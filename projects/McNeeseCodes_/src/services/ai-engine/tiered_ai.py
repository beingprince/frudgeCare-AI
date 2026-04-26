"""
FrudgeCare AI — Tiered Cascade.

Every AI endpoint follows this flow:

  Tier 0: Retrieve facts from the local knowledge base (always).
  Tier 1: Ask an LLM to reason OVER the retrieved facts (preferred path).
  Tier 2: If the LLM fails, build a response purely from the retrieved facts.
  Tier 3: If retrieval also yields nothing, return a safe, rule-based response.

The tier that produced a response is returned as `source_tier` and the list of
KB entry IDs that contributed is returned as `provenance`. The active LLM is
also surfaced as `llm_provider` / `llm_model` so the UI's "Powered by..." chip
labels the engine honestly.

LLM provider order (mirrors agent_react._select_provider):
  - OPENAI_API_KEY set      -> OpenAI gpt-4o-mini  (preferred — generous
                                free quota, low latency for short JSON)
  - GEMINI_API_KEY set      -> Google Gemini 2.5 Flash-Lite (fallback)
  - neither set / both fail -> Tier 2 templated, then Tier 3 safe default
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from retrieval import (
    check_drug_interactions,
    evaluate_vitals,
    format_interactions_context,
    format_patterns_context,
    format_red_flags_context,
    lookup_icd10,
    match_red_flags,
    match_symptom_patterns,
)


GEMINI_MODEL = "gemini-2.5-flash-lite"
OPENAI_MODEL = "gpt-4o-mini"


# ----------------------------------------------------------------------
# Provider abstraction — same shape as agent_react.LlmProvider but kept
# local so this module stays import-clean (agent_react imports tiered_ai
# transitively in some entry points).
# ----------------------------------------------------------------------

@dataclass
class _LlmProvider:
    name: str           # "openai" / "gemini"
    model_id: str       # exact model id reported back to the UI
    call: Callable[[str], Dict[str, Any]]


def _make_openai_provider() -> Optional[_LlmProvider]:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    try:
        from openai import OpenAI
    except ImportError:
        print("[tiered_ai] openai SDK not installed; skipping OpenAI provider")
        return None

    client = OpenAI(api_key=key)

    def _call(prompt: str) -> Dict[str, Any]:
        rsp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system",
                 "content": "You are a clinical decision support AI. "
                            "Respond ONLY with the JSON object the user "
                            "prompt asks for — no prose, no markdown."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads((rsp.choices[0].message.content or "").strip() or "{}")

    return _LlmProvider(name="openai", model_id=OPENAI_MODEL, call=_call)


def _make_gemini_provider() -> Optional[_LlmProvider]:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    try:
        from google import genai
        from google.genai import types as gtypes
    except ImportError:
        print("[tiered_ai] google.genai SDK not installed; skipping Gemini provider")
        return None

    client = genai.Client(api_key=key)

    def _call(prompt: str) -> Dict[str, Any]:
        rsp = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=gtypes.GenerateContentConfig(response_mime_type="application/json"),
        )
        return json.loads(rsp.text)

    return _LlmProvider(name="gemini", model_id=GEMINI_MODEL, call=_call)


# Lazily resolved: main.py imports this module BEFORE calling load_dotenv(),
# so resolving at import time would consistently miss OPENAI_API_KEY and
# silently fall through to Gemini. _active_llm() is called inside the
# request path instead, after the env is loaded. The cached value is
# captured once on first call so subsequent requests don't re-init the
# OpenAI client.
_ACTIVE_LLM: Optional[_LlmProvider] = None
_ACTIVE_LLM_RESOLVED: bool = False


def _active_llm() -> Optional[_LlmProvider]:
    """Return the preferred LLM provider, resolving once on first use.

    OpenAI first, then Gemini. None if neither key/SDK is available.
    """
    global _ACTIVE_LLM, _ACTIVE_LLM_RESOLVED
    if not _ACTIVE_LLM_RESOLVED:
        _ACTIVE_LLM = _make_openai_provider() or _make_gemini_provider()
        _ACTIVE_LLM_RESOLVED = True
        if _ACTIVE_LLM is not None:
            print(f"[tiered_ai] active LLM: {_ACTIVE_LLM.name} ({_ACTIVE_LLM.model_id})")
        else:
            print("[tiered_ai] no LLM configured — Tier 1 disabled")
    return _ACTIVE_LLM


def llm_status() -> Dict[str, Optional[str]]:
    """Public probe so other modules / debug routes can report which LLM is active."""
    p = _active_llm()
    if p is None:
        return {"provider": None, "model": None}
    return {"provider": p.name, "model": p.model_id}


def _llm_available(legacy_client: Optional[Any]) -> bool:
    """Tier-1 gate. Either the auto-selected LLM OR the legacy Gemini
    client (kept for backward-compat callers) being non-None counts as
    "an LLM is available".
    """
    return _active_llm() is not None or legacy_client is not None


def _llm_json(legacy_client: Optional[Any], prompt: str) -> Tuple[Dict[str, Any], _LlmProvider]:
    """Call the active LLM and return (parsed_json, provider_used).

    Tries the auto-selected provider first. If that errors, falls back
    to the caller's legacy client (Gemini, kept for compatibility).
    Raises only when both paths fail — the cascade then drops to Tier 2.
    """
    active = _active_llm()
    if active is not None:
        try:
            data = active.call(prompt)
            return data, active
        except Exception as e:  # noqa: BLE001
            # Don't lose the legacy client as a fallback if it was passed.
            if legacy_client is None:
                raise
            print(f"[tiered_ai] {active.name} failed ({e}); trying legacy Gemini client")

    # Legacy code path: caller threaded a Gemini client in directly.
    if legacy_client is not None:
        from google.genai import types as gtypes  # local import
        rsp = legacy_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=gtypes.GenerateContentConfig(response_mime_type="application/json"),
        )
        legacy_provider = _LlmProvider(
            name="gemini",
            model_id=GEMINI_MODEL,
            call=lambda _p: {},  # placeholder; we already have the result
        )
        return json.loads(rsp.text), legacy_provider

    raise RuntimeError("No LLM provider configured")


def _gemini_json(client: Any, prompt: str) -> Dict[str, Any]:
    """Backwards-compatible shim. New code should call _llm_json instead.

    Routes through the auto-selected LLM (OpenAI > Gemini) first; only
    falls back to the legacy direct-Gemini client if that fails. Returns
    just the parsed JSON to match the original signature.
    """
    data, _ = _llm_json(client, prompt)
    return data


# ======================================================================
# Intake analysis cascade
# ======================================================================

def tiered_analyze_intake(
    client: Optional[Any],
    symptoms: str,
    duration: str,
    severity: str,
    patient_history: str = "",
    age: Optional[int] = None,
) -> Dict[str, Any]:
    """Return an AIAnalysis-shaped dict with source_tier + provenance."""

    # --- Tier 0: retrieve -----------------------------------------------
    matches = match_symptom_patterns(symptoms)
    red_flags = match_red_flags(symptoms, age=age)
    provenance: List[str] = [m[0]["id"] for m in matches] + [r["id"] for r in red_flags]

    # Compute retrieval-derived urgency as a safe floor.
    urgency_from_kb = _combined_urgency(matches, red_flags)

    # --- Tier 1: LLM-as-verifier (OpenAI primary, Gemini fallback) -----
    if _llm_available(client):
        prompt = _build_intake_prompt(
            symptoms, duration, severity, patient_history, matches, red_flags
        )
        try:
            data, used = _llm_json(client, prompt)
            # Sanity-check the LLM; never let it downgrade a red flag.
            if red_flags and data.get("urgency") != "high":
                data["urgency"] = "high"
                data.setdefault("risks", []).append(
                    "Red-flag override applied — KB rule required 'high' urgency."
                )
            data.setdefault("urgency", urgency_from_kb or "medium")
            return _wrap(data, tier=1, provenance=provenance,
                         llm_provider=used.name, llm_model=used.model_id)
        except Exception as e:  # noqa: BLE001
            print(f"[Tier 1] analyze-intake LLM failed: {e}. Falling back to Tier 2.")

    # --- Tier 2: templated from retrieved facts --------------------------
    if matches:
        top_pattern, top_conf = matches[0]
        risks = [d["diagnosis"] for d in top_pattern.get("differential", [])[:3]]
        return _wrap({
            "urgency": urgency_from_kb or top_pattern["urgency_hint"],
            "summary": top_pattern.get("patient_summary",
                       "Your symptoms have been logged. A clinician will see you soon."),
            "risks": risks,
            "reasoning": f"Local knowledge base matched '{top_pattern['label']}' "
                         f"(confidence {top_conf:.2f}). "
                         + (f"Red-flag rules fired: {', '.join(r['id'] for r in red_flags)}. "
                            if red_flags else ""),
            "clinician_brief": top_pattern.get("clinician_brief",
                               "Clinical review required."),
        }, tier=2, provenance=provenance)

    # --- Tier 3: safe static fallback ------------------------------------
    severity_urgency = {"severe": "high", "moderate": "medium", "mild": "low"}
    return _wrap({
        "urgency": urgency_from_kb
                   or severity_urgency.get(severity.lower(), "medium"),
        "summary": "Your symptoms have been logged. A clinician will review shortly.",
        "risks": [],
        "reasoning": "AI services and local knowledge base yielded no specific "
                     "match; applying safe severity-based default.",
        "clinician_brief": f"Patient reports: {symptoms[:140]}. "
                           f"Duration {duration}, severity {severity}. "
                           f"Clinical review required — no KB pattern matched.",
    }, tier=3, provenance=[])


def _combined_urgency(
    matches: List[Tuple[Dict[str, Any], float]],
    red_flags: List[Dict[str, Any]],
) -> Optional[str]:
    if any(r.get("urgency_override") == "high" for r in red_flags):
        return "high"
    if matches:
        return matches[0][0].get("urgency_hint")
    return None


def _build_intake_prompt(
    symptoms: str,
    duration: str,
    severity: str,
    history: str,
    matches: List[Tuple[Dict[str, Any], float]],
    red_flags: List[Dict[str, Any]],
) -> str:
    return f"""You are a clinical decision support AI. You suggest, you do not decide.

