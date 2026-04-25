"use client";

/**
 * AuthShell — A full-screen layout for login and sign-up pages.
 *
 * It has two looks:
 *  - "dark"  — used for staff login, with a dark background and grid pattern.
 *  - "light" — used for patients, with a simple bright background.
 *
 * It completely hides the normal navigation sidebar.
 */

import React from "react";
import { cn } from "@/lib/utils";

type Variant = "dark" | "light";
type WidthArchetype = "md" | "4xl" | "6xl";

export interface AuthShellProps {
  variant?: Variant;
  /** Controls how wide the box is depending on what we are showing inside it. */
  width?: WidthArchetype;
  /** Shows a small colored line at the top to match the patient brand colors. */
  brandStrip?: boolean;
  /** Adds a message fixed to the bottom of the screen, automatically making room so it doesn't cover anything. */
  bottomNotice?: React.ReactNode;
  /** The top section above the main white box. */
  header?: React.ReactNode;
  /** Links placed below the main box, like "Need help?". */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const WIDTH_CLASS: Record<WidthArchetype, string> = {
  md: "max-w-md",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

export function AuthShell({
  variant = "light",
  width = "md",
  brandStrip = false,
  bottomNotice,
  header,
  footer,
  children,
  className,
}: AuthShellProps) {
  const isDark = variant === "dark";

  return (
    <div
      className={cn(
        "relative min-h-screen w-full flex flex-col",
        isDark
          ? "bg-[radial-gradient(ellipse_at_top,rgba(21,101,192,0.18),transparent_60%),linear-gradient(180deg,#0B1220_0%,#0F172A_100%)] text-white"
          : "bg-[var(--background)] text-[var(--foreground)]",
        className
      )}
    >
      {/* A small strip of color at the top for patients */}
      {!isDark && brandStrip ? (
        <div
          aria-hidden="true"
          className="h-2 w-full flex-shrink-0 bg-[var(--primary)]"
        />
      ) : null}

      {/* A subtle grid background for the dark theme */}
      {isDark ? (
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="authgrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#authgrid)" />
        </svg>
      ) : null}

      <main
        id="auth-main"
        className={cn(
          "relative z-10 flex-1 flex items-center justify-center px-4 py-8",
          // Make sure the bottom message doesn't hide the content
          bottomNotice && "pb-[88px]"
        )}
      >
        <div className={cn("w-full", WIDTH_CLASS[width])}>
          {header ? <div className="mb-6 text-center">{header}</div> : null}

          <div
            className={cn(
              "rounded-[40px] p-8",
              isDark
                ? "bg-white/[0.06] backdrop-blur-md border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                : "bg-[var(--card)] border border-[var(--border)] shadow-[0_2px_6px_rgba(15,23,42,0.08)]"
            )}
          >
            {children}
          </div>

          {footer ? (
            <div
              className={cn(
                "mt-6 flex items-center justify-center gap-4 text-[13px]",
                isDark ? "text-white/70" : "text-slate-500"
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </main>

      {bottomNotice ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 safe-area-bottom",
            "bg-slate-900 text-slate-50 text-[13px] px-4 py-3 text-center"
          )}
          role="status"
        >
          {bottomNotice}
        </div>
      ) : null}
    </div>
  );
}
