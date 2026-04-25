from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
from google import genai
import os
import re
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

import asyncio
import time

from tiered_ai import (
    tiered_analyze_intake,
    tiered_build_patient_profile,
    tiered_nurse_assist,
    tiered_provider_copilot,
    tiered_rank_queue,
)
from retrieval import (
    DRUG_INTERACTIONS,
    ICD10_CODES,
    lookup_icd10,
)

load_dotenv()

# Build the Gemini client only if an API key is present. Anywhere downstream
# that sees `client is None` treats that as "LLM unavailable" and falls back
# to the Tier 2/3 local pipeline — no hard failure, ever.
_api_key = os.getenv("GEMINI_API_KEY")
try:
    client = genai.Client(api_key=_api_key) if _api_key else None
except Exception as e:  # noqa: BLE001
    print(f"Gemini client init failed, running in KB-only mode: {e}")
    client = None

# Shared-secret gate for server-to-server calls (Phase 9 / S-hardening).
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "frudgecare-internal-dev-secret")


async def verify_internal_secret(x_internal_secret: Optional[str] = Header(default=None)):
    if x_internal_secret != INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized — missing or invalid internal API secret")
    return True


app = FastAPI(title="FrudgeCare AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================================================================
# /analyze-intake  — AI Level 1
# ======================================================================
#
# Wire contract (Step 2 of the hackathon spec, F-03):
#
# Request — tolerates BOTH the legacy intake form (severity:str) and the new
# /triage page (severity:int NRS, age_group). Pydantic `extra=ignore` so any
# future caller field is silently dropped instead of producing 422.
#
# Response — superset of the legacy AIAnalysis. Adds:
#   - urgency_reason       (1-line clinician-facing rationale)
#   - extracted_symptoms   (clinical entities surfaced from the narrative)
#   - negations            (entities the patient explicitly denies)
#   - rag_evidence         (verbatim guideline text chosen BEFORE the LLM)
#   - rag_source           (citation for the guideline above)
#   - recommended_route    (single-line care coordinator action)
#   - fhir_output          (CarePlan-shaped JSON, R4-compatible)
#
# All legacy fields are still present so the rest of the platform (front desk,
# nurse, provider, ops) keeps working unchanged.


class IntakeRequest(BaseModel):
    # `extra=ignore` is the bug fix for the 422: requests from /triage carry
    # `age_group` and a numeric `severity`. Legacy callers still pass strings.
    model_config = {"extra": "ignore"}

    symptoms: str
    duration: str = "as described"
    severity: Union[str, int, float] = "moderate"
    patient_history: Optional[str] = ""
    age: Optional[int] = None
    age_group: Optional[str] = None


def _coerce_severity(v: Union[str, int, float, None]) -> str:
    """Normalize severity to {mild, moderate, severe} for the tiered pipeline."""
    if v is None:
        return "moderate"
    if isinstance(v, (int, float)):
        n = float(v)
        if n >= 7:
            return "severe"
        if n >= 4:
            return "moderate"
        return "mild"
    s = str(v).strip().lower()
    if not s:
        return "moderate"
    if s in {"severe", "high", "critical", "urgent"}:
        return "severe"
    if s in {"moderate", "medium", "semi-urgent"}:
        return "moderate"
    if s in {"mild", "low", "non-urgent"}:
        return "mild"
    return s


@app.post("/analyze-intake", dependencies=[Depends(verify_internal_secret)])
async def analyze_intake(request: IntakeRequest):
    """
    Grounded patient intake analysis with 4-tier resilience:
      T0 KB retrieval → T1 Gemini-as-verifier → T2 templated → T3 safe default.

    The response is then enriched with the hackathon Step 2 schema (entities,
    negations, RAG evidence, FHIR CarePlan, recommended route) plus the Step 3
    multi-layer NLP outputs (vitals, temporal, demographics, meds, ICD-10).
    """
    return _build_intake_payload(request)


def _build_intake_payload(request: IntakeRequest) -> Dict[str, Any]:
    """
    Pure function (no FastAPI dependency injection inside) so the cascade
    orchestrator below can call it concurrently with the other AI endpoints.
    """
    timings: Dict[str, int] = {}

    severity_str = _coerce_severity(request.severity)

    # --- NLP regex layer (always runs, instant, deterministic) --------------
    t0 = time.perf_counter()
    extracted_vitals = _extract_vitals(request.symptoms)
    extracted_temporal = _extract_temporal(request.symptoms)
    extracted_demographics = _extract_demographics(request.symptoms)
    extracted_meds = _extract_medications(
        " ".join([request.symptoms or "", request.patient_history or ""]).strip()
    )
    timings["nlp_regex_ms"] = int((time.perf_counter() - t0) * 1000)

    # --- RAG: pick top-3 guidelines BEFORE any LLM call --------------------
    t0 = time.perf_counter()
    guidelines = _retrieve_guidelines(request.symptoms, top_k=3)
    timings["rag_ms"] = int((time.perf_counter() - t0) * 1000)
    primary = guidelines[0] if guidelines else None

    # --- KB-grounded base analysis (existing tiered pipeline) --------------
    t0 = time.perf_counter()
    # If the narrative didn't hand us an explicit age, but NLP extracted one,
    # use the NLP value so the existing red-flag rules with `age_min` fire.
    effective_age = request.age or extracted_demographics.get("age")
    base = tiered_analyze_intake(
        client=client,
        symptoms=request.symptoms,
        duration=request.duration,
        severity=severity_str,
        patient_history=request.patient_history or "",
        age=effective_age,
    )
    timings["llm_intake_ms"] = int((time.perf_counter() - t0) * 1000)

    # --- NLP entity extraction layer (LLM-preferred, lexicon fallback) -----
    t0 = time.perf_counter()
    entities = _extract_entities(
        client=client,
        symptoms=request.symptoms,
        kb_provenance=base.get("provenance", []) or [],
    )
    timings["nlp_entities_ms"] = int((time.perf_counter() - t0) * 1000)

    # --- ICD-10 auto-tagging for every extracted symptom -------------------
    icd10_tags = _icd10_tag(entities["symptoms"])

    # --- Urgency mapping + agreement-based confidence pill -----------------
    legacy_urgency = str(base.get("urgency", "medium"))
    red_flag_fired = any(
        isinstance(p, str) and ("red_flag" in p.lower() or p.startswith("RF"))
        for p in (base.get("provenance") or [])
    )
    urgency_label = _map_urgency_label(legacy=legacy_urgency, red_flag_fired=red_flag_fired)
    urgency_label = _maybe_escalate_for_vitals(urgency_label, extracted_vitals)

    recommended_route = _route_for(
        urgency_label,
        age_group=request.age_group or extracted_demographics.get("age_group"),
    )

    confidence = _ai_confidence(
        legacy_urgency=legacy_urgency,
        urgency_label=urgency_label,
        red_flag_fired=red_flag_fired,
        rag_score=primary["score"] if primary else 0.0,
        source_tier=int(base.get("source_tier", 3)),
    )

    fhir_output = _build_careplan(
        symptoms=request.symptoms,
        urgency_label=urgency_label,
        recommended_route=recommended_route,
        risks=base.get("risks", []) or [],
        rag_source=(primary["source"] if primary else "Clinical knowledge base"),
        extracted_vitals=extracted_vitals,
        icd10_tags=icd10_tags,
    )

    return {
        # Legacy fields (unchanged) — every existing platform consumer still works.
        "urgency": base.get("urgency", "medium"),
        "summary": base.get("summary", ""),
        "risks": base.get("risks", []) or [],
        "reasoning": base.get("reasoning", ""),
        "clinician_brief": base.get("clinician_brief", ""),
        "source_tier": base.get("source_tier", 3),
        "provenance": base.get("provenance", []) or [],
        # Hackathon Step 2 superset.
        "urgency_label": urgency_label,
        "urgency_reason": (
            base.get("clinician_brief")
            or base.get("reasoning")
            or "Triage assessment generated from symptom narrative and clinical KB."
        ),
        "extracted_symptoms": entities["symptoms"],
        "negations": entities["negations"],
        "risk_flags": entities["risk_flags"],
        "rag_evidence": primary["text"] if primary else "",
        "rag_source": primary["source"] if primary else "",
        "recommended_route": recommended_route,
        "fhir_output": fhir_output,
        # Step 3 multi-layer NLP & RAG enrichments.
        "rag_matches": guidelines,
        "extracted_vitals": extracted_vitals,
        "extracted_temporal": extracted_temporal,
        "extracted_demographics": extracted_demographics,
        "extracted_medications": extracted_meds,
        "icd10_tags": icd10_tags,
        "ai_confidence": confidence,
        "pipeline_timings_ms": timings,
        "kb_stats": {
            "guideline_count": len([g for g in CLINICAL_GUIDELINES if g.get("keywords")]),
            "icd10_count": len(ICD10_CODES),
            "drug_interaction_count": len(DRUG_INTERACTIONS),
        },
    }


# ----------------------------------------------------------------------
# Hackathon Step 2 helpers — RAG corpus, NLP, urgency mapping, FHIR.
# ----------------------------------------------------------------------

# Curated, hand-authored guideline excerpts. This IS the RAG corpus for the
# triage demo: short, citable, and selected by deterministic keyword matching
# BEFORE any LLM call so the surfaced evidence is provably grounded, not
# hallucinated. Each entry is paraphrased from the cited public guideline for
# educational/demo use; clinicians must rely on the original sources.
#
# Pluggable backend: the keyword scorer lives in `_retrieve_guidelines` below.
# To swap in a vector backend (ChromaDB + sentence-transformers), implement an
# alternative retriever with the same `(symptoms) -> ranked_list` signature
# and select via `RAG_BACKEND` in `.env`. The guideline payload shape stays
# identical so neither the cascade endpoint nor the UI need to change.
CLINICAL_GUIDELINES: List[Dict[str, Any]] = [
    {
        "id": "acs-chest-pain",
        "keywords": [
            "chest pain", "crushing", "pressure", "radiating", "left arm",
            "jaw pain", "diaphoresis", "shortness of breath", "acs", "angina",
            "stemi", "troponin",
        ],
        "text": (
            "Acute chest pain with radiation to the arm or jaw, diaphoresis, "
            "or new dyspnea should be treated as possible acute coronary "
            "syndrome (ACS). Obtain a 12-lead ECG within 10 minutes of arrival "
            "and serial high-sensitivity troponins. Do not delay transport for "
            "a definitive diagnosis."
        ),
        "source": "ACC/AHA 2021 Chest Pain Guideline (paraphrased)",
        "route_hint": "Emergency Department — STEMI/NSTEMI workup within 10 minutes",
    },
    {
        "id": "stroke-fast",
        "keywords": [
            "facial drooping", "face drooping", "slurred speech", "arm weakness",
            "one-sided weakness", "numbness", "stroke", "fast", "aphasia",
            "vision loss", "hemiparesis", "last known well",
        ],
        "text": (
            "Sudden-onset focal neurologic deficits (facial droop, arm "
            "weakness, speech disturbance) are stroke until proven otherwise. "
            "Document last-known-well time, activate stroke team, and obtain "
            "non-contrast head CT to triage thrombolytic eligibility within "
            "the 4.5-hour window."
        ),
        "source": "AHA/ASA 2019 Acute Ischemic Stroke Guideline (paraphrased)",
        "route_hint": "Emergency Department — stroke team activation, CT within 25 min",
    },
    {
        "id": "sepsis-qsofa",
        "keywords": [
            "fever", "tachycardia", "tachypnea", "altered mental status",
            "confused", "lethargic", "hypotension", "sepsis", "infection",
            "qsofa", "septic shock", "lactate",
        ],
        "text": (
            "Suspect sepsis when ≥2 qSOFA criteria are present (RR ≥22, "
            "altered mentation, SBP ≤100). Initiate the 1-hour bundle: "
            "lactate, blood cultures before antibiotics, broad-spectrum "
            "antimicrobials, and 30 mL/kg crystalloid for hypotension or "
            "lactate ≥4 mmol/L."
        ),
        "source": "Surviving Sepsis Campaign 2021 (paraphrased)",
        "route_hint": "Emergency Department — Sepsis 1-hour bundle",
    },
    {
        "id": "peds-fever-meningitis",
        "keywords": [
            "child", "pediatric", "infant", "toddler", "fever", "neck stiffness",
            "rash", "irritable", "petechial", "bulging fontanelle", "meningitis",
            "lethargy", "non-blanching",
        ],
        "text": (
            "A febrile child with neck stiffness, petechial/purpuric rash, "
            "altered mental status, or focal neurologic findings is a "
            "meningitis red flag. Do not wait for lumbar puncture results — "
            "give empirical IV antibiotics within 1 hour and consider "
            "dexamethasone per local protocol."
        ),
        "source": "NICE NG143 Fever in under 5s (paraphrased)",
        "route_hint": "Pediatric ED — empirical antibiotics within 60 minutes",
    },
    {
        "id": "anaphylaxis",
        "keywords": [
            "anaphylaxis", "swelling", "throat swelling", "tongue swelling",
            "hives", "urticaria", "wheezing", "stridor", "epinephrine",
            "allergic reaction", "facial swelling", "difficulty breathing",
        ],
        "text": (
            "Anaphylaxis is suspected with acute onset of skin/mucosal "
            "involvement plus respiratory compromise OR hypotension. "
            "Administer IM epinephrine 0.3–0.5 mg (adult) into the "
            "anterolateral thigh immediately; do not delay for IV access. "
            "Repeat every 5–15 minutes as needed."
        ),
        "source": "WAO Anaphylaxis Guidance 2020 (paraphrased)",
        "route_hint": "Emergency Department — IM epinephrine before transport",
    },
    {
        "id": "pe-wells",
        "keywords": [
            "pulmonary embolism", "pe", "leg swelling", "calf swelling",
            "dvt", "immobilization", "pleuritic", "hemoptysis", "tachycardia",
            "shortness of breath", "post-op", "recent surgery",
        ],
        "text": (
            "Apply the Wells score for suspected pulmonary embolism. Score >4 "
            "is PE-likely → CT pulmonary angiogram. Score ≤4 plus negative "
            "high-sensitivity D-dimer effectively rules out PE without "
            "imaging. Begin therapeutic anticoagulation pending imaging if "
            "clinical suspicion is high and bleeding risk is acceptable."
        ),
        "source": "ESC 2019 PE Diagnosis & Management (paraphrased)",
        "route_hint": "Emergency Department — Wells score + D-dimer / CTPA",
    },
    {
        "id": "dka",
        "keywords": [
            "diabetes", "diabetic", "type 1", "type 2", "polyuria", "polydipsia",
            "ketoacidosis", "dka", "fruity breath", "kussmaul", "vomiting",
            "abdominal pain", "high glucose", "blood sugar",
        ],
        "text": (
            "Diabetic ketoacidosis is defined by hyperglycemia (>250 mg/dL), "
            "anion-gap acidosis, and ketonemia. Initiate isotonic fluid "
            "resuscitation, IV insulin infusion only after potassium >3.3 "
            "mEq/L is confirmed, and replace electrolytes per protocol. "
            "Search for and treat the precipitating cause (infection, missed "
            "insulin)."
        ),
        "source": "ADA Diabetes Standards of Care (paraphrased)",
        "route_hint": "Emergency Department — DKA protocol with q1h glucose/K+",
    },
    {
        "id": "gi-bleed",
        "keywords": [
            "melena", "hematemesis", "coffee ground", "rectal bleeding",
            "blood in stool", "blood in vomit", "gi bleed", "upper gi",
            "lower gi", "hematochezia",
        ],
        "text": (
            "Suspected upper GI bleed requires immediate IV access (two "
            "large-bore), type & crossmatch, and PPI infusion. Apply the "
            "Glasgow-Blatchford score; score ≥2 typically warrants admission "
            "and endoscopy within 24 hours. Reverse anticoagulants per "
            "local protocol if applicable."
        ),
        "source": "ACG 2021 Upper GI Bleed Guideline (paraphrased)",
        "route_hint": "Emergency Department — IV access, PPI, urgent endoscopy",
    },
    {
        "id": "asthma-exacerbation",
        "keywords": [
            "asthma", "wheezing", "wheeze", "inhaler", "albuterol",
            "shortness of breath", "expiratory", "peak flow", "tripod",
            "accessory muscle", "silent chest",
        ],
        "text": (
            "Severe asthma exacerbation: SpO2 <92%, peak flow <50% predicted, "
            "or inability to speak full sentences. Give continuous nebulized "
            "albuterol + ipratropium, systemic corticosteroids within the "
            "first hour, and consider IV magnesium sulfate. A silent chest "
            "is a pre-arrest sign and warrants immediate intubation prep."
        ),
        "source": "GINA 2024 Global Asthma Strategy (paraphrased)",
        "route_hint": "Emergency Department — neb/steroids/MgSO4, monitor for ICU",
    },
    {
        "id": "opioid-overdose",
        "keywords": [
            "overdose", "opioid", "heroin", "fentanyl", "oxycodone",
            "pinpoint pupils", "respiratory depression", "naloxone", "narcan",
            "unresponsive", "shallow breathing",
        ],
        "text": (
            "Opioid overdose is suggested by the triad of CNS depression, "
            "respiratory depression (RR <12), and miotic pupils. Administer "
            "naloxone 0.4–2 mg IM/IN; titrate to adequate respirations rather "
            "than full alertness to avoid precipitated withdrawal. Observe "
            "≥4 hours post-reversal due to naloxone half-life."
        ),
        "source": "ACEP Naloxone Guidance (paraphrased)",
        "route_hint": "Emergency Department — naloxone, airway support, observation",
    },
    {
        "id": "hypoglycemia",
        "keywords": [
            "hypoglycemia", "low blood sugar", "diabetic on insulin",
            "sweating", "tremor", "confusion", "diaphoretic", "shaky",
            "loss of consciousness", "glucose", "dextrose",
        ],
        "text": (
            "Symptomatic hypoglycemia (BG <70 mg/dL) in a conscious patient: "
            "give 15–20 g rapid carbohydrate, recheck in 15 min, repeat once "
            "if still low. Unconscious or NPO: 25 g IV dextrose (50 mL of "
            "D50W) or 1 mg IM glucagon. Identify cause (insulin error, missed "
            "meal, sulfonylurea ingestion)."
        ),
        "source": "Endocrine Society Hypoglycemia Guideline (paraphrased)",
        "route_hint": "ED or urgent care — rapid carbohydrate, identify cause",
    },
    {
        "id": "general-triage",
        "keywords": [],  # Catch-all — selected only if nothing else fires.
        "text": (
            "Where presenting features do not match a specific high-acuity "
            "pathway, perform a structured ABCDE primary survey, document "
            "vitals and pain score, and re-triage at defined intervals "
            "until a clinician completes a full assessment."
        ),
        "source": "ESI Implementation Handbook (paraphrased)",
        "route_hint": "Same-day clinical assessment with timed reassessment",
    },
]


def _retrieve_guidelines(symptoms: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Deterministic keyword RAG. Returns the top-k guidelines with their
    matched-keyword evidence and a normalized 0–1 score so the UI can render
    confidence bars and judges can see retrieval is doing real work.
    """
    text = (symptoms or "").lower()
    scored: List[Dict[str, Any]] = []
    for g in CLINICAL_GUIDELINES:
        kws = g.get("keywords", [])
        if not kws:
            continue
        matched = [kw for kw in kws if kw in text]
        if not matched:
            continue
        # Coverage = matches/total keywords; capped at 1.0 with a small bonus
        # for hitting >3 distinct terms so very strong matches stand out.
        coverage = len(matched) / len(kws)
        bonus = min(0.15, 0.05 * max(0, len(matched) - 3))
        scored.append({
            "id": g["id"],
            "text": g["text"],
            "source": g["source"],
            "route_hint": g["route_hint"],
            "matched_keywords": matched,
            "score": round(min(1.0, coverage + bonus), 3),
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    if not scored:
        catchall = next(g for g in CLINICAL_GUIDELINES if g["id"] == "general-triage")
        return [{
            "id": catchall["id"],
            "text": catchall["text"],
            "source": catchall["source"],
            "route_hint": catchall["route_hint"],
            "matched_keywords": [],
            "score": 0.0,
        }]
    return scored[:top_k]


def _retrieve_guideline(symptoms: str) -> Dict[str, str]:
    """Backwards-compatible single-best retriever (kept for legacy callers)."""
    top = _retrieve_guidelines(symptoms, top_k=1)
    g = top[0]
    return {
        "id": g["id"],
        "text": g["text"],
        "source": g["source"],
        "route_hint": g["route_hint"],
    }


# Negation cues used by the deterministic NLP fallback. Lowercased.
_NEGATION_CUES = (
    "denies", "denying", "no ", "not ", "without ", "negative for ",
    "ruled out", "absent ", "no history of ",
)

# Small, demo-focused clinical lexicon. Used only when Gemini is unavailable.
_FALLBACK_SYMPTOM_LEXICON = [
    "chest pain", "shortness of breath", "diaphoresis", "dizziness", "nausea",
    "vomiting", "headache", "fever", "neck stiffness", "rash", "confusion",
    "lethargy", "facial drooping", "slurred speech", "arm weakness",
    "leg weakness", "abdominal pain", "back pain", "tachycardia",
    "tachypnea", "hypotension", "hypertension", "syncope", "seizure",
]
_FALLBACK_RISK_LEXICON = [
    "radiating to", "ST elevation", "qSOFA", "altered mental status",
    "petechial rash", "neck stiffness", "BP 88", "BP 90", "BP 100",
    "fever 39", "fever 40",
]


def _extract_entities(
    client: Any, symptoms: str, kb_provenance: List[str]
) -> Dict[str, List[str]]:
    """
    Extract clinical entities, negations, and risk flags from the narrative.

    Strategy:
      Tier A — Gemini structured-JSON pass (fast, accurate, demo-quality).
      Tier B — deterministic lexicon scan (always works, never hallucinates).
    """
    text = (symptoms or "").strip()
    if not text:
        return {"symptoms": [], "negations": [], "risk_flags": []}

    if client is not None:
        try:
            from google.genai import types  # local import keeps cold start fast

            prompt = (
                "You are a clinical NLP extractor. Read the patient narrative and "
                "return ONLY valid JSON with three arrays of short lowercase "
                "strings:\n"
                "  symptoms: positively reported symptoms / signs (e.g. 'chest pain')\n"
                "  negations: items the patient explicitly denies or rules out\n"
                "  risk_flags: phrases that indicate clinical red flags (e.g. "
                "'radiating to left arm', 'qsofa positive')\n"
                "Do NOT invent findings that are not in the text. If a list is "
                "empty, return [].\n\n"
                f"NARRATIVE: {text}"
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash-lite",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            import json as _json
            data = _json.loads(response.text)
            return {
                "symptoms": _clean_list(data.get("symptoms"))[:12],
                "negations": _clean_list(data.get("negations"))[:8],
                "risk_flags": _clean_list(data.get("risk_flags"))[:8],
            }
        except Exception as e:  # noqa: BLE001
            print(f"[NLP] Gemini entity extraction failed, using lexicon: {e}")

    # --- Deterministic lexicon fallback ---
    low = text.lower()
    sentences = re.split(r"[.!?\n]+", low)
    negated_terms: List[str] = []
    positive_terms: List[str] = []

    for term in _FALLBACK_SYMPTOM_LEXICON:
        if term not in low:
            continue
        is_neg = False
        for sent in sentences:
            if term not in sent:
                continue
            for cue in _NEGATION_CUES:
                idx = sent.find(cue)
                if idx != -1 and idx < sent.find(term):
                    is_neg = True
                    break
            if is_neg:
                break
        (negated_terms if is_neg else positive_terms).append(term)

    risk_flags = [t for t in _FALLBACK_RISK_LEXICON if t.lower() in low]

    return {
        "symptoms": _dedupe_keep_order(positive_terms)[:12],
        "negations": _dedupe_keep_order(negated_terms)[:8],
        "risk_flags": _dedupe_keep_order(risk_flags)[:8],
    }


def _clean_list(v: Any) -> List[str]:
    if not isinstance(v, list):
        return []
    out: List[str] = []
    for item in v:
        s = str(item).strip().lower()
        if s and s not in out:
            out.append(s)
    return out


def _dedupe_keep_order(items: List[str]) -> List[str]:
    seen: set = set()
    out: List[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


def _map_urgency_label(legacy: str, red_flag_fired: bool) -> str:
    """Map legacy urgency (high/medium/low) → hackathon 4-level scale."""
    s = (legacy or "").strip().lower()
    if s == "high":
        # If a hard red flag fired we escalate to CRITICAL, otherwise URGENT.
        return "CRITICAL" if red_flag_fired else "URGENT"
    if s == "medium":
        return "SEMI-URGENT"
    if s == "low":
        return "NON-URGENT"
    # Already in hackathon scale? Pass it through.
    s_up = s.upper()
    if s_up in {"CRITICAL", "URGENT", "SEMI-URGENT", "NON-URGENT"}:
        return s_up
    return "URGENT"


def _route_for(urgency_label: str, age_group: Optional[str] = None) -> str:
    pediatric = (age_group or "").strip().lower() == "pediatric"
    if urgency_label == "CRITICAL":
        return (
            "Pediatric Emergency Department — escalate to senior clinician now"
            if pediatric
            else "Emergency Department — escalate to senior clinician now"
        )
    if urgency_label == "URGENT":
        return "Urgent care or ED triage — assess within 60 minutes"
    if urgency_label == "SEMI-URGENT":
        return "Same-day clinic visit — primary care or urgent care"
    return "Primary care follow-up — non-time-critical"


def _build_careplan(
    symptoms: str,
    urgency_label: str,
    recommended_route: str,
    risks: List[str],
    rag_source: str,
    extracted_vitals: Optional[List[Dict[str, Any]]] = None,
    icd10_tags: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return a FHIR R4 CarePlan-shaped dict suitable for EHR ingestion demos."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    activities: List[Dict[str, Any]] = [
        {
            "detail": {
                "kind": "ServiceRequest",
                "status": "not-started",
                "description": recommended_route,
            }
        }
    ]
    for r in risks[:5]:
        activities.append({
            "detail": {
                "kind": "ServiceRequest",
                "status": "not-started",
                "description": f"Evaluate / rule out: {r}",
            }
        })

    # Embed FHIR Observation entries for vitals the NLP regex layer extracted
    # so judges can see the structured FHIR payload includes real measurements,
    # not just a plan stub.
    contained: List[Dict[str, Any]] = []
    for i, v in enumerate(extracted_vitals or []):
        contained.append({
            "resourceType": "Observation",
            "id": f"vital-{i+1}",
            "status": "preliminary",
            "category": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "vital-signs",
                }],
            }],
            "code": {"text": v.get("field", "vital")},
            "valueQuantity": {
                "value": v.get("value"),
                "unit": v.get("unit", ""),
            },
            "interpretation": [{"text": v.get("status", "preliminary")}],
        })

    code_coding = []
    for tag in (icd10_tags or [])[:5]:
        if tag.get("code"):
            code_coding.append({
                "system": "http://hl7.org/fhir/sid/icd-10",
                "code": tag["code"],
                "display": tag.get("display", ""),
            })

    plan: Dict[str, Any] = {
        "resourceType": "CarePlan",
        "status": "active",
        "intent": "plan",
        "title": f"Triage Care Plan — {urgency_label}",
        "description": (
            "AI-generated triage recommendation grounded in the cited "
            "clinical guideline. For clinical decision support only."
        ),
        "created": now,
        "subject": {"display": "Demo patient (synthetic)"},
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/care-plan-category",
                        "code": "assess-plan",
                        "display": "Assessment and Plan of Treatment",
                    }
                ]
            }
        ],
        "note": [
            {"text": f"Patient narrative: {symptoms[:240]}"},
            {"text": f"Guideline reference: {rag_source}"},
        ],
        "activity": activities,
    }
    if contained:
        plan["contained"] = contained
    if code_coding:
        plan["addresses"] = [{"display": c["display"], "identifier": {"value": c["code"]}} for c in code_coding]
    return plan


# ----------------------------------------------------------------------
# Phase C — deterministic NLP regex extractors. Always run, never fail.
# ----------------------------------------------------------------------

# Each entry: (regex, FHIR-style field, unit, KB key in vitals_ranges.json).
_VITAL_PATTERNS: List[tuple] = [
    # BP 165/95, BP: 88/60, blood pressure 165/95
    (re.compile(r"\bbp[: ]\s*(\d{2,3})\s*/\s*(\d{2,3})", re.I), "BP", "mmHg", None),
    (re.compile(r"\bblood pressure[: ]\s*(\d{2,3})\s*/\s*(\d{2,3})", re.I), "BP", "mmHg", None),
    # HR 118, heart rate 118, pulse 118
    (re.compile(r"\b(?:hr|heart rate|pulse)[: ]*\s*(\d{2,3})\b", re.I), "HR", "bpm", "Heart Rate"),
    # RR 22, respiratory rate 22
    (re.compile(r"\b(?:rr|respiratory rate|resp rate)[: ]*\s*(\d{1,3})\b", re.I), "RR", "/min", "Respiratory Rate"),
    # Temp 39.8°C, temperature 39.8 C, fever 40.1
    (re.compile(r"\b(?:temp(?:erature)?|fever)[: ]*\s*(\d{2,3}(?:\.\d)?)\s*°?\s*([cf])?\b", re.I), "Temp", "°C", "Temperature"),
    # SpO2 88%, O2 sat 92, oxygen saturation 88%
    (re.compile(r"\b(?:spo2|o2 sat(?:uration)?|oxygen saturation)[: ]*\s*(\d{1,3})\s*%?", re.I), "SpO2", "%", "O2 Saturation"),
    # Glucose 245 mg/dL, blood sugar 320
    (re.compile(r"\b(?:glucose|blood sugar|bg)[: ]*\s*(\d{2,3})\s*(?:mg/dl)?", re.I), "Glucose", "mg/dL", None),
]


def _classify_vital(field: str, value: float, raw_unit: Optional[str] = None) -> str:
    """Quick heuristic vital flag — keeps NLP layer self-sufficient."""
    if field == "BP_systolic":
        if value <= 90 or value >= 180:
            return "critical"
        if value <= 100 or value >= 160:
            return "warning"
    elif field == "HR":
        if value <= 40 or value >= 130:
            return "critical"
        if value <= 50 or value >= 110:
            return "warning"
    elif field == "RR":
        if value <= 8 or value >= 28:
            return "critical"
        if value <= 10 or value >= 22:
            return "warning"
    elif field == "Temp":
        if value <= 35.0 or value >= 40.0:
            return "critical"
        if value <= 36.0 or value >= 38.5:
            return "warning"
    elif field == "SpO2":
        if value < 90:
            return "critical"
        if value < 94:
            return "warning"
    elif field == "Glucose":
        if value < 54 or value > 400:
            return "critical"
        if value < 70 or value > 250:
            return "warning"
    return "normal"


def _extract_vitals(text: str) -> List[Dict[str, Any]]:
    if not text:
        return []
    out: List[Dict[str, Any]] = []
    seen_fields: set = set()

    for pattern, field, unit, _kb_key in _VITAL_PATTERNS:
        for m in pattern.finditer(text):
            try:
                if field == "BP":
                    sys_v = float(m.group(1))
                    dia_v = float(m.group(2))
                    if "BP_systolic" not in seen_fields:
                        out.append({
                            "field": "BP Systolic",
                            "value": sys_v,
                            "unit": unit,
                            "status": _classify_vital("BP_systolic", sys_v),
                        })
                        seen_fields.add("BP_systolic")
                    if "BP_diastolic" not in seen_fields:
                        out.append({
                            "field": "BP Diastolic",
                            "value": dia_v,
                            "unit": unit,
                            "status": "normal",
                        })
                        seen_fields.add("BP_diastolic")
                elif field == "Temp":
                    v = float(m.group(1))
                    raw_unit = (m.group(2) or "").lower()
                    # Convert F → C if the writer used Fahrenheit (heuristic: >50)
                    if raw_unit == "f" or v > 50:
                        v = round((v - 32) * 5 / 9, 1)
                    if field not in seen_fields:
                        out.append({
                            "field": "Temperature",
                            "value": v,
                            "unit": "°C",
                            "status": _classify_vital("Temp", v),
                        })
                        seen_fields.add(field)
                else:
                    v = float(m.group(1))
                    if field not in seen_fields:
                        out.append({
                            "field": _vital_display(field),
                            "value": v,
                            "unit": unit,
                            "status": _classify_vital(field, v),
                        })
                        seen_fields.add(field)
            except (ValueError, IndexError):
                continue
    return out


def _vital_display(field: str) -> str:
    return {
        "HR": "Heart Rate",
        "RR": "Respiratory Rate",
        "SpO2": "O2 Saturation",
        "Glucose": "Glucose",
    }.get(field, field)


_TEMPORAL_PATTERNS = [
    re.compile(r"\bonset[: ]*\s*([\w\s]+?\s*ago)", re.I),
    re.compile(r"\b(\d+)\s*(minute|hour|day|week|month)s?\s*ago", re.I),
    re.compile(r"\bfor\s+(\d+)\s*(minute|hour|day|week|month)s?\b", re.I),
    re.compile(r"\bsince\s+(yesterday|this morning|last night|today)", re.I),
    re.compile(r"\bstarted\s+(\d+\s*\w+\s*ago)", re.I),
]


def _extract_temporal(text: str) -> Dict[str, Any]:
    """Extract onset/duration phrasing and (when possible) minutes since onset."""
    if not text:
        return {"phrases": [], "minutes_since_onset": None}
    phrases: List[str] = []
    minutes: Optional[int] = None
    low = text.lower()

    for p in _TEMPORAL_PATTERNS:
        for m in p.finditer(low):
            phrase = m.group(0).strip()
            if phrase not in phrases:
                phrases.append(phrase)

    # Try to compute minutes since onset for the first numeric "X units ago".
    num_unit = re.search(r"\b(\d+)\s*(minute|hour|day|week|month)s?\s*ago", low)
    if num_unit:
        n = int(num_unit.group(1))
        unit = num_unit.group(2)
        mult = {"minute": 1, "hour": 60, "day": 1440, "week": 10080, "month": 43200}[unit]
        minutes = n * mult

    return {"phrases": phrases[:4], "minutes_since_onset": minutes}


def _extract_demographics(text: str) -> Dict[str, Any]:
    """Pull age and sex from common framings like '67-year-old male'."""
    if not text:
        return {"age": None, "sex": None, "age_group": None}
    age: Optional[int] = None
    sex: Optional[str] = None

    m = re.search(r"\b(\d{1,3})[- ]year[- ]old\b", text, re.I)
    if m:
        try:
            n = int(m.group(1))
            if 0 < n < 130:
                age = n
        except ValueError:
            pass

    if re.search(r"\b(male|man|boy|gentleman)\b", text, re.I):
        sex = "male"
    elif re.search(r"\b(female|woman|girl|lady)\b", text, re.I):
        sex = "female"

    age_group: Optional[str] = None
    if age is not None:
        if age < 18:
            age_group = "Pediatric"
        elif age >= 65:
            age_group = "Geriatric"
        else:
            age_group = "Adult"
    elif re.search(r"\b(child|toddler|infant|pediatric)\b", text, re.I):
        age_group = "Pediatric"

    return {"age": age, "sex": sex, "age_group": age_group}


def _extract_medications(text: str) -> List[Dict[str, Any]]:
    """
    Match drug names and aliases from the existing drug-interaction KB.

    Uses word-boundary regex so a 2-letter alias like "si" doesn't fire on
    every word containing those letters. Multi-word aliases use literal
    case-insensitive search (the KB never stores fragments shorter than 3
    chars in those).
    """
    if not text:
        return []
    found: List[Dict[str, Any]] = []
    seen: set = set()

    for entry in DRUG_INTERACTIONS:
        for which in ("a", "b"):
            name = entry.get(f"drug_{which}", "")
            aliases = entry.get(f"drug_{which}_aliases", []) or []
            candidates = [name] + list(aliases)
            for cand in candidates:
                if not cand:
                    continue
                pattern = r"\b" + re.escape(cand.lower()) + r"\b"
                if re.search(pattern, text.lower()) and name.lower() not in seen:
                    seen.add(name.lower())
                    found.append({
                        "name": name,
                        "matched_on": cand,
                    })
                    break
    return found[:8]


def _icd10_tag(symptoms: List[str]) -> List[Dict[str, Any]]:
    """
    Best-effort ICD-10 lookup for each extracted symptom string.

    Tries the canonical lookup first, then falls back to a bidirectional
    alias substring match so phrases like "crushing chest pain" still
    resolve to R07.9 (alias "chest pain"). Keeps results unique by code.
    """
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for s in symptoms or []:
        if not s:
            continue
        hit = lookup_icd10(s)
        if not hit:
            s_l = s.lower()
            for entry in ICD10_CODES:
                aliases = [a.lower() for a in entry.get("aliases", [])]
                disp_first = entry.get("display", "").lower().split(",")[0].strip()
                # Word-boundary match — avoids "si" hitting "diaphoreSIs", etc.
                # We also require any short alias to be ≥3 chars to be considered.
                alias_hit = any(
                    a and len(a) >= 3 and re.search(r"\b" + re.escape(a) + r"\b", s_l)
                    for a in aliases
                )
                disp_hit = bool(
                    disp_first
                    and len(disp_first) >= 4
                    and re.search(r"\b" + re.escape(disp_first) + r"\b", s_l)
                )
                if alias_hit or disp_hit:
                    hit = entry
                    break
        if hit and hit.get("code") and hit["code"] not in seen:
            seen.add(hit["code"])
            out.append({
                "term": s,
                "code": hit["code"],
                "display": hit.get("display", s),
            })
    return out


def _maybe_escalate_for_vitals(
    urgency_label: str, vitals: List[Dict[str, Any]]
) -> str:
    """Escalate to CRITICAL whenever NLP found a critical vital flag."""
    if any(v.get("status") == "critical" for v in vitals):
        return "CRITICAL"
    if urgency_label == "NON-URGENT" and any(
        v.get("status") == "warning" for v in vitals
    ):
        return "SEMI-URGENT"
    return urgency_label


def _ai_confidence(
    legacy_urgency: str,
    urgency_label: str,
    red_flag_fired: bool,
    rag_score: float,
    source_tier: int,
) -> Dict[str, Any]:
    """Compose a 0–100% confidence pill from cross-layer agreement."""
    # Tier-based base confidence: higher tier = more grounded.
    tier_base = {1: 0.78, 2: 0.65, 3: 0.45}.get(source_tier, 0.5)
    rag_boost = min(0.18, rag_score * 0.18)
    rf_boost = 0.05 if red_flag_fired else 0.0
    # Penalize disagreement between legacy and label-mapped urgency.
    expected = _map_urgency_label(legacy=legacy_urgency, red_flag_fired=red_flag_fired)
    agreement_penalty = 0.0 if expected == urgency_label else 0.07
    score = max(0.0, min(1.0, tier_base + rag_boost + rf_boost - agreement_penalty))
    label = "high" if score >= 0.78 else "medium" if score >= 0.6 else "low"
    return {
        "score": round(score, 2),
        "label": label,
        "components": {
            "tier_base": round(tier_base, 2),
            "rag_boost": round(rag_boost, 2),
            "red_flag_boost": round(rf_boost, 2),
            "disagreement_penalty": round(agreement_penalty, 2),
        },
    }


# ======================================================================
# /health
# ======================================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "llm_available": client is not None,
    }


# ======================================================================
# Care coordination orchestrator (unchanged)
# ======================================================================

class HandoffRequest(BaseModel):
    case_id: str
    nurse_assessment_id: str
    is_validated: bool
    provider_handoff_brief: str


@app.post("/orchestrator/handoff-to-provider", dependencies=[Depends(verify_internal_secret)])
async def handoff_to_provider(request: HandoffRequest):
    if not request.is_validated:
        raise HTTPException(status_code=403, detail="Workflow Violation: Assessment must be explicitly validated by a nurse.")

    if not request.provider_handoff_brief or len(request.provider_handoff_brief.strip()) == 0:
        raise HTTPException(status_code=403, detail="Workflow Violation: Missing provider handoff brief.")

    return {
        "success": True,
        "new_case_status": "provider_review_pending",
        "message": "Strict handoff invariant satisfied. Case securely advanced.",
    }


class ProviderActionRequest(BaseModel):
    case_id: str
    provider_user_id: str
    active_nurse_assessment_id: str
    action_type: str
    remarks: str


@app.post("/orchestrator/submit-provider-action", dependencies=[Depends(verify_internal_secret)])
async def submit_provider_action(request: ProviderActionRequest):
    if not request.active_nurse_assessment_id:
        raise HTTPException(status_code=403, detail="Workflow Violation: Cannot issue orders without reading a valid active nurse assessment.")

    return {
        "success": True,
        "new_case_status": "provider_action_issued",
        "action_status": "pending",
        "message": "Action successfully persisted and queued for staff execution.",
    }


# ======================================================================
# /ai/rank-queue  — AI Level 2 (Front Desk smart queue)
# ======================================================================

class QueueCase(BaseModel):
    case_id: str
    urgency: str
    submitted_at: str
    current_status: str
    wait_minutes: int
    provider_assigned: bool


class QueueRankRequest(BaseModel):
    cases: List[QueueCase]
    available_providers: int = 2


class RankedCase(BaseModel):
    case_id: str
    rank: int
    reason: str
    alert: Optional[str] = None


class QueueRankResponse(BaseModel):
    ranked_cases: List[RankedCase]
    bottleneck_alerts: List[str]
    source_tier: int
    provenance: List[str] = []


@app.post("/ai/rank-queue", response_model=QueueRankResponse, dependencies=[Depends(verify_internal_secret)])
async def rank_queue(request: QueueRankRequest):
    data = tiered_rank_queue(
        client=client,
        cases=[c.model_dump() for c in request.cases],
        available_providers=request.available_providers,
    )
    return QueueRankResponse(**data)


# ======================================================================
# /ai/nurse-assist  — AI Level 3 (Clinical decision support)
# ======================================================================

class NurseAssistRequest(BaseModel):
    symptoms: str
    vitals: Dict[str, Any]
    ai_pretriage_brief: str = ""
    known_allergies: List[str] = []
    current_medications: List[str] = []
    active_diagnoses: List[str] = []


class VitalsFlag(BaseModel):
    field: str
    value: Any
    status: str
    note: str


class DrugInteractionHit(BaseModel):
    matched_on: List[str]
    severity: Optional[str] = None
    mechanism: Optional[str] = None
    recommendation: Optional[str] = None
    source_entry: str


class NurseAssistResponse(BaseModel):
    vitals_flags: List[VitalsFlag]
    allergy_alerts: List[str]
    suggested_questions: List[str]
    documentation_hints: List[str]
    drug_interactions: List[DrugInteractionHit] = []
    source_tier: int
    provenance: List[str] = []


@app.post("/ai/nurse-assist", response_model=NurseAssistResponse, dependencies=[Depends(verify_internal_secret)])
async def nurse_assist(request: NurseAssistRequest):
    data = tiered_nurse_assist(
        client=client,
        symptoms=request.symptoms,
        vitals=request.vitals or {},
        ai_pretriage_brief=request.ai_pretriage_brief,
        known_allergies=request.known_allergies,
        current_medications=request.current_medications,
        active_diagnoses=request.active_diagnoses,
    )
    return NurseAssistResponse(**data)


# ======================================================================
# /ai/provider-copilot  — AI Level 4 (Provider co-pilot)
# ======================================================================

class ProviderCopilotRequest(BaseModel):
    symptoms: str
    nurse_validated_brief: str = ""
    vitals: Dict[str, Any] = {}
    known_diagnoses: List[str] = []
    known_allergies: List[str] = []
    current_medications: List[str] = []
    proposed_action: Optional[str] = None


class DiagnosisSuggestion(BaseModel):
    diagnosis: str
    probability: str
    reasoning: str
    icd10_code: Optional[str] = None


class ProviderCopilotResponse(BaseModel):
    differential_dx: List[DiagnosisSuggestion]
    drug_interaction_alerts: List[str]
    recommended_tests: List[str]
    clinical_pearls: List[str]
    disclaimer: str
    source_tier: int
    provenance: List[str] = []


@app.post("/ai/provider-copilot", response_model=ProviderCopilotResponse, dependencies=[Depends(verify_internal_secret)])
async def provider_copilot(request: ProviderCopilotRequest):
    data = tiered_provider_copilot(
        client=client,
        symptoms=request.symptoms,
        nurse_validated_brief=request.nurse_validated_brief,
        vitals=request.vitals or {},
        known_diagnoses=request.known_diagnoses,
        known_allergies=request.known_allergies,
        current_medications=request.current_medications,
        proposed_action=request.proposed_action,
    )
    return ProviderCopilotResponse(**data)


# ======================================================================
# /ai/build-patient-profile  — AI Level 5 (Patient profile synthesizer)
# ======================================================================
#
# Takes the intake form + the analyze-intake result and produces a
# structured profile that is rendered (a) back to the patient on
# /patient/status and (b) to the front-desk / nurse as a quick brief.
# This is the LLM "profile maker" layer the patient flow needs so that
# the data the patient just typed is actually surfaced as a coherent
# narrative instead of getting lost.

class PatientProfileRequest(BaseModel):
    full_name: str = ""
    date_of_birth: str = ""
    age: Optional[int] = None
    chief_complaint: str = ""
    severity: str = ""
    duration: str = ""
    additional_details: str = ""
    medical_history: str = ""
    preferred_timing: str = ""
    preferred_provider: str = ""

    pretriage_urgency: str = ""
    pretriage_summary: str = ""
    pretriage_risks: List[str] = []
    pretriage_clinician_brief: str = ""


class PatientProfileResponse(BaseModel):
    display_name: str
    age: Optional[int] = None
    chief_complaint_short: str
    narrative_summary: str
    key_clinical_signals: List[str] = []
    lifestyle_factors: List[str] = []
    recommended_questions_for_nurse: List[str] = []
    red_flags_for_team: List[str] = []
    next_step_for_patient: str
    disclaimer: str
    source_tier: int
    provenance: List[str] = []


@app.post(
    "/ai/build-patient-profile",
    response_model=PatientProfileResponse,
    dependencies=[Depends(verify_internal_secret)],
)
async def build_patient_profile(request: PatientProfileRequest):
    data = tiered_build_patient_profile(
        client=client,
        full_name=request.full_name,
        date_of_birth=request.date_of_birth,
        age=request.age,
        chief_complaint=request.chief_complaint,
        severity=request.severity,
        duration=request.duration,
        additional_details=request.additional_details,
        medical_history=request.medical_history,
        preferred_timing=request.preferred_timing,
        preferred_provider=request.preferred_provider,
        pretriage_urgency=request.pretriage_urgency,
        pretriage_summary=request.pretriage_summary,
        pretriage_risks=request.pretriage_risks,
        pretriage_clinician_brief=request.pretriage_clinician_brief,
    )
    return PatientProfileResponse(**data)


# ======================================================================
# /ai/triage-cascade  — Phase B: one input → four AI subsystems → one screen
# ======================================================================
#
# This is the demo wow endpoint. The /triage page calls this when the user
# clicks "Run full care cascade." It orchestrates the same AI engines that
# power the four production panels (Patient, Front Desk, Nurse, Provider) and
# returns one combined response so the UI can render four downstream cards in
# parallel from a single round-trip.
#
# It deliberately does NOT write to the database — these cards are read-only
# previews that prove platform feasibility without requiring a logged-in user.


class CascadeRequest(IntakeRequest):
    """Same input shape as /analyze-intake."""
    pass


@app.post("/ai/triage-cascade", dependencies=[Depends(verify_internal_secret)])
async def triage_cascade(request: CascadeRequest):
    """
    Fan out the patient narrative across all four AI subsystems and stitch the
    results into one payload. Each subsystem keeps its own tier badge and
    provenance so the UI can show degradation transparently.
    """
    cascade_start = time.perf_counter()

    # 1) Run intake first so we can feed its outputs into the downstream AIs.
    intake = await asyncio.to_thread(_build_intake_payload, request)

    # 2) Build a synthetic queue with this case + 3 mock peers so the queue
    #    AI has something realistic to rank. The current case always carries
    #    the urgency we just computed.
    case_id = "case-current"
    legacy_urgency = str(intake.get("urgency", "medium"))
    queue_cases = _synthetic_queue(case_id=case_id, current_urgency=legacy_urgency)

    # 3) Run rank-queue, nurse-assist, provider-copilot concurrently.
    #    All three are sync functions, so wrap each in `asyncio.to_thread`.
    extracted_meds_names = [m["name"] for m in intake.get("extracted_medications", [])]
    extracted_vitals_dict = _vitals_to_dict(intake.get("extracted_vitals", []))
    pretriage_brief = intake.get("clinician_brief", "")

    queue_task = asyncio.to_thread(
        tiered_rank_queue,
        client=client,
        cases=queue_cases,
        available_providers=2,
    )
    nurse_task = asyncio.to_thread(
        tiered_nurse_assist,
        client=client,
        symptoms=request.symptoms,
        vitals=extracted_vitals_dict,
        ai_pretriage_brief=pretriage_brief,
        known_allergies=[],
        current_medications=extracted_meds_names,
        active_diagnoses=[],
    )
    provider_task = asyncio.to_thread(
        tiered_provider_copilot,
        client=client,
        symptoms=request.symptoms,
        nurse_validated_brief=pretriage_brief,
        vitals=extracted_vitals_dict,
        known_diagnoses=[],
        known_allergies=[],
        current_medications=extracted_meds_names,
        proposed_action=None,
    )

    queue_res, nurse_res, provider_res = await asyncio.gather(
        queue_task, nurse_task, provider_task, return_exceptions=True
    )

    # Replace any exception with a Tier-3 placeholder so the UI never crashes.
    queue_card = _safe_card(queue_res, default={
        "ranked_cases": [], "bottleneck_alerts": [],
        "source_tier": 3, "provenance": [],
    })
    nurse_card = _safe_card(nurse_res, default={
        "vitals_flags": [], "allergy_alerts": [], "suggested_questions": [],
        "documentation_hints": [], "drug_interactions": [],
        "source_tier": 3, "provenance": [],
    })
    provider_card = _safe_card(provider_res, default={
        "differential_dx": [], "drug_interaction_alerts": [],
        "recommended_tests": [], "clinical_pearls": [],
        "disclaimer": "AI suggestions only; clinician decision is final.",
        "source_tier": 3, "provenance": [],
    })

    # Surface the case_id on the matching ranked entry so the UI can highlight.
    queue_card["current_case_id"] = case_id

    cascade_ms = int((time.perf_counter() - cascade_start) * 1000)
    intake.setdefault("pipeline_timings_ms", {})["cascade_total_ms"] = cascade_ms

    return {
        "intake": intake,
        "queue": queue_card,
        "nurse": nurse_card,
        "provider": provider_card,
        # Convenience top-level mirrors so the /triage page can render the
        # urgency block directly from the cascade response without re-keying.
        "urgency_label": intake.get("urgency_label"),
        "urgency_reason": intake.get("urgency_reason"),
        "ai_confidence": intake.get("ai_confidence"),
        "pipeline_timings_ms": intake.get("pipeline_timings_ms", {}),
    }


def _synthetic_queue(case_id: str, current_urgency: str) -> List[Dict[str, Any]]:
    """Three plausible peers + the current case so the queue ranker has data."""
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return [
        {
            "case_id": case_id,
            "urgency": current_urgency,
            "submitted_at": now_iso,
            "current_status": "intake_received",
            "wait_minutes": 2,
            "provider_assigned": False,
        },
        {
            "case_id": "case-002",
            "urgency": "medium",
            "submitted_at": now_iso,
            "current_status": "nurse_review",
            "wait_minutes": 18,
            "provider_assigned": False,
        },
        {
            "case_id": "case-003",
            "urgency": "low",
            "submitted_at": now_iso,
            "current_status": "intake_received",
            "wait_minutes": 35,
            "provider_assigned": False,
        },
        {
            "case_id": "case-004",
            "urgency": "high",
            "submitted_at": now_iso,
            "current_status": "provider_review_pending",
            "wait_minutes": 22,
            "provider_assigned": True,
        },
    ]


def _vitals_to_dict(vitals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Convert NLP-extracted vitals into the shape nurse-assist expects.

    The KB file `vitals_ranges.json` keys are snake_case (`bp_systolic`,
    `pulse`, `temp_f`, ...) and `evaluate_vitals` looks them up by exact key.
    Our regex layer reports human display names ("BP Systolic", "Heart Rate"),
    so map back here. Temperature is normalized to °F because the KB only
    carries `temp_f` thresholds (97–103 °F warning/critical band).
    """
    out: Dict[str, Any] = {}
    for v in vitals or []:
        field = v.get("field", "")
        value = v.get("value")
        if value is None:
            continue
        if field == "BP Systolic":
            out["bp_systolic"] = value
        elif field == "BP Diastolic":
            out["bp_diastolic"] = value
        elif field == "Heart Rate":
            out["pulse"] = value
        elif field == "Respiratory Rate":
            out["respiratory_rate"] = value
        elif field == "O2 Saturation":
            out["o2_sat"] = value
        elif field == "Glucose":
            out["glucose"] = value
        elif field == "Temperature":
            unit = (v.get("unit") or "").lower()
            try:
                celsius = float(value)
            except (TypeError, ValueError):
                continue
            # Our extractor stores °C; the KB uses °F. Convert when needed.
            if "c" in unit and "f" not in unit:
                fahrenheit = round(celsius * 9 / 5 + 32, 1)
            elif "f" in unit:
                fahrenheit = celsius
            else:
                # Heuristic — a value <50 is almost certainly °C.
                fahrenheit = (
                    round(celsius * 9 / 5 + 32, 1) if celsius < 50 else celsius
                )
            out["temp_f"] = fahrenheit
    return out


def _safe_card(res: Any, default: Dict[str, Any]) -> Dict[str, Any]:
    """If a cascade subtask raised, swap in a Tier-3 default card."""
    if isinstance(res, Exception):
        print(f"[cascade] subsystem failed, returning Tier-3 default: {res}")
        return default
    if isinstance(res, dict):
        return res
    return default


if __name__ == "__main__":
    import uvicorn
    # Port 8001 matches the Next.js default (AI_ENGINE_URL and NEXT_PUBLIC_AI_ENGINE_URL).
    uvicorn.run(app, host="0.0.0.0", port=8001)
