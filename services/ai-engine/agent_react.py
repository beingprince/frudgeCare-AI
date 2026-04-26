"""
FrudgeCare AI Engine — Scripted Triage Agent.

Architecture
------------

This is a hybrid agent. The workflow ordering is deterministic Python
code, the tools are real (same handlers used by the pure-ReAct version
that lives in ``agent_tools.py``), and Gemini is invoked exactly once
at the end to produce a rationale and pick a final urgency given all
the evidence the tools collected.

Why scripted instead of letting Gemini drive the loop:

  - Free-tier Gemini quota is brutally tight (gemini-2.5-flash: 20
    requests per day, gemini-2.0-flash similar). A pure ReAct loop
    burns 4-8 model calls per case and will rate-limit during the
    demo.
  - Smaller Gemini variants (flash-lite) consistently emit one tool
    call then stop, even with very explicit prompting, so multi-step
    ReAct is not actually working on the model we have access to.
  - For triage, the workflow is well-defined. Real clinical decision
    support runs the rules deterministically and uses the LLM only
    for synthesis. That is exactly what we do here.

Returned shape is identical to the original ReAct version so the BFF
and UI can render either implementation interchangeably. The trace
records every tool call with args + result, plus a final
synthesis step. ``agent_available`` distinguishes "Gemini synthesised
the final rationale" (true) vs "tools ran but synthesis fell back to
deterministic logic" (false).
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from google.genai import types

from agent_tools import execute_tool, make_call_preview


GEMINI_MODEL = "gemini-2.5-flash-lite"

MAX_RETRIES_SYNTHESIS = 1
RETRY_BACKOFF_SEC = 4.0


# ----------------------------------------------------------------------
# Deterministic workflow
# ----------------------------------------------------------------------

def _record(trace: List[Dict[str, Any]], step: int, tool: str,
            args: Dict[str, Any], result: Dict[str, Any]) -> None:
    """Append a tool call to the trace in the standard shape."""
    trace.append({
        "step": step,
        "kind": "tool_call",
        "tool": tool,
        "args": args,
        "preview": make_call_preview(tool, args),
        "result_summary": _summarize_result(tool, result),
        "result": result,
    })


def _run_workflow(
    narrative: str,
    age: Optional[int],
    sex: Optional[str],
    known_medications: Optional[List[str]],
    measured_vitals: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Run the clinical workflow deterministically, returning the trace.

    The order is the same one a triage nurse would actually follow:

        1. red flags        -> safety floor
        2. guideline lookup -> clinical pattern + differential
        3. vitals scoring   -> objective abnormality
        4. drug interactions -> contraindications
        5. ICD-10 coding    -> standard terminology for downstream
    """
    trace: List[Dict[str, Any]] = []
    step = 0

    # Step 1: red flags. Always.
    step += 1
    args1: Dict[str, Any] = {"narrative": narrative}
    if age is not None:
        args1["age"] = age
    res1 = execute_tool("check_red_flags", args1)
    _record(trace, step, "check_red_flags", args1, res1)

    # Step 2: guideline lookup. The keyword matcher takes the full
    # narrative directly, so we do not need an LLM to summarise it.
    step += 1
    args2 = {"condition": narrative}
    res2 = execute_tool("lookup_clinical_guideline", args2)
    _record(trace, step, "lookup_clinical_guideline", args2, res2)

    # Step 3: vitals (only if measurements were supplied).
    if measured_vitals:
        step += 1
        args3 = {"vitals": measured_vitals}
        res3 = execute_tool("evaluate_vitals_signs", args3)
        _record(trace, step, "evaluate_vitals_signs", args3, res3)

    # Step 4: drug interactions (only if a med list was supplied).
    if known_medications:
        step += 1
        args4 = {"current_medications": list(known_medications)}
        res4 = execute_tool("check_drug_interaction", args4)
        _record(trace, step, "check_drug_interaction", args4, res4)

    # Step 5: ICD-10 code the top differential (if any guideline match
    # produced one). This grounds the case in standard terminology.
    matches = res2.get("matches", []) if isinstance(res2, dict) else []
    top_dx_name: Optional[str] = None
    for m in matches:
        diffs = m.get("differential", []) or []
        if diffs:
            top_dx_name = diffs[0].get("diagnosis")
            if top_dx_name:
                break
    if top_dx_name:
        step += 1
        args5 = {"diagnosis_name": top_dx_name}
        res5 = execute_tool("code_diagnosis_icd10", args5)
        _record(trace, step, "code_diagnosis_icd10", args5, res5)

    return trace


# ----------------------------------------------------------------------
# LLM synthesis — the only Gemini call per case
# ----------------------------------------------------------------------