A local clinical knowledge base has been consulted BEFORE you. Use its findings
as grounding — you must not contradict explicit red-flag rules.

[PATIENT INTAKE]
Symptoms: {symptoms}
Duration: {duration}
Severity (patient-reported): {severity}
History: {history or 'none provided'}

[KB MATCHED PATTERNS]
{format_patterns_context(matches)}

[KB RED-FLAG RULES FIRED]
{format_red_flags_context(red_flags)}

Return ONLY this JSON:
{{
  "urgency": "high|medium|low",
  "summary": "patient-facing one-paragraph summary",
  "risks": ["list of clinical risk flags"],
  "reasoning": "why you arrived at the urgency (cite KB patterns if used)",
  "clinician_brief": "2-3 sentence dense brief for the nurse/provider"
}}
"""


# ======================================================================
# Queue ranking cascade
# ======================================================================

def tiered_rank_queue(
    client: Optional[Any],
    cases: List[Dict[str, Any]],
    available_providers: int = 2,
) -> Dict[str, Any]:
    if not cases:
        return _wrap({"ranked_cases": [], "bottleneck_alerts": []}, tier=3, provenance=[])

    # Tier 0 is inherently just the score function — no KB lookup needed here
    # beyond the urgency encoding the intake already derived.
    deterministic = _deterministic_rank(cases)

    if _llm_available(client):
        cases_text = "\n".join(
            f"- Case {c['case_id']}: urgency={c['urgency']}, "
            f"wait={c['wait_minutes']}min, status={c['current_status']}, "
            f"provider_assigned={c['provider_assigned']}"
            for c in cases
        )
        prompt = f"""You are a clinical queue management AI.

