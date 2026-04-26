"use client";

/**
 * RoleChip — a small "For: X" pill rendered in page headers.
 *
 * Why: the audit (FC-AUDIT-0001 §14) flagged that public-facing screens like
 * /triage and /agent never tell the viewer who the screen is for. A judge or
 * stakeholder should know within 2 seconds whether they are looking at the
 * patient kiosk, the staff console, or the engineering preview.
 *
 * Usage:
 *   <RoleChip audience="patient" />
 *   <RoleChip audience="judge" detail="Engineering preview of the agent loop" />
 *
 * The chip is intentionally restrained (one line, no animation) so it does
 * not compete with the page title. Colour-coded by audience for at-a-glance
 * recognition.
 */

import type { ReactNode } from "react";
import { Activity, Cpu, Stethoscope, Users } from "lucide-react";

export type RoleAudience =
  | "patient"
  | "staff"
  | "judge"
  | "front_desk"
  | "nurse"
  | "provider";

const STYLES: Record<
  RoleAudience,
  { bg: string; border: string; text: string; icon: ReactNode; label: string }
> = {
  patient: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: <Activity className="h-3.5 w-3.5" />,
    label: "Patient kiosk",
  },
  staff: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    icon: <Users className="h-3.5 w-3.5" />,
    label: "Clinic staff",
  },
  judge: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-800",
    icon: <Cpu className="h-3.5 w-3.5" />,
    label: "Judges & engineers",
  },
  front_desk: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: <Users className="h-3.5 w-3.5" />,
    label: "Front desk",
  },
  nurse: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-800",
    icon: <Stethoscope className="h-3.5 w-3.5" />,
    label: "Nurse",
  },
  provider: {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-800",
    icon: <Stethoscope className="h-3.5 w-3.5" />,
    label: "Provider",
  },
};

export function RoleChip({
  audience,
  detail,
  className = "",
}: {
  audience: RoleAudience;
  detail?: string;
  className?: string;
}) {
  const s = STYLES[audience];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${s.bg} ${s.border} ${s.text} px-2.5 py-1 text-xs font-medium ${className}`}
      title={detail ?? `Designed for: ${s.label}`}
    >
      {s.icon}
      <span className="font-semibold">For:</span>
      <span>{s.label}</span>
      {detail ? (
        <span className="hidden sm:inline text-[11px] font-normal opacity-75">
          · {detail}
        </span>
      ) : null}
    </span>
  );
}

/**
 * ModelChip — sibling of RoleChip, used to label which AI model is currently
 * powering the screen. Reads honestly from the engine response so the user
 * always knows what is running (Gemini, OpenAI, deterministic fallback).
 */
export function ModelChip({
  model,
  mode,
  className = "",
}: {
  /** Raw model id from the engine, e.g. "gemini-2.5-flash-lite" or "gpt-4o-mini". */
  model?: string | null;
  /** Synthesis mode reported by the agent: llm | deterministic | offline. */
  mode?: "llm" | "deterministic" | "offline" | string | null;
  className?: string;
}) {
  const display = prettyModelLabel(model, mode);
  const tone = pickTone(mode);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${tone.bg} ${tone.border} ${tone.text} px-2.5 py-1 text-xs font-medium ${className}`}
      title={`Engine reports model=${model ?? "unknown"}, mode=${mode ?? "unknown"}`}
    >
      <Cpu className="h-3.5 w-3.5" />
      <span>{display}</span>
    </span>
  );
}

function prettyModelLabel(
  model?: string | null,
  mode?: string | null,
): string {
  if (mode === "offline") return "Engine offline · safe default";
  if (mode === "deterministic") return "Deterministic fallback (KB only)";
  if (!model || model === "unavailable") return "Deterministic fallback (KB only)";

  const m = model.toLowerCase();
  if (m.startsWith("gemini")) return `Powered by Google ${prettyVersion(m)}`;
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3"))
    return `Powered by OpenAI ${prettyVersion(m)}`;
  if (m.startsWith("qwen") || m.includes("dashscope"))
    return `Powered by Alibaba Qwen ${prettyVersion(m)}`;
  if (m.startsWith("claude"))
    return `Powered by Anthropic ${prettyVersion(m)}`;
  return `Powered by ${model}`;
}

function prettyVersion(m: string): string {
  // gemini-2.5-flash-lite -> Gemini 2.5 Flash Lite
  return m
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pickTone(mode?: string | null): {
  bg: string;
  border: string;
  text: string;
} {
  if (mode === "llm") {
    return {
      bg: "bg-violet-50",
      border: "border-violet-200",
      text: "text-violet-800",
    };
  }
  if (mode === "deterministic") {
    return {
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-700",
    };
  }
  if (mode === "offline") {
    return {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
    };
  }
  return {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
  };
}
