"use client";

/**
 * FormField — label + control + helper/error, governed.
 *
 * Implements `documents/ux design/95-component-form-field.md`.
 * - Label always above the control (never floating-inside).
 * - Helper text is replaced (not appended) by error.
 * - Reserves error-slot height to prevent layout jump.
 * - Required mark "*" + aria-required on the control.
 */

import React from "react";
import { cn } from "@/lib/utils";

type Size = "staff" | "patient";

export interface FormFieldProps {
  /** Stable id for htmlFor + aria wiring. */
  id?: string;
  label: string;
  /** When true, adds "*" suffix and aria-required on the control. */
  required?: boolean;
  /** Muted "(optional)" suffix. */
  optional?: boolean;
  /** Helper message below the control. Replaced by `error` when present. */
  helper?: React.ReactNode;
  /** Error message. Takes precedence over helper; sets aria-invalid on control. */
  error?: React.ReactNode;
  /**
   * - "staff" = desktop staff inputs (40 px).
   * - "patient" = mobile-first 44 px inputs.
   */
  size?: Size;
  /** Visible control. Use the `getControlProps()` show on screen-prop for full aria wiring. */
  children: (ctrl: {
    id: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
    "aria-describedby"?: string;
    /** Height class tier chosen by `size`. */
    heightClass: string;
    /** Base input className tier (height + padding + radius). */
    inputClass: string;
  }) => React.ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  required,
  optional,
  helper,
  error,
  size = "staff",
  children,
  className,
}: FormFieldProps) {
  const reactId = React.useId();
  const resolvedId = id ?? `ff-${reactId}`;
  const describedId = error
    ? `${resolvedId}-error`
    : helper
    ? `${resolvedId}-helper`
    : undefined;

  // Per 95 § Control heights
  const heightClass = size === "patient" ? "h-[44px]" : "h-[40px]";
  const radiusClass = size === "patient" ? "rounded-[12px]" : "rounded-[8px]";
  const inputClass = cn(
    "w-full px-3 border border-slate-300 bg-white outline-none transition-colors",
    "text-[15px] leading-none",
    "focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20",
    "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50",
    heightClass,
    radiusClass,
    error && "border-destructive focus:border-destructive focus:ring-destructive/25"
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={resolvedId}
        className="text-[15px] font-semibold text-slate-800 leading-tight"
      >
        {label}
        {required ? (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        ) : null}
        {optional ? (
          <span className="ml-1 text-slate-400 font-normal text-[12px]">
            (optional)
          </span>
        ) : null}
      </label>

      {children({
        id: resolvedId,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
        "aria-describedby": describedId,
        heightClass,
        inputClass,
      })}

      {/* Reserve 16 px for the error/helper row so layout doesn't jump. */}
      <div className="min-h-[16px] text-[12px] leading-4">
        {error ? (
          <span id={`${resolvedId}-error`} className="text-destructive">
            {error}
          </span>
        ) : helper ? (
          <span id={`${resolvedId}-helper`} className="text-slate-500">
            {helper}
          </span>
        ) : null}
      </div>
    </div>
  );
}