Available providers: {available_providers}
Cases waiting:
{cases_text}

Rank by care priority (urgency, wait time, assignment state). Surface any
bottleneck patterns (e.g., "3 high-urgency cases waiting >20min").

Return ONLY:
{{
  "ranked_cases": [{{"case_id": "...", "rank": 1, "reason": "...", "alert": "string or null"}}],
  "bottleneck_alerts": ["..."]
}}"""
        try:
            data, used = _llm_json(client, prompt)
            return _wrap(data, tier=1, provenance=["queue_heuristic_v1"],
                         llm_provider=used.name, llm_model=used.model_id)
        except Exception as e:  # noqa: BLE001
            print(f"[Tier 1] rank-queue LLM failed: {e}. Falling back to Tier 2.")

    # Tier 2 = deterministic rule scoring with alerts, Tier 3 would be
    # identical here (nothing further to fall back to), so we label as Tier 2.
    return _wrap(deterministic, tier=2, provenance=["queue_heuristic_v1"])


def _deterministic_rank(cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    urgency_pts = {"high": 3, "medium": 2, "low": 1}
    scored = sorted(
        cases,
        key=lambda c: (
            urgency_pts.get(c.get("urgency", "low"), 1)
            + (1 if c.get("wait_minutes", 0) > 30 else 0)
        ),
        reverse=True,
    )
    ranked = [
        {
            "case_id": c["case_id"],
            "rank": i + 1,
            "reason": f"{c.get('urgency','unknown')} urgency, "
                      f"{c.get('wait_minutes',0)}min wait",
            "alert": "Wait exceeds threshold" if c.get("wait_minutes", 0) > 45 else None,
        }
        for i, c in enumerate(scored)
    ]
    alerts: List[str] = []
    high_waiting = [c for c in cases if c.get("urgency") == "high" and c.get("wait_minutes", 0) > 20]
    if len(high_waiting) >= 2:
        alerts.append(f"{len(high_waiting)} high-urgency cases waiting >20 min")
    long_waits = [c for c in cases if c.get("wait_minutes", 0) > 45]
    if long_waits:
        alerts.append(f"{len(long_waits)} cases waiting >45 min")
    return {"ranked_cases": ranked, "bottleneck_alerts": alerts}


# ======================================================================
# Nurse assist cascade
# ======================================================================

def tiered_nurse_assist(
    client: Optional[Any],
    symptoms: str,
    vitals: Dict[str, Any],
    ai_pretriage_brief: str,
    known_allergies: List[str],
    current_medications: List[str],
    active_diagnoses: List[str],
) -> Dict[str, Any]:
    # --- Tier 0 ----------------------------------------------------------
    vitals_flags = evaluate_vitals(vitals)
    interactions = check_drug_interactions(current_medications)
    patterns = match_symptom_patterns(symptoms)
    red_flags = match_red_flags(symptoms)

    provenance: List[str] = (
        [f"vitals:{f['field']}" for f in vitals_flags]
        + [f"interaction:{h['source_entry']}" for h in interactions]
        + [f"pattern:{p[0]['id']}" for p in patterns]
        + [f"red_flag:{r['id']}" for r in red_flags]
    )

    allergy_alerts_kb: List[str] = []
    for allergy in known_allergies:
        for med in current_medications:
            if allergy.lower() in med.lower():
                allergy_alerts_kb.append(
                    f"Patient has documented allergy to '{allergy}' and current med list includes '{med}'."
                )

    # --- Tier 1 ----------------------------------------------------------
    if _llm_available(client):
        prompt = f"""You are a clinical decision support AI assisting a registered nurse.

