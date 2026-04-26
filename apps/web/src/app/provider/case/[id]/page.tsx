"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CaseHeader } from "@/components/shared/CaseHeader";
import { type TimelineEvent } from "@/components/shared/CaseTimeline";
import { StatusChip } from "@/components/shared/StatusChip";
import {
  FileText,
  Activity,
  Clock,
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowUpRight,
  ArrowLeft,
  Download,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { PatientContextRail } from "./_components/PatientContextRail";
import { ClinicalSummaryPanel } from "./_components/ClinicalSummaryPanel";
import {
  DecisionActionRail,
  type DecisionFormSubmit,
} from "./_components/DecisionActionRail";
import { DecisionReceipt } from "./_components/DecisionReceipt";
import { AICoPilotPanel } from "./_components/AICoPilotPanel";
import {
  loadProviderCaseView,
  type ProviderCaseView,
  type TimelineCategory,
} from "./_data/case-view";
import {
  clearDecision,
  getDecision,
  saveDecision,
  type ProviderDecision,
} from "./_data/decisions";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Signed-in provider (mock). When login is wired this comes from session.
const CURRENT_PROVIDER = { id: "usr_pr_001", name: "Dr. Emily Carter" };

// Map data-only timeline categories → the lucide icon components.
// Kept out of the data module so the data stays portable.
const CATEGORY_ICONS: Record<TimelineCategory, LucideIcon> = {
  intake:    FileText,
  scheduled: Clock,
  nurse:     Activity,
  provider:  Stethoscope,
};

export default function ProviderCaseReview() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const caseId = params?.id ?? "";

  // Real-data loader: hits /api/cases/[caseId] (Supabase) and folds the
  // nurse handoff brief stored in cases.ai_patient_profile.nurse_assessment
  // into the same view shape the rest of the page consumes. This is what
  // makes the front-desk → nurse → provider chain actually carry data
  // across page boundaries.
  const [view, setView] = useState<ProviderCaseView | null>(null);
  const [loadingView, setLoadingView] = useState(true);

  // Form submission data — starts by checking whether a decision already
  // exists for this case in local storage (so refreshing after submit
  // keeps the receipt visible).
  const [decision, setDecision] = useState<ProviderDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [escalationSent, setEscalationSent] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setLoadingView(true);
    loadProviderCaseView(caseId)
      .then((v) => {
        if (!cancelled) {
          setView(v);
          setLoadingView(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingView(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  // load any saved decision on the client after mount. This reads from
  // localStorage, which is a browser-only API, so the effect is the correct
  // place — not the show on screen body (server-side loading would mismatch) and not useSyncExternalStore
  // (overkill for a one-shot read in mock mode).
  //
  // We try both the URL caseId (which may be a case_code like FC-C-ABC123)
  // and the loaded view.id (always the UUID) so a refresh by either key
  // surfaces the previously-signed receipt.
  useEffect(() => {
    if (!caseId) return;
    const fromUrl = getDecision(caseId);
    if (fromUrl) {
      setDecision(fromUrl);
      return;
    }
    if (view?.id) setDecision(getDecision(view.id));
  }, [caseId, view?.id]);

  // Auto-hide the escalation-sent banner on the not-cleared gate.
  useEffect(() => {
    if (!escalationSent) return;
    const t = window.setTimeout(() => setEscalationSent(false), 4000);
    return () => window.clearTimeout(t);
  }, [escalationSent]);

  const handleExportPDF = async () => {
    if (!view) return;
    // 1. Load jsPDF from CDN
    if (!(window as any).jspdf) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load jsPDF"));
        document.body.appendChild(script);
      });
    }

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" }); // 1 inch = 72 pt

    // 14pt underlined headers
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("Clinical Case Report", 72, 72);
    doc.setLineWidth(1);
    doc.line(72, 74, 210, 74);

    // 12pt standard data
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    
    let y = 100;
    const addLine = (text: string) => {
      doc.text(text, 72, y);
      y += 18;
    };

    addLine(`Patient: ${view.patient.fullName}`);
    addLine(`Age/Sex: ${view.patient.age} ${view.patient.gender}`);
    addLine(`Case ID: ${view.caseMeta.caseCode}`);
    addLine(`Date: ${new Date().toISOString().split('T')[0]}`);
    y += 15;
    
    doc.setFont("times", "bold");
    doc.text("Chief Complaint", 72, y);
    doc.setFont("times", "normal");
    y += 16;
    const splitComplaint = doc.splitTextToSize(view.chiefComplaint.patientWords, 468);
    doc.text(splitComplaint, 72, y);
    y += (splitComplaint.length * 18);

    doc.setFont("times", "bold");
    doc.text("Nurse Brief", 72, y);
    doc.setFont("times", "normal");
    y += 16;
    const splitBrief = doc.splitTextToSize(view.nurseBrief.summary, 468);
    doc.text(splitBrief, 72, y);
    
    // Centered, 10pt, italic footer string
    doc.setFont("times", "italic");
    doc.setFontSize(10);
    doc.text("Confidential — for clinical use only", 306, 750, { align: "center" });

    doc.save(`case-${view.caseMeta.caseCode}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ─── Loading state ─────────────────────────────────────────────────────
  if (loadingView) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="fc-card p-6 md:p-8 max-w-md w-full text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 border border-slate-200 animate-pulse mb-3" />
            <h1 className="text-[15px] font-semibold text-slate-700">Loading case…</h1>
            <p className="mt-1 text-[12px] text-slate-500">
              Fetching <span className="font-mono">{caseId}</span> from the case service.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Not-found data ────────────────────────────────────────────────────
  if (!view) {
    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="fc-card p-6 md:p-8 max-w-md w-full text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-slate-500" aria-hidden="true" />
            </div>
            <h1 className="text-[17px] font-bold text-slate-900">Case not found</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              No case exists with ID <span className="font-semibold text-slate-700">{caseId}</span>.
            </p>
            <div className="mt-5">
              <Link
                href="/provider/daily"
                className="fc-focus-ring inline-flex items-center gap-2 h-10 px-4 rounded-[8px] bg-[var(--primary)] text-white text-[13px] font-semibold hover:brightness-105"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back to daily list
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Build the timeline-event objects the CaseTimeline component wants.
  const timelineEvents: TimelineEvent[] = view.timeline.map((t) => ({
    id: t.id,
    icon: CATEGORY_ICONS[t.category],
    title: t.title,
    actorRole: t.actorRole,
    timestamp: t.timestamp,
    handoffSummary: t.handoffSummary,
    remarks: t.remarks,
    nextOwnerRole: t.nextOwnerRole,
    isAbnormal: t.isAbnormal,
    isActive: t.isActive,
  }));

  // ─── Not-cleared gate ───────────────────────────────────────────────────
  if (!view.caseMeta.isTriageCleared) {
    const remaining = view.handoffChecklist.filter((x) => !x.done);
    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-2 md:pb-4 flex-shrink-0">
          <CaseHeader
            caseId={view.caseMeta.caseCode}
            patientName={view.patient.fullName}
            demographics={view.patient.demographics}
            urgency={view.caseMeta.urgency}
            currentState="Nurse Pending"
            nextOwnerRole="Provider"
            waitingOn={view.caseMeta.waitingOn}
            appointmentStatus={view.caseMeta.appointmentStatus}
            lastUpdated={view.caseMeta.lastUpdated}
            actionButtons={
              <button
                type="button"
                onClick={handleExportPDF}
                title="Download as PDF"
                className="fc-focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-slate-300 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export
              </button>
            }
          />
        </div>

        <div className="flex-1 px-4 md:px-6 pb-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
            <div className="flex flex-col gap-4">
              <div
                role="status"
                aria-live="polite"
                className="fc-card p-5 md:p-6 border-l-[3px] border-l-amber-500"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="fc-section-title text-[18px]">Awaiting nurse validation</h1>
                      <StatusChip status="nurse_in_progress" />
                    </div>
                    <p className="mt-1.5 text-[14px] leading-[20px] text-slate-600 max-w-2xl">
                      This case is still owned by the triage nurse. You&apos;ll be able to author
                      the clinical decision once the handoff brief is validated. The checklist
                      below shows what&apos;s outstanding.
                    </p>
                    <p className="mt-3 text-[13px] text-slate-600">
                      <span className="font-semibold text-slate-800">Current owner:</span>{" "}
                      {view.nurseOwner.name}
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="font-semibold text-slate-800">Picked up:</span>{" "}
                      {view.nurseOwner.pickedUpAt}
                    </p>
                  </div>
                </div>
              </div>

              <section className="fc-card p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="fc-section-title">Handoff readiness</h2>
                  <span className="text-[12px] font-medium text-slate-500">
                    {view.handoffChecklist.length - remaining.length} of{" "}
                    {view.handoffChecklist.length} complete
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {view.handoffChecklist.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5 text-[14px]">
                      {item.done ? (
                        <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 mt-0.5 flex-shrink-0" aria-label="Complete" />
                      ) : (
                        <Circle className="w-[18px] h-[18px] text-slate-300 mt-0.5 flex-shrink-0" aria-label="Outstanding" />
                      )}
                      <span className={item.done ? "text-slate-500 line-through decoration-slate-200" : "text-slate-900"}>
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => setEscalationSent(true)}
                    className="fc-focus-ring inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[8px] bg-[var(--primary)] text-white text-[14px] font-semibold hover:brightness-105 active:brightness-95 transition-[filter]"
                  >
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    Request escalation
                  </button>
                  {DEMO_MODE && (
                    <button
                      type="button"
                      onClick={() => router.refresh()}
                      className="fc-focus-ring inline-flex items-center justify-center h-11 px-4 rounded-[8px] border border-slate-300 bg-white text-slate-700 text-[13px] font-semibold hover:bg-slate-50"
                      title="Demo only"
                    >
                      Simulate handoff complete
                    </button>
                  )}
                </div>

                <div
                  role="status"
                  aria-live="polite"
                  className={"mt-3 text-[13px] font-medium text-emerald-700 " + (escalationSent ? "opacity-100" : "opacity-0 h-0")}
                >
                  {escalationSent
                    ? `Escalation request sent to ${view.nurseOwner.name}. No case data was modified.`
                    : null}
                </div>
              </section>
            </div>

            <aside className="flex flex-col gap-4" aria-label="Patient context (read-only)">
              <section className="fc-card p-5">
                <div className="fc-eyebrow mb-2">Read-only context</div>
                <dl className="text-[13px] flex flex-col">
                  {[
                    ["Gender", view.patient.gender],
                    ["Age", String(view.patient.age)],
                    ["Weight", view.patient.weight],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-b-0">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-semibold text-slate-900 text-right max-w-[60%] truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // ─── Submit handler ─────────────────────────────────────────────────────
  // Persists the decision (Supabase via /api/provider/decisions, mirrored
  // to localStorage as a backup) and then advances the case state machine
  // forward so /front-desk/queue, /patient/status, and /operations/audit
  // all reflect the new disposition. close_and_discharge skips straight
  // to disposition_finalized; everything else issues an action that ops
  // can follow up on.
  async function handleSubmit(payload: DecisionFormSubmit) {
    if (!view) return;
    setSubmitting(true);
    const signed: ProviderDecision = {
      // Always use the canonical case UUID so /api/provider/decisions can
      // write into a uuid-typed FK without a 22P02 cast error. The local
      // receipt mirror still keys on this same id, so refreshing the URL
      // (case_code) still shows the receipt because the page also loads
      // by code → UUID.
      caseId: view.id,
      providerId: CURRENT_PROVIDER.id,
      providerName: CURRENT_PROVIDER.name,
      nextAction: payload.nextAction,
      encounterNote: payload.encounterNote,
      patientUpdate: payload.patientUpdate,
      signedAt: new Date().toISOString(),
    };
    try {
      await saveDecision(signed);

      // Advance the case state machine. Best-effort: a transition
      // failure (already-advanced, missing FK, etc.) shouldn't lose the
      // signed receipt that the provider just authored.
      try {
        await fetch("/api/cases/transition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_id: view.id,
            from_status: "provider_review_pending",
            to_status: "provider_action_issued",
            actor_id: CURRENT_PROVIDER.id,
            event_type: "provider.decision_signed",
            metadata: { action: payload.nextAction },
          }),
        });
        if (payload.nextAction === "close_and_discharge") {
          await fetch("/api/cases/transition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              case_id: view.id,
              from_status: "provider_action_issued",
              to_status: "disposition_finalized",
              actor_id: CURRENT_PROVIDER.id,
              event_type: "provider.case_closed",
            }),
          });
        }
      } catch (e) {
        console.warn("[provider/case] transition failed (decision still saved):", e);
      }

      setDecision(signed);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit() {
    clearDecision(caseId);
    if (view?.id) clearDecision(view.id);
    setDecision(null);
  }

  // ─── Receipt data ──────────────────────────────────────────────────────
  if (decision) {
    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-2 md:pb-4 flex-shrink-0">
          <CaseHeader
            caseId={view.caseMeta.caseCode}
            patientName={view.patient.fullName}
            demographics={view.patient.demographics}
            urgency={view.caseMeta.urgency}
            currentState="Closed"
            nextOwnerRole=""
            waitingOn="Decision signed"
            appointmentStatus={view.caseMeta.appointmentStatus}
            lastUpdated="Just now"
            actionButtons={
              <button
                type="button"
                onClick={handleExportPDF}
                title="Download as PDF"
                className="fc-focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-slate-300 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export
              </button>
            }
          />
        </div>
        <div className="flex-1 px-4 md:px-6 pb-8 pt-2">
          <DecisionReceipt
            decision={decision}
            patientName={view.patient.fullName}
            caseCode={view.caseMeta.caseCode}
            onEdit={handleEdit}
          />
        </div>
      </div>
    );
  }

  // ─── Cleared data: 3-rail clinical workspace ───────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50 min-w-0">
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-2 md:pb-4 flex-shrink-0">
        <CaseHeader
          caseId={view.caseMeta.caseCode}
          patientName={view.patient.fullName}
          demographics={view.patient.demographics}
          urgency={view.caseMeta.urgency}
          currentState={view.caseMeta.currentState}
          nextOwnerRole=""
          waitingOn={view.caseMeta.waitingOn}
          appointmentStatus={view.caseMeta.appointmentStatus}
          lastUpdated={view.caseMeta.lastUpdated}
          actionButtons={
            <button
              type="button"
              onClick={handleExportPDF}
              title="Download as PDF"
              className="fc-focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-slate-300 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export
            </button>
          }
        />
      </div>

      <div
        className={
          "flex-1 px-4 md:px-6 pb-6 min-h-0 min-w-0 flex flex-col gap-4 " +
          "xl:grid xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:gap-5 xl:overflow-hidden"
        }
      >
        <div className="xl:overflow-y-auto xl:pr-2 min-w-0">
          <div className="xl:hidden">
            <details className="fc-disclosure fc-card p-5">
              <summary className="fc-focus-ring list-none cursor-pointer flex items-center justify-between gap-3">
                <span className="fc-section-title">Patient context</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  Snapshot · diagnoses · timeline
                </span>
              </summary>
              <div className="mt-5">
                <PatientContextRail
                  gender={view.patient.gender}
                  age={view.patient.age}
                  weight={view.patient.weight}
                  diagnoses={view.patient.diagnoses}
                  riskFlags={view.riskFlags}
                  timelineEvents={timelineEvents}
                />
              </div>
            </details>
          </div>
          <div className="hidden xl:block">
            <PatientContextRail
              gender={view.patient.gender}
              age={view.patient.age}
              weight={view.patient.weight}
              diagnoses={view.patient.diagnoses}
              riskFlags={view.riskFlags}
              timelineEvents={timelineEvents}
            />
          </div>
        </div>

        <div className="xl:overflow-y-auto min-w-0">
          <ClinicalSummaryPanel
            chiefComplaint={view.chiefComplaint}
            nurseBrief={view.nurseBrief}
            vitals={view.vitals}
            assessment={view.assessment}
            meds={view.meds}
            labs={view.labs}
            visitHistory={view.visitHistory}
          />
        </div>

        <div className="xl:overflow-y-auto xl:pl-1 min-w-0 flex flex-col gap-4">
          <AICoPilotPanel
            symptoms={view.chiefComplaint.patientWords}
            nurseBrief={view.nurseBrief.summary}
            vitals={view.vitals.reduce<Record<string, unknown>>((acc, v) => {
              acc[v.id] = v.value;
              return acc;
            }, {})}
            knownDiagnoses={view.patient.diagnoses}
            knownAllergies={[]}
            currentMedications={view.meds.map(m => m.name)}
          />
          <DecisionActionRail onSubmit={handleSubmit} submitting={submitting} />
        </div>
      </div>
    </div>
  );
}
