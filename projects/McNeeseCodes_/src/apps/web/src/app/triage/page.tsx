"use client";

/**
 * /triage — Public, no-auth clinical triage tool.
 *
 * One screen, two columns: pre-loaded scenario buttons -> AI -> structured
 * triage output (urgency, NLP entities, care route, RAG evidence, FHIR), plus
 * an on-demand "downstream cascade" of three cards (queue, nurse, provider)
 * powered by the same FastAPI engines that drive the production panels.
 *
 * Designed for the CareDevi 2026 hackathon demo (3-min walkthrough).
 *
 * Auth: outside `proxy.ts` matcher AND added to AppShell BYPASS so this route
 * renders standalone with no staff chrome.
 *
 * Resilience: this page calls /api/ai/analyze-intake (Tier 0..3 fallback) for
 * the initial submit, and /api/ai/triage-cascade on-demand for the four-card
 * fan-out. Both routes have soft-fallback shapes so partial failures still
 * render a usable screen.
 */

import { useMemo, useState } from "react";
import { useToast } from "@/components/shared/Toast";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Activity,
  Stethoscope,
  Baby,
  ShieldCheck,
  FileJson,
  Sparkles,
  Brain,
  Layers,
  Pill,
  Clock,
  Users,
  ListChecks,
  GitBranch,
  X,
  Database,
  Zap,
} from "lucide-react";
import { RoleChip } from "@/components/common/RoleChip";
import { Disclosure } from "@/components/shared/Disclosure";
import { SyntheaPicker, type SyntheaSelection } from "./SyntheaPicker";
import { CommunityPanel } from "./CommunityPanel";
import { PharmacyFinder } from "./PharmacyFinder";

// ---------------------------------------------------------------------------
// Scenarios — the demo's secret weapon. One click = filled textarea.
// ---------------------------------------------------------------------------

type Scenario = {
  id: string;
  label: string;
  hint: string;
  age: AgeGroup;
  icon: React.ElementType;
  text: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "chest_pain",
    label: "Chest Pain",
    hint: "Possible ACS",
    age: "Geriatric",
    icon: HeartPulse,
    text: "67-year-old male presenting with crushing chest pain radiating to left arm and jaw. Diaphoresis and shortness of breath. Onset 40 minutes ago. BP 165/95. HR 102. No prior cardiac history. Patient appears distressed and pale. Denies recent trauma.",
  },
  {
    id: "stroke",
    label: "Stroke Symptoms",
    hint: "Acute neuro deficit",
    age: "Adult",
    icon: Activity,
    text: "58-year-old female with sudden onset facial drooping on right side, slurred speech, and left arm weakness. Symptoms started 25 minutes ago. BP 178/102. HR 88. History of hypertension. Denies headache or vision changes.",
  },
  {
    id: "sepsis",
    label: "Sepsis Signs",
    hint: "qSOFA risk",
    age: "Adult",
    icon: Stethoscope,
    text: "45-year-old male with fever 39.8°C, HR 118, RR 22. Confused and lethargic. Recent UTI treated with antibiotics 3 days ago. BP 88/60. SpO2 92%. Not responding to verbal commands normally.",
  },
  {
    id: "peds_fever",
    label: "Pediatric Fever",
    hint: "Meningitis red flags",
    age: "Pediatric",
    icon: Baby,
    text: "4-year-old child with fever 40.1°C for 2 days. Not eating or drinking. Mild neck stiffness noted by parent. Petechial rash on torso. Irritable and difficult to console. No known allergies.",
  },
];

type AgeGroup = "Pediatric" | "Adult" | "Geriatric";

// ---------------------------------------------------------------------------
// Urgency normalization — handles legacy (high/medium/low) AND hackathon scale.
// ---------------------------------------------------------------------------

type Urgency = "CRITICAL" | "URGENT" | "SEMI-URGENT" | "NON-URGENT";

// Urgency channels are pinned to the design system tokens defined in
// globals.css (`--urgency-high: #C62828`, `--urgency-medium: #E65100`,
// `--urgency-low: #2E7D32`). CRITICAL is a darker shade of urgency-high
// so the four-step ESI-flavoured scale still has visible hierarchy.
const URG_STYLE: Record<
  Urgency,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  CRITICAL:      { bg: "#991B1B", text: "#FFFFFF", border: "#7F1D1D", dot: "#FECACA", label: "CRITICAL" },
  URGENT:        { bg: "#C62828", text: "#FFFFFF", border: "#7F1D1D", dot: "#FEE2E2", label: "URGENT" },
  "SEMI-URGENT": { bg: "#E65100", text: "#FFFFFF", border: "#9F3009", dot: "#FFE7BA", label: "SEMI-URGENT" },
  "NON-URGENT":  { bg: "#2E7D32", text: "#FFFFFF", border: "#14532D", dot: "#DCFCE7", label: "NON-URGENT" },
};

// Plain-English narration of each urgency tier. Surfaced at the top of
// Step 2 so the patient sees a sentence ("we think this needs urgent
// care within an hour") before any numeric/clinical detail.
function urgencyHeadline(u: Urgency): string {
  switch (u) {
    case "CRITICAL":
      return "These symptoms can be life-threatening — please go to the Emergency Department now or call 911.";
    case "URGENT":
      return "We think this needs urgent care within the next hour. Please head to the ED triage or an urgent-care clinic right away.";
    case "SEMI-URGENT":
      return "We recommend you see a clinician today. A same-day urgent-care or primary-care visit will keep you on the safe path.";
    case "NON-URGENT":
      return "This looks routine. A primary-care follow-up in the next few days should be enough — but if anything changes, come back here.";
  }
}

function normalizeUrgency(v: unknown): Urgency {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "CRITICAL" || s === "URGENT" || s === "SEMI-URGENT" || s === "NON-URGENT") return s;
  if (s === "HIGH") return "URGENT";
  if (s === "MEDIUM") return "SEMI-URGENT";
  if (s === "LOW") return "NON-URGENT";
  return "URGENT";
}

// ---------------------------------------------------------------------------
// Result shape — the union of every field the AI engine + cascade can return.
// All fields are defensively defaulted in `normalizeResult` so the UI never
// crashes even if the backend regresses.
// ---------------------------------------------------------------------------

type RagMatch = {
  id: string;
  text: string;
  source: string;
  matched_keywords: string[];
  score: number;
};

type Vital = {
  field: string;
  value: number;
  unit: string;
  status: "critical" | "warning" | "normal";
};

type Icd10Tag = { term: string; code: string; display: string };

type Confidence = {
  score: number;
  label: "high" | "medium" | "low";
  components?: Record<string, number>;
};

type CascadeQueue = {
  ranked_cases: { case_id: string; rank: number; reason: string; alert?: string | null }[];
  bottleneck_alerts: string[];
  source_tier: number;
  current_case_id?: string;
  offline?: boolean;
};

type CascadeNurse = {
  vitals_flags: { field: string; value: number | string; status: string; note: string }[];
  allergy_alerts: string[];
  suggested_questions: string[];
  documentation_hints: string[];
  drug_interactions: { matched_on: string[]; severity?: string; recommendation?: string }[];
  source_tier: number;
  offline?: boolean;
};

type CascadeProvider = {
  differential_dx: { diagnosis: string; probability: string; reasoning: string; icd10_code?: string }[];
  drug_interaction_alerts: string[];
  recommended_tests: string[];
  clinical_pearls: string[];
  disclaimer: string;
  source_tier: number;
  offline?: boolean;
};