A local KB has already produced these findings. Incorporate them and do not contradict vitals flags or red flags.

[PATIENT]
Symptoms: {symptoms}
AI pre-triage brief: {ai_pretriage_brief}
Known allergies: {', '.join(known_allergies) or 'None documented'}
Current medications: {', '.join(current_medications) or 'None documented'}
Active diagnoses: {', '.join(active_diagnoses) or 'None documented'}

[KB VITALS FLAGS]
{json.dumps(vitals_flags, default=str)}

[KB DRUG INTERACTIONS]
{format_interactions_context(interactions)}

[KB SYMPTOM PATTERNS]
{format_patterns_context(patterns)}

[KB RED-FLAG RULES]
{format_red_flags_context(red_flags)}

Respond ONLY with:
{{
  "allergy_alerts": ["..."],
  "suggested_questions": ["3-5 targeted nurse follow-up questions"],
  "documentation_hints": ["clinical observations to explicitly document"]
}}"""
        try:
            ai, used = _llm_json(client, prompt)
            return _wrap({
                "vitals_flags": vitals_flags,
                "allergy_alerts": _dedupe(allergy_alerts_kb + ai.get("allergy_alerts", [])),
                "suggested_questions": ai.get("suggested_questions", []),
                "documentation_hints": ai.get("documentation_hints", []),
                "drug_interactions": interactions,
            }, tier=1, provenance=provenance,
               llm_provider=used.name, llm_model=used.model_id)
        except Exception as e:  # noqa: BLE001
            print(f"[Tier 1] nurse-assist LLM failed: {e}. Falling back to Tier 2.")

    # --- Tier 2: templated from KB --------------------------------------
    suggested_questions = _build_nurse_questions(patterns, red_flags, vitals_flags)
    documentation_hints = _build_documentation_hints(patterns, red_flags, vitals_flags)

    if vitals_flags or interactions or patterns or red_flags:
        return _wrap({
            "vitals_flags": vitals_flags,
            "allergy_alerts": allergy_alerts_kb,
            "suggested_questions": suggested_questions,
            "documentation_hints": documentation_hints,
            "drug_interactions": interactions,
        }, tier=2, provenance=provenance)

    # --- Tier 3: safe minimal response -----------------------------------
    return _wrap({
        "vitals_flags": vitals_flags,
        "allergy_alerts": allergy_alerts_kb,
        "suggested_questions": [
            "When did symptoms begin and how have they changed?",
            "Any associated symptoms not yet mentioned?",
            "Recent medication changes, new exposures, or recent travel?",
        ],
        "documentation_hints": [
            "Document onset, quality, location, severity, timing, exacerbating/relieving factors.",
            "Repeat vitals if any were borderline.",
        ],
        "drug_interactions": [],
    }, tier=3, provenance=provenance)


def _build_nurse_questions(
    patterns: List[Tuple[Dict[str, Any], float]],
    red_flags: List[Dict[str, Any]],
    vitals_flags: List[Dict[str, Any]],
) -> List[str]:
    qs: List[str] = []
    if red_flags:
        qs.append(f"Red-flag screen: {red_flags[0]['message']} Ask directly to confirm or rule out.")
    for p, _ in patterns[:2]:
        label = p.get("label", "").lower()
        qs.append(f"For suspected {label}: onset, duration, intensity, any triggers or prior episodes?")
    if any(f["field"] == "O2 Saturation" for f in vitals_flags):
        qs.append("Recheck O2 saturation on room air vs. supplemental; any recent exertion?")
    if any(f["field"] == "BP Systolic" for f in vitals_flags):
        qs.append("Repeat BP in both arms after 5-min seated rest; last BP medication taken when?")
    qs.append("Any medications, supplements, or substances taken in the last 24 hours?")
    qs.append("Existing advance directives or care preferences to document?")
    return qs[:5]


def _build_documentation_hints(
    patterns: List[Tuple[Dict[str, Any], float]],
    red_flags: List[Dict[str, Any]],
    vitals_flags: List[Dict[str, Any]],
) -> List[str]:
    hints: List[str] = []
    if red_flags:
        hints.append(f"Document red-flag assessment: {red_flags[0]['id']} — action '{red_flags[0].get('action','')}'.")
    for p, _ in patterns[:2]:
        workup = p.get("recommended_workup", [])
        if workup:
            hints.append(f"Document workup considered/initiated: {'; '.join(workup[:3])}.")
    for vf in vitals_flags:
        hints.append(f"Document {vf['field']} reading ({vf['value']}) and nursing intervention taken.")
    if not hints:
        hints.append("Document full chief complaint, associated symptoms, and pertinent negatives.")
    return hints


# ======================================================================
# Provider co-pilot cascade
# ======================================================================

def tiered_provider_copilot(
    client: Optional[Any],
    symptoms: str,
    nurse_validated_brief: str,
    vitals: Dict[str, Any],
    known_diagnoses: List[str],
    known_allergies: List[str],
    current_medications: List[str],
    proposed_action: Optional[str] = None,
) -> Dict[str, Any]:
    patterns = match_symptom_patterns(symptoms)
    red_flags = match_red_flags(symptoms)
    interactions = check_drug_interactions(current_medications, proposed=proposed_action)

    provenance: List[str] = (
        [f"pattern:{p[0]['id']}" for p in patterns]
        + [f"red_flag:{r['id']}" for r in red_flags]
        + [f"interaction:{h['source_entry']}" for h in interactions]
    )

    disclaimer = ("These are AI-generated suggestions for informational purposes only. "
                  "Clinical judgment of the licensed provider supersedes all AI recommendations.")

    # --- Tier 1 ---------------------------------------------------------
    if _llm_available(client):
        prompt = f"""You are a clinical decision support AI assisting a licensed physician.
