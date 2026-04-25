"use client";

import React, { useState } from "react";
import { Pill } from "lucide-react";
import { cn } from "@/lib/utils";
import { VitalsGrid } from "@/components/shared/VitalsGrid";
import { Disclosure } from "@/components/shared/Disclosure";
import type { ProviderCaseView } from "../_data/case-view";

type TabKey = "meds" | "labs" | "history";

/**
 * Clinical summary — show on screen as ONE card (the clinical note), not a
 * stack of nested cards. Sections inside are divided by <hr>s.
 *
 * Everything is driven from `ProviderCaseView` so the panel can show on screen
 * any case — no hardcoded copy.
 */
export function ClinicalSummaryPanel({
  chiefComplaint,
  nurseBrief,
  vitals,
  assessment,
  meds,
  labs,
  visitHistory,
}: {
  chiefComplaint: ProviderCaseView["chiefComplaint"];
  nurseBrief: ProviderCaseView["nurseBrief"];
  vitals: ProviderCaseView["vitals"];
  assessment: ProviderCaseView["assessment"];
  meds: ProviderCaseView["meds"];
  labs: ProviderCaseView["labs"];
  visitHistory: ProviderCaseView["visitHistory"];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("meds");

  return (
    <article className="fc-card p-5 md:p-6 min-w-0">
      {/* ─── Section 1: Clinical brief ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="fc-eyebrow">Nurse-validated handoff brief</div>
          <span className="inline-flex items-center h-6 px-2 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700 flex-shrink-0">
            Validated · {nurseBrief.validatedAgo}
          </span>
        </div>

        <p className="text-[15px] leading-[24px] text-slate-800">
          {nurseBrief.summary}
        </p>

        {nurseBrief.takeaways.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 text-[14px] leading-[20px] text-slate-700">
            {nurseBrief.takeaways.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span
                  className="inline-block w-1 h-1 rounded-full bg-slate-400 mt-1.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Disclosure label="Patient's own words">
            <blockquote className="text-[13px] leading-[19px] text-slate-700 italic border-l-2 border-slate-200 pl-3">
              &ldquo;{chiefComplaint.patientWords}&rdquo;
              <footer className="mt-1 not-italic text-[11px] text-slate-500 font-medium">
                Submitted via {chiefComplaint.submittedVia.toLowerCase()} ·{" "}
                {chiefComplaint.submittedAgo}
              </footer>
            </blockquote>
          </Disclosure>
          <Disclosure label="Nurse note on adherence">
            <p className="text-[13px] leading-[19px] text-slate-700">
              {nurseBrief.adherenceNote}
            </p>
          </Disclosure>
        </div>
      </section>

      <hr className="my-6 border-t border-slate-100" />

      {/* ─── Section 2: Vitals & assessment ───────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="fc-section-title">Vitals &amp; assessment</h2>
          <span className="text-[11px] text-slate-500">
            Recorded by {nurseBrief.recordedBy} · {nurseBrief.recordedAt}
          </span>
        </div>

        <VitalsGrid vitals={vitals} />

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
          <div>
            <div className="fc-eyebrow mb-1">Onset</div>
            <div className="text-[14px] font-semibold text-slate-900">
              {assessment.onset}
            </div>
          </div>
          <div>
            <div className="fc-eyebrow mb-1">Severity</div>
            <div className="text-[14px] font-semibold text-slate-900">
              {assessment.severity}
            </div>
          </div>
          <div>
            <div className="fc-eyebrow mb-1">Red flags</div>
            <div className="text-[14px] font-semibold text-slate-900 leading-tight">
              {assessment.redFlagsLabel}
            </div>
          </div>
        </div>

        {(assessment.associated.length > 0 || assessment.denied.length > 0) && (
          <div className="mt-4">
            <Disclosure label="Associated &amp; denied symptoms">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                <div className="flex items-baseline gap-3">
                  <span className="fc-eyebrow w-[72px] flex-shrink-0">Associated</span>
                  <span className="text-slate-800">
                    {assessment.associated.join(", ") || "—"}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="fc-eyebrow w-[72px] flex-shrink-0">Denied</span>
                  <span className="text-slate-800">
                    {assessment.denied.join(", ") || "—"}
                  </span>
                </div>
              </div>
            </Disclosure>
          </div>
        )}
      </section>

      <hr className="my-6 border-t border-slate-100" />

      {/* ─── Section 3: History (tabs) ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="fc-section-title">History</h2>
        </div>

        <div
          role="tablist"
          aria-label="Patient history"
          className="flex gap-6 border-b border-slate-200 mb-4 -mx-1 px-1 overflow-x-auto"
        >
          {(
            [
              ["meds", "Current meds"],
              ["labs", "Recent labs"],
              ["history", "Visit history"],
            ] as const
          ).map(([key, label]) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "fc-focus-ring relative pb-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
                  isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 right-0 -bottom-px h-[2px] rounded-full transition-colors",
                    isActive ? "bg-[var(--primary)]" : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div role="tabpanel">
          {activeTab === "meds" && (
            meds.length > 0 ? (
              <ul className="flex flex-col">
                {meds.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0"
                  >
                    <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Pill className="w-4 h-4 text-slate-500" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-slate-900 leading-tight">
                        {m.name}
                      </span>
                      <span className="block text-[12px] text-slate-500 mt-0.5">
                        {m.dose}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-[13px] text-slate-500">
                No current medications on file.
              </p>
            )
          )}
          {activeTab === "labs" && (
            <p className="py-2 text-[13px] text-slate-500">
              {labs ?? "No labs on file in the last 12 months."}
            </p>
          )}
          {activeTab === "history" && (
            <p className="py-2 text-[13px] text-slate-500">
              {visitHistory ?? "No prior visits in the last 12 months."}
            </p>
          )}
        </div>
      </section>
    </article>
  );
}
