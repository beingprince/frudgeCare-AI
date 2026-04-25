"use client";

/**
 * /patient/status
 *
 * The patient's view of their own case. Get the case the intake form
 * just created (by `?caseId=...`) and show on screen the data the patient
 * actually entered + the AI-built patient profile from
 * /api/ai/build-patient-profile.
 *
 * No more dummy "Hi, Jonathan / Tue, Oct 14 / Dr. Carter" — every
 * patient-facing string is either:
 *   • verbatim from what the patient typed at intake, OR
 *   • from the Gemini-built profile save on the case row, OR
 *   • a clearly-marked "not yet scheduled / not yet assigned" placeholder.
 */

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LinearProgress } from "@mui/material";
import { CaseTimeline, type TimelineEvent } from "@/components/shared/CaseTimeline";
import { StatusChip } from "@/components/shared/StatusChip";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";
import {
  ArrowRight, BellRing, User, CheckCircle2, Sparkles, ClipboardList,
  ChevronRight, Stethoscope, CalendarClock, LifeBuoy, Clock, Loader2,
  Activity, AlertTriangle, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceTierBadge } from "@/components/shared/ProvenanceBadges";
import { useToast } from "@/components/shared/Toast";
import type { Case, AIPatientProfile, CaseStatus } from "@/types";
import { downloadIntakeReceipt } from "@/lib/intake-receipt";
import { formatPhoneWithCountry } from "@/lib/country-codes";
import { ROLE_HOME } from "@/lib/role-routes";
import type { UserRole } from "@/types";

// Triage banner (URL-driven; unchanged in spirit)

const URGENCY_PALETTE = {
  high:   { bar: "bg-red-100/50",     border: "border-red-200/80",    text: "text-red-900",   headline: "High priority"   },
  medium: { bar: "bg-amber-100/50",   border: "border-amber-200/80",  text: "text-amber-900", headline: "Medium priority" },
  low:    { bar: "bg-emerald-100/50", border: "border-emerald-200/80", text: "text-emerald-900", headline: "Low priority"    },
} as const;
type Urgency = keyof typeof URGENCY_PALETTE;

function TriageBanner() {
  const searchParams = useSearchParams();
  const caseId  = searchParams.get("caseId");
  const urgency = searchParams.get("urgency")?.toLowerCase() as Urgency | null;
  const tierRaw = searchParams.get("tier");
  const tier = tierRaw ? Number(tierRaw) : undefined;

  if (!urgency || !(urgency in URGENCY_PALETTE)) return null;
  const p = URGENCY_PALETTE[urgency];

  const subtext =
    tier === 2
      ? "Your case was reviewed against our clinical knowledge base. A nurse will validate the findings before your provider is assigned."
      : tier === 3
      ? "Our triage system is temporarily unavailable. A nurse will review your case directly and make sure you get the right level of care."
      : "Your case has been reviewed. A nurse will validate the findings before your provider is assigned.";

  return (
    <div className={cn("w-full border-b px-4 py-3 sm:px-6", p.bar, p.border)}>
      <div className="mx-auto flex min-w-0 max-w-[min(100%,90rem)] flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <Sparkles className="h-4 w-4 opacity-80" strokeWidth={2} aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Triage update</span>
          {tier != null && <SourceTierBadge tier={tier} />}
        </div>
        <div className={cn("min-w-0 flex-1 space-y-0.5", p.text)}>
          <p className="text-[13px] font-semibold leading-snug sm:text-sm">{p.headline}</p>
          <p className="text-[12px] font-normal leading-snug opacity-90 sm:text-[13px]">{subtext}</p>
        </div>
        {caseId && <span className="shrink-0 font-mono text-[10px] text-slate-500">Case {caseId}</span>}
      </div>
    </div>
  );
}

function QuestionnaireReturnBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const isComplete = searchParams.get("questionnaire") === "complete";
  if (dismissed || !isComplete) return null;

  return (
    <div className="w-full border-b border-emerald-200/80 bg-emerald-50/60 px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-[min(100%,90rem)] items-start justify-between gap-3 text-[13px] text-emerald-950">
        <p>
          <span className="font-semibold">Questionnaire saved.</span>{" "}
          <span className="text-emerald-900/90">Your care team can use this for your visit.</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            router.replace("/patient/status", { scroll: false });
          }}
          className="fc-focus-ring shrink-0 text-[12px] font-semibold text-emerald-800 underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Stepper / journey derivation from the case data machine

