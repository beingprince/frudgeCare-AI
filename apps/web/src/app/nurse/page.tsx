"use client";

/**
 * Nurse triage list — table of cases awaiting or in nurse triage.
 * Open the full workbench at /nurse/case/[caseId] (from drawer or "Open" here).
 */

import React, { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, Stethoscope } from "lucide-react";
import { SectionHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import type { Case } from "@/types";

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

function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
}

function urgencyLabel(c: Case): string {
  const u = c.urgency_final ?? c.urgency_suggested ?? "medium";
  if (u === "high") return "Emergency";
  if (u === "medium") return "Urgent";
  return "Routine";
}

export default function NurseTriageListPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cases/nurse-queue", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { cases?: Case[]; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not load triage list");
        setCases([]);
        return;
      }
      setCases(j.cases ?? []);
    } catch {
      setError("Could not load triage list");
      setCases([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F1F5F9]">
      <div className="px-4 md:px-6 pt-5 pb-3 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <SectionHeader
              title="Nurse triage queue"
              subtitle="Review incoming cases, expand a row for a snapshot, then open the full case workspace to document vitals and hand off to the provider."
            />
            <p className="text-[12px] text-slate-500 mt-1 flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
              Use <strong className="font-semibold text-slate-600">Triage list</strong> in the app drawer to return here
              from a case.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-[10px] text-[12px] font-semibold text-[#0F4C81] border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 self-start sm:self-center"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Refresh list
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 md:px-6 pb-8 overflow-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-[#0F4C81]" />
            <span className="text-[13px]">Loading triage list…</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            {error}
          </div>
        )}

        {!loading && !error && cases.length === 0 && (
          <EmptyState
            title="No cases in triage"
            description="When front desk sends a case to the nurse, it will show in this table. Use Refresh after a new handoff."
          />
        )}

        {!loading && !error && cases.length > 0 && (
          <div className="w-full overflow-auto bg-white border border-slate-300 rounded-[16px] shadow-resting">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="bg-slate-50 border-b border-slate-300">
                <tr>
                  <th className="w-10 h-[44px] px-2" aria-hidden />
                  <th className="h-[44px] px-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Case</th>
                  <th className="h-[44px] px-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Patient</th>
                  <th className="h-[44px] px-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="h-[44px] px-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Urgency</th>
                  <th className="h-[44px] px-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Updated</th>
                  <th className="h-[44px] px-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const open = expandedId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        className={`border-b border-slate-200 transition-colors ${
                          open ? "bg-slate-50" : "hover:bg-slate-50/80"
                        }`}
                      >
                        <td className="align-middle pl-1">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={open ? "Collapse row" : "Expand row"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId((id) => (id === c.id ? null : c.id));
                            }}
                            className="p-2 rounded-md text-slate-500 hover:bg-slate-200/50 hover:text-slate-800"
                          >
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-[13px] font-semibold text-slate-900">
                          {c.case_code || c.id.slice(0, 8) + "…"}
                        </td>
                        <td className="py-3 px-3 text-[13px] text-slate-700 max-w-[200px] truncate" title={c.patient_full_name ?? ""}>
                          {c.patient_full_name?.trim() || "—"}
                        </td>
                        <td className="py-3 px-3 text-[12px] text-slate-600 capitalize">{statusLabel(c.status)}</td>
                        <td className="py-3 px-3 text-[12px]">
                          <span
                            className={
                              urgencyLabel(c) === "Emergency"
                                ? "text-rose-700 font-semibold"
                                : urgencyLabel(c) === "Urgent"
                                  ? "text-amber-700 font-semibold"
                                  : "text-slate-600"
                            }
                          >
                            {urgencyLabel(c)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[12px] text-slate-500">
                          {formatRelativeTime(c.updated_at || c.created_at)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/nurse/case/${encodeURIComponent(c.id)}`}
                            className="inline-flex h-8 items-center rounded-[8px] bg-[#0F4C81] px-3 text-[12px] font-semibold text-white hover:bg-[#0B3D66]"
                          >
                            Open triage
                          </Link>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={7} className="px-4 py-4 text-[13px] text-slate-700">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Intake snapshot</p>
                            <p className="text-[13px] leading-relaxed text-slate-800 line-clamp-4">
                              {c.structured_summary || c.symptom_text || "No narrative yet."}
                            </p>
                            {c.risky_flags && c.risky_flags.length > 0 && (
                              <p className="mt-2 text-[12px] text-rose-700">
                                <span className="font-semibold">Flags:</span> {c.risky_flags.join(" · ")}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Link
                                href={`/nurse/case/${encodeURIComponent(c.id)}`}
                                className="inline-flex h-9 items-center rounded-[8px] bg-[#0F4C81] px-4 text-[13px] font-semibold text-white hover:bg-[#0B3D66]"
                              >
                                Open full case triage
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
