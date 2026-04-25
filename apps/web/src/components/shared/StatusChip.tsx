"use client";

/**
 * StatusChip — single chip primitive for data / urgency / role / flag.
 *
 * Implements `documents/ux design/93-component-status-chip.md` AND aligns
 * with the case data-machine in `18-workflow-ownership.md § 2`.
 *
 * Back-compat: the legacy human-readable `status` values
 *   ("Submitted", "Under Review", "Waiting on Patient", "Nurse Pending",
 *    "Provider Review", "Follow-up Due", "Escalated", "Closed")
 * are preserved and aliased to the canonical data names.
 *
 * Prefer the canonical names on new code:
 *   submitted · front_desk_reviewed · nurse_in_progress · nurse_validated ·
 *   provider_pending · provider_reviewed · disposition_finalized · voided · reopened
 *
 * Urgency chips: `urgency-high|medium|low` — reserved colors (spec 20 § 4.1).
 */

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusChipVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap gap-1",
    "rounded-[6px] px-2 text-[11px] font-semibold leading-none",
    "ring-offset-background transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  ].join(" "),
  {
    variants: {
      status: {
        // Canonical data names (spec 18 § 2)
        submitted:              "bg-slate-100 text-slate-700",
        front_desk_reviewed:    "bg-blue-50 text-blue-700",
        nurse_in_progress:      "bg-amber-50 text-amber-800",
        nurse_validated:        "bg-emerald-50 text-emerald-700",
        provider_pending:       "bg-indigo-50 text-indigo-700",
        provider_reviewed:      "bg-blue-50 text-blue-800",
        disposition_finalized:  "bg-emerald-100 text-emerald-800",
        voided:                 "bg-slate-100 text-slate-500",
        reopened:               "bg-purple-50 text-purple-700",

        // Urgency (reserved palette — spec 20 § 4.1)
        "urgency-high":         "bg-red-50 text-[#C62828]",
        "urgency-medium":       "bg-orange-50 text-[#E65100]",
        "urgency-low":          "bg-green-50 text-[#2E7D32]",

        // Flag chips
        "handoff-ready":        "bg-emerald-50 text-emerald-700",
        "escalated":            "bg-red-50 text-red-700",
        "allergy":              "bg-rose-50 text-rose-700",
        "consent-missing":      "bg-amber-50 text-amber-800",
        "note-present":         "bg-slate-50 text-slate-700",

        // Legacy back-compat (aliases to canonical look)
        "Submitted":            "bg-slate-100 text-slate-700",
        "Under Review":         "bg-blue-50 text-blue-700",
        "Waiting on Patient":   "bg-slate-100 text-slate-600",
        "Nurse Pending":        "bg-amber-50 text-amber-800",
        "Provider Review":      "bg-indigo-50 text-indigo-700",
        "Follow-up Due":        "bg-amber-50 text-amber-800",
        "Escalated":            "bg-red-50 text-red-700",
        "Closed":               "bg-emerald-100 text-emerald-800",
      },
      size: {
        default: "h-6",          // 24 px (spec 93 — comfortable)
        compact: "h-5 px-1.5",   // 20 px (spec 93 — dense)
      },
    },
    defaultVariants: {
      status: "submitted",
      size: "default",
    },
  }
);

export type StatusKind =
  | "submitted"
  | "front_desk_reviewed"
  | "nurse_in_progress"
  | "nurse_validated"
  | "provider_pending"
  | "provider_reviewed"
  | "disposition_finalized"
  | "voided"
  | "reopened"
  | "urgency-high"
  | "urgency-medium"
  | "urgency-low"
  | "handoff-ready"
  | "escalated"
  | "allergy"
  | "consent-missing"
  | "note-present"
  // Legacy
  | "Submitted"
  | "Under Review"
  | "Waiting on Patient"
  | "Nurse Pending"
  | "Provider Review"
  | "Follow-up Due"
  | "Escalated"
  | "Closed";

/** Human-readable label for each canonical status (spec 93). */
const DEFAULT_LABEL: Record<string, string> = {
  submitted:             "Submitted",
  front_desk_reviewed:   "Front-desk reviewed",
  nurse_in_progress:     "Nurse in progress",
  nurse_validated:       "Nurse validated",
  provider_pending:      "Provider pending",
  provider_reviewed:     "Provider reviewed",
  disposition_finalized: "Finalized",
  voided:                "Voided",
  reopened:              "Reopened",
  "urgency-high":        "High",
  "urgency-medium":      "Medium",
  "urgency-low":         "Low",
  "handoff-ready":       "Handoff ready",
  "escalated":           "Escalated",
  "allergy":             "Allergy",
  "consent-missing":     "Consent missing",
  "note-present":        "Note",
};

export interface StatusChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof statusChipVariants> {
  label?: string;
  /** Optional leading icon (already sized by caller to 12–14 px). */
  icon?: React.ReactNode;
}

export function StatusChip({
  className,
  status,
  size,
  label,
  icon,
  ...props
}: StatusChipProps) {
  const resolvedLabel =
    label ??
    (status && DEFAULT_LABEL[status as string]) ??
    String(status ?? "");

  return (
    <span
      className={cn(statusChipVariants({ status, size, className }))}
      role="status"
      {...props}
    >
      {icon ? <span aria-hidden="true" className="inline-flex">{icon}</span> : null}
      {resolvedLabel}
    </span>
  );
}

/**
 * UrgencyChip — thin wrapper that maps the legacy display vocabulary
 * (Routine / Urgent / Emergency) onto the canonical urgency palette.
 * Use this for any row-level urgency so we never inline amber/red classes again.
 */
export type UrgencyLevel =
  | "Routine"
  | "Urgent"
  | "Emergency"
  | "low"
  | "medium"
  | "high";

const URGENCY_MAP: Record<UrgencyLevel, StatusKind> = {
  Routine:   "urgency-low",
  Urgent:    "urgency-medium",
  Emergency: "urgency-high",
  low:       "urgency-low",
  medium:    "urgency-medium",
  high:      "urgency-high",
};

export function UrgencyChip({
  level,
  size = "compact",
  className,
}: {
  level: UrgencyLevel;
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <StatusChip
      status={URGENCY_MAP[level]}
      size={size}
      label={level === "low" ? "Low" : level === "medium" ? "Medium" : level === "high" ? "High" : level}
      className={className}
    />
  );
}
