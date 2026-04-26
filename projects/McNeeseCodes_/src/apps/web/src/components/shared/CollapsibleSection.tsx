"use client";

/**
 * CollapsibleSection — a card-scale disclosure with a header strip.
 *
 * Different from `Disclosure` (which is an inline text disclosure used
 * for small "Show more" links): this one is a full card surface with a
 * title, optional summary line, optional right-aligned aside, and a
 * chevron that rotates on open.
 *
 * Why it exists
 *  - The front-desk KPI strip needs to collapse to free up vertical space.
 *  - The nurse workspace has many long sections (brief, CDS, questionnaire,
 *    validation, actions). Collapsing each lets the nurse focus on one at
 *    a time without infinite scroll.
 *
 * Design tokens
 *  - Uses `.fc-card` surface (border, radius, shadow)
 *  - Uses `.fc-section-title` typography for the header
 *  - Header left rail accent toggled via `tone` prop: default/warn/success/danger/primary
 */

import React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "./InfoTooltip";

type Tone = "default" | "primary" | "warn" | "success" | "danger";

const TONE_RAIL: Record<Tone, string> = {
  default: "",
  primary: "fc-highlight-primary",
  warn:    "fc-highlight-warn",
  success: "fc-highlight-success",
  danger:  "fc-highlight-danger",
};

export interface CollapsibleSectionProps {
  title: string;
  /** Short supporting line shown under the title. Kept short — wraps to 1 line. */
  summary?: React.ReactNode;
  /** Lucide icon component show on screen inside the title row. */
  icon?: LucideIcon;
  /** Right-aligned element in the header (badge, pill, tiny button). */
  aside?: React.ReactNode;
  /** Info-tooltip body shown next to the title. */
  info?: string;
  /** Accent rail on the left edge. */
  tone?: Tone;
  /** Start expanded (default) or collapsed. */
  defaultOpen?: boolean;
  /** Controlled open data — pair with onOpenChange for parent control. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** When true, remove inner padding so the body can flush to edges (forms). */
  dense?: boolean;
  /** Forwarded className for the outer card. */
  className?: string;
  children?: React.ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  icon: Icon,
  aside,
  info,
  tone = "default",
  defaultOpen = true,
  open,
  onOpenChange,
  dense = false,
  className,
  children,
}: CollapsibleSectionProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isOpen = open ?? uncontrolled;

  const toggle = () => {
    const next = !isOpen;
    if (onOpenChange) onOpenChange(next);
    else setUncontrolled(next);
  };

  const bodyId = React.useId();

  return (
    <section className={cn("fc-card p-0 overflow-hidden", TONE_RAIL[tone], className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className={cn(
          "w-full flex items-center gap-3 text-left",
          "px-4 md:px-5 py-3",
          "hover:bg-slate-50 transition-colors fc-focus-ring",
          isOpen ? "" : "bg-white",
        )}
      >
        {Icon && (
          <span
            className={cn(
              "flex-shrink-0 inline-flex items-center justify-center rounded-[8px]",
              "w-8 h-8 bg-slate-100 text-slate-600",
              tone === "primary" && "bg-[#0F4C81]/10 text-[#0F4C81]",
              tone === "warn"    && "bg-amber-100 text-amber-700",
              tone === "success" && "bg-emerald-100 text-emerald-700",
              tone === "danger"  && "bg-rose-100 text-rose-700",
            )}
            aria-hidden="true"
          >
            <Icon className="w-4 h-4" strokeWidth={2} />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="fc-section-title truncate">{title}</h3>
            {info && <InfoTooltip label={title} description={info} />}
          </div>
          {summary && (
            <div className="text-[12px] text-slate-500 truncate mt-0.5">{summary}</div>
          )}
        </div>

        {aside && <span className="flex-shrink-0">{aside}</span>}

        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-500 flex-shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id={bodyId}
          className={cn(
            "border-t border-slate-200",
            dense ? "p-0" : "p-4 md:p-5",
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}
