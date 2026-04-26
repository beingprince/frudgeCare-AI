"""
FrudgeCare AI Engine — Scripted Triage Agent.

Architecture
------------

This is a hybrid agent. The workflow ordering is deterministic Python
code, the tools are real (same handlers used by the pure-ReAct version
that lives in ``agent_tools.py``), and an LLM is invoked exactly once
at the end to produce a rationale and pick a final urgency given all
the evidence the tools collected.

The LLM provider is auto-detected at module import time:

  - ``OPENAI_API_KEY`` set  -> OpenAI (gpt-4o-mini)
  - ``GEMINI_API_KEY`` set  -> Google Gemini 2.5 Flash-Lite
  - neither set             -> deterministic synthesis (no LLM call)

When both keys are present OpenAI wins because it currently has a more
generous free tier and lower latency for short JSON completions. Either
way the response payload reports the actual model that ran in the
``model`` field, so the UI can render an honest "Powered by ..." chip.

Why scripted instead of letting the LLM drive the loop:

  - Free-tier Gemini quota is brutally tight (gemini-2.5-flash: 20
    requests per day). A pure ReAct loop burns 4-8 model calls per case
    and will rate-limit during the demo.
  - Smaller Gemini variants (flash-lite) consistently emit one tool
    call then stop, even with very explicit prompting, so multi-step
    ReAct is not actually working on the model we have access to.
  - For triage, the workflow is well-defined. Real clinical decision
    support runs the rules deterministically and uses the LLM only
    for synthesis. That is exactly what we do here.

Returned shape is identical to the original ReAct version so the BFF
and UI can render either implementation interchangeably. The trace
records every tool call with args + result, plus a final
synthesis step. ``synthesis_mode`` is ``"llm"`` when an LLM produced the
rationale and ``"deterministic"`` when the fallback ran.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from agent_tools import execute_tool, make_call_preview


# ----------------------------------------------------------------------
# LLM provider abstraction. Each provider returns the raw JSON string
# from a single chat completion. The caller parses + validates it.
# ----------------------------------------------------------------------

@dataclass
class LlmProvider:
    """A pluggable LLM backend used for the single synthesis call."""

    name: str           # short label, e.g. "openai", "gemini"
    model_id: str       # exact model id reported back to the UI
    synthesise: Callable[[str, str], str]  # (system, user) -> raw text


GEMINI_MODEL = "gemini-2.5-flash-lite"
OPENAI_MODEL = "gpt-4o-mini"

MAX_RETRIES_SYNTHESIS = 1
RETRY_BACKOFF_SEC = 4.0


def _make_openai_provider() -> Optional[LlmProvider]:
    """Build an OpenAI provider if OPENAI_API_KEY is set and the SDK loads."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    try:
        from openai import OpenAI  # imported lazily so absence is non-fatal
    except ImportError:
        print("[agent] openai SDK not installed; skipping OpenAI provider")
        return None

    client = OpenAI(api_key=key)

    def _call(system: str, user: str) -> str:
        rsp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return (rsp.choices[0].message.content or "").strip()

    return LlmProvider(name="openai", model_id=OPENAI_MODEL, synthesise=_call)


