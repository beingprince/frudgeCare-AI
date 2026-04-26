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
import {
  AlertTriangle,
  ArrowRight,
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

const URG_STYLE: Record<
  Urgency,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  CRITICAL: { bg: "#DC2626", text: "#FFFFFF", border: "#7F1D1D", dot: "#FEE2E2", label: "CRITICAL" },
  URGENT: { bg: "#EA580C", text: "#FFFFFF", border: "#9A3412", dot: "#FFEDD5", label: "URGENT" },
  "SEMI-URGENT": { bg: "#FACC15", text: "#1F2937", border: "#A16207", dot: "#FEF3C7", label: "SEMI-URGENT" },
  "NON-URGENT": { bg: "#16A34A", text: "#FFFFFF", border: "#14532D", dot: "#DCFCE7", label: "NON-URGENT" },
};

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

  const [cascade, setCascade] = useState<CascadeData | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

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
    setCascade(null);
    setCascadeError(null);
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
    setCascade(null);
    setCascadeError(null);
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
    setCascade(null);
    setCascadeError(null);
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

  const handleRunCascade = async () => {
    setCascadeLoading(true);
    setCascadeError(null);
    setCascade(null);
    try {
      const response = await fetch("/api/ai/triage-cascade", {
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
      if (!response.ok) throw new Error(`Cascade returned ${response.status}`);
      const data = await response.json();
      setCascade(normalizeCascade(data));
    } catch (e) {
      setCascadeError(
        e instanceof Error ? e.message : "Cascade request failed.",
      );
    } finally {
      setCascadeLoading(false);
    }
  };

  // Lift the current AI verdict into a real case row in the front-desk
  // queue. Mirrors the payload shape that /patient/intake POSTs to
  // /api/cases/create so the queue and downstream pages render this
  // case identically to one that came from the production intake form.
  // If the user picked a Synthea patient we attach that synthetic
  // identity; otherwise we tag the case as an anonymous walk-in.
  const handleSendToFrontDesk = async () => {
    if (!result || handoffState === "sending") return;
    setHandoffState("sending");
    setHandoffError(null);
    setHandoffCaseId(null);

    const synthea = pickedSynthea?.patient;
    const anonSuffix = Math.floor(Math.random() * 9000 + 1000);
    const patientName = synthea
      ? formatSyntheaName(synthea.label)
      : `Walk-in ${anonSuffix}`;

    const urgencyForCase = mapUrgencyToCaseLevel(result.urgency);
    const nowIso = new Date().toISOString();

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
      patient_full_name: patientName,
      patient_age: synthea?.age ?? null,
      patient_gender: synthea?.sex ?? null,
      patient_history: synthea
        ? (synthea.active_conditions ?? []).join("; ")
        : "",
      additional_details: synthea
        ? `Synthetic patient (Synthea ${pickedSynthea?.patient.bucket}). Active meds: ${(synthea.active_medications ?? []).join(", ") || "none"}.`
        : "Created from /triage demo (no patient identity captured).",
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

      <main className="mx-auto w-full max-w-[1280px] px-4 py-5 lg:px-8 lg:py-7">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
          <section className="lg:col-span-5 xl:col-span-5">
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

          <section className="lg:col-span-7 xl:col-span-7">
            <OutputPanel
              loading={loading}
              error={error}
              result={result}
              showFhir={showFhir}
              setShowFhir={setShowFhir}
            />
          </section>
        </div>

        {result && !error && (
          <div className="mt-5">
            <FrontDeskHandoffBanner
              urgency={result.urgency}
              state={handoffState}
              caseId={handoffCaseId}
              error={handoffError}
              syntheaName={
                pickedSynthea
                  ? formatSyntheaName(pickedSynthea.patient.label)
                  : null
              }
              onSend={handleSendToFrontDesk}
            />
          </div>
        )}

        {result && !error && (
          <CascadeSection
            cascade={cascade}
            loading={cascadeLoading}
            error={cascadeError}
            onRun={handleRunCascade}
          />
        )}

        {result && !error && submittedNarrative.length >= 12 && (
          <div className="mt-5">
            <CommunityPanel narrative={submittedNarrative} />
          </div>
        )}

        {result && !error && (
          <div className="mt-5">
            <PharmacyFinder suggestedDrug={result.medications[0]?.name ?? ""} />
          </div>
        )}

        <DisclaimerFooter />
      </main>

      {showThinks && (
        <ThinksDrawer
          result={result}
          cascade={cascade}
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

        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 sm:hidden">
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
    <div className="fc-card p-5 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="fc-eyebrow">Step 1</div>
          <h1 className="fc-page-title">Describe the patient</h1>
          <p className="fc-page-subtitle">Pick a scenario, load a real Synthea patient, or write your own.</p>
        </div>
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Demo scenarios
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        {SCENARIOS.map((s) => {
          const active = activeScenarioId === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPickScenario(s)}
              className={[
                "fc-card-interactive fc-focus-ring group flex items-start gap-2.5 rounded-[12px] border p-3 text-left transition",
                active
                  ? "border-[#0F4C81] bg-[#EEF4FB] shadow-[0_0_0_3px_rgba(15,76,129,0.12)]"
                  : "border-slate-200 bg-white hover:border-[#0F4C81]/50",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                  active ? "bg-[#0F4C81] text-white" : "bg-[#0F4C81]/10 text-[#0F4C81]",
                ].join(" ")}
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight text-slate-900">
                  {s.label}
                </span>
                <span className="block text-[11px] leading-tight text-slate-500">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <SyntheaPicker onSelect={onPickSynthea} />

      <label htmlFor="symptoms" className="mb-1.5 block text-[12px] font-semibold text-slate-700">
        Patient symptom description
      </label>
      <textarea
        id="symptoms"
        rows={6}
        className="fc-text-input fc-focus-ring resize-y"
        placeholder="Or describe the patient's symptoms in your own words…"
        value={symptomText}
        onChange={(e) => setSymptomText(e.target.value)}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="age" className="mb-1.5 block text-[12px] font-semibold text-slate-700">
            Age group
          </label>
          <select
            id="age"
            className="fc-text-input fc-focus-ring"
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
          >
            <option value="Pediatric">Pediatric</option>
            <option value="Adult">Adult</option>
            <option value="Geriatric">Geriatric</option>
          </select>
        </div>
        <div className="flex items-end justify-end text-right text-[11px] text-slate-500">
          <span>
            {symptomText.length > 0
              ? `${symptomText.trim().split(/\s+/).filter(Boolean).length} words`
              : "Awaiting input"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={!canSubmit}
        className={[
          "fc-focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[14px] font-bold transition",
          canSubmit
            ? "bg-[#E85D04] text-white shadow-[0_4px_14px_rgba(232,93,4,0.25)] hover:bg-[#C2410C]"
            : "cursor-not-allowed bg-slate-200 text-slate-500",
        ].join(" ")}
      >
        <Sparkles size={16} />
        {loading ? "Analyzing…" : "Analyze & Triage"}
        {!loading && <ArrowRight size={16} />}
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        AI runs three layers — NLP entity &amp; vital extraction, RAG against
        clinical guidelines, then LLM verification — before any output renders.
      </p>
    </div>
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
}: {
  loading: boolean;
  error: string | null;
  result: TriageResult | null;
  showFhir: boolean;
  setShowFhir: (b: boolean) => void;
}) {
  return (
    <div className="fc-card overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/60 px-5 py-3 lg:px-6">
        <div className="fc-eyebrow">Step 2</div>
        <div className="text-[14px] font-semibold text-slate-900">Triage output</div>
      </div>

      <div className="p-5 lg:p-6">
        {loading && <SkeletonOutput />}

        {!loading && error && (
          <div className="rounded-[12px] border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle size={14} /> AI engine error
            </div>
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && !result && <EmptyOutput />}

        {!loading && !error && result && (
          <ResultBlocks result={result} showFhir={showFhir} setShowFhir={setShowFhir} />
        )}
      </div>
    </div>
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
  return (
    <div className="space-y-5">
      {/* Urgency block + confidence + tier badges */}
      <div
        className="rounded-[14px] border-2 px-5 py-4"
        style={{ backgroundColor: u.bg, color: u.text, borderColor: u.border }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-90"
              style={{ color: u.text }}
            >
              Triage urgency
            </div>
            <div
              className="text-[26px] font-extrabold leading-tight tracking-tight"
              style={{ color: u.text }}
            >
              {u.label}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <ConfidencePill confidence={result.confidence} bg={u.dot} fg={u.bg} />
            {result.sourceTier !== undefined && (
              <TierBadge tier={result.sourceTier} bg={u.dot} fg={u.bg} />
            )}
            {result.llmProvider && (
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ borderColor: u.dot, color: u.text, background: u.bg }}
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
        </div>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: u.text, opacity: 0.95 }}>
          {result.urgencyReason}
        </p>
      </div>

      {/* Vitals strip — extracted by NLP regex from the narrative */}
      {result.vitals.length > 0 && <VitalsStrip vitals={result.vitals} />}

      {/* NLP entities + ICD-10 codes inline */}
      <Block
        eyebrow="NLP"
        title="Extracted clinical entities"
        helper="Symptoms, negations, and risk flags parsed from the narrative. Hover a chip for ICD-10."
      >
        {result.symptoms.length === 0 && result.risks.length === 0 && result.negations.length === 0 && (
          <p className="text-[12.5px] text-slate-500">
            No structured entities surfaced. The full reasoning is shown in the evidence block below.
          </p>
        )}
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
      </Block>

      {/* Demographics + temporal — small inline strip */}
      {(result.demographics.age !== null ||
        result.demographics.sex ||
        result.temporal.phrases.length > 0) && (
        <div className="flex flex-wrap gap-2 rounded-[10px] border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11.5px]">
          {result.demographics.age !== null && (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Users size={11} /> Age {result.demographics.age}
              {result.demographics.sex ? ` · ${result.demographics.sex}` : ""}
              {result.demographics.age_group ? ` · ${result.demographics.age_group}` : ""}
            </span>
          )}
          {result.temporal.phrases.length > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Clock size={11} /> {result.temporal.phrases.join(" · ")}
              {result.temporal.minutes_since_onset !== null && (
                <span className="text-slate-500"> ({result.temporal.minutes_since_onset} min)</span>
              )}
            </span>
          )}
          {result.medications.length > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Pill size={11} /> Meds detected: {result.medications.map((m) => m.name).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Recommended care route */}
      <Block eyebrow="Routing" title="Recommended care route" helper="Care coordinator action item.">
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] font-semibold text-slate-900">
          {result.recommendedRoute}
        </div>
      </Block>

      {/* RAG evidence — show top match prominently + top-3 list */}
      <Block
        eyebrow="RAG"
        title="Clinical guideline evidence"
        helper="Retrieved deterministically before the LLM ran — grounded, not hallucinated."
      >
        <blockquote className="rounded-[10px] border-l-4 border-l-[#0F4C81] bg-[#EEF4FB] px-4 py-3 text-[13.5px] leading-relaxed text-slate-800">
          {result.ragEvidence}
        </blockquote>
        <div className="mt-2 text-[11.5px] font-semibold text-[#0F4C81]">
          Source: {result.ragSource}
        </div>

        {result.ragMatches.length > 1 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Top {result.ragMatches.length} retrieved guidelines
            </div>
            {result.ragMatches.map((m, i) => (
              <div
                key={m.id}
                className="rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-[11.5px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800">
                    #{i + 1} · {m.source}
                  </div>
                  <ScoreBar score={m.score} />
                </div>
                {m.matched_keywords.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.matched_keywords.slice(0, 6).map((kw) => (
                      <span
                        key={`${m.id}-${kw}`}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-600"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Block>

      {/* FHIR */}
      <Block
        eyebrow="FHIR R4"
        title="FHIR-compatible output"
        helper="CarePlan + Observation entries shaped for EHR / Gazuntite ingestion."
      >
        <button
          type="button"
          onClick={() => setShowFhir(!showFhir)}
          className="fc-focus-ring inline-flex items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 transition hover:border-[#0F4C81]/50 hover:text-[#0F4C81]"
        >
          <FileJson size={14} />
          {showFhir ? "Hide JSON" : "Show JSON"}
          {showFhir ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showFhir && (
          <pre className="mt-3 max-h-[320px] overflow-auto rounded-[10px] border border-slate-200 bg-[#0F172A] p-4 text-[11.5px] leading-relaxed text-slate-100">
            {JSON.stringify(result.fhir, null, 2)}
          </pre>
        )}
      </Block>

      {/* Pipeline timing strip — judge bait */}
      <TimingStrip timings={result.timings} provenance={result.provenance ?? []} />
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
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {vitals.slice(0, 8).map((v, i) => (
        <div
          key={i}
          className={[
            "rounded-[10px] border px-3 py-2",
            v.status === "critical"
              ? "border-rose-300 bg-rose-50"
              : v.status === "warning"
              ? "border-amber-300 bg-amber-50"
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
                v.status === "critical" ? "text-rose-700" : "text-amber-700",
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
  cascade,
  onClose,
}: {
  result: TriageResult | null;
  cascade: CascadeData | null;
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
            in parallel. Each card carries its own tier badge so failures degrade gracefully.
            {cascade && cascade.totalMs !== undefined && (
              <div className="mt-2 rounded-[8px] bg-slate-50 px-3 py-2 text-[11.5px]">
                Last cascade: {cascade.totalMs} ms total · queue tier {cascade.queue.source_tier} ·
                nurse tier {cascade.nurse.source_tier} · provider tier {cascade.provider.source_tier}
              </div>
            )}
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
// Shared primitives
// ---------------------------------------------------------------------------

function Block({
  eyebrow,
  title,
  helper,
  children,
}: {
  eyebrow: string;
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5">
        <div className="fc-eyebrow">{eyebrow}</div>
        <div className="text-[14px] font-semibold text-slate-900">{title}</div>
        {helper && <div className="text-[11.5px] text-slate-500">{helper}</div>}
      </div>
      {children}
    </section>
  );
}

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

function FrontDeskHandoffBanner({
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
  const tone =
    urgency === "CRITICAL"
      ? { ring: "border-[#C62828]", chip: "bg-[#C62828] text-white" }
      : urgency === "URGENT"
      ? { ring: "border-[#E53935]", chip: "bg-[#E53935] text-white" }
      : urgency === "SEMI-URGENT"
      ? { ring: "border-amber-400", chip: "bg-amber-400 text-amber-950" }
      : { ring: "border-emerald-400", chip: "bg-emerald-500 text-white" };

  if (state === "sent" && caseId) {
    return (
      <section
        className={`rounded-[14px] border bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.04)] ${tone.ring}`}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Handed off to front desk
            </div>
            <div className="mt-0.5 text-[14px] font-semibold text-slate-900">
              Case <span className="font-mono">{caseId}</span> is now in the queue.
            </div>
            <p className="mt-1 text-[12px] leading-snug text-slate-600">
              The case appears on the front-desk queue and will follow the same
              triage → nurse → provider path as a real intake.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/front-desk/queue"
              className="rounded-[10px] bg-[#0F4C81] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0d3f6c]"
            >
              Open front-desk queue →
            </a>
            <a
              href={`/patient/status?caseId=${encodeURIComponent(caseId)}&urgency=${encodeURIComponent(urgency.toLowerCase())}`}
              className="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-[#0F4C81] hover:text-[#0F4C81]"
            >
              View patient status
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`rounded-[14px] border bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.04)] ${tone.ring}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.chip}`}
            >
              {urgency}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Hand off to front desk
            </span>
          </div>
          <div className="mt-1.5 text-[14px] font-semibold text-slate-900">
            Create a real case from this AI verdict.
          </div>
          <p className="mt-1 max-w-[640px] text-[12px] leading-snug text-slate-600">
            {syntheaName
              ? `The case will be filed for ${syntheaName} (synthetic patient) and routed to the front-desk queue.`
              : "The case will be filed as an anonymous walk-in and routed to the front-desk queue."}{" "}
            From there it follows the existing triage → nurse → provider workflow.
          </p>
          {error ? (
            <p className="mt-2 rounded-[8px] border border-amber-200 bg-amber-50 px-2 py-1 text-[11.5px] text-amber-900">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={state === "sending"}
          className="shrink-0 rounded-[10px] bg-[#0F4C81] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0d3f6c] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state === "sending" ? "Sending…" : "Send to front-desk queue"}
        </button>
      </div>
    </section>
  );
}

function DisclaimerFooter() {
  return (
    <footer className="mt-6 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <div>
          <strong>For clinical decision support only.</strong> This tool does not replace
          professional medical judgment, diagnosis, or treatment. Demo scenarios are synthetic.
          Production deployment would require SaMD review, HIPAA compliance, and SMART on FHIR
          integration with a certified EHR or care platform such as Gazuntite.
        </div>
      </div>
    </footer>
  );
}
