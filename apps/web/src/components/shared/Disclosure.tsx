"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Disclosure — native <details>/<summary> wrapper with consistent styling.
 *
 * Used for progressive disclosure on dense pages (spec 19 § long-content rule).
 *
 * Visually signals "this is expandable" three ways so providers don't miss it:
 *   1. Primary-tinted text color
 *   2. Dotted underline under the label
 *   3. Chevron that rotates on open
 *
 * Accessible by default: keyboard-navigable, screen-reader-announced,
 * no JS data required.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className,
  summaryClassName,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
}) {
  return (
    <details
      className={cn("group fc-disclosure", className)}
      open={defaultOpen}
    >
      <summary
        className={cn(
          "fc-focus-ring list-none cursor-pointer select-none",
          "inline-flex items-center gap-1.5 text-[12.5px] font-semibold",
          "text-[var(--primary)] hover:opacity-80 transition-opacity",
          summaryClassName,
        )}
      >
        <span
          className={cn(
            "underline underline-offset-4 decoration-dotted decoration-[var(--primary)]/50",
            "group-open:decoration-solid",
          )}
        >
          {label}
        </span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