You provide suggestions only. The physician makes all final decisions.
A local KB has retrieved grounding facts. Do not contradict them.

[PATIENT PRESENTATION]
Symptoms: {symptoms}
Nurse-validated brief: {nurse_validated_brief}
Vitals: {json.dumps(vitals, default=str)}
Known diagnoses: {', '.join(known_diagnoses) or 'None'}
Known allergies: {', '.join(known_allergies) or 'None'}
Current medications: {', '.join(current_medications) or 'None'}
Proposed action: {proposed_action or 'None stated yet'}

[KB MATCHED PATTERNS]
{format_patterns_context(patterns)}

[KB RED-FLAG RULES]
{format_red_flags_context(red_flags)}

[KB DRUG INTERACTIONS]
{format_interactions_context(interactions)}

Respond ONLY with:
{{
  "differential_dx": [
    {{"diagnosis": "...", "probability": "high|medium|low", "reasoning": "...", "icd10_code": "..."}}
  ],
  "drug_interaction_alerts": ["..."],
  "recommended_tests": ["..."],
  "clinical_pearls": ["..."],
  "disclaimer": "{disclaimer}"
}}"""
        try:
            data, used = _llm_json(client, prompt)
            # Merge KB interactions in so the LLM can't silently drop them.
            llm_alerts: List[str] = list(data.get("drug_interaction_alerts", []))
            for h in interactions:
                phrase = f"{h['matched_on'][0]} ↔ {h['matched_on'][1]} [{h.get('severity','?')}]"
                if not any(phrase.split(' ')[0] in a for a in llm_alerts):
                    llm_alerts.append(f"{phrase}: {h.get('recommendation','review')}")
            data["drug_interaction_alerts"] = llm_alerts
            data.setdefault("disclaimer", disclaimer)
            return _wrap(data, tier=1, provenance=provenance,
                         llm_provider=used.name, llm_model=used.model_id)
        except Exception as e:  # noqa: BLE001
            print(f"[Tier 1] provider-copilot LLM failed: {e}. Falling back to Tier 2.")

    # --- Tier 2: from KB -------------------------------------------------
    if patterns:
        differential_dx: List[Dict[str, Any]] = []
        for p, _ in patterns[:2]:
            for d in p.get("differential", [])[:2]:
                icd = d.get("icd10") or ""
                if not icd:
                    lookup = lookup_icd10(d["diagnosis"])
                    icd = lookup["code"] if lookup else ""
                differential_dx.append({
                    "diagnosis": d["diagnosis"],
                    "probability": d.get("probability", "medium"),
                    "reasoning": f"Matches KB pattern '{p['label']}'.",
                    "icd10_code": icd,
                })

        tests: List[str] = []
        for p, _ in patterns[:2]:
            tests.extend(p.get("recommended_workup", []))
        tests = _dedupe(tests)[:5]

        pearls: List[str] = []
        for p, _ in patterns[:1]:
            pearls.extend(p.get("citations", []))
        for r in red_flags[:2]:
            pearls.append(f"Red flag '{r['id']}': {r['message']}")

        drug_alerts = [
            f"{h['matched_on'][0]} ↔ {h['matched_on'][1]} [{h.get('severity','?')}]: "
            f"{h.get('recommendation','review')}"
            for h in interactions
        ]

        return _wrap({
            "differential_dx": differential_dx,
            "drug_interaction_alerts": drug_alerts,
            "recommended_tests": tests,
            "clinical_pearls": pearls[:3] if pearls else ["Always confirm pertinent negatives before disposition."],
            "disclaimer": disclaimer,
        }, tier=2, provenance=provenance)

    # --- Tier 3 ----------------------------------------------------------
    return _wrap({
        "differential_dx": [],
        "drug_interaction_alerts": [
            f"{h['matched_on'][0]} ↔ {h['matched_on'][1]}: {h.get('recommendation','review')}"
            for h in interactions
        ],
        "recommended_tests": [],
        "clinical_pearls": ["AI co-pilot unavailable and no KB pattern matched. Clinical judgment remains authoritative."],
        "disclaimer": disclaimer,
    }, tier=3, provenance=provenance)


# ======================================================================
# Patient profile builder cascade
# ======================================================================
#
# Why this exists:
#   The intake form gathers ~10 fields, but downstream surfaces (patient
#   status page, front-desk card, nurse pre-brief) need a *narrative* —
#   "what should the team know, in human prose, before they pick this
#   case up?". Letting Gemini do that synthesis once at intake time means
#   the patient sees the same coherent profile the team sees, instead of
#   raw form fields.
#
#   Tier cascade follows the same pattern as the other endpoints so
#   missing API key / Gemini outage never breaks the patient flow.

_PROFILE_DISCLAIMER = (
    "AI-generated profile from patient intake. Suggestions only — a "
    "clinician validates every detail before it informs care."
)


def tiered_build_patient_profile(
    client: Optional[Any],
    full_name: str,
    date_of_birth: str,
    age: Optional[int],
    chief_complaint: str,
    severity: str,
    duration: str,
    additional_details: str,
    medical_history: str,
    preferred_timing: str,
    preferred_provider: str,
    pretriage_urgency: str,
    pretriage_summary: str,
    pretriage_risks: List[str],
    pretriage_clinician_brief: str,
) -> Dict[str, Any]:
    """Return a structured patient profile with source_tier + provenance."""

    safe_name = (full_name or "").strip() or "Unnamed patient"
    chief = (chief_complaint or "").strip()

    # Provenance for a profile is the form fields the AI was given; this
    # is what makes the response auditable from the patient's side too.
    provenance: List[str] = [
        f"form:{k}"
        for k, v in {
            "full_name": full_name,
            "date_of_birth": date_of_birth,
            "chief_complaint": chief_complaint,
            "severity": severity,
            "duration": duration,
            "additional_details": additional_details,
            "medical_history": medical_history,
            "preferred_timing": preferred_timing,
            "preferred_provider": preferred_provider,
        }.items()
        if v
    ]
    if pretriage_urgency:
        provenance.append(f"pretriage:urgency={pretriage_urgency}")

    # --- Tier 1: LLM-as-scribe (OpenAI primary, Gemini fallback) -------
    if _llm_available(client):
        prompt = _build_profile_prompt(
            full_name=safe_name,
            age=age,
            chief_complaint=chief,
            severity=severity,
            duration=duration,
            additional_details=additional_details,
            medical_history=medical_history,
            preferred_timing=preferred_timing,
            preferred_provider=preferred_provider,
            pretriage_urgency=pretriage_urgency,
            pretriage_summary=pretriage_summary,
            pretriage_risks=pretriage_risks,
            pretriage_clinician_brief=pretriage_clinician_brief,
        )
        try:
            data, used = _llm_json(client, prompt)
            data.setdefault("display_name", safe_name)
            data.setdefault("age", age)
            data.setdefault("chief_complaint_short", chief[:80])
            data.setdefault("disclaimer", _PROFILE_DISCLAIMER)
            for list_field in (
                "key_clinical_signals",
                "lifestyle_factors",
                "recommended_questions_for_nurse",
                "red_flags_for_team",
            ):
                data.setdefault(list_field, [])
            return _wrap(data, tier=1, provenance=provenance,
                         llm_provider=used.name, llm_model=used.model_id)
        except Exception as e:  # noqa: BLE001
            print(f"[Tier 1] build-patient-profile LLM failed: {e}. Falling back to Tier 2.")

    # --- Tier 2: deterministic templated profile -------------------------
    return _wrap(
        _templated_profile(
            full_name=safe_name,
            age=age,
            chief_complaint=chief,
            severity=severity,
            duration=duration,
            additional_details=additional_details,
            medical_history=medical_history,
            preferred_timing=preferred_timing,
            preferred_provider=preferred_provider,
            pretriage_urgency=pretriage_urgency,
            pretriage_summary=pretriage_summary,
            pretriage_risks=pretriage_risks,
            pretriage_clinician_brief=pretriage_clinician_brief,
        ),
        tier=2,
        provenance=provenance,
    )


def _build_profile_prompt(
    full_name: str,
    age: Optional[int],
    chief_complaint: str,
    severity: str,
    duration: str,
    additional_details: str,
    medical_history: str,
    preferred_timing: str,
    preferred_provider: str,
    pretriage_urgency: str,
    pretriage_summary: str,
    pretriage_risks: List[str],
    pretriage_clinician_brief: str,
) -> str:
    return f"""You are a clinical scribe AI for FrudgeCare. You synthesize a