type StepState = "complete" | "current" | "upcoming";

interface StepperEntry {
  id: string;
  label: string;
  sub: string;
  state: StepState;
  /** Statuses that map to this step. */
  match: CaseStatus[];
}

/**
 * Map the 9-data case FSM down to the 5-step patient journey UI.
 * Order of the case statuses defines the canonical progression so we
 * can derive `complete | current | upcoming` from a single `case.status`.
 */
const STAGE_ORDER: CaseStatus[] = [
  "intake_submitted",
  "ai_pretriage_ready",
  "frontdesk_review",
  "nurse_triage_pending",
  "nurse_triage_in_progress",
  "nurse_validated",
  "provider_review_pending",
  "provider_action_issued",
  "disposition_finalized",
];

const STEP_DEFS: Omit<StepperEntry, "state">[] = [
  { id: "intake",   label: "Intake",     sub: "",       match: ["intake_submitted"] },
  { id: "review",   label: "In review",  sub: "",       match: ["ai_pretriage_ready", "frontdesk_review"] },
  { id: "nurse",    label: "Nurse",      sub: "",       match: ["nurse_triage_pending", "nurse_triage_in_progress", "nurse_validated"] },
  { id: "provider", label: "Provider",   sub: "",       match: ["provider_review_pending", "provider_action_issued"] },
  { id: "visit",    label: "Visit",      sub: "",       match: ["disposition_finalized"] },
];

function deriveStepper(status: CaseStatus | undefined): StepperEntry[] {
  const idx = status ? STAGE_ORDER.indexOf(status) : -1;
  // Find the step whose `match` contains the current status.
  const currentStepIdx = STEP_DEFS.findIndex(s => status && s.match.includes(status));

  return STEP_DEFS.map((s, i) => {
    let state: StepState = "upcoming";
    let sub = "Pending";
    if (currentStepIdx !== -1) {
      if (i < currentStepIdx) { state = "complete"; sub = "Done"; }
      else if (i === currentStepIdx) { state = "current"; sub = "Now"; }
      else { state = "upcoming"; sub = "Pending"; }
    } else if (idx === -1) {
      // Unknown status — best effort: highlight intake.
      if (i === 0) { state = "current"; sub = "Now"; }
    }
    return { ...s, state, sub };
  });
}

function deriveStepperProgressPct(stepper: StepperEntry[]): number {
  const currentIdx = stepper.findIndex(s => s.state === "current");
  if (currentIdx === -1) {
    const allComplete = stepper.every(s => s.state === "complete");
    return allComplete ? 100 : 0;
  }
  // Centre the bar on the current step.
  return Math.min(100, Math.round(((currentIdx + 0.5) / stepper.length) * 100));
}

/**
 * The 9-data FSM doesn't 1:1 match the StatusChip variant set, which has
 * its own canonical chip vocabulary (`submitted`, `nurse_in_progress`, …).
 * This mapper keeps us inside the chip's typed variant list so colors
 * actually show on screen — passing an unknown status to CVA silently drops the
 * variant class, which is what produced the bland "no color" chip before.
 */
type StatusChipKind =
  | "submitted"
  | "front_desk_reviewed"
  | "nurse_in_progress"
  | "nurse_validated"
  | "provider_pending"
  | "provider_reviewed"
  | "disposition_finalized";

const STATUS_HEADER: Record<
  string,
  { label: string; sub: string; chipLabel: string; chipKind: StatusChipKind }
