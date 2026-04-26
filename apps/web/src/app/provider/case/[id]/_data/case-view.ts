/**
 * _data/case-view.ts
 *
 * Per-case view model for the provider review page.
 *
 * This is the shape the UI consumes. It wraps the underlying mock-service
 * (patient + case) and adds encounter-scoped structured data (vitals,
 * nurse brief, assessment, meds, timeline) that the current types file
 * marks as `additional_structured_data: Record<string, any>`.
 *
 * When the Supabase schema grows typed fields for those, this module is
 * the one to rewrite — the components stay the same.
 */

import type { Vital } from "@/components/shared/VitalsGrid";
import { getMockCaseById, MOCK_CASES } from "@/lib/mock-service";

// ─── View model ──────────────────────────────────────────────────────────
//
// Data-only module. No React, no icons — the page maps `category` strings
// to icons in the component layer. Keeps this file portable for any future
// data-source swap (Supabase, REST, etc.).

export type TimelineCategory = "intake" | "scheduled" | "nurse" | "provider";

export type TimelineEventData = {
  id: string;
  category: TimelineCategory;
  title: string;
  actorRole: string;
  timestamp: string;
  handoffSummary?: string;
  remarks?: string;
  nextOwnerRole?: string;
  isAbnormal?: boolean;
  isActive?: boolean;
};

export type RiskFlag = {
  id: string;
  title: string;
  detail: string;
};

export type HandoffItem = {
  id: string;
  label: string;
  done: boolean;
};

export type ProviderCaseView = {
  id: string;
  patient: {
    fullName: string;
    demographics: string;
    gender: string;
    age: number;
    weight: string;
    diagnoses: string[];
  };
  caseMeta: {
    caseCode: string;
    urgency: "Routine" | "Urgent" | "Emergency";
    currentState:
      | "Submitted"
      | "Under Review"
      | "Waiting on Patient"
      | "Nurse Pending"
      | "Provider Review"
      | "Follow-up Due"
      | "Escalated"
      | "Closed";
    waitingOn?: string;
    appointmentStatus: string;
    lastUpdated: string;
    isTriageCleared: boolean;
  };
  chiefComplaint: {
    patientWords: string;
    submittedVia: string;
    submittedAgo: string;
  };
  nurseBrief: {
    summary: string;
    takeaways: string[];
    adherenceNote: string;
    validatedAgo: string;
    recordedBy: string;
    recordedAt: string;
  };
  vitals: Vital[];
  assessment: {
    onset: string;
    severity: string;
    redFlagsLabel: string;
    associated: string[];
    denied: string[];
  };
  meds: { name: string; dose: string }[];
  labs: string | null;
  visitHistory: string | null;
  riskFlags: RiskFlag[];
  timeline: TimelineEventData[];
  handoffChecklist: HandoffItem[];
  nurseOwner: { name: string; pickedUpAt: string };
};

// ─── Mock dataset — mock-001 (rich) ──────────────────────────────────────