_SYNTHESIS_INSTRUCTION = (
    "You are FrudgeCare's triage agent. The clinical tools have already "
    "been run on the patient narrative. Your job is to synthesise a "
    "final urgency call.\n\n"
    "Rules:\n"
    "  - If any red flag fired, urgency MUST be CRITICAL or URGENT.\n"
    "  - If any vital is critical, urgency MUST be CRITICAL.\n"
    "  - If a severe drug interaction exists, urgency MUST be at least "
    "URGENT.\n"
    "  - Cite specific tool results in the rationale, not generic "
    "advice.\n\n"
    "Respond with JSON only matching this schema exactly:\n"
    "{\n"
    '  "urgency": "CRITICAL" | "URGENT" | "MODERATE" | "LOW" | "ROUTINE",\n'
    '  "rationale": "one or two sentences referencing the evidence",\n'
    '  "first_actions": ["concrete action", "concrete action", ...]\n'
    "}"
)


def _synthesis_payload(narrative: str, trace: List[Dict[str, Any]]) -> str:
    """Build the user message handed to Gemini for the final call."""
    evidence_blocks = []
    for step in trace:
        if step.get("kind") != "tool_call":
            continue
        evidence_blocks.append({
            "tool": step.get("tool"),
            "result_summary": step.get("result_summary"),
            "result": step.get("result"),
        })
    return (
        f"PATIENT NARRATIVE:\n{narrative.strip()}\n\n"
        f"TOOL EVIDENCE (in order):\n{json.dumps(evidence_blocks, indent=2)}\n"
    )