def _make_gemini_provider() -> Optional[LlmProvider]:
    """Build a Gemini provider if GEMINI_API_KEY is set and the SDK loads."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    try:
        from google import genai
        from google.genai import types as gtypes
    except ImportError:
        print("[agent] google.genai SDK not installed; skipping Gemini provider")
        return None

    client = genai.Client(api_key=key)

    def _call(system: str, user: str) -> str:
        config = gtypes.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            temperature=0.2,
        )
        rsp = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user,
            config=config,
        )
        return (rsp.text or "").strip()

    return LlmProvider(name="gemini", model_id=GEMINI_MODEL, synthesise=_call)


def _select_provider() -> Optional[LlmProvider]:
    """Pick the best available LLM provider. Order: OpenAI, then Gemini.

    OpenAI wins when both keys are present because gpt-4o-mini is currently
    cheaper, faster, and has a more forgiving free quota than Gemini's
    free tier. Demo days only need a handful of synthesis calls so the
    cost is negligible (<$0.01).
    """
    return _make_openai_provider() or _make_gemini_provider()


# Resolved at import time so we have a single source of truth for the UI.
_ACTIVE_PROVIDER: Optional[LlmProvider] = _select_provider()


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

    step += 1
    args1: Dict[str, Any] = {"narrative": narrative}
    if age is not None:
        args1["age"] = age
    res1 = execute_tool("check_red_flags", args1)
    _record(trace, step, "check_red_flags", args1, res1)

    step += 1
    args2 = {"condition": narrative}
    res2 = execute_tool("lookup_clinical_guideline", args2)
    _record(trace, step, "lookup_clinical_guideline", args2, res2)

    if measured_vitals:
        step += 1
        args3 = {"vitals": measured_vitals}
        res3 = execute_tool("evaluate_vitals_signs", args3)
        _record(trace, step, "evaluate_vitals_signs", args3, res3)

    if known_medications:
        step += 1
        args4 = {"current_medications": list(known_medications)}
        res4 = execute_tool("check_drug_interaction", args4)
        _record(trace, step, "check_drug_interaction", args4, res4)

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
# LLM synthesis — the only model call per case
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
    """Build the user message handed to the LLM for the final call."""
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
    provider: LlmProvider,
    narrative: str,
    trace: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Call the active LLM once to produce the final verdict.

    Returns ``None`` on any failure so the caller can fall back to
    deterministic logic. Retries once on rate-limit (429 / quota).
    """
    payload = _synthesis_payload(narrative, trace)
    last_err: Optional[BaseException] = None

    for attempt in range(MAX_RETRIES_SYNTHESIS + 1):
        try:
            text = provider.synthesise(_SYNTHESIS_INSTRUCTION, payload)
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
            rate_limited = (
                "429" in msg
                or "RESOURCE_EXHAUSTED" in msg
                or "rate_limit" in msg.lower()
            )
            if rate_limited and attempt < MAX_RETRIES_SYNTHESIS:
                time.sleep(RETRY_BACKOFF_SEC * (attempt + 1))
                continue
            break

    print(
        f"[agent] {provider.name} synthesis failed, "
        f"falling back deterministically: {last_err}"
    )
    return None


# ----------------------------------------------------------------------
# Entry point — same signature as the original ReAct version
# ----------------------------------------------------------------------

def run_agentic_triage(
    client: Optional[Any] = None,  # kept for backward compat; ignored
    narrative: str = "",
    age: Optional[int] = None,
    sex: Optional[str] = None,
    known_medications: Optional[List[str]] = None,
    measured_vitals: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run the scripted agent and return verdict + trace.

    The legacy ``client`` argument is accepted but ignored — provider
    selection now lives inside this module so the call site does not have
    to know which LLM is configured.
    """
    t0 = time.time()
    _ = client  # explicitly discarded; selection is module-local

    trace = _run_workflow(
        narrative=narrative,
        age=age,
        sex=sex,
        known_medications=known_medications,
        measured_vitals=measured_vitals,
    )

    verdict: Optional[Dict[str, Any]] = None
    synthesis_via_llm = False
    model_used = "deterministic"

    if _ACTIVE_PROVIDER is not None:
        verdict = _llm_synthesise(_ACTIVE_PROVIDER, narrative, trace)
        if verdict is not None:
            synthesis_via_llm = True
            model_used = _ACTIVE_PROVIDER.model_id

    if verdict is None:
        verdict = _verdict_from_trace(trace)

    trace.append({
        "step": len(trace) + 1,
        "kind": "synthesis",
        "tool": "synthesise_verdict",
        "preview": (
            f"Reasoning over collected evidence ({_ACTIVE_PROVIDER.name})"
            if synthesis_via_llm and _ACTIVE_PROVIDER is not None
            else "Reasoning over collected evidence (deterministic fallback)"
        ),
        "result_summary": f"committed to {verdict['urgency']}",
        "synthesised_by": (
            _ACTIVE_PROVIDER.name if synthesis_via_llm and _ACTIVE_PROVIDER is not None
            else "deterministic"
        ),
    })

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
        "model": model_used,
        "provider": (
            _ACTIVE_PROVIDER.name if synthesis_via_llm and _ACTIVE_PROVIDER is not None
            else "deterministic"
        ),
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