patient's intake form and the pre-triage summary into a structured profile that
will be shown back to (a) the patient on their status page in plain English and
(b) the care team as a quick brief. You suggest, you do not decide.

[INTAKE FORM]
Name: {full_name}
Age: {age if age is not None else 'unknown'}
Chief complaint: {chief_complaint or 'not stated'}
Severity (patient-reported): {severity}
Duration: {duration or 'not stated'}
Additional details: {additional_details or 'none'}
Relevant history: {medical_history or 'none'}
Preferred timing: {preferred_timing or 'unspecified'}
Preferred provider: {preferred_provider or 'no preference'}

[PRE-TRIAGE RESULT]
Urgency: {pretriage_urgency or 'unknown'}
Patient-facing summary: {pretriage_summary}
Risks: {', '.join(pretriage_risks) if pretriage_risks else 'none flagged'}
Clinician brief: {pretriage_clinician_brief}

Return ONLY this JSON. Use plain, warm, non-alarming English in patient-facing
fields. Use clinical shorthand only in `key_clinical_signals` /
`red_flags_for_team` / `recommended_questions_for_nurse`.

{{
  "display_name": "preferred display form of the patient's name",
  "age": <integer or null>,
  "chief_complaint_short": "3-8 word phrasing of the chief complaint",
  "narrative_summary": "1-2 short paragraphs the patient can read; what we heard, what we will do next",
  "key_clinical_signals": ["short clinician-facing bullets distilled from intake"],
  "lifestyle_factors": ["any factors mentioned (smoking, exercise, diet) — empty list if none"],
  "recommended_questions_for_nurse": ["specific follow-up questions the nurse should ask"],
  "red_flags_for_team": ["any worrying signals the team should not miss — empty list if none"],
  "next_step_for_patient": "one short sentence telling the patient what happens next",
  "disclaimer": "{_PROFILE_DISCLAIMER}"
}}
"""


def _templated_profile(
    full_name: str,
    age: Optional[int],
    chief_complaint: str,
    severity: str,
    duration: str,
    additional_details: str,
    medical_history: str,
    preferred_timing: str,
    preferred_provider: str,
    pretriage_urgency: str,
    pretriage_summary: str,
    pretriage_risks: List[str],
    pretriage_clinician_brief: str,
) -> Dict[str, Any]:
    chief_short = chief_complaint[:80] if chief_complaint else "Reason for visit not stated"

    timing_phrase = {
        "asap": "as soon as possible",
        "today": "later today",
        "flexible": "within the next 3 days",
    }.get((preferred_timing or "").lower(), "at the next available slot")

    narrative_parts = [
        f"Hi {full_name.split(' ')[0] if full_name else 'there'} — we received your intake.",
    ]
    if chief_complaint:
        narrative_parts.append(
            f"You told us about {chief_complaint.lower().rstrip('.')}"
            + (f" (severity {severity})" if severity else "")
            + (f", which has been going on for {duration}" if duration else "")
            + "."
        )
    if additional_details:
        narrative_parts.append(f"You also mentioned: {additional_details}")
    if pretriage_summary:
        narrative_parts.append(pretriage_summary)
    narrative_parts.append(
        f"We will see you {timing_phrase}. A nurse reviews every case before a "
        "provider is assigned."
    )
    narrative = " ".join(narrative_parts)

    key_signals: List[str] = []
    if chief_complaint:
        key_signals.append(f"Chief complaint: {chief_complaint}")
    if severity:
        key_signals.append(f"Severity: {severity}")
    if duration:
        key_signals.append(f"Duration: {duration}")
    if medical_history:
        key_signals.append(f"Relevant history: {medical_history}")
    if pretriage_clinician_brief:
        key_signals.append(pretriage_clinician_brief)

    questions = [
        "Are the symptoms getting better, worse, or staying the same since onset?",
        "What makes it better or worse?",
        "Any associated symptoms you didn't mention on the form?",
    ]

    next_step = (
        "A nurse will reach out shortly to confirm details and schedule your visit."
        if (pretriage_urgency or "").lower() != "high"
        else "Because some answers may need urgent attention, a nurse will contact "
             "you very soon. If your symptoms get worse, call your local emergency "
             "number."
    )

    return {
        "display_name": full_name,
        "age": age,
        "chief_complaint_short": chief_short,
        "narrative_summary": narrative,
        "key_clinical_signals": key_signals,
        "lifestyle_factors": [],
        "recommended_questions_for_nurse": questions,
        "red_flags_for_team": list(pretriage_risks or []),
        "next_step_for_patient": next_step,
        "disclaimer": _PROFILE_DISCLAIMER,
    }


# ======================================================================
# Shared utilities
# ======================================================================

def _wrap(
    payload: Dict[str, Any],
    tier: int,
    provenance: List[str],
    llm_provider: Optional[str] = None,
    llm_model: Optional[str] = None,
) -> Dict[str, Any]:
    payload = dict(payload)  # don't mutate caller's dict
    payload["source_tier"] = tier
    payload["provenance"] = provenance
    # Always tell the UI which engine produced this — Tier 2/3 are
    # explicitly labeled "deterministic" so the "Powered by..." chip
    # never lies. Tier 1 carries the actual provider+model.
    if tier == 1 and llm_provider:
        payload["llm_provider"] = llm_provider
        payload["llm_model"] = llm_model
    else:
        payload["llm_provider"] = "deterministic"
        payload["llm_model"] = "kb_template" if tier == 2 else "safe_default"
    return payload


def _dedupe(items: List[str]) -> List[str]:
    seen: set = set()
    out: List[str] = []
    for i in items:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out
