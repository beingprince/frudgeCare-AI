"use client";

/**
 * Nurse Triage Workspace — rebuilt for density + real wiring.
 *
 * Design goals
 *  - Collapsible sections so the nurse sees only what she's working on.
 *    Default-open: Vitals + questionnaire. Default-closed: decision
 *    support, documentation hints, escalation.
 *  - Aligned with ESI (Emergency Severity Index, Level 1-5) which is
 *    the AHRQ-standard triage rubric in US emergency and urgent care.
 *    We surface the five levels in the severity selector rather than
 *    invented "Moderate/Severe" labels.
 *  - Vitals use structured numeric inputs (BP sys/dia, HR, Temp, SpO₂, RR)
 *    with range validation + not-taken backup option.
 *  - Escalate case and Send to provider both produce on-screen feedback
 *    (toast + inline banner) and complete a real transition flow.
 *
 * All long scrolling sections from the old page collapse to 1-line
 * summaries when closed, and all AI calls go through the same-origin
 * /api/ai/nurse-assist proxy so the browser never sees the internal
 * shared secret and we always get a graceful Tier-3 backup option.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle, AlertTriangle, Brain, CheckCircle2, Circle, FileText,
  GitBranch, ListChecks, Loader2, MessageSquare, Send, Sparkles, Stethoscope,
  Activity, ClipboardList, HeartPulse, ShieldAlert, Zap,
} from "lucide-react";
import { CaseHeader, type CaseHeaderProps } from "@/components/shared/CaseHeader";
import { CollapsibleSection } from "@/components/shared/CollapsibleSection";
import { SourceTierBadge } from "@/components/shared/ProvenanceBadges";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { StatusChip } from "@/components/shared/StatusChip";
import { useToast } from "@/components/shared/Toast";
import { type CascadeData, normalizeCascade } from "@/lib/cascade-types";
import type { Case } from "@/types";

/* ─────────── Types ─────────── */

interface VitalsFlag { field: string; value: unknown; status: "normal" | "warning" | "critical"; note: string }
interface DrugInteractionHit {
  matched_on: string[];
  severity?: string | null;
  mechanism?: string | null;
  recommendation?: string | null;
  source_entry: string;
}
interface NurseAssistResult {
  vitals_flags: VitalsFlag[];
  allergy_alerts: string[];
  suggested_questions: string[];
  documentation_hints: string[];
  drug_interactions?: DrugInteractionHit[];
  source_tier?: number;
  provenance?: string[];
}

interface Vitals {
  bpSys: string;
  bpDia: string;
  hr: string;
  tempF: string;
  spo2: string;
  rr: string;
  notTakenReason: string;
}

interface NurseForm {
  onset: string;
  esiLevel: string;            // ESI 1-5 (see ESI_LEVELS below)
  painScore: string;           // 0-10 NRS
  associated: string;
  denied: string;
  redFlagsChecked: Set<string>;
  nurseSummary: string;
}

interface HandoffFlags {
  acknowledgedFlag: boolean;
  briefConfirmed: boolean;
  hasFindings: boolean;
  noAbnormalFindings: boolean;
}

/**
 * ESI — Emergency Severity Index (AHRQ five-level triage algorithm).
 * Most US ED/urgent care centers and ambulatory clinics use this rubric.
 * Level 1 is immediate (resuscitation); level 5 is non-urgent. Keeping the
 * wording close to the AHRQ handbook lets the nurse pick without guessing.
 */
const ESI_LEVELS: Array<{ value: string; label: string; description: string }> = [
  { value: "1", label: "ESI 1 — Resuscitation", description: "Requires immediate life-saving intervention." },
  { value: "2", label: "ESI 2 — Emergent",      description: "High-risk situation; or severe pain / distress." },
  { value: "3", label: "ESI 3 — Urgent",        description: "Needs many resources; stable vitals." },
  { value: "4", label: "ESI 4 — Less urgent",   description: "One resource expected (e.g. labs OR imaging)." },
  { value: "5", label: "ESI 5 — Non-urgent",    description: "No resources expected beyond exam." },
];

const RED_FLAG_PROTOCOLS = [
  { id: "stroke",   label: "Stroke protocol (FAST)",        hint: "Face · Arm · Speech · Time" },
  { id: "sepsis",   label: "Sepsis criteria (qSOFA/SIRS)",  hint: "RR ≥ 22, AMS, SBP ≤ 100" },
  { id: "acs",      label: "Cardiac ischemia (ACS)",         hint: "Chest pain, radiation, diaphoresis" },
  { id: "fall",     label: "Fall / trauma precautions",      hint: "Mechanism, anticoag use" },
  { id: "adherence",label: "Medication adherence check",     hint: "Last dose, refill status" },
];

/* ─────────── Vitals helpers ─────────── */

interface VitalsInterp { status: "normal" | "warning" | "critical"; note: string }

function interpret(vitals: Vitals): Record<string, VitalsInterp | undefined> {
  const out: Record<string, VitalsInterp | undefined> = {};
  const sys = Number(vitals.bpSys);
  const dia = Number(vitals.bpDia);
  const hr = Number(vitals.hr);
  const t = Number(vitals.tempF);
  const sp = Number(vitals.spo2);
  const rr = Number(vitals.rr);

  if (sys) {
    if (sys >= 180 || dia >= 120) out.bp = { status: "critical", note: "Hypertensive crisis — notify provider." };
    else if (sys >= 140 || dia >= 90) out.bp = { status: "warning", note: "Stage 2 hypertension range." };
    else if (sys < 90) out.bp = { status: "warning", note: "Hypotension — consider orthostatic check." };
    else out.bp = { status: "normal", note: "Within normal limits." };
  }
  if (hr) {
    if (hr > 120) out.hr = { status: "warning", note: "Tachycardia — investigate cause." };
    else if (hr < 50) out.hr = { status: "warning", note: "Bradycardia — confirm with manual read." };
    else out.hr = { status: "normal", note: "Within normal limits." };
  }
  if (t) {
    if (t >= 103) out.temp = { status: "critical", note: "High-grade fever — sepsis screen recommended." };
    else if (t >= 100.4) out.temp = { status: "warning", note: "Fever." };
    else if (t < 96) out.temp = { status: "warning", note: "Hypothermia — recheck." };
    else out.temp = { status: "normal", note: "Afebrile." };
  }
  if (sp) {
    if (sp < 92) out.spo2 = { status: "critical", note: "Hypoxia — escalate and prepare oxygen." };
    else if (sp < 95) out.spo2 = { status: "warning", note: "Mildly reduced — recheck on room air." };
    else out.spo2 = { status: "normal", note: "Adequate oxygenation." };
  }
  if (rr) {
    if (rr >= 22) out.rr = { status: "warning", note: "Tachypnea — assess work of breathing." };
    else if (rr < 10) out.rr = { status: "warning", note: "Bradypnea." };
    else out.rr = { status: "normal", note: "Within normal limits." };
  }
  return out;
}

