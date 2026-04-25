"use client";

/**
 * Operations · Audit Log
 *
 * Implements spec 16 §11 (two-axis scroll, sticky thead, min-width, filtered-empty)
 * and spec 92 (DenseTable contract).
 */

import React, { useMemo, useState } from "react";
import { Search, ArrowUpDown, History } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

const MOCK_AUDIT = [
  { id: "audit_001", table: "cases",        record: "case_001", field: "urgency_final", old: "null",  new: "high",  user: "Maria Johnson",  role: "front_desk", date: "2026-04-25 08:09" },
  { id: "audit_002", table: "appointments", record: "appt_003", field: "start_time",    old: "09:00", new: "10:00", user: "Patient Portal", role: "patient",    date: "2026-04-25 10:15" },
];

export default function OperationsAudit() {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_AUDIT;
    return MOCK_AUDIT.filter((r) =>
      [r.id, r.table, r.record, r.field, r.old, r.new, r.user, r.role]
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [query]);

  const isFilteredEmpty = rows.length === 0 && MOCK_AUDIT.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-6 py-4">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight">System Audit</h1>
          <p className="text-slate-500 text-[14px]">
            Immutable log of manual overrides and workflow transitions.
          </p>
        </div>
        <label className="flex items-center gap-3 bg-white border border-slate-200 rounded-[12px] px-4 h-[40px] shadow-resting">
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by ID, user, or action…"
            className="bg-transparent border-none outline-none text-[14px] w-64"
            aria-label="Filter audit entries"
          />
        </label>
      </div>

      {/* Two-axis scroll container — spec 16 §11.
          - Vertical scroll owner: this element (overflow-y-auto).
          - Horizontal scroll owner: inner wrapper (overflow-x-auto) below.
          - Sticky <thead> inside the inner table keeps columns visible. */}
      <div className="flex-1 min-h-0 px-4 md:px-6 pb-6 overflow-y-auto">
        <div className="bg-white border border-slate-200 rounded-[16px] shadow-resting overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ minWidth: 960 }}
              role="table"
              aria-label="Audit log"
            >
              <thead
                className="sticky top-0 z-[2] bg-slate-50 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"
                aria-label="Audit log columns"
              >
                <tr>
                  <th scope="col" className="text-left px-6 py-3 font-bold whitespace-nowrap">Timestamp</th>
                  <th scope="col" className="text-left px-6 py-3 font-bold whitespace-nowrap">Actor</th>
                  <th scope="col" className="text-left px-6 py-3 font-bold whitespace-nowrap">Table</th>
                  <th scope="col" className="text-left px-6 py-3 font-bold whitespace-nowrap">Field</th>
                  <th scope="col" className="text-left px-6 py-3 font-bold whitespace-nowrap">Transition</th>
                  <th scope="col" className="text-right px-6 py-3 font-bold whitespace-nowrap">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? (
                  rows.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-[12px] font-semibold text-slate-500 whitespace-nowrap tabular-nums">
                        {log.date}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[13px] font-bold text-slate-900">{log.user}</p>
                        <p className="text-[10px] font-bold uppercase text-blue-600 tracking-widest">
                          {log.role}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-[12px] font-bold uppercase text-slate-500 tracking-widest whitespace-nowrap">
                        {log.table}
                      </td>
                      <td className="px-6 py-4 text-[13px] font-semibold text-slate-700 whitespace-nowrap">
                        {log.field}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="text-[12px] font-medium text-slate-400 line-through truncate max-w-[140px]"
                            title={log.old}
                          >
                            {log.old}
                          </span>
                          <ArrowUpDown size={12} className="text-slate-300" aria-hidden="true" />
                          <span
                            className="text-[12px] font-bold text-amber-700 uppercase truncate max-w-[140px]"
                            title={log.new}
                          >
                            {log.new}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-[10px] font-bold text-[#0F4C81] bg-[#0F4C81]/5 px-3 py-1 rounded-full uppercase tracking-widest border border-[#0F4C81]/10 whitespace-nowrap">
                          {log.record}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  // Spec 19 § Empty states: full-width single row, same bg as tbody
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div className="min-h-[240px] flex items-center justify-center">
                        {isFilteredEmpty ? (
                          <EmptyState
                            icon="search"
                            title="No matching audit entries"
                            description="Try a different ID, user, or field name."
                            action={
                              <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="text-[13px] font-semibold text-[#0F4C81] hover:underline"
                              >
                                Clear filter
                              </button>
                            }
                          />
                        ) : (
                          <EmptyState
                            icon="inbox"
                            title="No audit entries yet"
                            description="System transitions and overrides will appear here."
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-slate-400 py-4">
          <History size={16} aria-hidden="true" />
          <span className="text-[12px] font-semibold italic">
            Showing local demo events and audit log entries.
          </span>
        </div>
      </div>
    </div>
  );
}