> = {
  intake_submitted:         { label: "Intake submitted",   sub: "We've received your details and our triage system is reviewing them now.", chipLabel: "Submitted",         chipKind: "submitted" },
  ai_pretriage_ready:       { label: "Triage complete",    sub: "Your case is ready for the front desk. They'll route you to a nurse next.", chipLabel: "Triage Ready",      chipKind: "submitted" },
  frontdesk_review:         { label: "Front desk review",  sub: "Our team is reviewing your case and assigning a nurse.",                  chipLabel: "Front Desk Review", chipKind: "front_desk_reviewed" },
  nurse_triage_pending:     { label: "Nurse pending",      sub: "Your care team is preparing to review your information.",                 chipLabel: "Nurse Pending",     chipKind: "nurse_in_progress" },
  nurse_triage_in_progress: { label: "Nurse in progress",  sub: "Your nurse is reviewing your case right now.",                            chipLabel: "Nurse In Progress", chipKind: "nurse_in_progress" },
  nurse_validated:          { label: "Nurse validated",    sub: "Your nurse signed off. A provider will review your case shortly.",       chipLabel: "Nurse Validated",   chipKind: "nurse_validated" },
  provider_review_pending:  { label: "Provider review",    sub: "A provider is reviewing your case and will issue next steps.",            chipLabel: "Provider Review",   chipKind: "provider_pending" },
  provider_action_issued:   { label: "Decision issued",    sub: "Your provider has issued next steps. Your nurse is following up.",       chipLabel: "Decision Issued",   chipKind: "provider_reviewed" },
  disposition_finalized:    { label: "Visit complete",     sub: "Your case has been resolved. Reach out anytime if anything changes.",    chipLabel: "Closed",            chipKind: "disposition_finalized" },
};

function buildJourneyEvents(stepper: StepperEntry[]): TimelineEvent[] {
  const ICON_BY_ID: Record<string, TimelineEvent["icon"]> = {
    intake:   CheckCircle2,
    review:   User,
    nurse:    Stethoscope,
    provider: User,
    visit:    CalendarClock,
  };
  const ROLE_BY_ID: Record<string, string> = {
    intake:   "You",
    review:   "Front desk",
    nurse:    "Triage",
    provider: "Physician",
    visit:    "Next step",
  };
  return stepper.map(s => ({
    id: s.id,
    icon: ICON_BY_ID[s.id] ?? CheckCircle2,
    title:
      s.id === "intake"   ? "Intake submitted" :
      s.id === "review"   ? "In review" :
      s.id === "nurse"    ? "Nurse assessment" :
      s.id === "provider" ? "Provider review" :
                            "Visit",
    actorRole: ROLE_BY_ID[s.id] ?? "",
    timestamp: s.state === "complete" ? "Done" : s.state === "current" ? "Now" : "Pending",
    isActive: s.state === "current",
    activeCaption: s.state === "current" ? "This is where your case is right now." : undefined,
  }));
}

// Page

export default function PatientStatusPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PatientStatusInner />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-[13px]">Loading your case…</p>
      </div>
    </div>
  );
}

