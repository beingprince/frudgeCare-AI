"use client";

/**
 * /patient/history — list of past care events.
 *
 * Real data path: /api/patient/me/cases (Supabase, scoped by the
 * fc_session cookie). When the patient is unauthenticated we fall back
 * to a tiny demo list so the marketing demo and a logged-out preview
 * still show on screen.
 *
 * Tone: patient / care. Unified card primitives, no italic / uppercase
 * flourishes.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Calendar, History, Loader2 } from "lucide-react";
import { StatusChip, type StatusKind } from "@/components/shared/StatusChip";
import { useToast } from "@/components/shared/Toast";

type ApiCase = {
  id: string;
  case_code: string;
  status: string | null;
  urgency_final: string | null;
  urgency_suggested: string | null;
  symptom_text: string | null;
  created_at: string | null;
};

type HistoryItem = {
  id: string;
  uuid: string;
  date: string;
  symptom: string;
  status: StatusKind;
  isLive: boolean;
};

const MOCK_HISTORY: HistoryItem[] = [
  {
    id: "FC-C-1002",
    uuid: "FC-C-1002",
    date: "2025-11-12",
    symptom: "Seasonal Allergy Follow-up",
    status: "Closed",
    isLive: false,
  },
  {
    id: "FC-C-0982",
    uuid: "FC-C-0982",
    date: "2025-06-15",
    symptom: "Mild Back Pain",
    status: "Closed",
    isLive: false,
  },
];

// Map a raw cases.status string from Supabase to the StatusChip kind so
// the chip color/label stays consistent with the rest of the patient
// surfaces.
function statusFromCaseRow(s: string | null | undefined): StatusKind {
  switch (s) {
    case "disposition_finalized":
      return "Closed";
    case "provider_action_issued":
    case "provider_review_pending":
      return "Provider Review";
    case "nurse_validated":
    case "nurse_triage_in_progress":
    case "nurse_triage_pending":
      return "Nurse Pending";
    case "frontdesk_review":
      return "Under Review";
    case "ai_pretriage_ready":
    case "intake_submitted":
      return "Submitted";
    default:
      return "Submitted";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export default function PatientHistory() {
  const toast = useToast();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/patient/me/cases", { cache: "no-store" });
        if (res.ok) {
          const payload = (await res.json()) as { cases?: ApiCase[] };
          const cases = payload.cases ?? [];
          if (!cancelled) {
            if (cases.length > 0) {
              setItems(
                cases.map((c) => ({
                  id: c.case_code ?? c.id,
                  uuid: c.id,
                  date: formatDate(c.created_at),
                  symptom: c.symptom_text ?? "Care event",
                  status: statusFromCaseRow(c.status),
                  isLive: true,
                })),
              );
              setUsingDemo(false);
            } else {
              // Authenticated but no real cases yet → still show the demo
              // strip so the page never renders blank during the hackathon.
              setItems(MOCK_HISTORY);
              setUsingDemo(true);
            }
          }
        } else {
          // 401 (not signed in) or 500 → demo fallback.
          if (!cancelled) {
            setItems(MOCK_HISTORY);
            setUsingDemo(true);
          }
        }
      } catch {
        if (!cancelled) {
          setItems(MOCK_HISTORY);
          setUsingDemo(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-6 py-8 md:py-10 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-[12px] bg-[#0F4C81]/8 text-[#0F4C81] flex items-center justify-center">
          <History size={20} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="fc-page-title">Medical History</h1>
          <p className="fc-page-subtitle">
            A record of your past consultations and visit outcomes.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="fc-card p-8 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[13px] font-medium">Loading your history…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const inner = (
              <div className="flex items-center justify-between text-left w-full">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0 group-hover:text-[#0F4C81] transition-colors">
                    <FileText size={18} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="fc-eyebrow text-[#0F4C81]">{item.id}</span>
                      <StatusChip status={item.status} size="compact" />
                    </div>
                    <h3 className="text-[16px] font-semibold text-slate-900 truncate">
                      {item.symptom}
                    </h3>
                    <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                      <Calendar size={13} />
                      <span className="text-[12px] font-medium">{item.date}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-slate-300 group-hover:text-[#0F4C81] transition-colors flex-shrink-0 ml-3"
                />
              </div>
            );

            return item.isLive ? (
              <Link
                key={item.uuid}
                href={`/patient/status?caseId=${encodeURIComponent(item.uuid)}`}
                className="fc-card fc-card-interactive fc-focus-ring p-5 group block"
              >
                {inner}
              </Link>
            ) : (
              <button
                key={item.uuid}
                type="button"
                onClick={() =>
                  toast.info(
                    `Opening ${item.id}`,
                    "A detailed view is not available in this demo.",
                  )
                }
                className="fc-card fc-card-interactive fc-focus-ring p-5 group w-full"
              >
                {inner}
              </button>
            );
          })}

          <p className="text-[12px] text-slate-400 text-center mt-6">
            {usingDemo
              ? "Showing demo records. Submit an intake to see your real history here."
              : "Showing your most recent cases."}
          </p>
        </div>
      )}
    </div>
  );
}
