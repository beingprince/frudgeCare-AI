"use client";

/**
 * InfoTooltip — a small info (i) affordance that explains a label or metric.
 *
 * Built on MUI Tooltip + lucide Info so it works everywhere MUI show on screen and
 * respects keyboard focus (press Tab, the tooltip appears automatically).
 *
 * Use cases
 *  - KPI titles: explain what a metric counts or how it's computed
 *  - Column headers: explain a calculated field
 *  - Form labels: explain an unusual field without adding helper text
 *
 * Design spec
 *  - Icon size: 13 px (inline with eyebrow / fc-section-title)
 *  - Color: slate-400 idle → slate-600 hover
 *  - Tooltip: 320 px max width, left-aligned body copy, arrow-less
 */

import * as React from "react";
import { Tooltip } from "@mui/material";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InfoTooltipProps {
  label: string;
  description?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function InfoTooltip({
  label,
  description,
  side = "top",
  className,
}: InfoTooltipProps) {
  const content = (
    <div className="max-w-[300px] py-0.5">
      <div className="text-[12px] font-semibold text-white leading-4">{label}</div>
      {description && (
        <div className="text-[11.5px] text-white/80 leading-[16px] mt-0.5">
          {description}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip
      title={content}
      placement={side}
      arrow={false}
      enterDelay={120}
      leaveDelay={50}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "#0F172A",
            color: "#FFFFFF",
            px: 1.25,
            py: 0.875,
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
            "& .MuiTooltip-arrow": { color: "#0F172A" },
          },
        },
      }}
    >
      <button
        type="button"
        aria-label={`More info: ${label}`}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 transition-colors",
          "fc-focus-ring align-middle",
          className,
        )}
      >
        <Info className="w-[13px] h-[13px]" strokeWidth={2} />
      </button>
    </Tooltip>
  );
}