const MOCK_001: ProviderCaseView = {
  id: "mock-001",
  patient: {
    fullName: "Jonathan Reya",
    demographics: "68, male",
    gender: "Male",
    age: 68,
    weight: "185 lbs",
    diagnoses: ["Hypertension", "Type 2 Diabetes"],
  },
  caseMeta: {
    caseCode: "CAS-1045",
    urgency: "Urgent",
    currentState: "Provider Review",
    waitingOn: "Provider decision",
    appointmentStatus: "Arrived · Room 3",
    lastUpdated: "10 min ago",
    isTriageCleared: true,
  },
  chiefComplaint: {
    patientWords:
      "I've been feeling dizzy since last night, and I have a slight headache.",
    submittedVia: "Mobile intake",
    submittedAgo: "~12 hrs ago",
  },
  nurseBrief: {
    summary:
      "Patient presents with acute dizziness and mild headache. Combined with today's nurse-confirmed BP of 158/92 and a prior stroke (2022), this points to possible hypertensive urgency.",
    takeaways: [
      "Medication non-compliance confirmed — missed Lisinopril this morning.",
      "Neurological exam recommended to rule out recurrent stroke / TIA.",
    ],
    adherenceNote:
      "Patient admits to occasionally skipping morning Lisinopril doses \u201Cwhen I feel fine.\u201D Confirmed missed dose this morning.",
    validatedAgo: "10 min ago",
    recordedBy: "Nurse M. Ortega",
    recordedAt: "09:40",
  },
  vitals: [
    { id: "bp",   label: "Blood pressure",   value: "158 / 92", unit: "mmHg", abnormal: true, takenAt: "09:40" },
    { id: "hr",   label: "Heart rate",       value: "88",       unit: "bpm",                  takenAt: "09:40" },
    { id: "temp", label: "Temperature",      value: "98.6",     unit: "°F",                   takenAt: "09:40" },
    { id: "spo2", label: "SpO\u2082",        value: "97",       unit: "%",                    takenAt: "09:40" },
    { id: "resp", label: "Respiratory rate", value: "16",       unit: "/ min",                takenAt: "09:40" },
  ],
  assessment: {
    onset: "~12 hrs ago",
    severity: "4 / 10",
    redFlagsLabel: "Stroke protocol · meds",
    associated: ["Mild headache"],
    denied: ["Numbness", "Vision changes"],
  },
  meds: [
    { name: "Lisinopril 20 mg", dose: "1 tablet daily" },
    { name: "Metformin 500 mg", dose: "1 tablet twice daily with meals" },
  ],
  labs: null,
  visitHistory: null,
  riskFlags: [{ id: "stroke-2022", title: "Stroke (2022)", detail: "CVA, left MCA" }],
  timeline: [
    {
      id: "t1",
      category: "intake",
      title: "Patient completed intake",
      actorRole: "Patient (mobile)",
      timestamp: "Oct 12, 08:30",
    },
    {
      id: "t2",
      category: "scheduled",
      title: "Scheduled & assigned",
      actorRole: "Front desk",
      timestamp: "Oct 12, 09:15",
      handoffSummary: "Assigned to Dr. Carter",
      nextOwnerRole: "Nurse",
    },
    {
      id: "t3",
      category: "nurse",
      title: "Intake validated",
      actorRole: "Triage nurse",
      timestamp: "Oct 12, 09:40",
      handoffSummary: "Vitals confirmed · abnormal BP noted",
      remarks: "BP 158/92 manually confirmed. Escalated to priority review.",
      nextOwnerRole: "Provider",
      isAbnormal: true,
    },
    {
      id: "t4",
      category: "provider",
      title: "Provider review",
      actorRole: "Dr. Carter",
      timestamp: "Now",
      isActive: true,
    },
  ],
  handoffChecklist: [
    { id: "identity",      label: "Patient identity verified",            done: true  },
    { id: "complaint",     label: "Chief complaint + severity captured",  done: true  },
    { id: "vitals",        label: "Vitals captured or marked not-taken",  done: true  },
    { id: "questionnaire", label: "Symptom questionnaire complete",       done: true  },
    { id: "findings",      label: "Nurse findings or no-abnormal toggle", done: true  },
    { id: "flags",         label: "High-risk flags acknowledged",         done: true  },
    { id: "brief",         label: "Handoff brief confirmed by nurse",     done: true  },
  ],
  nurseOwner: { name: "Nurse M. Ortega", pickedUpAt: "09:14" },
};

// Future cases can be added here. When Supabase comes online, replace
// this map with a loader function that hits the DB — the UI layer won't
// need to change.
const CASE_VIEWS: Record<string, ProviderCaseView> = {
  "mock-001": MOCK_001,
};

/**
 * Build a ProviderCaseView from a raw MockCase. Used as a generic backup option
 * so the provider page show on screen for *any* case that exists in the mock store
 * (or in Supabase in the future) — not just the richly-authored mock-001.
 */