function PatientStatusInner() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(caseId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    role: string;
    name: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (!cancelled)
            setSession({ role: d.role, name: d.name, email: d.email });
        }
      } catch {
        /* not signed in / public page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When the user lands here with no caseId in the URL but they DO have
  // an active patient session (e.g. they just logged back in days after
  // submitting), get the most recent case for that patient and slip
  // the caseId into the URL so the rest of this component show on screen the
  // expected detail view. If no cases exist we fall through to the
  // existing "no-case empty data" below. Staff must never be redirected
  // into a patient case via this effect.
  useEffect(() => {
    if (caseId) return;
    if (session && session.role !== "patient") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/patient/me/cases", { cache: "no-store" });
        if (!res.ok) return; // 401 → not logged in: stay on empty state
        const json = await res.json();
        const latest = (json.cases ?? [])[0];
        if (!cancelled && latest?.case_code) {
          router.replace(
            `/patient/status?caseId=${encodeURIComponent(latest.case_code)}`,
          );
        }
      } catch {
        // Silent: empty-data UX is the safe backup option.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, router, session]);

  useEffect(() => {
    if (!caseId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("We couldn't find that case. Please start a new intake.");
          }
          throw new Error("Couldn't load your case right now.");
        }
        const json = await res.json();
        if (!cancelled) setCaseData(json.case as Case);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Couldn't load your case.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  // ── Calculated data (real, with safe backup option) ─────────────────────
  const profile: AIPatientProfile | undefined = caseData?.ai_patient_profile;
  const displayName =
    profile?.display_name ||
    caseData?.patient_full_name ||
    "your visit";
  const isWalkInWorkspace =
    Boolean(session) &&
    (session!.role === "front_desk" || session!.role === "admin");
  const isWrongStaffView =
    Boolean(session) &&
    !isWalkInWorkspace &&
    session!.role !== "patient";
  const staffGreetToken =
    session?.name?.trim().split(/\s+/).filter(Boolean)[0] ?? "there";
  const rawPatientToken = displayName.split(" ")[0] || "there";
  const patientGreetName =
    !caseId && !caseData
      ? "there"
      : rawPatientToken.toLowerCase() === "your"
        ? "there"
        : rawPatientToken;
  const greetName = isWalkInWorkspace || isWrongStaffView
    ? staffGreetToken
    : patientGreetName;
  const status = caseData?.status as CaseStatus | undefined;
  const header = (status && STATUS_HEADER[status]) || {
    label: "Your case",
    sub: "Your care team is preparing your details.",
    chipLabel: "In progress",
    chipKind: "submitted" as StatusChipKind,
  };
  const stepper = deriveStepper(status);
  const stepperProgressPct = deriveStepperProgressPct(stepper);
  const journey = buildJourneyEvents(stepper);
  const currentStep = stepper.find(s => s.state === "current");
  const activeSubText =
    profile?.next_step_for_patient ||
    (currentStep
      ? `You are currently in the "${currentStep.label}" step.`
      : "Your care team is preparing your details.");

  // Tasks list — kept generic (consents/insurance/pharmacy) because these
  // aren't intake-form fields. The intake-driven content lives below in
  // the AI summary card.
  const initialTasks = [
    { title: "Sign consent forms",        done: true,  hint: "Done"   as const },
    { title: "Upload insurance card",     done: false, hint: "Needed" as const },
    { title: "Select preferred pharmacy", done: false, hint: "Needed" as const },
  ];
  const [items, setItems] = useState(initialTasks);
  const toggleItem = (i: number) => {
    setItems(prev => {
      const wasDone = prev[i].done;
      const next = prev.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it));
      toast.success(
        wasDone ? "Marked as not done" : "Marked as complete",
        prev[i].title,
      );
      return next;
    });
  };

  // ── Download intake receipt (PDF) ───────────────────────────────
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadReceipt = async () => {
    if (!caseData || isDownloading) return;
    setIsDownloading(true);
    try {
      const filename = await downloadIntakeReceipt({
        caseData,
        variant: isWalkInWorkspace ? "front_desk" : "patient",
      });
      toast.success("Receipt ready", filename);
    } catch (err) {
      console.error("Receipt generation failed:", err);
      toast.success("Couldn't generate receipt", "Please try again in a moment.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (isWrongStaffView && session) {
    const home = ROLE_HOME[session.role as UserRole] ?? "/";
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[var(--background)] px-4 text-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Wrong area for your role
          </p>
          <h1 className="mt-2 text-[1.25rem] font-semibold text-slate-900">This is the patient care status page</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Hi, {greetName}</span> — you are signed in as{" "}
            {session.role.replace(/_/g, " ")}. The History link from the patient header would send you
            here; your workspace uses different menus.
          </p>
          <button
            type="button"
            onClick={() => router.push(home)}
            className="mt-4 w-full rounded-lg bg-[var(--primary)] py-2.5 text-[14px] font-semibold text-white shadow-sm"
          >
            Go to my workspace
          </button>
        </div>
      </div>
    );
  }

  if (isWalkInWorkspace && !caseId && !isLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[var(--background)] text-slate-900">
        <header className="w-full border-b border-[#0F4C81]/20 bg-gradient-to-b from-slate-50 to-white">
          <div className="mx-auto w-full max-w-[min(100%,90rem)] px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0F4C81]/80">
              Front desk · Walk-in &amp; case status
            </p>
            <h1 className="mt-1 text-[1.5rem] font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">
              Hi, {greetName}
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600">
              You are on the same <span className="font-mono text-[13px]">/patient/status</span> URL patients use, but{" "}
              <span className="font-semibold text-slate-800">as front desk</span> the next step is usually to
              start a walk-in or pull work from the check-in queue where new intakes appear after a patient
              submits the form.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => router.push("/patient/intake")}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-[14px] font-semibold text-white shadow"
              >
                Start walk-in intake <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => router.push("/front-desk/queue")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-800"
              >
                Open check-in queue
              </button>
            </div>
            <p className="mt-3 text-[12px] text-slate-500">
              When a patient completes the intake on their phone, the case is created in the system and
              should appear under <strong>Check-in queue</strong> for triage and next steps.
            </p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[var(--background)] pb-[5.5rem] text-slate-900 md:pb-6">
      {/* Top band */}
      <header className="w-full shrink-0 border-b border-amber-200/40 bg-gradient-to-b from-amber-50/90 via-amber-50/35 to-slate-50/40">
        <div className="mx-auto flex w-full max-w-[min(100%,90rem)] flex-col gap-3 px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8 lg:py-4">
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-900/50">
                {isWalkInWorkspace ? "Front desk · case review" : "Patient portal"}
              </p>
              <h1 className="mt-0.5 text-[1.4rem] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[1.65rem] md:text-[1.75rem]">
                {isLoading ? "Loading…" : `Hi, ${greetName}`}
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-snug text-slate-600 md:text-[14px]">
                {isWalkInWorkspace
                  ? "Viewing this intake in staff context — the patient still sees the same case on their own login."
                  : "Here is your place in the care process and the one thing to do next."}
              </p>
            </div>
            <div
              className="w-full min-w-0 max-w-sm rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 shadow-sm md:w-[min(100%,19rem)] md:shrink-0"
              role="status"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900/60">Current status</p>
              <p className="mt-0.5 text-[16px] font-semibold text-amber-950 sm:text-[17px]">{header.label}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-amber-900/80">{header.sub}</p>
              <div className="mt-1.5">
                <StatusChip
                  status={header.chipKind}
                  size="compact"
                  label={header.chipLabel}
                  className="border border-amber-200/50 bg-white/60"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {isWalkInWorkspace && caseId && !isLoading && (
        <div
          className="w-full border-b border-emerald-200/60 bg-emerald-50/85 px-4 py-2.5 text-[13px] text-emerald-950 sm:px-6"
          role="status"
        >
          <span className="font-semibold">Viewing as front desk.</span> The PDF you download is labeled for
          internal review. Patients get the standard intake receipt from their own flow.
        </div>
      )}

      <TriageBanner />
      <QuestionnaireReturnBanner />

      {/* No-case empty state — patients only; front desk + admin use the walk-in page above */}
      {!caseId && !isLoading && !isWalkInWorkspace && (
        <NoActiveCase onStart={() => router.push("/patient/intake")} />
      )}

      {/* Load error */}
      {caseId && loadError && (
        <div className="mx-auto mt-6 w-full max-w-[min(100%,90rem)] px-4 sm:px-6">
          <div className="flex items-start gap-3 rounded-xl border border-red-200/80 bg-red-50/70 p-4 text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-[13px]">
              <p className="font-semibold">Couldn't load your case</p>
              <p className="opacity-90">{loadError}</p>
              <button
                type="button"
                onClick={() => router.push("/patient/intake")}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                Start a new intake <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main two-column workspace */}
      {(caseId || isLoading) && !loadError && (
        <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[min(100%,90rem)] flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-200/50 lg:flex-row lg:border-0">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col border-slate-200/60 bg-white/50 lg:border-r">
              {/* Next for you */}
              <section
                className="order-1 w-full border-b border-[#0F4C81]/10 bg-gradient-to-r from-sky-50/90 via-sky-50/40 to-white/30 pl-3 sm:pl-4 md:pl-5"
                aria-labelledby="next-label"
              >
                <div className="border-l-[3px] border-[var(--primary)] py-3.5 pl-3 pr-3 sm:py-4 sm:pl-4 sm:pr-5">
                  <p
                    id="next-label"
                    className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0F4C81]/80"
                  >
                    Next for you
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#0F4C81]/20 bg-white shadow-sm">
                      <ClipboardList className="h-5 w-5 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[1.25rem] font-semibold leading-tight text-slate-900 sm:text-[1.4rem] md:text-[1.5rem] md:leading-snug">
                        Complete medical history
                      </h2>
                      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-slate-600 md:text-[14px]">
                        {profile?.next_step_for_patient ??
                          "Short answers help your care team get ready. You can return anytime to update."}
                      </p>
                      <div className="mt-3 flex min-w-0 max-w-md flex-col gap-1.5 sm:max-w-lg">
                        <div className="flex items-center gap-2.5">
                          <div className="min-w-0 flex-1">
                            <LinearProgress
                              variant="determinate"
                              value={0}
                              sx={{
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: "rgba(15, 76, 129, 0.1)",
                                "& .MuiLinearProgress-bar": {
                                  borderRadius: 999,
                                  backgroundColor: "#0F4C81",
                                },
                              }}
                            />
                          </div>
                          <span className="shrink-0 rounded-full border border-amber-200/80 bg-amber-100/80 px-2 py-0.5 text-center text-[12px] font-semibold text-amber-950">
                            Not started
                          </span>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[12px] text-slate-500 md:text-[13px]">
                        Takes about 5–8 minutes. You can save and return anytime.
                      </p>
                    </div>
                    <div className="shrink-0 sm:pt-1">
                      <button
                        type="button"
                        onClick={() => router.push("/patient/questionnaire")}
                        className="fc-focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white shadow-md transition hover:opacity-[0.97] sm:h-11 sm:w-auto sm:min-w-[10.5rem]"
                      >
                        Start Questionnaire
                        <ArrowRight className="h-[15px] w-[15px] opacity-95" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* What you told us — REAL submitted intake */}
              <SubmittedDetailsSection
                caseData={caseData}
                isLoading={isLoading}
                onDownloadReceipt={handleDownloadReceipt}
                isDownloading={isDownloading}
              />

              {/* AI-built profile narrative */}
              <AIProfileSection profile={profile} isLoading={isLoading} />

              {/* Care journey — real status-driven */}
              <section
                className="order-4 w-full min-h-0 border-b border-slate-200/60 bg-gradient-to-b from-slate-50/40 to-white/20 px-4 py-4 sm:px-6 sm:py-5 md:py-6"
                aria-labelledby="journey-heading"
              >
                <h3 id="journey-heading" className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Care journey
                </h3>
                <p className="mt-0.5 text-[12px] text-slate-500 md:text-[13px]">Where you are in your path to your visit</p>
                <div className="mt-3 md:mt-4">
                  <DesktopJourneyStepper stepper={stepper} progressPct={stepperProgressPct} activeSubText={activeSubText} />
                  <div className="mt-1 lg:hidden">
                    <CaseTimeline events={journey} className="ml-0.5" journeyEmphasis />
                  </div>
                </div>
              </section>

              {/* Tasks */}
              <section className="order-5 w-full border-b border-slate-200/60" aria-labelledby="tasks-heading">
                <div className="border-b border-slate-100/90 bg-slate-50/40 px-4 py-2.5 sm:px-6">
                  <h3 id="tasks-heading" className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-500">
                    Your tasks
                  </h3>
                  <p className="text-[12px] text-slate-500">Quick things to clear before your visit</p>
                </div>
                <ul className="divide-y divide-slate-200/60" role="list">
                  {items.map((item, i) => (
                    <li key={item.title}>
                      <button
                        type="button"
                        onClick={() => toggleItem(i)}
                        className={cn(
                          "fc-focus-ring flex w-full min-h-12 items-center gap-3 py-2.5 pl-4 pr-3 text-left transition sm:pl-6",
                          "hover:bg-slate-50/90",
                          item.done && "bg-slate-50/20",
                        )}
                      >
                        <span className="shrink-0" aria-hidden>
                          {item.done ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={2} />
                          ) : (
                            <Clock className="h-5 w-5 text-amber-600/90" strokeWidth={2} />
                          )}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-[15px] leading-snug",
                            item.done ? "font-medium text-slate-400 line-through" : "font-medium text-slate-900",
                          )}
                        >
                          {item.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-center text-[12px] font-semibold",
                            item.done
                              ? "bg-emerald-100/90 text-emerald-900"
                              : "border border-amber-200/80 bg-amber-50/80 text-amber-950",
                          )}
                        >
                          {item.done ? "Completed" : "Needed"}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </main>

            {/* Right column — visit & prep. Real if assigned, placeholder otherwise. */}
            <aside className="w-full shrink-0 border-t border-slate-200/60 bg-gradient-to-b from-slate-50/70 to-slate-50/30 lg:mt-0 lg:w-[min(25rem,32vw)] lg:border-t-0">
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Visit &amp; preparation
                </h2>
                <div className="mt-3">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white shadow-sm">
                      <CalendarClock className="h-5 w-5 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Upcoming visit</p>
                      <p className="mt-0.5 text-[1.4rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-[1.5rem]">
                        Not yet scheduled
                      </p>
                      <p className="mt-1.5 text-[14px] font-medium text-slate-600">
                        We'll confirm a time once your nurse reviews your case.
                      </p>
                      <p className="mt-0.5 text-[13px] text-slate-600">
                        {caseData?.preferred_provider
                          ? `Preferred provider: ${caseData.preferred_provider}`
                          : "No preferred provider on file"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusChip status={header.chipKind} size="compact" label={header.chipLabel} />
                        {caseData?.preferred_timing && (
                          <span className="text-[12px] text-slate-500">
                            You asked: {caseData.preferred_timing === "asap"
                              ? "as soon as possible"
                              : caseData.preferred_timing === "today"
                              ? "later today"
                              : "within 3 days"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-l-2 border-amber-300/70 bg-amber-50/50 py-2.5 pl-3 pr-2" role="status">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900/75 flex items-center gap-1.5">
                    <BellRing className="h-3.5 w-3.5" aria-hidden />
                    Reminder
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium leading-snug text-amber-950/95">
                    A nurse validates every case before a provider is assigned. We'll text or call you with next steps.
                  </p>
                </div>

                <div
                  className="mt-4 flex gap-2.5 border-t border-slate-200/70 pt-4 text-[13px] leading-relaxed text-slate-600"
                  role="contentinfo"
                >
                  <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                  <p>
                    <span className="font-semibold text-slate-800">Need help? </span>
                    <a
                      className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
                      href="tel:+15555550100"
                    >
                      Call the clinic
                    </a>{" "}
                    during business hours.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      <MobileStickyCTA
        label={isWalkInWorkspace ? "Back to queue" : "Start new intake"}
        onAction={() =>
          isWalkInWorkspace
            ? router.push("/front-desk/queue")
            : router.push("/patient/intake")
        }
      />
    </div>
  );
}

// Sub-components

function NoActiveCase({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-[min(100%,90rem)] flex-col items-start gap-3 px-4 sm:px-6">
      <div className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
          <ClipboardList className="h-5 w-5 text-slate-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-[16px] font-semibold text-slate-900">No active case yet</h2>
          <p className="mt-1 text-[13px] text-slate-600">
            Start a new intake and your details will be carried through to this page.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Start intake <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmittedDetailsSection({
  caseData,
  isLoading,
  onDownloadReceipt,
  isDownloading,
}: {
  caseData: Case | null;
  isLoading: boolean;
  onDownloadReceipt: () => void;
  isDownloading: boolean;
}) {
  return (
    <section className="order-2 w-full border-b border-slate-200/60 bg-white/40 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-500">
            What you told us
          </h3>
          <p className="mt-0.5 text-[12px] text-slate-500 md:text-[13px]">
            These are the details from the intake form — exactly as you submitted them.
          </p>
        </div>
        {caseData && (
          <button
            type="button"
            onClick={onDownloadReceipt}
            disabled={isDownloading}
            className={cn(
              "fc-focus-ring inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-[#0F4C81]/20 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#0F4C81] shadow-sm transition",
              "hover:bg-[#0F4C81] hover:text-white hover:border-[#0F4C81]",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            title="Download a PDF receipt of your intake form"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Preparing PDF…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" strokeWidth={2.2} />
                Download intake receipt
              </>
            )}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your details…
        </div>
      ) : caseData ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <DetailRow label="Name" value={caseData.patient_full_name} />
          <DetailRow
            label="Date of birth"
            value={
              caseData.patient_date_of_birth
                ? caseData.patient_age != null
                  ? `${caseData.patient_date_of_birth} · age ${caseData.patient_age}`
                  : caseData.patient_date_of_birth
                : ""
            }
          />
          <DetailRow label="Gender" value={caseData.patient_gender} />
          <DetailRow
            label="Phone"
            value={formatPhoneWithCountry(caseData.patient_phone, caseData.patient_phone_country)}
          />
          <DetailRow label="Email" value={caseData.patient_email} />
          <DetailRow label="Chief complaint" value={caseData.symptom_text} wide />
          <DetailRow label="Severity" value={caseData.severity_hint} />
          <DetailRow label="Duration" value={caseData.duration_text} />
          <DetailRow label="Additional details" value={caseData.additional_details} wide />
          <DetailRow label="Preferred timing" value={caseData.preferred_timing} />
          <DetailRow label="Preferred provider" value={caseData.preferred_provider} />
          <DetailRow label="Relevant history" value={caseData.patient_history} wide />
        </dl>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">Your details will appear here.</p>
      )}
    </section>
  );
}

function DetailRow({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  const display = value && value.toString().trim().length > 0 ? value : "—";
  return (
    <div className={cn("flex flex-col gap-0.5", wide && "sm:col-span-2")}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn(
        "text-[13px] leading-snug",
        display === "—" ? "text-slate-400" : "text-slate-800 font-medium",
      )}>
        {display}
      </dd>
    </div>
  );
}

function AIProfileSection({
  profile,
  isLoading,
}: {
  profile?: AIPatientProfile;
  isLoading: boolean;
}) {
  return (
    <section className="order-3 w-full border-b border-slate-200/60 bg-gradient-to-br from-violet-50/50 via-white/40 to-sky-50/30 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-700" />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-600">
          AI summary for your care team
        </h3>
        {profile?.source_tier && <SourceTierBadge tier={profile.source_tier} />}
      </div>
      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your profile…
        </div>
      ) : profile ? (
        <div className="mt-3 space-y-3">
          {profile.chief_complaint_short && (
            <p className="text-[14px] font-semibold text-slate-900">{profile.chief_complaint_short}</p>
          )}
          {profile.narrative_summary && (
            <p className="text-[13px] leading-relaxed text-slate-700">{profile.narrative_summary}</p>
          )}

          {profile.key_clinical_signals?.length > 0 && (
            <ProfileBulletBlock
              icon={<Activity className="h-3.5 w-3.5 text-slate-500" />}
              title="Key clinical signals"
              items={profile.key_clinical_signals}
            />
          )}
          {profile.red_flags_for_team?.length > 0 && (
            <ProfileBulletBlock
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
              title="Flags for the care team"
              items={profile.red_flags_for_team}
              tone="warn"
            />
          )}
          {profile.recommended_questions_for_nurse?.length > 0 && (
            <ProfileBulletBlock
              icon={<Stethoscope className="h-3.5 w-3.5 text-slate-500" />}
              title="Questions your nurse may ask"
              items={profile.recommended_questions_for_nurse}
            />
          )}

          <p className="text-[11px] italic text-slate-500">{profile.disclaimer}</p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">
          Your AI summary will appear here once your case is processed.
        </p>
      )}
    </section>
  );
}

function ProfileBulletBlock({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone?: "warn";
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {icon}
        <span>{title}</span>
      </div>
      <ul className={cn(
        "mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed",
        tone === "warn" ? "text-red-900" : "text-slate-700",
      )}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function DesktopJourneyStepper({
  stepper,
  progressPct,
  activeSubText,
}: {
  stepper: StepperEntry[];
  progressPct: number;
  activeSubText: string;
}) {
  return (
    <div
      className="hidden w-full lg:block"
      role="list"
      aria-label="Care journey progress"
    >
      <div className="relative w-full pt-0.5">
        <div
          className="pointer-events-none absolute left-0 right-0 top-[1.1rem] h-[3px] rounded-full bg-slate-200/95"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-0 top-[1.1rem] h-[3px] rounded-l-full bg-gradient-to-r from-emerald-500 from-10% to-[#0F4C81]"
          style={{ width: `${progressPct}%` }}
          aria-hidden
        />
        <div className="relative z-[1] flex flex-wrap justify-between gap-y-4">
          {stepper.map((step, i) => (
            <div
              key={step.id}
              className="flex min-w-0 w-[18%] flex-1 flex-col items-center text-center"
              role="listitem"
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white text-[11px] font-bold transition-shadow duration-200",
                  step.state === "complete" && "border-emerald-500 text-emerald-800 shadow-sm ring-2 ring-emerald-500/15",
                  step.state === "current" && "z-20 scale-105 border-[#0F4C81] text-[#0F4C81] shadow-md ring-4 ring-[#0F4C81]/18",
                  step.state === "upcoming" && "border-slate-200 text-slate-400",
                )}
                aria-current={step.state === "current" ? "step" : undefined}
              >
                {step.state === "complete" ? "✓" : i + 1}
              </div>
              <p
                className={cn(
                  "mt-2.5 text-[12px] font-semibold leading-tight",
                  step.state === "current" && "text-[#0F4C81] text-[13px]",
                  step.state === "complete" && "text-slate-800",
                  step.state === "upcoming" && "text-slate-500",
                )}
              >
                {step.label}
              </p>
              <p
                className={cn(
                  "text-[11px] leading-tight",
                  step.state === "current" && "font-semibold text-slate-700",
                  step.state === "upcoming" && "text-slate-400",
                  step.state === "complete" && "text-slate-500",
                )}
              >
                {step.sub}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-center text-[13px] leading-relaxed text-slate-600 md:text-left">
          <span className="font-medium text-[#0F4C81]">You are here · </span>
          {activeSubText}
        </p>
      </div>
    </div>
  );
}
