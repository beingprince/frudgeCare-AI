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
