"use client";

/**
 * MobileStickyCTA — fixed bottom action bar for mobile-first routes.
 *
 * Implements `documents/ux design/96-component-mobile-sticky-cta.md`.
 * Rules:
 *  - Only used on `mobile-first` classified routes (patient/login).
 *  - 48-px primary CTA, flex-1. Optional 44×48 back button to the left.
 *  - Safe-area bottom padding via `.safe-area-pb` (globals.css).
 *  - Parent page MUST reserve `pb-[80px]` at ≤ md so last control isn't obscured.
 */

import React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MobileStickyCTAProps {
  /** Primary CTA label. Always a verb. */
  label: string;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Optional back/secondary icon-only button to the left. */
  onBack?: () => void;
  backAriaLabel?: string;
  /** Optional custom className on the bar. */
  className?: string;
  /** Hide above md. Default true. */
  mobileOnly?: boolean;
}

export function MobileStickyCTA({
  label,
  onAction,
  disabled,
  loading,
  onBack,
  backAriaLabel = "Back",
  className,
  mobileOnly = true,
}: MobileStickyCTAProps) {
  return (
    <nav
      role="region"
      aria-label="Primary actions"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 bg-[var(--card)] border-t border-[var(--border)] safe-area-pb pt-4 px-4",
        "shadow-[0_-4px_16px_rgba(15,23,42,0.06)]",
        mobileOnly && "md:hidden",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backAriaLabel}
            className="w-[44px] h-[48px] rounded-[8px] border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onAction}
          disabled={disabled || loading}
          className={cn(
            "flex-1 h-[48px] rounded-[8px] text-[15px] font-bold text-white transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--primary)]",
            disabled || loading
              ? "bg-slate-300 cursor-not-allowed"
              : "bg-[var(--primary)] hover:opacity-95 active:translate-y-[1px] shadow-md"
          )}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              Please wait…
            </span>
          ) : (
            label
          )}
        </button>
      </div>
    </nav>
  );
}
