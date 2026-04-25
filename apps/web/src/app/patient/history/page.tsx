"use client";

/**
 * /patient/history — list of past care events.
 * Tone: patient / care. Unified card primitives, no italic / uppercase flourishes.
 */

import React from "react";
import { ChevronRight, FileText, Calendar, History } from "lucide-react";
import { StatusChip } from "@/components/shared/StatusChip";
import { useToast } from "@/components/shared/Toast";

const MOCK_HISTORY = [
  { id: "FC-C-1002", date: "2025-11-12", symptom: "Seasonal Allergy Follow-up", status: "Closed" as const },
  { id: "FC-C-0982", date: "2025-06-15", symptom: "Mild Back Pain",              status: "Closed" as const },
];

export default function PatientHistory() {
  const toast = useToast();
  return (
    <div className="max-w-3xl mx-auto px-5 md:px-6 py-8 md:py-10 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-[12px] bg-[#0F4C81]/8 text-[#0F4C81] flex items-center justify-center">
          <History size={20} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="fc-page-title">Medical History</h1>
          <p className="fc-page-subtitle">A record of your past consultations and visit outcomes.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {MOCK_HISTORY.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              toast.info(
                `Opening ${item.id}`,
                "A detailed view is not available in this demo.",
              )
            }
            className="fc-card fc-card-interactive fc-focus-ring p-5 flex items-center justify-between text-left group w-full"
          >
            <div className="flex items-center gap-5 min-w-0">
              <div className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0 group-hover:text-[#0F4C81] transition-colors">
                <FileText size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="fc-eyebrow text-[#0F4C81]">{item.id}</span>
                  <StatusChip status={item.status} size="compact" />
                </div>
                <h3 className="text-[16px] font-semibold text-slate-900 truncate">{item.symptom}</h3>
                <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                  <Calendar size={13} />
                  <span className="text-[12px] font-medium">{item.date}</span>
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-[#0F4C81] transition-colors flex-shrink-0 ml-3" />
          </button>
        ))}

        <p className="text-[12px] text-slate-400 text-center mt-6">
          Showing historical records from the last 12 months.
        </p>
      </div>
    </div>
  );
}