function buildViewFromMockCase(id: string): ProviderCaseView | null {
  const raw = MOCK_CASES.find(c => c.id === id || c.case_code === id);
  if (!raw) return null;

  const urgencyRaw = raw.urgency_final ?? raw.urgency_suggested ?? "medium";
  const urgency: "Routine" | "Urgent" | "Emergency" =
    urgencyRaw === "high" ? "Emergency" :
    urgencyRaw === "medium" ? "Urgent" : "Routine";

  const isTriageCleared = raw.status === "confirmed" || raw.status === "in_visit" || raw.status === "scheduled";

  // Derive age from date_of_birth (MockPatient doesn't carry age directly).
  const dobYear = raw.patient?.date_of_birth ? new Date(raw.patient.date_of_birth).getFullYear() : 0;
  const nowYear = new Date().getFullYear();
  const age = dobYear ? nowYear - dobYear : 0;

  return {
    id: raw.id,
    patient: {
      fullName: raw.patient?.full_name ?? "Unknown Patient",
      demographics: `${age || "—"}, ${raw.patient?.sex?.toLowerCase() ?? "—"}`,
      gender: raw.patient?.sex ?? "Unknown",
      age,
      weight: "—",
      diagnoses: raw.patient?.chronic_conditions ?? [],
    },
    caseMeta: {
      caseCode: raw.case_code ?? raw.id,
      urgency,
      currentState: isTriageCleared ? "Provider Review" : "Nurse Pending",
      waitingOn: isTriageCleared ? "Provider decision" : "Nurse validation",
      appointmentStatus: raw.linked_appointment_id ? "Scheduled" : "Pending",
      lastUpdated: new Date(raw.updated_at ?? raw.created_at).toLocaleString(),
      isTriageCleared,
    },
    chiefComplaint: {
      patientWords: raw.symptom_text ?? "Not recorded",
      submittedVia: "Mobile intake",
      submittedAgo: new Date(raw.created_at).toLocaleDateString(),
    },
    nurseBrief: {
      summary: raw.structured_summary ?? "Awaiting nurse validation.",
      takeaways: raw.risky_flags ?? [],
      adherenceNote: raw.urgency_reason ?? "",
      validatedAgo: "—",
      recordedBy: "Nurse",
      recordedAt: "—",
    },
    vitals: [],
    assessment: {
      onset: raw.duration_text ?? "Not recorded",
      severity: urgency === "Emergency" ? "8 / 10" : urgency === "Urgent" ? "5 / 10" : "2 / 10",
      redFlagsLabel: raw.risky_flags?.join(" · ") ?? "None",
      associated: [],
      denied: [],
    },
    meds: [],
    labs: null,
    visitHistory: null,
    riskFlags: (raw.risky_flags ?? []).map((f, i) => ({
      id: `flag-${i}`,
      title: f,
      detail: "Flagged during pre-triage.",
    })),
    timeline: [
      {
        id: "t1",
        category: "intake",
        title: "Patient completed intake",
        actorRole: "Patient",
        timestamp: new Date(raw.created_at).toLocaleString(),
      },
      {
        id: "t2",
        category: "provider",
        title: "Provider review",
        actorRole: "Provider",
        timestamp: "Now",
        isActive: true,
      },
    ],
    handoffChecklist: [
      { id: "identity",      label: "Patient identity verified",            done: true },
      { id: "complaint",     label: "Chief complaint + severity captured",  done: true },
      { id: "vitals",        label: "Vitals captured or marked not-taken",  done: isTriageCleared },
      { id: "questionnaire", label: "Symptom questionnaire complete",       done: isTriageCleared },
      { id: "findings",      label: "Nurse findings or no-abnormal toggle", done: isTriageCleared },
      { id: "flags",         label: "High-risk flags acknowledged",         done: isTriageCleared },
      { id: "brief",         label: "Handoff brief confirmed by nurse",     done: isTriageCleared },
    ],
    nurseOwner: { name: "Nurse on duty", pickedUpAt: "—" },
  };
}

/**
 * Load a case view by id. Looks up the hand-authored view map first, then
 * falls back to a generic builder over the mock-service, then null.
 * (The page show on screen a calm "not found" data in the null case.)
 */
export function getProviderCaseView(id: string): ProviderCaseView | null {
  if (CASE_VIEWS[id]) return CASE_VIEWS[id];
  // Allow both internal id (mock-001) and human case code (FC-C-5001, CAS-1045).
  const direct = getMockCaseById(id);
  if (direct) return buildViewFromMockCase(direct.id);
  return buildViewFromMockCase(id);
}

// ─── Real-data loader (Supabase via /api/cases/[caseId]) ────────────────
//
// Why this exists:
//   The original page used the synchronous `getProviderCaseView` above,
//   which only knew about MOCK_CASES. Cases created by /patient/intake or
//   /front-desk → /nurse never appeared on /provider/case/<uuid> because
//   they live in Supabase, not in the in-memory mock store.
//
//   `loadProviderCaseView` is the canonical async loader: it calls
//   /api/cases/[caseId] (which is itself schema-tolerant — see that
//   route), maps the raw row + folded `ai_patient_profile.nurse_assessment`
//   into the same `ProviderCaseView` shape the rest of the UI consumes,
//   and falls back to the mock builder so the demo case (mock-001) and
//   any in-memory cases keep working when the backend is down.

