import React from "react";
import { CaseTimeline, type TimelineEvent } from "@/components/shared/CaseTimeline";
import { AlertTriangle } from "lucide-react";
import type { RiskFlag } from "../_data/case-view";

/**
 * Patient context rail — static reference content.
 *
 * Show on screen as flat sections on the page background (no cards). Per spec 90,
 * cards are reserved for content that is either the primary read (the
 * clinical note) or interactive (the decision panel).
 *
 * All content is data-driven so this rail can show on screen any case view.
 */
export function PatientContextRail({
  gender,
  age,
  weight,
  diagnoses,
  riskFlags,
  timelineEvents,
}: {
  gender: string;
  age: string | number;
  weight: string;
  diagnoses: string[];
  riskFlags: RiskFlag[];
  timelineEvents: TimelineEvent[];
}) {
  return (
    <div className="flex flex-col divide-y divide-slate-200">
      <section className="pb-5">
        <h3 className="fc-eyebrow mb-3">Snapshot</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          <dt className="text-slate-500">Gender</dt>
          <dd className="font-semibold text-slate-900 text-right sm:text-left">{gender}</dd>
          <dt className="text-slate-500">Age</dt>
          <dd className="font-semibold text-slate-900 text-right sm:text-left">{age}</dd>
          <dt className="text-slate-500">Weight</dt>
          <dd className="font-semibold text-slate-900 text-right sm:text-left">{weight}</dd>
        </dl>
      </section>

      <section className="py-5">
        <h3 className="fc-eyebrow mb-3">Active diagnoses</h3>
        {diagnoses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {diagnoses.map((dx) => (
              <span
                key={dx}
                className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 border border-slate-200 text-[12px] font-medium text-slate-700"
              >
                {dx}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-slate-500 italic">None on file.</p>
        )}
      </section>

      {riskFlags.length > 0 && (
        <section className="py-5">
          <h3 className="fc-eyebrow mb-2 flex items-center gap-1.5 text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            High-risk history
          </h3>
          <ul className="flex flex-col gap-1.5 text-[13px] text-slate-700">
            {riskFlags.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2">
                <span
                  className="inline-block w-1 h-1 rounded-full bg-rose-500 mt-1.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-slate-900">{r.title}</span>
                  {r.detail && <span className="text-slate-500"> · {r.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-5">
        <h3 className="fc-eyebrow mb-4">Case timeline</h3>
        <CaseTimeline events={timelineEvents} className="pl-0.5" />
      </section>
    </div>
  );
}