type TriageResult = {
  urgency: Urgency;
  urgencyReason: string;
  summary: string;
  symptoms: string[];
  negations: string[];
  risks: string[];
  reasoning: string;
  clinicianBrief: string;
  recommendedRoute: string;
  ragEvidence: string;
  ragSource: string;
  ragMatches: RagMatch[];
  vitals: Vital[];
  temporal: { phrases: string[]; minutes_since_onset: number | null };
  demographics: { age: number | null; sex: string | null; age_group: string | null };
  medications: { name: string; matched_on: string }[];
  icd10: Icd10Tag[];
  confidence: Confidence;
  timings: Record<string, number>;
  kbStats: { guideline_count?: number; icd10_count?: number; drug_interaction_count?: number };
  fhir: Record<string, unknown>;
  sourceTier?: number;
  provenance?: string[];
  llmProvider?: string;
  llmModel?: string;
};

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeResult(raw: unknown, fallbackText: string): TriageResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const urgency = normalizeUrgency(r.urgency_label ?? r.urgency);

  const recommendedRoute =
    typeof r.recommended_route === "string" && r.recommended_route.trim()
      ? r.recommended_route
      : urgency === "CRITICAL"
      ? "Emergency Department — escalate to senior clinician now"
      : urgency === "URGENT"
      ? "Urgent care or ED triage — assess within 60 minutes"
      : urgency === "SEMI-URGENT"
      ? "Same-day clinic visit — primary care or urgent care"
      : "Primary care follow-up — non-time-critical";

  const ragMatches = asArray<Record<string, unknown>>(r.rag_matches).map((m) => ({
    id: String(m.id ?? ""),
    text: String(m.text ?? ""),
    source: String(m.source ?? ""),
    matched_keywords: asArray<string>(m.matched_keywords).map(String),
    score: typeof m.score === "number" ? m.score : 0,
  }));

  const vitals = asArray<Record<string, unknown>>(r.extracted_vitals).map((v) => ({
    field: String(v.field ?? ""),
    value: typeof v.value === "number" ? v.value : Number(v.value ?? 0),
    unit: String(v.unit ?? ""),
    status:
      v.status === "critical" || v.status === "warning" || v.status === "normal"
        ? (v.status as Vital["status"])
        : "normal",
  }));

  const temporalRaw = (r.extracted_temporal ?? {}) as Record<string, unknown>;
  const demoRaw = (r.extracted_demographics ?? {}) as Record<string, unknown>;
  const confRaw = (r.ai_confidence ?? {}) as Record<string, unknown>;
  const timingsRaw = (r.pipeline_timings_ms ?? {}) as Record<string, unknown>;
  const kbRaw = (r.kb_stats ?? {}) as Record<string, unknown>;

  return {
    urgency,
    urgencyReason:
      (typeof r.urgency_reason === "string" && r.urgency_reason) ||
      (typeof r.clinician_brief === "string" && r.clinician_brief) ||
      "Triage assessment generated from symptom narrative and clinical KB.",
    summary:
      (typeof r.summary === "string" && r.summary) ||
      "Symptom assessment complete. Review by qualified clinician required.",
    symptoms: asArray<string>(r.extracted_symptoms).map(String),
    negations: asArray<string>(r.negations).map(String),
    risks: asArray<string>(r.risks).map(String),
    reasoning: (typeof r.reasoning === "string" && r.reasoning) || "",
    clinicianBrief:
      (typeof r.clinician_brief === "string" && r.clinician_brief) ||
      `Patient reports: ${fallbackText.slice(0, 240)}`,
    recommendedRoute,
    ragEvidence:
      (typeof r.rag_evidence === "string" && r.rag_evidence) ||
      "Awaiting retrieval — clinical guideline match was not surfaced by the engine.",
    ragSource: (typeof r.rag_source === "string" && r.rag_source) || "Clinical knowledge base",
    ragMatches,
    vitals,
    temporal: {
      phrases: asArray<string>(temporalRaw.phrases).map(String),
      minutes_since_onset:
        typeof temporalRaw.minutes_since_onset === "number"
          ? (temporalRaw.minutes_since_onset as number)
          : null,
    },
    demographics: {
      age: typeof demoRaw.age === "number" ? (demoRaw.age as number) : null,
      sex: typeof demoRaw.sex === "string" ? (demoRaw.sex as string) : null,
      age_group: typeof demoRaw.age_group === "string" ? (demoRaw.age_group as string) : null,
    },
    medications: asArray<Record<string, unknown>>(r.extracted_medications).map((m) => ({
      name: String(m.name ?? ""),
      matched_on: String(m.matched_on ?? ""),
    })),
    icd10: asArray<Record<string, unknown>>(r.icd10_tags).map((t) => ({
      term: String(t.term ?? ""),
      code: String(t.code ?? ""),
      display: String(t.display ?? ""),
    })),
    confidence: {
      score: typeof confRaw.score === "number" ? (confRaw.score as number) : 0,
      label:
        confRaw.label === "high" || confRaw.label === "medium" || confRaw.label === "low"
          ? (confRaw.label as Confidence["label"])
          : "low",
      components: (confRaw.components ?? undefined) as Record<string, number> | undefined,
    },
    timings: Object.fromEntries(
      Object.entries(timingsRaw).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>,
    kbStats: {
      guideline_count: typeof kbRaw.guideline_count === "number" ? kbRaw.guideline_count : undefined,
      icd10_count: typeof kbRaw.icd10_count === "number" ? kbRaw.icd10_count : undefined,
      drug_interaction_count:
        typeof kbRaw.drug_interaction_count === "number" ? kbRaw.drug_interaction_count : undefined,
    },
    fhir:
      r.fhir_output && typeof r.fhir_output === "object"
        ? (r.fhir_output as Record<string, unknown>)
        : {
            resourceType: "CarePlan",
            status: "active",
            intent: "plan",
            title: "Triage Care Plan (synthetic demo)",
            description: "AI-generated triage recommendation for clinical decision support only.",
            activity: [
              { detail: { kind: "ServiceRequest", description: recommendedRoute, status: "not-started" } },
            ],
          },
    sourceTier: typeof r.source_tier === "number" ? r.source_tier : undefined,
    provenance: asArray<string>(r.provenance).map(String),
    llmProvider: typeof r.llm_provider === "string" ? r.llm_provider : undefined,
    llmModel: typeof r.llm_model === "string" ? r.llm_model : undefined,
  };
}

type CascadeData = {
  queue: CascadeQueue;
  nurse: CascadeNurse;
  provider: CascadeProvider;
  totalMs?: number;
};

function normalizeCascade(raw: unknown): CascadeData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const queueRaw = (r.queue ?? {}) as Record<string, unknown>;
  const nurseRaw = (r.nurse ?? {}) as Record<string, unknown>;
  const providerRaw = (r.provider ?? {}) as Record<string, unknown>;
  const timings = (r.pipeline_timings_ms ?? {}) as Record<string, unknown>;

  return {
    queue: {
      ranked_cases: asArray<Record<string, unknown>>(queueRaw.ranked_cases).map((c) => ({
        case_id: String(c.case_id ?? ""),
        rank: typeof c.rank === "number" ? (c.rank as number) : 0,
        reason: String(c.reason ?? ""),
        alert: (c.alert as string | null | undefined) ?? null,
      })),
      bottleneck_alerts: asArray<string>(queueRaw.bottleneck_alerts).map(String),
      source_tier: typeof queueRaw.source_tier === "number" ? (queueRaw.source_tier as number) : 3,
      current_case_id: typeof queueRaw.current_case_id === "string" ? queueRaw.current_case_id : undefined,
      offline: queueRaw.offline === true,
    },
    nurse: {
      vitals_flags: asArray<Record<string, unknown>>(nurseRaw.vitals_flags).map((f) => ({
        field: String(f.field ?? ""),
        value: (f.value as number | string) ?? "",
        status: String(f.status ?? "normal"),
        note: String(f.note ?? ""),
      })),
      allergy_alerts: asArray<string>(nurseRaw.allergy_alerts).map(String),
      suggested_questions: asArray<string>(nurseRaw.suggested_questions).map(String),
      documentation_hints: asArray<string>(nurseRaw.documentation_hints).map(String),
      drug_interactions: asArray<Record<string, unknown>>(nurseRaw.drug_interactions).map((d) => ({
        matched_on: asArray<string>(d.matched_on).map(String),
        severity: typeof d.severity === "string" ? d.severity : undefined,
        recommendation: typeof d.recommendation === "string" ? d.recommendation : undefined,
      })),
      source_tier: typeof nurseRaw.source_tier === "number" ? (nurseRaw.source_tier as number) : 3,
      offline: nurseRaw.offline === true,
    },
    provider: {
      differential_dx: asArray<Record<string, unknown>>(providerRaw.differential_dx).map((d) => ({
        diagnosis: String(d.diagnosis ?? ""),
        probability: String(d.probability ?? "medium"),
        reasoning: String(d.reasoning ?? ""),
        icd10_code: typeof d.icd10_code === "string" ? d.icd10_code : undefined,
      })),
      drug_interaction_alerts: asArray<string>(providerRaw.drug_interaction_alerts).map(String),
      recommended_tests: asArray<string>(providerRaw.recommended_tests).map(String),
      clinical_pearls: asArray<string>(providerRaw.clinical_pearls).map(String),
      disclaimer: String(providerRaw.disclaimer ?? "AI suggestions only; clinician decision is final."),
      source_tier:
        typeof providerRaw.source_tier === "number" ? (providerRaw.source_tier as number) : 3,
      offline: providerRaw.offline === true,
    },
    totalMs: typeof timings.cascade_total_ms === "number" ? (timings.cascade_total_ms as number) : undefined,
  };
}

// ---------------------------------------------------------------------------
// FRONT-DESK HANDOFF helpers
// ---------------------------------------------------------------------------

/**
 * Map a /triage Urgency string ("CRITICAL" | "URGENT" | "SEMI-URGENT" |
 * "ROUTINE") onto the case-table urgency vocabulary used by
 * /front-desk/queue ("Emergency" | "Urgent" | "Routine"). The two were
 * developed independently and we don't want to silently downgrade
 * critical cases when they hit the queue.
 */
function mapUrgencyToCaseLevel(u: string): "Emergency" | "Urgent" | "Routine" {
  const upper = (u || "").toUpperCase();
  if (upper === "CRITICAL") return "Emergency";
  if (upper === "URGENT" || upper === "SEMI-URGENT") return "Urgent";
  return "Routine";
}