const PROVIDER_VISIBLE_STATUSES = new Set([
  'provider_review_pending',
  'provider_action_issued',
  'disposition_finalized',
]);

type ApiCaseRow = {
  id: string;
  case_code?: string | null;
  status?: string | null;
  urgency_final?: string | null;
  urgency_suggested?: string | null;
  urgency_reason?: string | null;
  symptom_text?: string | null;
  duration_text?: string | null;
  severity_hint?: string | null;
  additional_details?: string | null;
  patient_full_name?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  patient_date_of_birth?: string | null;
  patient_history?: string | null;
  structured_summary?: string | null;
  ai_clinician_brief?: string | null;
  risky_flags?: string[] | null;
  source_channel?: string | null;
  ai_patient_profile?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NurseAssessmentRecord = {
  id?: string;
  primary_complaint?: string;
  severity?: string;
  pain_score?: number | string;
  associated_symptoms?: string[];
  denied_symptoms?: string[];
  red_flags_checked?: string[];
  nurse_clinical_summary?: string;
  provider_handoff_brief?: string;
  is_validated?: boolean;
  validated_by_user_id?: string;
  validated_at?: string;
  assessment_completed_at?: string;
  additional_structured_data?: {
    vitals?: {
      bpSys?: string | number;
      bpDia?: string | number;
      hr?: string | number;
      tempF?: string | number;
      spo2?: string | number;
      /** Nurse UI stores RR as `rr` — must mirror here or provider panel stays empty. */
      rr?: string | number;
      respRate?: string | number;
      notTakenReason?: string;
    };
    notTakenReason?: string;
  };
};

function mapUrgency(u: string | null | undefined): "Routine" | "Urgent" | "Emergency" {
  if (u === "high" || u === "Emergency" || u === "URGENT" || u === "CRITICAL") return "Emergency";
  if (u === "medium" || u === "Urgent" || u === "SEMI-URGENT") return "Urgent";
  return "Routine";
}

function mapStatusToCurrentState(
  status: string | null | undefined,
  isCleared: boolean,
): ProviderCaseView["caseMeta"]["currentState"] {
  if (status === "disposition_finalized") return "Closed";
  if (status === "provider_action_issued") return "Provider Review";
  if (status === "provider_review_pending") return "Provider Review";
  if (status === "nurse_triage_in_progress" || status === "nurse_validated") return "Nurse Pending";
  if (status === "nurse_triage_pending") return "Nurse Pending";
  if (status === "frontdesk_review") return "Under Review";
  if (status === "ai_pretriage_ready" || status === "intake_submitted") return "Submitted";
  return isCleared ? "Provider Review" : "Nurse Pending";
}

function buildVitalsFromAssessment(na: NurseAssessmentRecord | null): Vital[] {
  const raw = na?.additional_structured_data;
  const v = raw?.vitals;
  const notTaken =
    (raw as { notTakenReason?: string } | undefined)?.notTakenReason ||
    (v as { notTakenReason?: string } | undefined)?.notTakenReason;
  if (!v && !notTaken) return [];
  const vitals: Vital[] = [];
  const at = na?.validated_at
    ? new Date(na.validated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  const bpStr =
    v.bpSys && v.bpDia ? `${v.bpSys} / ${v.bpDia}` : v.bpSys ? String(v.bpSys) : "";
  if (bpStr) {
    const sys = Number(v.bpSys);
    const dia = Number(v.bpDia);
    const abnormalBp =
      (Number.isFinite(sys) && (sys >= 140 || sys < 90)) ||
      (Number.isFinite(dia) && (dia >= 90 || dia < 60));
    vitals.push({
      id: "bp", label: "Blood pressure", value: bpStr, unit: "mmHg",
      abnormal: abnormalBp, takenAt: at,
    });
  }
  if (v.hr) {
    const hr = Number(v.hr);
    vitals.push({
      id: "hr", label: "Heart rate", value: String(v.hr), unit: "bpm",
      abnormal: Number.isFinite(hr) && (hr > 100 || hr < 50),
      takenAt: at,
    });
  }
  if (v.tempF) {
    const t = Number(v.tempF);
    vitals.push({
      id: "temp", label: "Temperature", value: String(v.tempF), unit: "°F",
      abnormal: Number.isFinite(t) && (t >= 100.4 || t <= 95),
      takenAt: at,
    });
  }
  if (v.spo2) {
    const s = Number(v.spo2);
    vitals.push({
      id: "spo2", label: "SpO\u2082", value: String(v.spo2), unit: "%",
      abnormal: Number.isFinite(s) && s < 92,
      takenAt: at,
    });
  }
  if (notTaken && !v?.bpSys && !v?.hr) {
    vitals.push({
      id: "vitals-nt",
      label: "Vitals",
      value: "Not obtained",
      unit: notTaken,
      abnormal: false,
      takenAt: at,
    });
  }

  if (!v) return vitals;

  const respVal = v.respRate ?? v.rr;
  if (respVal) {
    const r = Number(respVal);
    vitals.push({
      id: "resp", label: "Respiratory rate", value: String(respVal), unit: "/ min",
      abnormal: Number.isFinite(r) && (r > 22 || r < 10),
      takenAt: at,
    });
  }
  return vitals;
}

function ageFromRow(row: ApiCaseRow): number {
  if (typeof row.patient_age === "number" && row.patient_age > 0) return row.patient_age;
  if (row.patient_date_of_birth) {
    const dob = new Date(row.patient_date_of_birth);
    if (!Number.isNaN(dob.getTime())) {
      const diff = Date.now() - dob.getTime();
      return Math.max(0, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
    }
  }
  return 0;
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function buildViewFromApiCase(row: ApiCaseRow): ProviderCaseView {
  const profile = row.ai_patient_profile ?? null;
  const nurse: NurseAssessmentRecord | null =
    profile && typeof profile === "object" && "nurse_assessment" in profile
      ? (profile.nurse_assessment as NurseAssessmentRecord)
      : null;

  const status = row.status ?? "intake_submitted";
  // Provider workspace should unlock as soon as the triage nurse has
  // validated a handoff (data lives in `nurse_assessment` even if a
  // state transition hiccup left the FSM in a nurse-* status for a
  // moment, or a demo reopens the case).
  const isTriageCleared =
    PROVIDER_VISIBLE_STATUSES.has(status) || nurse?.is_validated === true;
  const urgency = mapUrgency(row.urgency_final ?? row.urgency_suggested);
  const age = ageFromRow(row);
  const sex = (row.patient_gender ?? "").trim();
  const fullName = (row.patient_full_name ?? "").trim() || "Unnamed patient";

  const nurseSummary =
    nurse?.nurse_clinical_summary ||
    nurse?.provider_handoff_brief ||
    row.ai_clinician_brief ||
    row.structured_summary ||
    (isTriageCleared
      ? "Nurse handoff completed; no narrative summary captured."
      : "Awaiting nurse validation.");

  const associated = nurse?.associated_symptoms ?? [];
  const denied = nurse?.denied_symptoms ?? [];
  const redFlags = nurse?.red_flags_checked ?? row.risky_flags ?? [];
  const meds = (() => {
    if (!profile) return [] as { name: string; dose: string }[];
    const px = (profile as Record<string, unknown>).extracted_medications;
    if (!Array.isArray(px)) return [];
    return px
      .map((m: unknown) => {
        if (typeof m === "string") return { name: m, dose: "" };
        if (m && typeof m === "object" && "name" in m) {
          const obj = m as { name?: string; dose?: string };
          return { name: obj.name ?? "", dose: obj.dose ?? "" };
        }
        return { name: "", dose: "" };
      })
      .filter((m) => m.name);
  })();

  const timeline: TimelineEventData[] = [];
  if (row.created_at) {
    timeline.push({
      id: "t-intake",
      category: "intake",
      title: "Patient completed intake",
      actorRole: row.source_channel === "staff" ? "Front desk" : "Patient",
      timestamp: new Date(row.created_at).toLocaleString(),
    });
  }
  if (nurse?.validated_at) {
    timeline.push({
      id: "t-nurse",
      category: "nurse",
      title: "Nurse validated handoff",
      actorRole: nurse.validated_by_user_id ?? "Triage nurse",
      timestamp: new Date(nurse.validated_at).toLocaleString(),
      handoffSummary:
        nurseSummary.length > 120 ? nurseSummary.slice(0, 117) + "…" : nurseSummary,
      remarks: redFlags.length ? `Red flags: ${redFlags.join(", ")}` : undefined,
      nextOwnerRole: "Provider",
      isAbnormal: redFlags.length > 0,
    });
  }
  timeline.push({
    id: "t-provider",
    category: "provider",
    title: status === "disposition_finalized" ? "Provider closed case" : "Provider review",
    actorRole: "Provider",
    timestamp: status === "disposition_finalized" && row.updated_at
      ? new Date(row.updated_at).toLocaleString()
      : "Now",
    isActive: status === "provider_review_pending" || status === "provider_action_issued",
  });

  const handoffChecklist: HandoffItem[] = [
    { id: "identity",      label: "Patient identity verified",            done: true },
    { id: "complaint",     label: "Chief complaint + ESI captured",       done: !!nurse?.primary_complaint },
    { id: "vitals",        label: "Vitals captured or marked not-taken",  done: (buildVitalsFromAssessment(nurse).length > 0) || !!((nurse?.additional_structured_data as { notTakenReason?: string } | undefined)?.notTakenReason) },
    { id: "questionnaire", label: "Symptom questionnaire complete",       done: associated.length + denied.length > 0 },
    { id: "findings",      label: "Findings authored or no-abnormal toggle", done: !!nurseSummary && nurseSummary !== "Awaiting nurse validation." },
    { id: "flags",         label: "Risk flags acknowledged",              done: redFlags.length > 0 || isTriageCleared },
    { id: "brief",         label: "Handoff brief reviewed & confirmed",   done: !!nurse?.is_validated },
  ];

  return {
    id: row.id,
    patient: {
      fullName,
      demographics: `${age || "—"}, ${sex.toLowerCase() || "—"}`,
      gender: sex || "Unknown",
      age,
      weight: "—",
      diagnoses: [],
    },
    caseMeta: {
      caseCode: row.case_code ?? row.id,
      urgency,
      currentState: mapStatusToCurrentState(status, isTriageCleared),
      waitingOn: isTriageCleared ? "Provider decision" : "Nurse validation",
      appointmentStatus: "—",
      lastUpdated: relativeAgo(row.updated_at ?? row.created_at),
      isTriageCleared,
    },
    chiefComplaint: {
      patientWords: row.symptom_text ?? row.additional_details ?? "Not recorded",
      submittedVia: row.source_channel === "staff" ? "Front-desk intake" : "Patient self-intake",
      submittedAgo: relativeAgo(row.created_at),
    },
    nurseBrief: {
      summary: nurseSummary,
      takeaways: redFlags,
      adherenceNote: row.urgency_reason ?? row.patient_history ?? "",
      validatedAgo: relativeAgo(nurse?.validated_at ?? nurse?.assessment_completed_at),
      recordedBy: nurse?.validated_by_user_id ?? (isTriageCleared ? "Triage nurse" : "—"),
      recordedAt: nurse?.validated_at
        ? new Date(nurse.validated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "—",
    },
    vitals: buildVitalsFromAssessment(nurse),
    assessment: {
      onset: nurse?.primary_complaint ?? row.duration_text ?? "Not recorded",
      severity: nurse?.severity ?? row.severity_hint ?? "—",
      redFlagsLabel: redFlags.join(" · ") || "None",
      associated,
      denied,
    },
    meds,
    labs: null,
    visitHistory: null,
    riskFlags: redFlags.map((f, i) => ({
      id: `flag-${i}`,
      title: f,
      detail: "Flagged during nurse triage.",
    })),
    timeline,
    handoffChecklist,
    nurseOwner: {
      name: nurse?.validated_by_user_id ?? "Nurse on duty",
      pickedUpAt: nurse?.validated_at
        ? new Date(nurse.validated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "—",
    },
  };
}

/**
 * Async loader: hits /api/cases/[caseId] (which talks to Supabase
 * service-role and gracefully falls back to the mock store), then maps
 * the row into the ProviderCaseView. If the API can't find the case
 * (offline / unknown id), returns the existing synchronous mock view.
 */
export async function loadProviderCaseView(
  id: string,
): Promise<ProviderCaseView | null> {
  // Hand-authored mock-001 always wins so the demo screenshot is stable.
  if (CASE_VIEWS[id]) return CASE_VIEWS[id];

  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const payload = (await res.json()) as { case?: ApiCaseRow };
      if (payload?.case) return buildViewFromApiCase(payload.case);
    }
  } catch {
    /* fall through to mock */
  }

  return getProviderCaseView(id);
}
