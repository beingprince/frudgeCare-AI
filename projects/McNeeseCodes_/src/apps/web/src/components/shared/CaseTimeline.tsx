import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, type LucideIcon } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  icon: LucideIcon;
  title: string;
  actorRole: string;
  timestamp: string;
  handoffSummary?: string;
  nextOwnerRole?: string;
  remarks?: string;
  isAbnormal?: boolean;
  isActive?: boolean;
  /** Shown only for the active step when `journeyEmphasis` is on (patient status). */
  activeCaption?: string;
}

interface CaseTimelineProps {
  events: TimelineEvent[];
  className?: string;
  /**
   * Stronger “you are here” styling: green done segments, muted future,
   * colored connector lines, and optional active caption.
   */
  journeyEmphasis?: boolean;
}

export function CaseTimeline({ events, className, journeyEmphasis }: CaseTimelineProps) {
  const activeIndex = events.findIndex(e => e.isActive);
  return (
    <div className={cn("relative flex flex-col gap-4", className)}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const isDone = journeyEmphasis && activeIndex >= 0 && index < activeIndex;
        const isActive = event.isActive;
        const isUpcoming = journeyEmphasis && activeIndex >= 0 && index > activeIndex;
        const segmentComplete = journeyEmphasis && activeIndex >= 0 && index < activeIndex;

        return (
          <div key={event.id} className="relative flex gap-4">
            {/* Timeline connector — green through completed, neutral ahead */}
            {!isLast && (
              <div
                className={cn(
                  "absolute left-[15px] top-[32px] bottom-[-16px] w-[2px]",
                  segmentComplete ? "bg-emerald-400/80" : "bg-slate-200",
                )}
                aria-hidden
              />
            )}

            {/* Icon node */}
            <div
              className={cn(
                "relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 bg-white transition-[box-shadow,transform] duration-200",
                !journeyEmphasis && event.isActive && "border-[#0F4C81] text-[#0F4C81]",
                !journeyEmphasis && !event.isActive && "border-slate-200 text-slate-400",
                journeyEmphasis && isDone && "border-emerald-500 bg-emerald-50/90 text-emerald-800",
                journeyEmphasis && isActive && "z-20 border-[#0F4C81] text-[#0F4C81] bg-white shadow-md ring-4 ring-[#0F4C81]/12",
                journeyEmphasis && isUpcoming && "border-slate-200/90 bg-slate-50/80 text-slate-400",
                event.isAbnormal && "border-red-500 bg-red-50 text-red-600",
              )}
            >
              {journeyEmphasis && isDone ? (
                <span className="text-[12px] font-bold text-emerald-700" aria-hidden>✓</span>
              ) : (
                <event.icon className="h-4 w-4" />
              )}
            </div>

            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1.5 pb-2",
                isActive && "opacity-100",
                !isActive && (journeyEmphasis ? "opacity-75" : "opacity-80 hover:opacity-100"),
                "transition-opacity",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex max-w-[80%] items-start gap-2">
                  <span
                    className={cn(
                      "leading-snug",
                      !journeyEmphasis && "text-[14px] font-semibold",
                      !journeyEmphasis && isActive && "text-slate-900",
                      !journeyEmphasis && !isActive && "text-slate-700",
                      journeyEmphasis && isActive && "text-[16px] font-bold text-slate-900",
                      journeyEmphasis && isUpcoming && "text-[14px] font-semibold text-slate-500",
                      journeyEmphasis && isDone && "text-[14px] font-semibold text-slate-600",
                      event.isAbnormal && "text-red-700",
                    )}
                  >
                    {event.title}
                  </span>
                  {event.isAbnormal && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" />}
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap pt-0.5 text-[12px] font-medium",
                    isActive ? "text-[#0F4C81]" : "text-slate-500",
                  )}
                >
                  {event.timestamp}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] font-medium text-slate-500">
                <span className="flex-shrink-0 text-slate-700">{event.actorRole}</span>
                {event.handoffSummary && (
                  <>
                    <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-300" />
                    <span className="line-clamp-1">{event.handoffSummary}</span>
                  </>
                )}
              </div>

              {journeyEmphasis && isActive && event.activeCaption && (
                <p className="mt-1 max-w-md rounded-md border border-[#0F4C81]/15 bg-[#0F4C81]/[0.04] px-2.5 py-2 text-[13px] leading-snug text-slate-700">
                  {event.activeCaption}
                </p>
              )}

              {event.remarks && (
                <div className="text-[13px] text-slate-600 bg-slate-50 border border-slate-100 rounded-md p-2.5 mt-1 leading-relaxed">
                  {event.remarks}
                </div>
              )}

              {event.nextOwnerRole && (
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0F4C81] mt-1">
                  <span>→ Handoff to:</span>
                  <span>{event.nextOwnerRole}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