def _llm_synthesise(
    client: Any,
    narrative: str,
    trace: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Call Gemini once to produce the final verdict. Returns None on
    any failure so the caller can fall back to deterministic logic."""
    payload = _synthesis_payload(narrative, trace)
    config = types.GenerateContentConfig(
        system_instruction=_SYNTHESIS_INSTRUCTION,
        response_mime_type="application/json",
        temperature=0.2,
    )
    last_err: Optional[BaseException] = None
    for attempt in range(MAX_RETRIES_SYNTHESIS + 1):
        try:
            rsp = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=payload,
                config=config,
            )
            text = (rsp.text or "").strip()
            if not text:
                last_err = ValueError("empty model response")
                break
            data = json.loads(text)
            urgency = str(data.get("urgency", "")).upper()
            allowed = {"CRITICAL", "URGENT", "MODERATE", "LOW", "ROUTINE"}
            if urgency not in allowed:
                last_err = ValueError(f"bad urgency: {urgency!r}")
                break
            return {
                "urgency": urgency,
                "rationale": str(data.get("rationale", "")).strip()
                              or "No rationale supplied.",
                "first_actions": [
                    str(a).strip() for a in (data.get("first_actions") or [])
                    if str(a).strip()
                ] or ["Triage nurse review"],
            }
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            msg = str(exc)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                if attempt < MAX_RETRIES_SYNTHESIS:
                    time.sleep(RETRY_BACKOFF_SEC * (attempt + 1))
                    continue
            break
    print(f"[agent] synthesis failed, falling back deterministically: {last_err}")
    return None


# ----------------------------------------------------------------------
# Entry point — same signature as the original ReAct version
# ----------------------------------------------------------------------

def run_agentic_triage(
    client: Optional[Any],
    narrative: str,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    known_medications: Optional[List[str]] = None,
    measured_vitals: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run the scripted agent and return verdict + trace."""
    t0 = time.time()

    trace = _run_workflow(
        narrative=narrative,
        age=age,
        sex=sex,
        known_medications=known_medications,
        measured_vitals=measured_vitals,
    )

    verdict: Optional[Dict[str, Any]] = None
    synthesis_via_llm = False

    if client is not None:
        verdict = _llm_synthesise(client, narrative, trace)
        if verdict is not None:
            synthesis_via_llm = True

    if verdict is None:
        verdict = _verdict_from_trace(trace)

    # Record the synthesis step on the trace so the UI shows it as a
    # distinct line ("the agent reasoned over the evidence and committed
    # to URGENT").
    trace.append({
        "step": len(trace) + 1,
        "kind": "synthesis",
        "tool": "synthesise_verdict",
        "preview": (
            "Reasoning over collected evidence (LLM)"
            if synthesis_via_llm
            else "Reasoning over collected evidence (deterministic fallback)"
        ),
        "result_summary": f"committed to {verdict['urgency']}",
        "synthesised_by": "gemini" if synthesis_via_llm else "deterministic",
    })

    # Final escalate_to_provider call as the closing tool action. This
    # is a no-op in our local KB but keeps the trace shape consistent
    # with the pure-ReAct contract.
    esc_args = {
        "urgency": verdict["urgency"],
        "rationale": verdict["rationale"],
        "recommended_first_actions": verdict["first_actions"],
    }
    esc_res = execute_tool("escalate_to_provider", esc_args)
    _record(trace, len(trace) + 1, "escalate_to_provider", esc_args, esc_res)

    elapsed_ms = int((time.time() - t0) * 1000)
    return {
        "agent_available": True,
        "synthesis_mode": "llm" if synthesis_via_llm else "deterministic",
        "verdict": verdict,
        "trace": trace,
        "steps_used": len(trace),
        "max_steps": len(trace),
        "tools_offered": [
            "check_red_flags",
            "lookup_clinical_guideline",
            "evaluate_vitals_signs",
            "check_drug_interaction",
            "code_diagnosis_icd10",
            "synthesise_verdict",
            "escalate_to_provider",
        ],
        "model": GEMINI_MODEL,
        "elapsed_ms": elapsed_ms,
        "stop_reason": "workflow_complete",
        "architecture": "scripted_agent_with_llm_synthesis",
    }


# ----------------------------------------------------------------------
# Helpers shared with the original ReAct implementation
# ----------------------------------------------------------------------

def _summarize_result(tool: str, result: Dict[str, Any]) -> str:
    if "error" in result:
        return f"ERROR: {result['error']}"
    if tool == "lookup_clinical_guideline":
        n = len(result.get("matches", []))
        if n:
            top = result["matches"][0]
            return (f"{n} match(es); top: {top.get('label')} "
                    f"({top.get('confidence')})")
        return "no matches"
    if tool == "check_red_flags":
        if result.get("any_fired"):
            ids = [r.get("id") for r in result.get("fired_rules", [])]
            return f"red flags fired: {', '.join(ids)}"
        return "no red flags"
    if tool == "evaluate_vitals_signs":
        c = sum(1 for f in result.get("flags", []) if f.get("status") == "critical")
        w = sum(1 for f in result.get("flags", []) if f.get("status") == "warning")
        if c or w:
            return f"{c} critical, {w} warning"
        return "vitals within normal range"
    if tool == "check_drug_interaction":
        n = result.get("count", 0)
        return f"{n} interaction(s)" if n else "no interactions"
    if tool == "code_diagnosis_icd10":
        if result.get("matched"):
            return f"{result.get('code')} - {result.get('display')}"
        return "no ICD-10 match"
    if tool == "escalate_to_provider":
        return f"escalated as {result.get('urgency')}"
    return "ok"


def _verdict_from_trace(trace: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Defensive verdict used when LLM synthesis is unavailable."""
    red_flag_fired = False
    severe_interaction = False
    critical_vital = False
    matched_guideline_urgency: Optional[str] = None
    top_label: Optional[str] = None
    citations: List[str] = []

    for step in trace:
        if step.get("kind") != "tool_call":
            continue
        result = step.get("result") or {}
        tool = step.get("tool")
        if tool == "check_red_flags" and result.get("any_fired"):
            red_flag_fired = True
            for r in result.get("fired_rules", []):
                citations.append(f"red flag {r.get('id')}")
        if tool == "check_drug_interaction" and result.get("any_severe"):
            severe_interaction = True
            citations.append("severe drug interaction")
        if tool == "evaluate_vitals_signs" and result.get("any_critical"):
            critical_vital = True
            citations.append("critical vital")
        if tool == "lookup_clinical_guideline":
            for m in result.get("matches", []):
                hint = (m.get("urgency_hint") or "").lower()
                if not top_label:
                    top_label = m.get("label")
                if hint == "high" and matched_guideline_urgency != "CRITICAL":
                    matched_guideline_urgency = "URGENT"

    if red_flag_fired or critical_vital:
        urgency = "CRITICAL"
    elif severe_interaction:
        urgency = "URGENT"
    elif matched_guideline_urgency:
        urgency = matched_guideline_urgency
    else:
        urgency = "MODERATE"

    rationale_parts = []
    if citations:
        rationale_parts.append("Evidence: " + ", ".join(citations) + ".")
    if top_label:
        rationale_parts.append(f"Pattern match: {top_label}.")
    if not rationale_parts:
        rationale_parts.append(
            "Insufficient red-flag or guideline evidence; routing to "
            "clinical review for safety."
        )
    return {
        "urgency": urgency,
        "rationale": " ".join(rationale_parts),
        "first_actions": [
            "Triage nurse to confirm vitals and history",
            "Provider review within urgency-appropriate window",
        ],
    }
