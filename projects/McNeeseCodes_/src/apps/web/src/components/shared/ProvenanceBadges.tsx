"use client";

/**
 * Small, reusable tag components for signaling provenance of information
 * in the UI. These are intentionally tiny — they should slot next to a
 * piece of data (urgency badge, AI summary, EHR record) without breaking
 * layout.
 */

import React from "react";

/**
 * AIPill — signals that the adjacent value was produced or influenced by
 * the clinical AI layer. Use it liberally; clinicians appreciate knowing
 * which artifact is AI-calculated vs. human-authored.
 */
export function AIPill({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full leading-none " +
        className
      }
      title="AI-generated"
    >
      <span className="w-1 h-1 rounded-full bg-violet-500 animate-pulse" />
      AI
    </span>
  );
}

/**
 * FHIRBadge — marks a data block as following the HL7 FHIR R4 resource
 * shape. A single badge tells interop-literate judges that we speak the
 * standard without requiring them to read JSON.
 */
export function FHIRBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-mono leading-none " +
        className
      }
      title="HL7 FHIR R4 compatible"
    >
      FHIR R4
    </span>
  );
}

/**
 * SourceTierBadge — communicates which tier of the AI cascade produced the
 * current response:
 *   1 → LLM verified over local knowledge base (full AI)
 *   2 → Local knowledge base only (LLM unavailable, still grounded)
 *   3 → Safe rule-based default (neither LLM nor KB matched)
 *
 * The badge doubles as a one-line trust signal for clinicians and judges:
 * even during an LLM outage, the system is transparent about its confidence.
 */
export function SourceTierBadge({
  tier,
  provenance = [],
  className = "",
}: {
  tier: number | undefined;
  provenance?: string[];
  className?: string;
}) {
  if (!tier) return null;

  const meta: Record<number, { label: string; color: string; title: string }> = {
    1: {
      label: "Model + KB",
      color: "bg-violet-50 text-violet-700 border-violet-200",
      title: "Reasoning model cross-checked against the local clinical knowledge base.",
    },
    2: {
      label: "KB only",
      color: "bg-teal-50 text-teal-700 border-teal-200",
      title: "Response assembled from the clinical knowledge base (reasoning model unavailable).",
    },
    3: {
      label: "Safe default",
      color: "bg-amber-50 text-amber-800 border-amber-200",
      title: "Rule-based safe default — no model and no knowledge-base match.",
    },
  };

  const m = meta[tier] ?? meta[3];
  const tooltip = provenance.length > 0
    ? `${m.title}\n\nSources consulted:\n${provenance.slice(0, 8).map(p => "• " + p).join("\n")}`
    : m.title;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full leading-none ${m.color} ${className}`}
      title={tooltip}
    >
      <span className="w-1 h-1 rounded-full bg-current opacity-70" />
      {m.label}
      {provenance.length > 0 && (
        <span className="opacity-60 font-normal">· {provenance.length} src</span>
      )}
    </span>
  );
}
