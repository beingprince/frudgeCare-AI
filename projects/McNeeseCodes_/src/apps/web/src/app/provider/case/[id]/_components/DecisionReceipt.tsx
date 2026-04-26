"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Pencil, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  labelForAction,
  routeForAction,
  type ProviderDecision,
} from "../_data/decisions";

/**
 * Show on screen after a provider successfully signs + submits a decision.
 *
 * Surfaces four things:
 *   1. Confirmation (what was decided, who signed, when)
 *   2. Where it was routed (downstream workflow destination)
 *   3. The encounter note + patient-visible message, if any
 *   4. Next steps — back to daily list OR edit (revert to form)
 */
export function DecisionReceipt({
  decision,
  patientName,
  caseCode,
  onEdit,
}: {
  decision: ProviderDecision;
  patientName: string;
  caseCode: string;
  onEdit: () => void;
}) {
  const signedDate = new Date(decision.signedAt);
  const signedLabel = signedDate.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <article
      className="fc-card p-6 md:p-8 max-w-2xl mx-auto w-full"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="fc-eyebrow text-emerald-700 mb-0.5">Decision signed</div>
          <h1 className="text-[18px] font-bold text-slate-900 leading-tight">
            {labelForAction(decision.nextAction)}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            For {patientName} · #{caseCode}
          </p>
        </div>
      </div>

      <hr className="my-5 border-t border-slate-100" />

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[13px]">
        <dt className="fc-eyebrow self-center">Routed to</dt>
        <dd className="text-slate-900 font-semibold inline-flex items-center gap-1.5">
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          {routeForAction(decision.nextAction)}
        </dd>

        <dt className="fc-eyebrow self-center">Signed by</dt>
        <dd className="text-slate-900 font-semibold">{decision.providerName}</dd>

        <dt className="fc-eyebrow self-center">Signed at</dt>
        <dd className="text-slate-900 font-semibold tabular-nums">{signedLabel}</dd>
      </dl>

      {(decision.encounterNote || decision.patientUpdate) && (
        <>
          <hr className="my-5 border-t border-slate-100" />
          <div className="flex flex-col gap-4">
            {decision.encounterNote && (
              <div>
                <div className="fc-eyebrow mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Encounter note (internal)
                </div>
                <p className="text-[13.5px] leading-[20px] text-slate-700 whitespace-pre-wrap">
                  {decision.encounterNote}
                </p>
              </div>
            )}
            {decision.patientUpdate && (
              <div>
                <div className="fc-eyebrow mb-1.5">Sent to patient</div>
                <blockquote className="text-[13.5px] leading-[20px] text-slate-700 italic border-l-2 border-[var(--primary)]/30 pl-3">
                  {decision.patientUpdate}
                </blockquote>
              </div>
            )}
          </div>
        </>
      )}

      <hr className="my-6 border-t border-slate-100" />

      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          href="/provider/daily"
          className={cn(
            "fc-focus-ring inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[8px]",
            "bg-[var(--primary)] text-white text-[14px] font-semibold",
            "shadow-resting hover:brightness-105 active:brightness-95 transition-[filter]",
          )}
        >
          Back to daily list
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            "fc-focus-ring inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[8px]",
            "border border-slate-300 bg-white text-slate-800 text-[13px] font-semibold",
            "hover:bg-slate-50 hover:border-slate-400 transition-colors",
          )}
        >
          <Pencil className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          Edit decision
        </button>
      </div>

      <p className="mt-4 text-[11px] text-slate-400 leading-[16px]">
        Mock mode: this decision is saved to browser storage so the flow
        persists across refreshes. In production it would be written to the
        case record and fanned out to the destination queue above.
      </p>
    </article>
  );
}