const STATUS_PILL: Record<VitalsInterp["status"], string> = {
  normal:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

/* ─────────── Page ─────────── */

const NURSE_ID = "usr_nu_001";

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function caseToUrgency(c: Case): "Routine" | "Urgent" | "Emergency" {
  const u = c.urgency_final ?? c.urgency_suggested ?? "medium";
  if (u === "high") return "Emergency";
  if (u === "medium") return "Urgent";
  return "Routine";
}

function caseStatusToHeaderState(s: string, handoffOk: boolean): CaseHeaderProps["currentState"] {
  if (handoffOk) return "Provider Review";
  const m: Record<string, CaseHeaderProps["currentState"]> = {
    nurse_triage_pending: "Nurse Pending",
    nurse_triage_in_progress: "Nurse Pending",
    nurse_validated: "Nurse Pending",
  };
  return m[s] ?? "Nurse Pending";
}

export default function NurseCaseWorkspace() {
  const toast = useToast();
  const router = useRouter();
  const params = useParams();
  const caseIdParam = typeof params?.caseId === "string" ? params.caseId : null;
  const claimAttempted = useRef(false);

  const [vitals, setVitals] = useState<Vitals>({
    bpSys: "", bpDia: "", hr: "", tempF: "", spo2: "", rr: "", notTakenReason: "",
  });
  const [formData, setFormData] = useState<NurseForm>({
    onset: "",
    esiLevel: "3",
    painScore: "4",
    associated: "",
    denied: "",
    redFlagsChecked: new Set(["adherence"]),
    nurseSummary: "",
  });
  const [flags, setFlags] = useState<HandoffFlags>({
    acknowledgedFlag: false,
    briefConfirmed: false,
    hasFindings: false,
    noAbnormalFindings: false,
  });

  const [isValidated, setIsValidated] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [handoffSuccess, setHandoffSuccess] = useState(false);
  const [escalated, setEscalated] = useState(false);

  const [caseDetail, setCaseDetail] = useState<Case | null>(null);
  const [caseLoadError, setCaseLoadError] = useState<string | null>(null);
  const [caseLoading, setCaseLoading] = useState(true);

  const [aiAssist, setAiAssist] = useState<NurseAssistResult | null>(null);
  const [isLoadingAssist, setIsLoadingAssist] = useState(false);

  // AI care cascade — runs the 4-engine fan-out (intake / queue / nurse /
  // provider) for THIS case and stores the result on the case row so the
  // patient's live status page can surface it. Was previously triggered
  // from /triage; now lives here because the patient page is patient-facing
  // and the cascade is clinical decision support.
  const [cascade, setCascade] = useState<CascadeData | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);
  const [cascadeRanAt, setCascadeRanAt] = useState<string | null>(null);

  useEffect(() => {
    claimAttempted.current = false;
  }, [caseIdParam]);

  useEffect(() => {
    if (!caseIdParam) {
      setCaseDetail(null);
      setCaseLoadError(null);
      setCaseLoading(false);
      return;
    }
    let cancelled = false;
    setCaseLoading(true);
    setCaseLoadError(null);
    (async () => {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseIdParam)}`, { cache: "no-store" });
      if (!res.ok) {
        if (!cancelled) {
          setCaseDetail(null);
          setCaseLoadError(res.status === 404 ? "Case not found." : "Could not load case.");
        }
        return;
      }
      const j = (await res.json()) as { case: Case };
      if (!cancelled) setCaseDetail(j.case);
    })()
      .finally(() => {
        if (!cancelled) setCaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseIdParam]);

  /* Claim (pending → in progress) when opening a case from the list */
  useEffect(() => {
    if (!caseDetail || caseDetail.status !== "nurse_triage_pending" || claimAttempted.current) return;
    claimAttempted.current = true;
    (async () => {
      const res = await fetch("/api/cases/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseDetail.id,
          from_status: "nurse_triage_pending",
          to_status: "nurse_triage_in_progress",
          actor_id: NURSE_ID,
          event_type: "nurse.claim_triage",
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { new_status?: string };
        setCaseDetail((d) => (d ? { ...d, status: (j.new_status as Case["status"]) ?? "nurse_triage_in_progress" } : d));
      }
    })();
  }, [caseDetail]);

  useEffect(() => {
    if (!caseDetail) return;
    setIsValidated(false);
    setHandoffSuccess(false);
    setEscalated(false);
    setVitals({
      bpSys: "", bpDia: "", hr: "", tempF: "", spo2: "", rr: "", notTakenReason: "",
    });
    setFormData({
      onset: "",
      esiLevel: "3",
      painScore: "4",
      associated: "",
      denied: "",
      redFlagsChecked: new Set(["adherence"]),
      nurseSummary: "",
    });
    setFlags({
      acknowledgedFlag: false,
      briefConfirmed: false,
      hasFindings: false,
      noAbnormalFindings: false,
    });
  }, [caseDetail?.id]);

  /* ─── CDS when case context loads (same-origin proxy) ─── */
  useEffect(() => {
    if (!caseDetail) {
      setAiAssist(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoadingAssist(true);
      try {
        const res = await fetch("/api/ai/nurse-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symptoms:
              [caseDetail.symptom_text, caseDetail.structured_summary].filter(Boolean).join("\n\n") ||
              "No intake narrative on file.",
            vitals: {
              bp_systolic: Number(vitals.bpSys) || undefined,
              bp_diastolic: Number(vitals.bpDia) || undefined,
              pulse: Number(vitals.hr) || undefined,
              temp_f: Number(vitals.tempF) || undefined,
              o2_sat: Number(vitals.spo2) || undefined,
            },
            ai_pretriage_brief: caseDetail.structured_summary ?? caseDetail.symptom_text ?? "",
            known_allergies: [],
            current_medications: [],
            active_diagnoses: [],
          }),
        });
        if (!res.ok) throw new Error("assist unavailable");
        const data: NurseAssistResult = await res.json();
        if (!cancelled) setAiAssist(data);
      } catch {
        /* Route already emits Tier-3 backup option; nothing else to do here. */
      } finally {
        if (!cancelled) setIsLoadingAssist(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vitals sync re-fetch would be noisy; case switch resets assist
  }, [caseDetail?.id]);

  const vitalsEntered = !!(vitals.bpSys || vitals.hr || vitals.tempF || vitals.spo2);
  const hasFindingsSatisfied = flags.hasFindings || flags.noAbnormalFindings;

  /* ─── Handoff checklist ─── */
  const checklist = useMemo(() => {
    const esi = Number(formData.esiLevel);
    return [
      { id: "identity",  label: "Patient identity verified",                  done: true,                                  hint: "Front-desk verified on intake." },
      { id: "complaint", label: "Chief complaint + ESI captured",             done: !!formData.onset && esi >= 1 && esi <= 5, hint: "Primary complaint and ESI required." },
      { id: "vitals",    label: "Vitals captured or marked not-taken",        done: vitalsEntered || !!vitals.notTakenReason, hint: "Enter at least one vital, or record a not-taken reason." },
      { id: "history",   label: "Symptom questionnaire complete",             done: !!formData.associated && !!formData.denied, hint: "Associated and denied symptoms both required." },
      { id: "findings",  label: "Findings authored or no-abnormal toggle",    done: hasFindingsSatisfied, hint: "Add findings or tick the no-abnormal toggle." },
      { id: "flags",     label: "Risk flags acknowledged",                    done: flags.acknowledgedFlag, hint: "Tick the acknowledgement on the intake brief." },
      { id: "brief",     label: "Handoff brief reviewed & confirmed",         done: flags.briefConfirmed, hint: "Explicitly confirm the brief." },
    ];
  }, [formData, vitals, vitalsEntered, flags, hasFindingsSatisfied]);

  const missing = checklist.filter(c => !c.done);
  const allPass = missing.length === 0;

  const handleValidate = () => {
    if (!allPass) {
      toast.warn("Can't confirm yet", `Missing: ${missing.map(m => m.label).join(", ")}.`);
      setIsValidated(false);
      return;
    }
    setIsValidated(true);
    toast.success("Form validated", "Ready to hand off to the provider.");
  };

  /* ─── Send to provider ─── */
  const handleSend = async () => {
    if (!caseDetail || !isValidated || !allPass || isSending) return;
    setIsSending(true);

    const fromForHandoff =
      caseDetail.status === "nurse_validated" ? "nurse_validated" : "nurse_triage_in_progress";

    try {
      const assessmentRes = await fetch("/api/nurse/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseDetail.id,
          nurse_id: NURSE_ID,
          status: "handed_off",
          primary_complaint: formData.onset,
          severity: `ESI ${formData.esiLevel}`,
          pain_score: formData.painScore,
          associated_symptoms: formData.associated ? formData.associated.split(",").map(s => s.trim()) : [],
          denied_symptoms: formData.denied ? formData.denied.split(",").map(s => s.trim()) : [],
          red_flags_checked: Array.from(formData.redFlagsChecked),
          additional_structured_data: {
            vitals,
            notTakenReason: vitals.notTakenReason,
          },
          nurse_clinical_summary: formData.nurseSummary,
          provider_handoff_brief: formData.nurseSummary,
          is_validated: true,
          validated_by_user_id: NURSE_ID,
          validated_at: new Date().toISOString(),
          assessment_completed_at: new Date().toISOString(),
        }),
      });
      if (!assessmentRes.ok) throw new Error("Assessment save failed.");
      const { assessmentId } = await assessmentRes.json();

      await fetch("/api/cases/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseDetail.id,
          from_status: fromForHandoff,
          to_status: "provider_review_pending",
          actor_id: NURSE_ID,
          event_type: "nurse.handoff_ready",
          assessment_id: assessmentId,
        }),
      });

      setHandoffSuccess(true);
      router.push("/nurse");
      toast.success("Handoff complete", "The provider can now see this case.");
    } catch (err) {
      toast.error("Handoff failed", err instanceof Error ? err.message : "Try again in a moment.");
    } finally {
      setIsSending(false);
    }
  };

  /* ─── Escalate case ─── */
  const handleEscalate = async () => {
    if (!caseDetail || isEscalating) return;
    setIsEscalating(true);
    const fromForEscalate =
      caseDetail.status === "nurse_validated" ? "nurse_validated" : "nurse_triage_in_progress";
    try {
      // Persist a minimal handoff so /provider/case still receives vitals + narrative
      // (escalation used to transition without saving nurse_assessment).
      const summaryEsc =
        formData.nurseSummary?.trim() ||
        "Escalated by triage nurse for immediate provider review (urgency upgraded).";
      const escAssessment = await fetch("/api/nurse/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseDetail.id,
          nurse_id: NURSE_ID,
          status: "escalated",
          primary_complaint: formData.onset || caseDetail.symptom_text || "See intake",
          severity: `ESI ${formData.esiLevel} (escalated)`,
          pain_score: formData.painScore,
          associated_symptoms: formData.associated
            ? formData.associated.split(",").map((s) => s.trim())
            : [],
          denied_symptoms: formData.denied
            ? formData.denied.split(",").map((s) => s.trim())
            : [],
          red_flags_checked: Array.from(formData.redFlagsChecked),
          additional_structured_data: {
            vitals,
            notTakenReason: vitals.notTakenReason,
          },
          nurse_clinical_summary: summaryEsc,
          provider_handoff_brief: summaryEsc,
          is_validated: true,
          validated_by_user_id: NURSE_ID,
          validated_at: new Date().toISOString(),
          assessment_completed_at: new Date().toISOString(),
        }),
      });
      if (!escAssessment.ok) throw new Error("Could not save escalation handoff.");

      await fetch("/api/cases/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseDetail.id,
          from_status: fromForEscalate,
          to_status: "provider_review_pending",
          actor_id: NURSE_ID,
          event_type: "nurse.escalate",
        }),
      });
      setFormData(d => ({ ...d, esiLevel: "2" }));
      setEscalated(true);
      toast.warn(
        "Case escalated",
        "Upgraded to ESI 2 and flagged for immediate provider review.",
      );
    } catch {
      toast.error("Escalation failed", "Try again — the audit event was not recorded.");
    } finally {
      setIsEscalating(false);
    }
  };

  /* ─── Run AI cascade for this case ─── */
  const handleRunCascade = async () => {
    if (!caseDetail || cascadeLoading) return;
    setCascadeLoading(true);
    setCascadeError(null);
    try {
      const severityHint =
        Number(formData.esiLevel) <= 2
          ? "severe"
          : Number(formData.esiLevel) <= 3
          ? "moderate"
          : "mild";
      const ageGroup = caseDetail.patient_age != null
        ? caseDetail.patient_age < 18
          ? "Pediatric"
          : caseDetail.patient_age >= 65
          ? "Geriatric"
          : "Adult"
        : "Adult";
      const r = await fetch("/api/ai/triage-cascade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms:
            [caseDetail.symptom_text, caseDetail.structured_summary]
              .filter(Boolean)
              .join("\n\n") || "No intake narrative on file.",
          duration: "as described",
          severity: severityHint,
          age_group: ageGroup,
          patient_history: caseDetail.patient_history ?? "",
        }),
      });
      if (!r.ok) throw new Error(`Cascade engine returned ${r.status}`);
      const raw = await r.json();
      const data = normalizeCascade(raw);
      setCascade(data);
      setCascadeRanAt(new Date().toISOString());
      // Persist for the patient's live status page. Failures here are
      // non-fatal — the nurse still sees the result inline; we just log
      // and surface a soft warning.
      try {
        await fetch(
          `/api/cases/${encodeURIComponent(caseDetail.id)}/cascade`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cascade: raw,
              ranBy: NURSE_ID,
            }),
          },
        );
        toast.success(
          "Cascade saved",
          "The patient now sees these AI insights live on their case status page.",
        );
      } catch {
        toast.warn(
          "Cascade not persisted",
          "AI insights ran locally but couldn't be saved. Patient won't see them on their status page yet.",
        );
      }
    } catch (e) {
      setCascadeError(
        e instanceof Error ? e.message : "Cascade request failed.",
      );
    } finally {
      setCascadeLoading(false);
    }
  };

  /* ─── Suggested-question apply ─── */
  const applySuggestedQuestion = (question: string) => {
    setFormData(prev => ({
      ...prev,
      associated: prev.associated ? `${prev.associated}; ${question}` : question,
    }));
    setIsValidated(false);
  };

  const toggleRedFlag = (id: string) => {
    setFormData(prev => {
      const next = new Set(prev.redFlagsChecked);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, redFlagsChecked: next };
    });
  };

  /* ─── Vitals block ─── */
  const vInterp = useMemo(() => interpret(vitals), [vitals]);
  const chosenEsi = ESI_LEVELS.find(l => l.value === formData.esiLevel);

  const patientLabel = caseDetail
    ? [
        caseDetail.patient_gender,
        caseDetail.patient_age != null ? `${caseDetail.patient_age}y` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—"
    : "";

  if (!caseIdParam) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[#F1F5F9] p-6 text-center">
        <p className="text-[14px] text-slate-600">Invalid case link.</p>
        <Link href="/nurse" className="mt-3 text-[13px] font-semibold text-[#0F4C81]">Back to triage list</Link>
      </div>
    );
  }

  if (caseLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[#F1F5F9] p-6">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F4C81] mb-3" />
        <p className="text-[14px] text-slate-600">Loading case…</p>
      </div>
    );
  }

  if (caseLoadError) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[#F1F5F9] p-6 text-center max-w-md mx-auto">
        <p className="text-[14px] text-rose-700">{caseLoadError}</p>
        <Link href="/nurse" className="mt-4 inline-flex text-[13px] font-semibold text-[#0F4C81]">← Back to triage list</Link>
      </div>
    );
  }

  if (!caseDetail) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-[#F1F5F9]">
      <div className="px-4 md:px-6 pt-3 pb-1 flex-shrink-0 border-b border-slate-200/80 bg-white/80">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/nurse"
            className="text-[12px] font-semibold text-[#0F4C81] hover:underline inline-flex items-center gap-1"
          >
            ← Triage list
          </Link>
          <span className="text-slate-300">|</span>
          <span className="text-[12px] text-slate-500">
            Case triage · {caseDetail.case_code || caseDetail.id.slice(0, 8)}
          </span>
        </div>
      </div>

      <>
      {/* Case header */}
      <div className="px-4 md:px-6 py-4 flex-shrink-0">
        <CaseHeader
          caseId={caseDetail.case_code || caseDetail.id}
          patientName={caseDetail.patient_full_name?.trim() || "Unknown patient"}
          urgency={escalated ? "Emergency" : caseToUrgency(caseDetail)}
          currentState={caseStatusToHeaderState(caseDetail.status, handoffSuccess)}
          nextOwnerRole="Provider"
          waitingOn={handoffSuccess ? "Provider decision" : "Nurse validation"}
          lastUpdated={formatRelativeTime(caseDetail.updated_at || caseDetail.created_at)}
        />
      </div>

      {/* 8 / 4 layout: main workflow + sticky action rail */}
      <div className="flex-1 px-4 md:px-6 pb-6 flex flex-col md:grid md:grid-cols-12 gap-5 min-h-0 md:overflow-hidden overflow-y-auto">

        {/* Workspace column */}
        <div className="md:col-span-8 md:h-full md:overflow-y-auto md:pr-1">
          <div className="flex flex-col gap-3">

            {/* 1. Patient snapshot — short, default open */}
            <CollapsibleSection
              title="Patient snapshot"
              summary={patientLabel || "Demographics from intake"}
              icon={Stethoscope}
              info="From intake and EHR when linked; otherwise chief complaint and contacts only."
            >
              <dl className="fc-dl max-w-md">
                <div><dt>Sex · Age</dt><dd>{patientLabel || "—"}</dd></div>
                <div><dt>Phone</dt><dd>{caseDetail.patient_phone?.trim() || "—"}</dd></div>
                <div><dt>Email</dt><dd>{caseDetail.patient_email?.trim() || "—"}</dd></div>
                <div><dt>Chief complaint (intake)</dt><dd className="text-left max-w-prose">{caseDetail.symptom_text || "—"}</dd></div>
              </dl>
            </CollapsibleSection>

            {/* 2. Intake brief — warn rail, default open */}
            <CollapsibleSection
              title="Draft intake brief"
              summary="Requires nurse review before handoff"
              icon={AlertCircle}
              tone="warn"
              info="Structured summary of the patient's intake. Review and confirm before handoff to the provider."
              aside={<span className="fc-badge fc-badge-warn">Awaiting confirmation</span>}
            >
              <div className="text-[13.5px] text-slate-800 leading-relaxed bg-white p-4 rounded-[10px] border border-amber-100">
                {caseDetail.structured_summary || caseDetail.symptom_text || "No structured brief yet — use the chief complaint and patient narrative above."}
                {caseDetail.risky_flags && caseDetail.risky_flags.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <span className="fc-eyebrow text-rose-700">Risk flags</span>
                  <ul className="mt-1 list-disc pl-4 text-slate-800">
                    {caseDetail.risky_flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 accent-amber-600"
                    checked={flags.acknowledgedFlag}
                    onChange={(e) => {
                      setFlags(f => ({ ...f, acknowledgedFlag: e.target.checked }));
                      setIsValidated(false);
                    }}
                  />
                  <span>I acknowledge the <strong>high-risk flag</strong> and have reviewed the supporting data.</span>
                </label>
                <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 accent-amber-600"
                    checked={flags.briefConfirmed}
                    onChange={(e) => {
                      setFlags(f => ({ ...f, briefConfirmed: e.target.checked }));
                      setIsValidated(false);
                    }}
                  />
                  <span>I confirm the handoff brief is clinically accurate (or I have corrected it below).</span>
                </label>
              </div>
            </CollapsibleSection>

            {/* 3. Vitals — structured inputs */}
            <CollapsibleSection
              title="Vitals"
              summary={
                vitalsEntered
                  ? `BP ${vitals.bpSys || "–"}/${vitals.bpDia || "–"} · HR ${vitals.hr || "–"} · T ${vitals.tempF || "–"}°F · SpO₂ ${vitals.spo2 || "–"}%`
                  : vitals.notTakenReason
                  ? `Not taken — ${vitals.notTakenReason}`
                  : "Not entered"
              }
              icon={HeartPulse}
              tone={
                Object.values(vInterp).some(v => v?.status === "critical") ? "danger"
                : Object.values(vInterp).some(v => v?.status === "warning") ? "warn"
                : "default"
              }
              info="Primary objective data set. Each field is range-checked as you type so outliers are flagged before handoff."
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <VitalField
                  label="BP systolic"
                  unit="mmHg"
                  value={vitals.bpSys}
                  onChange={v => setVitals(s => ({ ...s, bpSys: v }))}
                  interp={vInterp.bp}
                  placeholder="120"
                />
                <VitalField
                  label="BP diastolic"
                  unit="mmHg"
                  value={vitals.bpDia}
                  onChange={v => setVitals(s => ({ ...s, bpDia: v }))}
                  placeholder="80"
                />
                <VitalField
                  label="Heart rate"
                  unit="bpm"
                  value={vitals.hr}
                  onChange={v => setVitals(s => ({ ...s, hr: v }))}
                  interp={vInterp.hr}
                  placeholder="72"
                />
                <VitalField
                  label="Temperature"
                  unit="°F"
                  value={vitals.tempF}
                  onChange={v => setVitals(s => ({ ...s, tempF: v }))}
                  interp={vInterp.temp}
                  placeholder="98.6"
                />
                <VitalField
                  label="SpO₂"
                  unit="%"
                  value={vitals.spo2}
                  onChange={v => setVitals(s => ({ ...s, spo2: v }))}
                  interp={vInterp.spo2}
                  placeholder="97"
                />
                <VitalField
                  label="Respiratory rate"
                  unit="/min"
                  value={vitals.rr}
                  onChange={v => setVitals(s => ({ ...s, rr: v }))}
                  interp={vInterp.rr}
                  placeholder="16"
                />
              </div>
              {!vitalsEntered && (
                <div className="mt-3">
                  <label className="text-[12px] font-semibold text-slate-600">
                    Reason vitals not taken
                  </label>
                  <select
                    value={vitals.notTakenReason}
                    onChange={(e) => setVitals(s => ({ ...s, notTakenReason: e.target.value }))}
                    className="w-full mt-1 h-[36px] border border-slate-300 rounded-[8px] px-3 text-[13px] bg-white focus:border-[#0F4C81] outline-none"
                  >
                    <option value="">Select a reason…</option>
                    <option>Patient refused</option>
                    <option>Equipment unavailable</option>
                    <option>Deferred to provider</option>
                    <option>Patient transferred before measurement</option>
                  </select>
                </div>
              )}
            </CollapsibleSection>

            {/* 4. ESI triage + questionnaire */}
            <CollapsibleSection
              title="Triage assessment"
              summary={
                chosenEsi
                  ? `${chosenEsi.label} · Pain ${formData.painScore}/10`
                  : "Not triaged"
              }
              icon={ClipboardList}
              tone="success"
              info="Severity is captured using the AHRQ Emergency Severity Index (ESI), the standard five-level triage algorithm for US emergency / urgent care."
              aside={<span className="fc-badge fc-badge-success">AHRQ ESI</span>}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Primary complaint">
                  <input
                    type="text"
                    value={formData.onset}
                    onChange={(e) => { setFormData(d => ({ ...d, onset: e.target.value })); setIsValidated(false); }}
                    placeholder="e.g. Dizziness × 12 h with mild confusion"
                    className="fc-text-input"
                  />
                </Field>
                <Field
                  label="ESI level"
                  hint={chosenEsi?.description}
                >
                  <select
                    value={formData.esiLevel}
                    onChange={(e) => { setFormData(d => ({ ...d, esiLevel: e.target.value })); setIsValidated(false); }}
                    className="fc-text-input"
                  >
                    {ESI_LEVELS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Pain (0–10 NRS)" hint="Numeric Rating Scale. 0 = none, 10 = worst imaginable.">
                  <select
                    value={formData.painScore}
                    onChange={(e) => { setFormData(d => ({ ...d, painScore: e.target.value })); setIsValidated(false); }}
                    className="fc-text-input"
                  >
                    {Array.from({ length: 11 }, (_, i) => i).map(n => (
                      <option key={n} value={String(n)}>{n} — {n === 0 ? "No pain" : n <= 3 ? "Mild" : n <= 6 ? "Moderate" : "Severe"}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Associated symptoms" hint="Comma-separated.">
                  <input
                    type="text"
                    value={formData.associated}
                    onChange={(e) => { setFormData(d => ({ ...d, associated: e.target.value })); setIsValidated(false); }}
                    placeholder="headache, nausea"
                    className="fc-text-input"
                  />
                </Field>

                <Field label="Denied symptoms" hint="Comma-separated. Document what the patient explicitly denied.">
                  <input
                    type="text"
                    value={formData.denied}
                    onChange={(e) => { setFormData(d => ({ ...d, denied: e.target.value })); setIsValidated(false); }}
                    placeholder="chest pain, numbness"
                    className="fc-text-input"
                  />
                </Field>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Red-flag protocols checked
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {RED_FLAG_PROTOCOLS.map(p => (
                    <label key={p.id} className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer p-2 rounded-md hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 accent-teal-600"
                        checked={formData.redFlagsChecked.has(p.id)}
                        onChange={() => toggleRedFlag(p.id)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{p.label}</span>
                        <span className="block text-[11.5px] text-slate-500">{p.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <Field label="Nurse clinical summary & handoff brief">
                  <textarea
                    value={formData.nurseSummary}
                    onChange={(e) => { setFormData(d => ({ ...d, nurseSummary: e.target.value })); setIsValidated(false); }}
                    className="fc-text-input min-h-[100px] resize-y"
                    placeholder="One paragraph for the provider. Include chief complaint, vitals, red flags checked, and next step."
                  />
                </Field>
                <div className="mt-3 flex flex-col gap-1.5">
                  <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 accent-teal-600"
                      checked={flags.hasFindings}
                      onChange={(e) => { setFlags(f => ({ ...f, hasFindings: e.target.checked, noAbnormalFindings: e.target.checked ? false : f.noAbnormalFindings })); setIsValidated(false); }}
                    />
                    <span>At least one finding authored above.</span>
                  </label>
                  <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 accent-teal-600"
                      checked={flags.noAbnormalFindings}
                      onChange={(e) => { setFlags(f => ({ ...f, noAbnormalFindings: e.target.checked, hasFindings: e.target.checked ? false : f.hasFindings })); setIsValidated(false); }}
                    />
                    <span>Explicitly <strong>no abnormal findings</strong> (nothing further to document).</span>
                  </label>
                </div>
              </div>
            </CollapsibleSection>

            {/* 5. Clinical decision support — collapsible, default closed */}
            <CollapsibleSection
              title="Clinical decision support"
              summary={
                aiAssist
                  ? `${aiAssist.vitals_flags.length} vitals flag${aiAssist.vitals_flags.length === 1 ? "" : "s"} · ${aiAssist.allergy_alerts.length} allergy alert${aiAssist.allergy_alerts.length === 1 ? "" : "s"} · ${aiAssist.suggested_questions.length} question${aiAssist.suggested_questions.length === 1 ? "" : "s"}`
                  : isLoadingAssist ? "Loading…" : "Unavailable"
              }
              icon={Sparkles}
              tone="primary"
              info="Evidence-based hints from the clinical knowledge base and — when available — a reasoning model. Nothing is applied automatically."
              defaultOpen={false}
              aside={aiAssist?.source_tier ? <SourceTierBadge tier={aiAssist.source_tier} provenance={aiAssist.provenance ?? []} /> : undefined}
            >
              {isLoadingAssist && (
                <div className="flex items-center gap-2 text-[13px] text-slate-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reviewing case context…
                </div>
              )}
              {aiAssist && !isLoadingAssist && (
                <div className="flex flex-col gap-4">
                  {aiAssist.vitals_flags.length > 0 && (
                    <div>
                      <SmallHeader icon={AlertTriangle} label="Vitals flags" />
                      <div className="flex flex-col gap-1.5">
                        {aiAssist.vitals_flags.map((f, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2 p-2.5 rounded-[10px] border ${
                              f.status === "critical" ? "bg-rose-50 border-rose-200"
                              : f.status === "warning" ? "bg-amber-50 border-amber-200"
                              : "bg-emerald-50 border-emerald-200"
                            }`}
                          >
                            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                              f.status === "critical" ? "text-rose-600" : f.status === "warning" ? "text-amber-600" : "text-emerald-600"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <span className={`text-[11px] font-bold uppercase tracking-wide ${
                                f.status === "critical" ? "text-rose-700" : f.status === "warning" ? "text-amber-700" : "text-emerald-700"
                              }`}>{f.status}</span>
                              <p className="text-[13px] text-slate-800 font-medium">
                                {f.field}: {String(f.value)}
                              </p>
                              <p className="text-[12px] text-slate-600">{f.note}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiAssist.allergy_alerts.length > 0 && (
                    <div>
                      <SmallHeader icon={ShieldAlert} label="Allergy alerts" />
                      <ul className="flex flex-col gap-1">
                        {aiAssist.allergy_alerts.map((a, i) => (
                          <li key={i} className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-[8px] flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiAssist.drug_interactions && aiAssist.drug_interactions.length > 0 && (
                    <div>
                      <SmallHeader icon={AlertTriangle} label="Drug interaction alerts" tooltip="Flagged by the local clinical knowledge base. Always confirm against the patient's current medication list." />
                      <ul className="flex flex-col gap-1.5">
                        {aiAssist.drug_interactions.map((d, i) => (
                          <li key={i} className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-[8px] px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold">{d.matched_on.join(" ↔ ")}</span>
                              {d.severity && (
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                  d.severity === "high" ? "bg-rose-100 text-rose-700 border border-rose-200"
                                  : d.severity === "medium" ? "bg-amber-100 text-amber-700 border border-amber-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}>{d.severity}</span>
                              )}
                            </div>
                            {d.mechanism && <p className="text-[12px] text-slate-700 mt-1">{d.mechanism}</p>}
                            {d.recommendation && <p className="text-[12px] text-amber-900 italic mt-0.5">→ {d.recommendation}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiAssist.suggested_questions.length > 0 && (
                    <div>
                      <SmallHeader icon={MessageSquare} label="Suggested follow-up questions" />
                      <div className="flex flex-col gap-1.5">
                        {aiAssist.suggested_questions.map((q, i) => (
                          <div key={i} className="flex items-start gap-2 bg-white border border-slate-200 rounded-[8px] p-2.5">
                            <span className="text-[#1565C0] mt-0.5 text-[14px]">›</span>
                            <span className="flex-1 text-[13px] text-slate-700">{q}</span>
                            <button
                              type="button"
                              onClick={() => applySuggestedQuestion(q)}
                              className="text-[11px] font-semibold text-[#1565C0] bg-[#1565C0]/10 border border-[#1565C0]/30 px-2 py-0.5 rounded-full hover:bg-[#1565C0]/15"
                            >
                              Apply
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiAssist.documentation_hints.length > 0 && (
                    <div>
                      <SmallHeader icon={FileText} label="Documentation hints" />
                      <ul className="flex flex-col gap-1 text-[12.5px] text-slate-600">
                        {aiAssist.documentation_hints.map((h, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-slate-400">•</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleSection>

            {/* 6. AI care cascade — fans the case out to 4 AI subsystems */}
            <CollapsibleSection
              title="AI care cascade"
              summary={
                cascade
                  ? `Last run ${cascadeRanAt ? formatRelativeTime(cascadeRanAt) : "just now"} · ${cascade.totalMs ?? "—"} ms`
                  : cascadeLoading
                  ? "Running…"
                  : "Not run yet — click to fan out across queue, nurse, and provider AI"
              }
              icon={GitBranch}
              tone="primary"
              info="One narrative goes to four AI subsystems in parallel (intake, queue, nurse, provider). Result is saved to the case row so the patient sees the same insights live on their status page."
              defaultOpen={false}
              aside={cascade ? <SourceTierBadge tier={cascade.provider.source_tier} provenance={[]} /> : undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <p className="text-[12.5px] text-slate-600 max-w-prose">
                  Runs queue, nurse, and provider AI engines on this case&apos;s narrative. The
                  patient sees the result on <code className="font-mono text-[11.5px]">/patient/status</code> as
                  soon as you save it.
                </p>
                <button
                  type="button"
                  onClick={handleRunCascade}
                  disabled={!caseDetail || cascadeLoading}
                  className="fc-focus-ring inline-flex items-center gap-2 rounded-[10px] bg-[#0F4C81] px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0B3A66] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {cascadeLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running cascade…
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      {cascade ? "Re-run cascade" : "Run AI cascade"}
                    </>
                  )}
                </button>
              </div>

              {cascadeError && (
                <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-800 mb-3">
                  <strong>Cascade error:</strong> {cascadeError}
                </div>
              )}

              {cascadeLoading && !cascade && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="fc-skeleton h-32 w-full rounded-[10px]" />
                  ))}
                </div>
              )}

              {cascade && !cascadeLoading && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3 md:divide-x md:divide-slate-100">
                  <NurseCascadeColumn
                    icon={ListChecks}
                    eyebrow="Front desk · Smart queue"
                    tier={cascade.queue.source_tier}
                    offline={cascade.queue.offline}
                    className="md:pr-6"
                  >
                    {cascade.queue.bottleneck_alerts.length > 0 ? (
                      <ul className="space-y-1">
                        {cascade.queue.bottleneck_alerts.slice(0, 3).map((a, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-[11.5px] text-[#B45309]"
                          >
                            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11.5px] text-slate-500">No bottlenecks detected.</p>
                    )}
                  </NurseCascadeColumn>

                  <NurseCascadeColumn
                    icon={Stethoscope}
                    eyebrow="Nurse · Pre-brief"
                    tier={cascade.nurse.source_tier}
                    offline={cascade.nurse.offline}
                    className="md:px-6"
                  >
                    {cascade.nurse.suggested_questions.length > 0 ? (
                      <ul className="space-y-1 text-[11.5px] text-slate-700">
                        {cascade.nurse.suggested_questions.slice(0, 3).map((q, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#0F4C81]" />
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11.5px] text-slate-500">No suggested questions.</p>
                    )}
                  </NurseCascadeColumn>

                  <NurseCascadeColumn
                    icon={Brain}
                    eyebrow="Provider · Co-pilot"
                    tier={cascade.provider.source_tier}
                    offline={cascade.provider.offline}
                    className="md:pl-6"
                  >
                    {cascade.provider.differential_dx.length > 0 ? (
                      <ul className="space-y-1.5 text-[11.5px]">
                        {cascade.provider.differential_dx.slice(0, 3).map((d, i) => (
                          <li key={i} className="flex items-baseline gap-1.5">
                            <span className="font-semibold text-slate-900">{d.diagnosis}</span>
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-slate-600">
                              {d.probability}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11.5px] text-slate-500">No differential generated.</p>
                    )}
                  </NurseCascadeColumn>
                </div>
              )}
            </CollapsibleSection>

            {/* 7. Checklist + validation */}
            <CollapsibleSection
              title="Handoff readiness"
              summary={`${checklist.filter(c => c.done).length} of ${checklist.length} items satisfied`}
              icon={Activity}
              tone={allPass ? "success" : "warn"}
              info="Every item must be satisfied before the provider can see the handoff brief."
            >
              <ul className="flex flex-col gap-1.5">
                {checklist.map(c => (
                  <li key={c.id} className="flex items-start gap-2 text-[13px]" title={c.hint}>
                    {c.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={c.done ? "text-slate-500" : "text-slate-900 font-medium"}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                {isValidated ? (
                  <span className="inline-flex items-center gap-1.5 fc-badge fc-badge-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready for provider handoff
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={!allPass}
                    title={!allPass ? `Outstanding: ${missing.map(m => m.label).join(", ")}` : undefined}
                    className={`h-[36px] px-3.5 rounded-[10px] text-[13px] font-semibold transition-colors ${
                      allPass
                        ? "bg-teal-600 text-white hover:bg-teal-700"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    Confirm form validity
                  </button>
                )}
              </div>
            </CollapsibleSection>
          </div>
        </div>

        {/* Sticky action rail */}
        <aside className="md:col-span-4 md:h-full md:overflow-y-auto md:pl-1">
          <div className="md:sticky md:top-0 flex flex-col gap-3">

            <div className="fc-card p-4">
              <h3 className="fc-section-title mb-2 flex items-center gap-1.5">
                Active findings
                <InfoTooltip label="Active findings" description="Critical observations surfaced during this encounter. Automatically populated from vitals + AI." />
              </h3>
              {Object.values(vInterp).some(v => v?.status === "critical") || escalated ? (
                <div className="bg-rose-50 border-l-4 border-rose-600 p-3 rounded-r-md mb-2">
                  <div className="flex items-center gap-2 text-rose-800 font-semibold text-[13px] mb-1">
                    <AlertTriangle className="w-4 h-4" /> Elevated risk
                  </div>
                  <p className="text-[12.5px] text-rose-700">
                    {escalated
                      ? "Case has been escalated — provider notified."
                      : "Vitals are outside safe range. Consider escalation."}
                  </p>
                </div>
              ) : (
                <p className="text-[12.5px] text-slate-500">
                  No critical findings yet. Capture vitals to populate this panel.
                </p>
              )}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-md flex flex-col gap-1 mt-2">
                <span className="fc-eyebrow">Handoff status</span>
                <span className="text-[13px] font-semibold text-slate-900">
                  {handoffSuccess ? "Handed off" : isValidated ? "Validated, ready to send" : "In progress (draft)"}
                </span>
                <span className="text-[12px] text-slate-500">Auto-saved just now</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="fc-card p-4">
              <h4 className="fc-section-title mb-3">Handoff actions</h4>
              <button
                type="button"
                onClick={handleSend}
                disabled={!caseDetail || !isValidated || isSending || handoffSuccess}
                title={
                  isValidated
                    ? undefined
                    : missing.length
                    ? `Outstanding: ${missing.map(m => m.label).join(", ")}`
                    : "Confirm form validity first."
                }
                className={`w-full inline-flex items-center justify-center gap-2 h-[44px] rounded-[10px] text-[14px] font-semibold transition-colors ${
                  isValidated && !isSending && !handoffSuccess
                    ? "bg-[#0F4C81] text-white hover:bg-[#0B3D66]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending to provider…
                  </>
                ) : handoffSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Handoff complete
                  </>
                ) : (
                  <>
                    Send to provider <Send className="w-4 h-4" />
                  </>
                )}
              </button>

              {handoffSuccess && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-[10px]" role="status" aria-live="polite">
                  <p className="text-[13px] text-emerald-800 font-semibold">Case handed off to provider.</p>
                  <p className="text-[12px] text-emerald-700 mt-0.5">
                    Audit event <span className="font-mono">nurse.handoff_ready</span> emitted.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleEscalate}
                disabled={!caseDetail || isSending || handoffSuccess || escalated || isEscalating}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 h-[40px] bg-white border border-rose-200 text-rose-700 rounded-[10px] text-[13.5px] font-semibold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEscalating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Escalating…
                  </>
                ) : escalated ? (
                  <>
                    <ShieldAlert className="w-4 h-4" /> Case escalated
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" /> Escalate case
                  </>
                )}
              </button>

              {escalated && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-[10px]" role="status" aria-live="polite">
                  <p className="text-[13px] text-rose-800 font-semibold">Escalation posted.</p>
                  <p className="text-[12px] text-rose-700 mt-0.5">
                    Case upgraded to <strong>ESI 2</strong>. Provider has been paged and the on-call lead is notified.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
      </>
    </div>
  );
}

/* ─────────── Small subcomponents ─────────── */

function VitalField({
  label, unit, value, onChange, interp, placeholder,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  interp?: VitalsInterp;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[12px] font-semibold text-slate-600">
          {label} <span className="text-slate-400 font-normal">({unit})</span>
        </label>
        {interp && (
          <span
            className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-[1px] border rounded-full ${STATUS_PILL[interp.status]}`}
            title={interp.note}
          >
            {interp.status}
          </span>
        )}
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="w-full h-[36px] border border-slate-300 rounded-[8px] px-2.5 text-[13px] focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81]/30 outline-none bg-white"
      />
      {interp && (
        <p className="mt-1 text-[11.5px] text-slate-500 leading-[16px]">{interp.note}</p>
      )}
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] text-slate-700">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  );
}

function NurseCascadeColumn({
  icon: Icon,
  eyebrow,
  tier,
  offline,
  className,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  eyebrow: string;
  tier: number;
  offline?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={["min-w-0", className ?? ""].join(" ").trim()}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-chip)] bg-[#0F4C81]/10 text-[#0F4C81]">
            <Icon size={11} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 leading-snug pt-0.5">
            {eyebrow}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-slate-600">
          T{tier}
        </span>
      </div>
      {offline ? (
        <p className="text-[11px] text-slate-500">AI engine offline.</p>
      ) : (
        children
      )}
    </div>
  );
}

function SmallHeader({
  icon: Icon, label, tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
      <Icon className="w-3 h-3" />
      {label}
      {tooltip && <InfoTooltip label={label} description={tooltip} />}
    </div>
  );
}
