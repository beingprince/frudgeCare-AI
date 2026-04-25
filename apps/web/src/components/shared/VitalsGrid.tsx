import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single nurse-recorded vital reading.
 * The component takes an array — when the data model grows
 * (pulse, temp, SpO2, resp rate, weight, height…) no UI change is needed.
 */
export type Vital = {
  id: string;
  /** Human label, e.g. "Blood pressure". */
  label: string;
  /** Displayed value, e.g. "158 / 92". */
  value: string;
  /** Unit, e.g. "mmHg", "bpm", "°F", "%". Show on screen in slate-400. */
  unit?: string;
  /** When true, the value is show on screen in rose + an alert icon is shown. */
  abnormal?: boolean;
  /** Optional time taken, e.g. "09:40". */
  takenAt?: string;
};

/**
 * Vitals readout — compact measurement grid.
 *
 * - 1 col on narrow, 2 cols from `sm`, 3 cols from `md`.
 * - Empty array show on screen a calm "not recorded" line instead of an empty grid.
 * - Abnormal readings get a single, restrained semantic signal (rose text + icon).
 */
export function VitalsGrid({
  vitals,
  className,
}: {
  vitals: Vital[];
  className?: string;
}) {
  if (!vitals.length) {
    return (
      <p className={cn("text-[13px] text-slate-500 italic", className)}>
        No vitals recorded in this encounter.
      </p>
    );
  }

  return (
    <dl
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4",
        className,
      )}
    >
      {vitals.map((v) => (
        <div key={v.id} className="min-w-0">
          <dt className="fc-eyebrow mb-1 flex items-center gap-1">
            <span className="truncate">{v.label}</span>
            {v.abnormal && (
              <AlertTriangle
                className="w-3 h-3 text-rose-500 flex-shrink-0"
                aria-label="Abnormal"
              />
            )}
          </dt>
          <dd
            className={cn(
              "text-[15px] font-semibold leading-tight tabular-nums",
              v.abnormal ? "text-rose-700" : "text-slate-900",
            )}
          >
            {v.value}
            {v.unit && (
              <span className="ml-1 text-[12px] font-medium text-slate-400">
                {v.unit}
              </span>
            )}
          </dd>
          {v.takenAt && (
            <div className="mt-0.5 text-[11px] text-slate-400">
              Taken {v.takenAt}
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}