/**
 * Synthea labels look like "Giovanni385 P. (65M, abnormal findings...)".
 * Drop the parenthetical clinical summary and the trailing digits on
 * the first name so the queue shows "Giovanni P." instead of the
 * full Synthea identifier string.
 */
function formatSyntheaName(label: string): string {
  if (!label) return "Synthea patient";
  const beforeParen = label.split("(")[0]?.trim() ?? label;
  const cleaned = beforeParen.replace(/(\b[A-Za-z]+)\d+/g, "$1");
  return cleaned || "Synthea patient";
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------

export default function TriagePage() {
  const [symptomText, setSymptomText] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("Adult");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [showFhir, setShowFhir] = useState(false);
  const [showThinks, setShowThinks] = useState(false);

  // Cascade is no longer triggered from /triage. The patient page is
  // patient-facing, so the "fan out across queue / nurse / provider AI"
  // step now belongs to the nurse workspace once the case is in the
  // care team's queue. The patient sees those AI insights live on
  // /patient/status/[caseId] after handoff. See
  // apps/web/src/app/nurse/case/[caseId]/page.tsx and
  // apps/web/src/lib/cascade-store.ts for the new home.

  // Captured at submit time so the community panel can fetch against the
  // exact narrative the user analysed, not what they're currently typing.
  const [submittedNarrative, setSubmittedNarrative] = useState<string>("");

  // Last-picked Synthea patient (if any) so the front-desk handoff can
  // attach the synthetic patient's name to the new case.
  const [pickedSynthea, setPickedSynthea] = useState<SyntheaSelection | null>(
    null,
  );

  // Front-desk handoff state. The /triage page is normally a judge-facing
  // demo, but we let the user "lift" the AI verdict into a real case in
  // the front-desk queue with one click. See handleSendToFrontDesk.
  const [handoffState, setHandoffState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [handoffCaseId, setHandoffCaseId] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => symptomText.trim().length >= 12 && !loading,
    [symptomText, loading],
  );

  const handlePickScenario = (s: Scenario) => {
    setActiveScenarioId(s.id);
    setSymptomText(s.text);
    setAgeGroup(s.age);
    setSubmittedNarrative("");
    setPickedSynthea(null);
    setHandoffState("idle");
    setHandoffCaseId(null);
    setHandoffError(null);
  };

  const handlePickSynthea = (selection: SyntheaSelection) => {
    // Selecting a real Synthea patient supersedes any active scenario;
    // the textarea, age group, and any downstream state are reset.
    setActiveScenarioId(null);
    setSymptomText(selection.patient.narrative_seed);
    setAgeGroup(selection.ageGroup);
    setResult(null);
    setError(null);
    setSubmittedNarrative("");
    setPickedSynthea(selection);
    setHandoffState("idle");
    setHandoffCaseId(null);
    setHandoffError(null);
  };

  const handleAnalyze = async () => {
    const narrativeAtSubmit = symptomText.trim();
    setLoading(true);
    setResult(null);
    setError(null);
    setShowFhir(false);
    setSubmittedNarrative(narrativeAtSubmit);
    setHandoffState("idle");
    setHandoffCaseId(null);
    setHandoffError(null);
    try {
      const response = await fetch("/api/ai/analyze-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: symptomText,
          duration: "as described",
          severity: 7,
          age_group: ageGroup,
          patient_history: "",
        }),
      });
      if (!response.ok) {
        throw new Error(`AI engine returned ${response.status}`);
      }
      const data = await response.json();
      setResult(normalizeResult(data, symptomText));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Triage request failed. The AI engine may be offline.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Modal-driven handoff. Clicking "Send to front desk" no longer fires
  // the case create directly — it opens a confirmation dialog that lets
  // the patient (or kiosk attendant) confirm or correct their basic
  // identity + contact details first. The same payload then carries
  // through to the front-desk queue, so the front-desk staff already
  // knows who they're greeting when the case lights up.
  const [showHandoffModal, setShowHandoffModal] = useState(false);

  const openHandoffModal = () => {
    if (!result) return;
    setHandoffError(null);
    setShowHandoffModal(true);
  };

  // Lift the current AI verdict into a real case row in the front-desk
  // queue. Mirrors the payload shape that /patient/intake POSTs to
  // /api/cases/create so the queue and downstream pages render this
  // case identically to one that came from the production intake form.
  const submitHandoff = async (form: HandoffPatientForm) => {
    if (!result || handoffState === "sending") return;
    setHandoffState("sending");
    setHandoffError(null);
    setHandoffCaseId(null);

    const synthea = pickedSynthea?.patient;
    const urgencyForCase = mapUrgencyToCaseLevel(result.urgency);
    const nowIso = new Date().toISOString();

    const trimmedName = form.fullName.trim();
    const anonSuffix = Math.floor(Math.random() * 9000 + 1000);
    const finalName =
      trimmedName.length > 0
        ? trimmedName
        : synthea
        ? formatSyntheaName(synthea.label)
        : `Walk-in ${anonSuffix}`;

    const ageNumber = (() => {
      if (form.age.trim()) {
        const parsed = Number(form.age);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return synthea?.age ?? null;
    })();

    const additional = form.additionalDetails.trim();
    const additionalSuffix = synthea
      ? `Synthetic patient (Synthea ${pickedSynthea?.patient.bucket}). Active meds: ${(synthea.active_medications ?? []).join(", ") || "none"}.`
      : "Created from /triage demo (kiosk handoff).";

    const payload: Record<string, unknown> = {
      urgency: urgencyForCase,
      urgency_reason: result.urgencyReason,
      recommended_route: result.recommendedRoute,
      structured_summary: result.summary,
      risky_flags: result.risks,
      symptom_text: submittedNarrative || symptomText,
      duration_text: "as described",
      severity_hint: "high",
      source_channel: synthea ? "ai_triage_demo_synthea" : "ai_triage_demo",
      ai_clinician_brief: result.clinicianBrief,
      patient_full_name: finalName,
      patient_age: ageNumber,
      patient_gender: form.sex || synthea?.sex || null,
      patient_phone: form.phone.trim() || null,
      patient_email: form.email.trim() || null,
      patient_history:
        form.history.trim() ||
        (synthea ? (synthea.active_conditions ?? []).join("; ") : ""),
      additional_details: additional
        ? `${additional}\n\n${additionalSuffix}`
        : additionalSuffix,
      created_at: nowIso,
      updated_at: nowIso,
    };

    try {
      const r = await fetch("/api/cases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const detail = await r.text();
        throw new Error(`Case create failed (${r.status}): ${detail.slice(0, 120)}`);
      }
      const body = (await r.json()) as { caseId?: string };
      if (!body.caseId) throw new Error("Case created but no id returned");
      setHandoffCaseId(body.caseId);
      setHandoffState("sent");
      setShowHandoffModal(false);
    } catch (e) {
      setHandoffError(
        e instanceof Error ? e.message : "Case handoff failed.",
      );
      setHandoffState("error");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F1F5F9] text-slate-900">
      <TopBar
        kbStats={result?.kbStats}
        onOpenThinks={() => setShowThinks(true)}
      />

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5 xl:col-span-4">
            <InputPanel
              symptomText={symptomText}
              setSymptomText={setSymptomText}
              ageGroup={ageGroup}
              setAgeGroup={setAgeGroup}
              onPickScenario={handlePickScenario}
              onPickSynthea={handlePickSynthea}
              activeScenarioId={activeScenarioId}
              loading={loading}
              canSubmit={canSubmit}
              onAnalyze={handleAnalyze}
            />
          </section>

          <section className="lg:col-span-7 xl:col-span-8">
            <OutputPanel
              loading={loading}
              error={error}
              result={result}
              showFhir={showFhir}
              setShowFhir={setShowFhir}
              symptomNarrative={submittedNarrative || symptomText}
              ageGroup={ageGroup}
              pickedSynthea={pickedSynthea}
            />
          </section>
        </div>

        {result && !error && (
          <CarePlanCard
            urgency={result.urgency}
            handoffState={handoffState}
            handoffCaseId={handoffCaseId}
            handoffError={handoffError}
            syntheaName={
              pickedSynthea
                ? formatSyntheaName(pickedSynthea.patient.label)
                : null
            }
            onSend={openHandoffModal}
            suggestedDrug={result.medications[0]?.name ?? ""}
            communityNarrative={submittedNarrative.length >= 12 ? submittedNarrative : ""}
          />
        )}

        {showHandoffModal && result && (
          <SendToFrontDeskModal
            urgency={result.urgency}
            summary={result.summary}
            recommendedRoute={result.recommendedRoute}
            sending={handoffState === "sending"}
            error={handoffError}
            initial={makeInitialHandoffForm(pickedSynthea)}
            onCancel={() => setShowHandoffModal(false)}
            onSubmit={submitHandoff}
          />
        )}

        <DisclaimerFooter />
      </main>

      {showThinks && (
        <ThinksDrawer
          result={result}
          onClose={() => setShowThinks(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TOP BAR
// ---------------------------------------------------------------------------

function TopBar({
  kbStats,
  onOpenThinks,
}: {
  kbStats?: TriageResult["kbStats"];
  onOpenThinks: () => void;
}) {
  const stats = kbStats ?? {};
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#0F4C81] text-white shadow-[0_4px_12px_rgba(15,76,129,0.35)]">
            <ShieldCheck size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="text-[16px] font-bold tracking-tight text-slate-900">
              Frudge<span className="text-[#0F4C81]">Care</span> AI
            </div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Clinical Triage &amp; Care Coordination Assistant
            </div>
          </div>
          <RoleChip
            audience="patient"
            detail="Self-service kiosk · no login"
            className="hidden md:inline-flex"
          />
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <KbStatPill icon={Layers} label="guidelines" value={stats.guideline_count ?? 12} />
          <KbStatPill icon={Database} label="ICD-10" value={stats.icd10_count ?? 47} />
          <KbStatPill icon={Pill} label="drug pairs" value={stats.drug_interaction_count ?? 38} />
          <button
            type="button"
            onClick={onOpenThinks}
            className="fc-focus-ring inline-flex items-center gap-1.5 rounded-full border border-[#0F4C81]/30 bg-[#EEF4FB] px-3 py-1.5 text-[11.5px] font-semibold text-[#0F4C81] transition hover:bg-[#DCE7F2]"
            title="See how the AI thinks"
          >
            <Brain size={13} /> How the AI thinks
          </button>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-[#FFE7BA] bg-[#FFF7ED] px-3 py-1.5 text-[11px] font-semibold text-[#B45309] sm:hidden">
          <AlertTriangle size={13} />
          Decision support only
        </div>
      </div>
    </header>
  );
}

function KbStatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
      <Icon size={12} className="text-[#0F4C81]" />
      <span className="font-bold text-slate-800">{value}</span>
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// INPUT PANEL
// ---------------------------------------------------------------------------

function InputPanel({
  symptomText,
  setSymptomText,
  ageGroup,
  setAgeGroup,
  onPickScenario,
  onPickSynthea,
  activeScenarioId,
  loading,
  canSubmit,
  onAnalyze,
}: {
  symptomText: string;
  setSymptomText: (s: string) => void;
  ageGroup: AgeGroup;
  setAgeGroup: (a: AgeGroup) => void;
  onPickScenario: (s: Scenario) => void;
  onPickSynthea: (s: SyntheaSelection) => void;
  activeScenarioId: string | null;
  loading: boolean;
  canSubmit: boolean;
  onAnalyze: () => void;
}) {
  return (
    <article className="fc-card p-5 lg:p-6 min-w-0">
      <header className="mb-4">
        <div className="fc-eyebrow">Step 1 · Describe the patient</div>
        <h1 className="fc-section-title mt-1">What&apos;s going on today?</h1>
        <p className="mt-1 text-[12.5px] leading-snug text-slate-500">
          Pick a scenario, load a Synthea patient, or write your own.
        </p>
      </header>

      <section>
        <div className="fc-eyebrow mb-2">Demo scenarios</div>
        <div className="grid grid-cols-2 gap-2">
          {SCENARIOS.map((s) => {
            const active = activeScenarioId === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPickScenario(s)}
                className={[
                  "fc-focus-ring group flex items-center gap-2 rounded-[var(--radius-control)] border px-3 h-12 text-left transition",
                  active
                    ? "border-[var(--primary)] bg-[#EEF4FB] shadow-[inset_0_0_0_1px_rgba(15,76,129,0.4)]"
                    : "border-slate-200 bg-white hover:border-[var(--primary)]/50",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-chip)]",
                    active ? "bg-[var(--primary)] text-white" : "bg-[var(--primary)]/10 text-[var(--primary)]",
                  ].join(" ")}
                >
                  <Icon size={14} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight text-slate-900 truncate">
                    {s.label}
                  </span>
                  <span className="block text-[10.5px] leading-tight text-slate-500 truncate">
                    {s.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <hr className="my-4 border-t border-slate-100" />

      <SyntheaPicker onSelect={onPickSynthea} />

      <hr className="my-4 border-t border-slate-100" />

      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <label htmlFor="symptoms" className="fc-eyebrow">
            Symptom description
          </label>
          <span className="text-[10.5px] text-slate-500">
            {symptomText.length > 0
              ? `${symptomText.trim().split(/\s+/).filter(Boolean).length} words`
              : "Awaiting input"}
          </span>
        </div>
        <textarea
          id="symptoms"
          rows={5}
          className="fc-text-input fc-focus-ring resize-y"
          placeholder="Describe the patient&apos;s symptoms in plain language…"
          value={symptomText}
          onChange={(e) => setSymptomText(e.target.value)}
        />

        <div className="mt-3">
          <label htmlFor="age" className="fc-eyebrow mb-1.5 block">
            Age group
          </label>
          <select
            id="age"
            className="fc-text-input fc-focus-ring"
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
          >
            <option value="Pediatric">Pediatric · 0 – 17 years</option>
            <option value="Adult">Adult · 18 – 64 years</option>
            <option value="Geriatric">Geriatric · 65 years and over</option>
          </select>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Drives age-aware vitals ranges and red-flag rules.
          </p>
        </div>
      </section>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={!canSubmit}
        className={[
          "fc-focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 h-11 text-[14px] font-semibold transition",
          canSubmit
            ? "bg-[var(--primary)] text-white shadow-[0_2px_8px_rgba(15,76,129,0.25)] hover:bg-[#0B3A66]"
            : "cursor-not-allowed bg-slate-100 text-slate-400",
        ].join(" ")}
      >
        <Sparkles size={15} />
        {loading ? "Analyzing…" : "Analyze & triage"}
        {!loading && <ArrowRight size={15} />}
      </button>

      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Cross-checked against a clinical reference library. Nothing here replaces a clinician.
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// OUTPUT PANEL
// ---------------------------------------------------------------------------

function OutputPanel({
  loading,
  error,
  result,
  showFhir,
  setShowFhir,
  symptomNarrative,
  ageGroup,
  pickedSynthea,
}: {
  loading: boolean;
  error: string | null;
  result: TriageResult | null;
  showFhir: boolean;
  setShowFhir: (b: boolean) => void;
  symptomNarrative: string;
  ageGroup: AgeGroup;
  pickedSynthea: SyntheaSelection | null;
}) {
  const toast = useToast();
  const [pdfBusy, setPdfBusy] = useState(false);

  // Triage PDF export — uses the same A4 brand-stripe pattern as the
  // patient intake receipt (lib/intake-receipt.ts) so every PDF coming
  // out of FrudgeCare looks consistent. Pre-handoff so we don't have a
  // case_code yet — we synthesize a "triage assessment" preview instead.
  const exportTriagePdf = async () => {
    if (!result || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { downloadTriageReceipt } = await import("@/lib/triage-receipt");
      const synthea = pickedSynthea?.patient;
      const patientName = synthea
        ? formatSyntheaName(synthea.label)
        : "Anonymous walk-in";
      await downloadTriageReceipt({
        patientName,
        patientAge: synthea?.age ?? result.demographics.age ?? null,
        patientSex: synthea?.sex ?? result.demographics.sex ?? null,
        patientHistory: synthea
          ? (synthea.active_conditions ?? []).join("; ")
          : "",
        ageGroup,
        symptomNarrative: symptomNarrative.trim() || "No narrative captured.",
        urgency: result.urgency,
        urgencyReason: result.urgencyReason,
        recommendedRoute: result.recommendedRoute,
        clinicianBrief: result.clinicianBrief,
        summary: result.summary,
        symptoms: result.symptoms,
        risks: result.risks,
        vitals: result.vitals.map((v) => ({
          field: v.field,
          value: v.value,
          unit: v.unit,
          status: v.status,
        })),
        icd10: result.icd10,
        ragSource: result.ragSource,
        ragEvidence: result.ragEvidence,
        confidencePct: Math.round((result.confidence.score || 0) * 100),
        sourceTier: result.sourceTier,
        llmProvider: result.llmProvider,
        llmModel: result.llmModel,
        generatedAt: new Date(),
      });
      toast.success("Triage receipt saved", "Check your downloads folder.");
    } catch (e) {
      console.error(e);
      toast.error("Export failed", "Try again in a moment.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <article className="fc-card p-5 lg:p-6 min-w-0">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="fc-eyebrow">Step 2 · Your triage result</div>
          <h2 className="fc-section-title mt-1">
            Here&apos;s what we found in your description
          </h2>
        </div>
        {result && !loading && !error && (
          <button
            type="button"
            onClick={exportTriagePdf}
            disabled={pdfBusy}
            className="fc-focus-ring shrink-0 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 h-8 text-[12px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {pdfBusy ? "Preparing…" : (
              <>
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </>
            )}
          </button>
        )}
      </header>

      {loading && <SkeletonOutput />}

      {!loading && error && (
        <div className="rounded-[var(--radius-control)] border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle size={14} /> Triage engine error
          </div>
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && !result && <EmptyOutput />}

      {!loading && !error && result && (
        <ResultBlocks result={result} showFhir={showFhir} setShowFhir={setShowFhir} />
      )}
    </article>
  );
}

function EmptyOutput() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Sparkles size={20} />
      </div>
      <div className="text-[14px] font-semibold text-slate-700">Awaiting triage analysis</div>
      <div className="max-w-[320px] text-[12.5px] text-slate-500">
        Pick a scenario or describe the patient and click{" "}
        <span className="font-semibold text-slate-700">Analyze &amp; Triage</span> to see urgency,
        extracted entities, care route, and grounded evidence.
      </div>
    </div>
  );
}

function SkeletonOutput() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="fc-skeleton h-12 w-full" />
      <div className="fc-skeleton h-4 w-3/5" />
      <div className="space-y-2">
        <div className="fc-skeleton h-3 w-1/3" />
        <div className="flex flex-wrap gap-2">
          <div className="fc-skeleton h-6 w-20" />
          <div className="fc-skeleton h-6 w-24" />
          <div className="fc-skeleton h-6 w-16" />
          <div className="fc-skeleton h-6 w-28" />
        </div>
      </div>
      <div className="fc-skeleton h-20 w-full" />
      <div className="fc-skeleton h-24 w-full" />
    </div>
  );
}

function ResultBlocks({
  result,
  showFhir,
  setShowFhir,
}: {
  result: TriageResult;
  showFhir: boolean;
  setShowFhir: (b: boolean) => void;
}) {
  const u = URG_STYLE[result.urgency];
  const hasContext =
    result.demographics.age !== null ||
    !!result.demographics.sex ||
    result.temporal.phrases.length > 0 ||
    result.medications.length > 0;
  const noEntities =
    result.symptoms.length === 0 &&
    result.risks.length === 0 &&
    result.negations.length === 0;

  return (
    <div>
      {/* SECTION 1: Urgency — full-bleed colored band breaking out of the
          card's horizontal padding only, so it sits cleanly under the
          OutputPanel header instead of overlapping it. No nested card. */}
      <section id="urgency" className="scroll-mt-24">
        <div
          className="-mx-5 px-5 py-4 lg:-mx-6 lg:px-6 lg:py-5 rounded-[var(--radius-card)]"
          style={{ backgroundColor: u.bg, color: u.text }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-90">
            Triage urgency
          </div>
          <div className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">
            {u.label}
          </div>
          <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed opacity-95">
            {urgencyHeadline(result.urgency)}
          </p>
        </div>

        <div className="mt-5">
          <p className="text-[13.5px] leading-[20px] text-slate-700">
            {result.urgencyReason}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ConfidencePill confidence={result.confidence} bg="#EEF4FB" fg="#0F4C81" />
            {result.sourceTier !== undefined && (
              <TierBadge tier={result.sourceTier} bg="#F1F5F9" fg="#334155" />
            )}
            {result.llmProvider && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-700"
                title={
                  result.llmProvider === "deterministic"
                    ? "No live LLM was used; this response came from the local clinical knowledge base or a safe default."
                    : `Powered by ${result.llmProvider} ${result.llmModel ?? ""}`.trim()
                }
              >
                {result.llmProvider === "deterministic"
                  ? "KB · deterministic"
                  : `${result.llmProvider} · ${result.llmModel ?? ""}`}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 border-l-2 border-l-[var(--primary)] pl-4">
            <span className="fc-eyebrow whitespace-nowrap">Next step</span>
            <span className="text-[14px] font-semibold leading-snug text-slate-900">
              {result.recommendedRoute}
            </span>
          </div>
        </div>
      </section>

      <hr className="my-6 border-t border-slate-100" />

      {/* SECTION 2: What we noticed — flat, no internal cards. */}
      <section id="findings" className="scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="fc-section-title">What we noticed in your symptoms</h3>
          <span className="text-[11px] text-slate-500">
            From your description
          </span>
        </div>

        {result.vitals.length > 0 && (
          <div className="mb-4">
            <div className="fc-eyebrow mb-2">Vitals</div>
            <VitalsStrip vitals={result.vitals} />
          </div>
        )}

        <div>
          <div className="fc-eyebrow mb-2">Symptoms, risks &amp; negations</div>
          {noEntities ? (
            <p className="text-[12.5px] text-slate-500">
              No structured entities surfaced. The full reasoning is shown in the evidence section below.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {result.symptoms.map((s) => {
                const icd = result.icd10.find(
                  (t) => t.term.toLowerCase() === s.toLowerCase(),
                );
                return (
                  <Chip
                    key={`sym-${s}`}
                    variant="primary"
                    title={icd ? `ICD-10 ${icd.code} — ${icd.display}` : undefined}
                    badge={icd?.code}
                  >
                    {s}
                  </Chip>
                );
              })}
              {result.risks.map((r) => (
                <Chip key={`risk-${r}`} variant="danger">
                  {r}
                </Chip>
              ))}
              {result.negations.map((n) => (
                <Chip key={`neg-${n}`} variant="negation">
                  {n}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {hasContext && (
          <div className="mt-3">
            <Disclosure label="Patient context (age, timing, medications)">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
                {result.demographics.age !== null && (
                  <>
                    <dt className="text-slate-500">Age &amp; sex</dt>
                    <dd className="font-semibold text-slate-900">
                      {result.demographics.age}
                      {result.demographics.sex ? ` · ${result.demographics.sex}` : ""}
                      {result.demographics.age_group ? ` · ${result.demographics.age_group}` : ""}
                    </dd>
                  </>
                )}
                {result.temporal.phrases.length > 0 && (
                  <>
                    <dt className="text-slate-500">Timing</dt>
                    <dd className="font-semibold text-slate-900">
                      {result.temporal.phrases.join(" · ")}
                      {result.temporal.minutes_since_onset !== null && (
                        <span className="ml-1 text-slate-500 font-normal">
                          ({result.temporal.minutes_since_onset} min)
                        </span>
                      )}
                    </dd>
                  </>
                )}
                {result.medications.length > 0 && (
                  <>
                    <dt className="text-slate-500">Meds detected</dt>
                    <dd className="font-semibold text-slate-900">
                      {result.medications.map((m) => m.name).join(", ")}
                    </dd>
                  </>
                )}
              </dl>
            </Disclosure>
          </div>
        )}
      </section>

      <hr className="my-6 border-t border-slate-100" />

      {/* SECTION 3: Evidence — flat blockquote + inline disclosure. */}
      <section id="evidence" className="scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="fc-section-title">The medical guidance we matched</h3>
          <span className="text-[11px] text-slate-500">Cross-referenced — never invented</span>
        </div>

        <blockquote className="rounded-[var(--radius-control)] border-l-2 border-l-[var(--primary)] bg-[#EEF4FB]/60 px-4 py-3 text-[13.5px] leading-[20px] text-slate-800">
          {result.ragEvidence}
          <footer className="mt-1 text-[11px] font-semibold text-[var(--primary)] not-italic">
            Source: {result.ragSource}
          </footer>
        </blockquote>

        {result.ragMatches.length > 1 && (
          <div className="mt-3">
            <Disclosure label={`Show top ${result.ragMatches.length} retrieved guidelines`}>
              <ul className="flex flex-col">
                {result.ragMatches.map((m, i) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0 text-[12px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800">
                        #{i + 1} · {m.source}
                      </div>
                      {m.matched_keywords.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.matched_keywords.slice(0, 6).map((kw) => (
                            <span
                              key={`${m.id}-${kw}`}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ScoreBar score={m.score} />
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        )}
      </section>

      <hr className="my-6 border-t border-slate-100" />

      {/* SECTION 4: For care team — inline disclosures, no nested card. */}
      <section id="technical" className="scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="fc-section-title">For your care team</h3>
          <span className="text-[11px] text-slate-500">Technical view</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Disclosure label="FHIR R4 output (JSON)">
            <button
              type="button"
              onClick={() => setShowFhir(!showFhir)}
              className="fc-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 h-8 text-[12px] font-semibold text-slate-700 transition hover:border-[var(--primary)]/50 hover:text-[var(--primary)]"
            >
              <FileJson size={13} />
              {showFhir ? "Hide JSON" : "Show JSON"}
            </button>
            {showFhir && (
              <pre className="mt-3 max-h-[320px] overflow-auto rounded-[var(--radius-control)] border border-slate-200 bg-[#0F172A] p-3 text-[11px] leading-relaxed text-slate-100">
                {JSON.stringify(result.fhir, null, 2)}
              </pre>
            )}
          </Disclosure>
          <Disclosure label="Pipeline timing &amp; provenance">
            <TimingStrip timings={result.timings} provenance={result.provenance ?? []} />
          </Disclosure>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CASCADE SECTION (Phase A)
// ---------------------------------------------------------------------------

function CascadeSection({
  cascade,
  loading,
  error,
  onRun,
}: {
  cascade: CascadeData | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <section className="mt-6">
      <div className="fc-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <div className="fc-eyebrow">Step 3 · Downstream care cascade</div>
            <div className="text-[14px] font-semibold text-slate-900">
              One narrative → four AI subsystems → one screen
            </div>
            <div className="text-[11.5px] text-slate-500">
              Same engines that power the production Front Desk, Nurse, and Provider panels —
              previewed read-only here.
            </div>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onRun}
              className="fc-focus-ring inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0F4C81] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(15,76,129,0.25)] transition hover:bg-[#0B3A66]"
            >
              <Zap size={14} />
              {cascade ? "Re-run cascade" : "Run full care cascade"}
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        <div className="p-5 lg:p-6">
          {loading && <CascadeSkeleton />}

          {!loading && error && (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <AlertTriangle size={14} /> Cascade error
              </div>
              <div>{error}</div>
            </div>
          )}

          {!loading && !error && !cascade && (
            <div className="rounded-[12px] border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#0F4C81]/10 text-[#0F4C81]">
                <GitBranch size={18} />
              </div>
              <div className="text-[13.5px] font-semibold text-slate-800">
                Click <span className="text-[#0F4C81]">Run full care cascade</span> to fan out the
                same narrative to the queue, nurse, and provider AI engines in parallel.
              </div>
            </div>
          )}

          {!loading && !error && cascade && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <QueueCard data={cascade.queue} />
                <NurseCard data={cascade.nurse} />
                <ProviderCard data={cascade.provider} />
              </div>
              {cascade.totalMs !== undefined && (
                <p className="text-center text-[10.5px] text-slate-400">
                  Cascade completed in {cascade.totalMs} ms · 3 AI subsystems run in parallel
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CascadeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-[12px] border border-slate-200 bg-white p-4">
          <div className="fc-skeleton h-4 w-1/2" />
          <div className="fc-skeleton h-3 w-3/4" />
          <div className="fc-skeleton h-3 w-2/3" />
          <div className="fc-skeleton h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

function QueueCard({ data }: { data: CascadeQueue }) {
  const current = data.ranked_cases.find((c) => c.case_id === data.current_case_id);
  return (
    <CascadeCardShell
      icon={ListChecks}
      eyebrow="Front Desk"
      title="Smart queue position"
      tier={data.source_tier}
      offline={data.offline}
    >
      {current && (
        <div className="mb-2 rounded-[10px] border border-[#0F4C81]/30 bg-[#EEF4FB] px-3 py-2 text-[12.5px]">
          <span className="font-bold text-[#0F4C81]">This patient · Position #{current.rank}</span>
          <div className="text-[11.5px] text-slate-700">{current.reason}</div>
        </div>
      )}
      <div className="space-y-1">
        {data.ranked_cases.slice(0, 4).map((c) => (
          <div
            key={c.case_id}
            className={[
              "flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-[11.5px]",
              c.case_id === data.current_case_id
                ? "bg-[#FFF7ED] text-slate-900"
                : "bg-slate-50 text-slate-700",
            ].join(" ")}
          >
            <span className="font-mono text-[10.5px] text-slate-500">#{c.rank}</span>
            <span className="flex-1 truncate">{c.case_id}</span>
            {c.alert && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                alert
              </span>
            )}
          </div>
        ))}
      </div>
      {data.bottleneck_alerts.length > 0 && (
        <div className="mt-2 space-y-1">
          {data.bottleneck_alerts.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-[8px] bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800"
            >
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </CascadeCardShell>
  );
}

function NurseCard({ data }: { data: CascadeNurse }) {
  return (
    <CascadeCardShell
      icon={Stethoscope}
      eyebrow="Nurse"
      title="Handoff brief"
      tier={data.source_tier}
      offline={data.offline}
    >
      {data.vitals_flags.length > 0 && (
        <div className="mb-2 space-y-1">
          {data.vitals_flags.slice(0, 3).map((f, i) => (
            <div
              key={i}
              className={[
                "rounded-[8px] px-2.5 py-1.5 text-[11.5px]",
                f.status === "critical"
                  ? "bg-rose-50 text-rose-800"
                  : f.status === "warning"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-slate-50 text-slate-700",
              ].join(" ")}
            >
              <span className="font-semibold">{f.field}</span>
              <span className="ml-1.5">{String(f.value)}</span>
              <span className="ml-1.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] uppercase">
                {f.status}
              </span>
              {f.note && <div className="mt-0.5 text-[10.5px] opacity-90">{f.note}</div>}
            </div>
          ))}
        </div>
      )}
      {data.suggested_questions.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            Suggested questions
          </div>
          <ul className="space-y-1 text-[11.5px] text-slate-700">
            {data.suggested_questions.slice(0, 3).map((q, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#0F4C81]" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.allergy_alerts.length > 0 && (
        <div className="mb-2 space-y-1">
          {data.allergy_alerts.map((a, i) => (
            <div
              key={i}
              className="rounded-[8px] bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800"
            >
              <strong>Allergy alert:</strong> {a}
            </div>
          ))}
        </div>
      )}
      {data.documentation_hints.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-slate-500">
            Documentation hints ({data.documentation_hints.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3 text-slate-600">
            {data.documentation_hints.map((h, i) => (
              <li key={i}>· {h}</li>
            ))}
          </ul>
        </details>
      )}
    </CascadeCardShell>
  );
}

function ProviderCard({ data }: { data: CascadeProvider }) {
  return (
    <CascadeCardShell
      icon={Brain}
      eyebrow="Provider"
      title="Co-pilot preview"
      tier={data.source_tier}
      offline={data.offline}
    >
      {data.differential_dx.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            Differential
          </div>
          <div className="space-y-1">
            {data.differential_dx.slice(0, 3).map((d, i) => (
              <div
                key={i}
                className="rounded-[8px] border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px]"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-semibold text-slate-900">{d.diagnosis}</span>
                  <ProbBadge p={d.probability} />
                </div>
                {d.icd10_code && (
                  <span className="mt-0.5 inline-block rounded bg-[#EEF4FB] px-1.5 py-0.5 font-mono text-[10px] text-[#0F4C81]">
                    {d.icd10_code}
                  </span>
                )}
                {d.reasoning && (
                  <div className="mt-0.5 text-[10.5px] leading-snug text-slate-600">
                    {d.reasoning}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.recommended_tests.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            Recommended workup
          </div>
          <div className="flex flex-wrap gap-1">
            {data.recommended_tests.slice(0, 6).map((t, i) => (
              <span
                key={i}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] text-slate-700"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.drug_interaction_alerts.length > 0 && (
        <div className="mb-2 space-y-1">
          {data.drug_interaction_alerts.slice(0, 2).map((a, i) => (
            <div
              key={i}
              className="rounded-[8px] bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800"
            >
              <strong>Interaction:</strong> {a}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] italic text-slate-500">
        {data.disclaimer}
      </div>
    </CascadeCardShell>
  );
}

function CascadeCardShell({
  icon: Icon,
  eyebrow,
  title,
  tier,
  offline,
  children,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  tier: number;
  offline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#0F4C81]/10 text-[#0F4C81]">
            <Icon size={14} />
          </span>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
              {eyebrow}
            </div>
            <div className="text-[13px] font-semibold text-slate-900">{title}</div>
          </div>
        </div>
        <TierBadge tier={tier} bg="#F1F5F9" fg="#334155" />
      </div>
      {offline ? (
        <div className="rounded-[8px] bg-slate-50 px-3 py-3 text-center text-[11.5px] text-slate-500">
          AI engine offline — preview unavailable.
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function ProbBadge({ p }: { p: string }) {
  const lo = p.toLowerCase();
  const cls =
    lo === "high"
      ? "bg-rose-100 text-rose-800"
      : lo === "medium"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${cls}`}
    >
      {p}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Vitals strip
// ---------------------------------------------------------------------------

function VitalsStrip({ vitals }: { vitals: Vital[] }) {
  // Uses urgency-channel tokens from globals.css §10.3 — never reuses
  // the urgency hex for decoration; status === warning maps to the
  // medium urgency channel, critical to high.
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {vitals.slice(0, 8).map((v, i) => (
        <div
          key={i}
          className={[
            "rounded-[var(--radius-control)] border px-3 py-2",
            v.status === "critical"
              ? "border-[#FECACA] bg-[#FEF2F2]"
              : v.status === "warning"
              ? "border-[#FFE7BA] bg-[#FFF7ED]"
              : "border-slate-200 bg-white",
          ].join(" ")}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {v.field}
          </div>
          <div className="text-[15px] font-bold text-slate-900">
            {v.value}
            <span className="ml-1 text-[10.5px] font-normal text-slate-500">{v.unit}</span>
          </div>
          {v.status !== "normal" && (
            <div
              className={[
                "mt-0.5 text-[10px] font-bold uppercase",
                v.status === "critical" ? "text-[#C62828]" : "text-[#E65100]",
              ].join(" ")}
            >
              {v.status}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence pill, tier badge, score bar, timing strip
// ---------------------------------------------------------------------------

function ConfidencePill({
  confidence,
  bg,
  fg,
}: {
  confidence: Confidence;
  bg: string;
  fg: string;
}) {
  const pct = Math.round((confidence.score || 0) * 100);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: bg, color: fg }}
      title="AI confidence — composite of pipeline tier, RAG match strength, and red-flag agreement."
    >
      <Brain size={11} /> AI confidence {pct}%
    </span>
  );
}

function TierBadge({ tier, bg, fg }: { tier: number; bg: string; fg: string }) {
  const label =
    tier === 1 ? "Tier 1 · LLM verified" : tier === 2 ? "Tier 2 · KB grounded" : "Tier 3 · safe default";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return (
    <div className="flex items-center gap-1.5" title={`Match score ${pct}%`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-[#0F4C81]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-slate-600">{pct}%</span>
    </div>
  );
}

function TimingStrip({
  timings,
  provenance,
}: {
  timings: Record<string, number>;
  provenance: string[];
}) {
  const entries = Object.entries(timings).filter(([k]) => k !== "cascade_total_ms");
  if (entries.length === 0 && provenance.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[10.5px] text-slate-500">
      {entries.length > 0 && (
        <>
          <span className="font-semibold uppercase tracking-wider">Pipeline:</span>
          {entries.map(([k, v]) => (
            <span key={k} className="font-mono">
              {k.replace(/_ms$/, "").replace(/_/g, " ")} {v}ms
            </span>
          ))}
        </>
      )}
      {provenance.length > 0 && (
        <span className="ml-auto font-mono text-slate-400">
          {provenance.length} KB provenance entries
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "How the AI thinks" drawer
// ---------------------------------------------------------------------------

function ThinksDrawer({
  result,
  onClose,
}: {
  result: TriageResult | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1 bg-slate-900/40"
      />
      <aside className="flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#0F4C81] text-white">
              <Brain size={16} />
            </span>
            <div>
              <div className="text-[14px] font-bold text-slate-900">How the AI thinks</div>
              <div className="text-[11px] text-slate-500">
                The 3-layer pipeline behind every triage answer
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fc-focus-ring flex h-8 w-8 items-center justify-center rounded-[8px] text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[12.5px] leading-relaxed text-slate-700">
          <ThinksSection icon={Layers} title="Layer 1 — Deterministic NLP">
            Regex extractors run first on the patient narrative. They surface vitals (BP, HR, RR,
            temperature, SpO2, glucose), temporal phrases (onset, duration), demographics (age,
            sex), and any drug names from the in-repo drug-interaction knowledge base. This layer
            never calls an LLM, runs in single-digit milliseconds, and is the same pipeline the
            nurse panel consumes.
            {result && (
              <div className="mt-2 rounded-[8px] bg-slate-50 px-3 py-2 text-[11.5px]">
                <div>
                  <strong>Vitals extracted:</strong>{" "}
                  {result.vitals.length > 0
                    ? result.vitals.map((v) => `${v.field} ${v.value}${v.unit}`).join(", ")
                    : "none"}
                </div>
                <div>
                  <strong>Temporal:</strong>{" "}
                  {result.temporal.phrases.join(", ") || "none"}
                </div>
                <div>
                  <strong>Demographics:</strong>{" "}
                  {result.demographics.age ?? "?"}-yr-old{" "}
                  {result.demographics.sex ?? "unspecified sex"}
                </div>
              </div>
            )}
          </ThinksSection>

          <ThinksSection icon={Database} title="Layer 2 — RAG retrieval">
            Top-3 matches from a hand-curated guideline corpus are scored deterministically by
            keyword coverage <em>before</em> any LLM call. The LLM is then handed the matched
            evidence as grounding so its output is constrained, citable, and auditable. The
            retriever is pluggable — keyword today, vector backend (ChromaDB +
            sentence-transformers) selectable via <code>RAG_BACKEND</code> env without UI changes.
            {result && result.ragMatches.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.ragMatches.map((m) => (
                  <div key={m.id} className="rounded-[8px] bg-slate-50 px-3 py-1.5 text-[11.5px]">
                    <div className="font-semibold text-slate-800">{m.source}</div>
                    <div className="text-slate-500">
                      score {Math.round(m.score * 100)}% · matched: {m.matched_keywords.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ThinksSection>

          <ThinksSection icon={Brain} title="Layer 3 — LLM verifier">
            Gemini 1.5 Flash is invoked only after retrieval has produced grounding. Its job is to
            verify and narrate, never to invent. Hard red-flag rules from the KB override the LLM
            if it tries to downgrade urgency. If the LLM fails or is offline, the response
            transparently falls back to Tier 2 (KB-only) and the badge shows it.
            {result && (
              <div className="mt-2 rounded-[8px] bg-slate-50 px-3 py-2 text-[11.5px]">
                <div>
                  <strong>Tier:</strong> {result.sourceTier}
                </div>
                <div>
                  <strong>Confidence:</strong> {Math.round(result.confidence.score * 100)}%
                  ({result.confidence.label})
                </div>
                {result.confidence.components && (
                  <div className="mt-1 font-mono text-[10.5px] text-slate-500">
                    {Object.entries(result.confidence.components)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            )}
          </ThinksSection>

          <ThinksSection icon={GitBranch} title="Cascade orchestrator">
            One <code>POST /ai/triage-cascade</code> fans the same narrative across four AI
            subsystems (intake, queue, nurse, provider) using <code>asyncio.gather</code>. Total
            wall time is dominated by the slowest subsystem because all three downstream calls run
            in parallel. Each card carries its own tier badge so failures degrade gracefully. The
            cascade is now triggered from the nurse workspace once the case has been handed off,
            and the patient sees its results live on their case status page.
          </ThinksSection>

          <ThinksSection icon={ShieldCheck} title="Why this isn't 'just GPT'">
            <ul className="ml-4 list-disc space-y-1">
              <li>Every output is grounded in a citable, in-repo guideline before generation.</li>
              <li>Hard KB red-flag rules can override the LLM, never the other way around.</li>
              <li>Numeric vitals are extracted by regex and classified against `vitals_ranges.json`.</li>
              <li>Drug mentions auto-trigger interaction checks against `drug_interactions.json`.</li>
              <li>Symptoms are auto-tagged with ICD-10 from `icd10_codes.json`.</li>
              <li>Tier badge makes degradation visible — no silent failure.</li>
            </ul>
          </ThinksSection>
        </div>
      </aside>
    </div>
  );
}

function ThinksSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-slate-200 bg-white p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#0F4C81]/10 text-[#0F4C81]">
          <Icon size={12} />
        </span>
        <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>
      </div>
      <div className="text-[12px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives — Chip used by ResultBlocks (symptom/risk/negation chips).
// The legacy Block helper was retired in favour of the Disclosure pattern.
// ---------------------------------------------------------------------------

type ChipVariant = "primary" | "danger" | "negation";

function Chip({
  children,
  variant,
  title,
  badge,
}: {
  children: React.ReactNode;
  variant: ChipVariant;
  title?: string;
  badge?: string;
}) {
  const styles: Record<ChipVariant, string> = {
    primary: "bg-[#EEF4FB] text-[#0F4C81] border-[#C7DBEC]",
    danger: "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]",
    negation: "bg-slate-100 text-slate-500 line-through border-slate-200",
  };
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
        styles[variant],
      ].join(" ")}
      title={title}
    >
      {children}
      {badge && (
        <span className="rounded bg-white/70 px-1 py-px font-mono text-[9.5px] text-[#0F4C81]">
          {badge}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FOOTER
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FRONT-DESK HANDOFF BANNER
// ---------------------------------------------------------------------------

/**
 * FrontDeskHandoffSection — flat content (NOT a card). Sits inside the
 * shared CarePlanCard, divided from siblings by <hr/>. Mirrors how
 * provider-case ClinicalSummaryPanel divides sections — see spec
 * 90-component-card.md "Never nest card/default inside card/default".
 */
function FrontDeskHandoffSection({
  urgency,
  state,
  caseId,
  error,
  syntheaName,
  onSend,
}: {
  urgency: Urgency;
  state: "idle" | "sending" | "sent" | "error";
  caseId: string | null;
  error: string | null;
  syntheaName: string | null;
  onSend: () => void;
}) {
  const chipClass =
    urgency === "CRITICAL"
      ? "bg-[#991B1B] text-white"
      : urgency === "URGENT"
      ? "bg-[#C62828] text-white"
      : urgency === "SEMI-URGENT"
      ? "bg-[#E65100] text-white"
      : "bg-[#2E7D32] text-white";

  if (state === "sent" && caseId) {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3" aria-live="polite">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center h-5 px-2 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Handed off
            </span>
            <span className="fc-eyebrow">Front desk · live</span>
          </div>
          <p className="mt-2 text-[14px] leading-[20px] text-slate-800">
            Case <span className="font-mono font-semibold">{caseId}</span> is now in the queue. Your
            nurse will run the AI cascade while reviewing — updates appear on your status page in real time.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/patient/status?caseId=${encodeURIComponent(caseId)}&urgency=${encodeURIComponent(urgency.toLowerCase())}`}
            className="fc-focus-ring inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--primary)] px-3 h-9 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0B3A66]"
          >
            Open my status
            <ArrowRight size={13} />
          </a>
          <a
            href="/front-desk/queue"
            className="fc-focus-ring inline-flex items-center justify-center rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 h-9 text-[13px] font-semibold text-slate-700 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            Front-desk queue
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3" aria-live="polite">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wider ${chipClass}`}>
            {urgency}
          </span>
          <span className="fc-eyebrow">Hand off to front desk</span>
        </div>
        <p className="mt-2 text-[13.5px] leading-[20px] text-slate-700 max-w-[560px]">
          {syntheaName
            ? `The case will be filed for ${syntheaName} (synthetic patient) and routed to the front-desk queue.`
            : "The case will be filed as an anonymous walk-in and routed to the front-desk queue."}{" "}
          You&apos;ll confirm a few basics first so the team knows you when you arrive.
        </p>
        {error ? (
          <p className="mt-2 inline-block fc-highlight-danger pl-3 py-1 text-[12px] text-slate-700">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={state === "sending"}
        className="fc-focus-ring shrink-0 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--primary)] px-4 h-10 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0B3A66] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {state === "sending" ? "Sending…" : "Send to front desk"}
        {state !== "sending" && <ArrowRight size={14} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send-to-Front-Desk confirmation modal
// ---------------------------------------------------------------------------

type HandoffPatientForm = {
  fullName: string;
  age: string;
  sex: string;
  phone: string;
  email: string;
  history: string;
  additionalDetails: string;
};

function makeInitialHandoffForm(
  synthea: SyntheaSelection | null,
): HandoffPatientForm {
  if (synthea?.patient) {
    return {
      fullName: formatSyntheaName(synthea.patient.label),
      age: synthea.patient.age != null ? String(synthea.patient.age) : "",
      sex: synthea.patient.sex ?? "",
      phone: "",
      email: "",
      history: (synthea.patient.active_conditions ?? []).join("; "),
      additionalDetails: "",
    };
  }
  return {
    fullName: "",
    age: "",
    sex: "",
    phone: "",
    email: "",
    history: "",
    additionalDetails: "",
  };
}

function SendToFrontDeskModal({
  urgency,
  summary,
  recommendedRoute,
  sending,
  error,
  initial,
  onCancel,
  onSubmit,
}: {
  urgency: Urgency;
  summary: string;
  recommendedRoute: string;
  sending: boolean;
  error: string | null;
  initial: HandoffPatientForm;
  onCancel: () => void;
  onSubmit: (form: HandoffPatientForm) => void;
}) {
  const [form, setForm] = useState<HandoffPatientForm>(initial);
  const u = URG_STYLE[urgency];

  const update = <K extends keyof HandoffPatientForm>(
    key: K,
    value: HandoffPatientForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const ageValid =
    form.age.trim() === "" ||
    (Number.isFinite(Number(form.age)) && Number(form.age) >= 0 && Number(form.age) < 130);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-modal-title"
    >
      <button
        type="button"
        aria-label="Close confirmation"
        onClick={sending ? undefined : onCancel}
        className="absolute inset-0 bg-slate-900/45"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--radius-dialog)] bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: u.bg, color: u.text }}
              >
                {u.label}
              </span>
              <span className="fc-eyebrow">Confirm before handoff</span>
            </div>
            <h2
              id="handoff-modal-title"
              className="mt-1 text-[16px] font-semibold text-slate-900"
            >
              A few quick details for the front desk
            </h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              These travel with your case so the front-desk team already knows you when you walk
              up. You can leave fields blank — we&apos;ll file the rest as walk-in basics.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="fc-focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 rounded-[var(--radius-card)] border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] leading-snug text-slate-700">
            <strong className="text-slate-900">Why we&apos;re sending this:</strong>{" "}
            {summary || recommendedRoute || "Triage AI suggests follow-up."}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Full name" hint="Optional. We&apos;ll use a walk-in number if blank.">
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                placeholder="e.g. Jane Doe"
                className="fc-text-input"
                disabled={sending}
              />
            </FieldGroup>
            <FieldGroup label="Age" hint="Years.">
              <input
                type="text"
                inputMode="numeric"
                value={form.age}
                onChange={(e) => update("age", e.target.value.replace(/[^\d]/g, ""))}
                placeholder="e.g. 32"
                className="fc-text-input"
                disabled={sending}
              />
              {!ageValid && (
                <span className="text-[11px] text-rose-600">Age looks off — please double-check.</span>
              )}
            </FieldGroup>
            <FieldGroup label="Sex">
              <select
                value={form.sex}
                onChange={(e) => update("sex", e.target.value)}
                className="fc-text-input"
                disabled={sending}
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="nonbinary">Non-binary / other</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Phone" hint="So front desk can reach you while you wait.">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="(555) 123-4567"
                className="fc-text-input"
                disabled={sending}
              />
            </FieldGroup>
            <FieldGroup label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@example.com"
                className="fc-text-input"
                disabled={sending}
              />
            </FieldGroup>
            <FieldGroup label="Existing conditions" hint="Comma-separated.">
              <input
                type="text"
                value={form.history}
                onChange={(e) => update("history", e.target.value)}
                placeholder="e.g. asthma, hypertension"
                className="fc-text-input"
                disabled={sending}
              />
            </FieldGroup>
          </div>

          <FieldGroup
            label="Anything else the team should know?"
            hint="Allergies, medications, or context."
          >
            <textarea
              value={form.additionalDetails}
              onChange={(e) => update("additionalDetails", e.target.value)}
              rows={2}
              className="fc-text-input min-h-[60px] resize-y"
              disabled={sending}
            />
          </FieldGroup>

          {error && (
            <div className="mt-3 rounded-[var(--radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-6 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="fc-focus-ring rounded-[var(--radius-control)] border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !ageValid}
            className="fc-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[#0F4C81] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0B3A66] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {sending ? "Sending…" : "Confirm and send"}
            {!sending && <ArrowRight size={14} />}
          </button>
        </footer>
      </form>
    </div>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-slate-700">
      <span className="font-semibold text-slate-800">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// CarePlanCard — single card grouping handoff, pharmacy, and community.
//
// Replaces the old pattern of stacking 4 sibling cards under the OutputPanel.
// Per spec 90-component-card.md, sibling content blocks should live as
// flat <section>s inside ONE card divided by <hr/>, not as nested cards.
// ---------------------------------------------------------------------------

function CarePlanCard({
  urgency,
  handoffState,
  handoffCaseId,
  handoffError,
  syntheaName,
  onSend,
  suggestedDrug,
  communityNarrative,
}: {
  urgency: Urgency;
  handoffState: "idle" | "sending" | "sent" | "error";
  handoffCaseId: string | null;
  handoffError: string | null;
  syntheaName: string | null;
  onSend: () => void;
  suggestedDrug: string;
  communityNarrative: string;
}) {
  return (
    <article className="mt-6 fc-card p-5 lg:p-6">
      <header>
        <div className="fc-eyebrow">Step 3 · Take action</div>
        <h2 className="fc-section-title mt-1">
          Send your case forward and find what you need next
        </h2>
        <p className="mt-1 text-[12.5px] leading-snug text-slate-500 max-w-[640px]">
          One place to hand the case to the team, locate your medication, and see how others
          described similar symptoms.
        </p>
      </header>

      <hr className="my-5 border-t border-slate-100" />

      <section id="handoff" className="scroll-mt-24">
        <FrontDeskHandoffSection
          urgency={urgency}
          state={handoffState}
          caseId={handoffCaseId}
          error={handoffError}
          syntheaName={syntheaName}
          onSend={onSend}
        />
      </section>

      <hr className="my-5 border-t border-slate-100" />

      <section id="pharmacy" className="scroll-mt-24">
        <PharmacyFinder suggestedDrug={suggestedDrug} flat />
      </section>

      {communityNarrative.length >= 12 && (
        <>
          <hr className="my-5 border-t border-slate-100" />
          <section id="community" className="scroll-mt-24">
            <CommunityPanel narrative={communityNarrative} flat />
          </section>
        </>
      )}
    </article>
  );
}

function DisclaimerFooter() {
  return (
    <footer className="mt-6 fc-card fc-highlight-warn p-4 text-[12px] leading-relaxed text-slate-700">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#B45309]" />
        <div>
          <strong className="text-slate-900">For clinical decision support only.</strong> This
          tool does not replace professional medical judgment, diagnosis, or treatment. Demo
          scenarios are synthetic. Production deployment would require SaMD review, HIPAA
          compliance, and SMART on FHIR integration with a certified EHR or care platform such as
          Gazuntite.
        </div>
      </div>
    </footer>
  );
}
