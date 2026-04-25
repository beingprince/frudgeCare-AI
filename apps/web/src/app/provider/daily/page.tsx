"use client";

/**
 * app/provider/daily/page.tsx
 * FrudgeCare Provider — Today's Encounter List
 *
 * Visual rewrite (scope: /provider/daily only):
 *  - Uses platform primitives (PageHeader, SectionHeader, KPICard, UrgencyChip,
 *    SkeletonCard, EmptyState) so this page now shares the same visual
 *    rhythm as /operations/dashboard and /front-desk/queue.
 *  - One urgency signal per card (top border for urgent slots; UrgencyChip in
 *    the meta row — no pulse halos, no duplicate "URGENT" chips).
 *  - No nested card-in-card for the chief complaint — it's an indented
 *    paragraph block inside the card (spec 90 § Rhythm).
 *  - "Remaining" KPI is computed honestly against the current time.
 *  - Decorative motion removed on staff pages (spec 20 § Tone).
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, AlertTriangle, Timer, ChevronRight, MapPin, Hash,
} from "lucide-react";

import { PageHeader, SectionHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/Cards";
import { UrgencyChip } from "@/components/shared/StatusChip";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

import {
  getMockAppointmentsByProvider,
  type MockAppointment,
} from "@/lib/mock-service";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const PROVIDER_ID = "usr_pr_001";

// Normalises low/medium/high → UrgencyChip.level
function toUrgencyLevel(u: string | null | undefined): "low" | "medium" | "high" {
  if (u === "high") return "high";
  if (u === "medium") return "medium";
  return "low";
}

// "08:30" + a reference minutes-of-day → true if the appointment is still ahead
function isUpcoming(startTime: string, nowMinutes: number): boolean {
  const [h, m] = startTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return true;
  return h * 60 + m >= nowMinutes;
}

// APPOINTMENT CARD
function AppointmentCard({ appt }: { appt: MockAppointment }) {
  const urgencyRaw =
    (appt.case.urgency_final ?? appt.case.urgency_suggested) as string | null;
  const level = toUrgencyLevel(urgencyRaw);
  const isUrgentSlot = Boolean(appt.urgent_slot);

  return (
    <Link
      href={`/provider/case/${appt.case_id}`}
      className="fc-card fc-card-interactive block p-0 overflow-hidden fc-focus-ring"
      aria-label={`Open case ${appt.case.case_code} for ${appt.patient.full_name}`}
    >
      {isUrgentSlot && (
        <div
          aria-hidden="true"
          className="h-[3px] bg-rose-500"
        />
      )}
      <div className="flex items-stretch gap-4 p-4 md:p-5">
        {/* Time column — calm, no hanging border */}
        <div className="w-[72px] flex-shrink-0 flex flex-col items-start md:items-center justify-center">
          <div className="text-[17px] md:text-[18px] font-semibold text-slate-900 tracking-tight leading-none">
            {appt.start_time}
          </div>
          <div className="mt-1 text-[11px] font-medium text-slate-400 leading-none">
            {appt.end_time}
          </div>
        </div>

        <div className="hidden md:block w-px bg-slate-200 flex-shrink-0" aria-hidden="true" />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          {/* Row 1: patient + urgency chip */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-slate-900 leading-tight truncate">
                {appt.patient.full_name}
              </div>
              <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                {appt.patient.patient_code} · DOB {appt.patient.date_of_birth}
              </div>
            </div>
            <div className="flex-shrink-0">
              <UrgencyChip level={level} />
            </div>
          </div>

          {/* Row 2: chief complaint — calm indented block, no nested card */}
          <div className="border-l-2 border-slate-200 pl-3">
            <div className="fc-eyebrow mb-0.5">Chief complaint</div>
            <p className="text-[13px] leading-[19px] text-slate-700 line-clamp-2">
              {appt.case.symptom_text}
            </p>
          </div>

          {/* Row 3: meta — location + case code only */}
          <div className="flex items-center gap-4 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
              <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">{appt.location_label}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-slate-400" />
              {appt.case.case_code}
            </span>
          </div>
        </div>

        {/* Chevron */}
        <div className="flex items-center flex-shrink-0 text-slate-300">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}

// MAIN
export default function ProviderDaily() {
  const [appointments, setAppointments] = useState<MockAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchDaily = async () => {
      if (isSupabaseConfigured()) {
        try {
          const fetchPromise = supabase
            .from("appointments")
            .select(
              "*, case:cases(*, patient:patient_profiles(*), patient_id), patient:patient_profiles(*)",
            )
            .eq("provider_user_id", PROVIDER_ID)
            .eq("status", "confirmed");

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 500),
          );

          const { data, error } = (await Promise.race([
            fetchPromise,
            timeoutPromise,
          ])) as { data: MockAppointment[] | null; error: unknown };

          if (!cancelled && !error && data && data.length > 0) {
            setAppointments(data);
            setLoading(false);
            return;
          }
        } catch {
          /* fall through to mock */
        }
      }
      if (!cancelled) {
        setAppointments(getMockAppointmentsByProvider(PROVIDER_ID));
        setLoading(false);
      }
    };
    fetchDaily();
    return () => {
      cancelled = true;
    };
  }, []);

  const { scheduled, urgent, remaining, sortedAppts } = useMemo(() => {
    const sorted = [...appointments].sort((a, b) =>
      a.start_time.localeCompare(b.start_time),
    );
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return {
      scheduled: sorted.length,
      urgent: sorted.filter(a => a.urgent_slot).length,
      remaining: sorted.filter(a => isUpcoming(a.start_time, nowMinutes)).length,
      sortedAppts: sorted,
    };
  }, [appointments]);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <PageHeader
        eyebrow="Provider"
        title="Today's Encounters"
        subtitle={todayLabel}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto w-full max-w-[960px] px-4 md:px-6 py-5 md:py-6 flex flex-col gap-6">
          {/* KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <KPICard
              title="Scheduled"
              value={loading ? "—" : scheduled}
              icon={<CalendarDays className="h-4 w-4" />}
              footer="Total appointments today"
            />
            <KPICard
              title="Urgent"
              value={loading ? "—" : urgent}
              icon={<AlertTriangle className="h-4 w-4" />}
              footer={urgent > 0 ? "Flagged priority slots" : "No urgent cases"}
            />
            <KPICard
              title="Remaining"
              value={loading ? "—" : remaining}
              icon={<Timer className="h-4 w-4" />}
              footer={
                remaining === 0
                  ? "All appointments completed"
                  : `${remaining} still ahead`
              }
            />
          </div>

          {/* Schedule list */}
          <section>
            <SectionHeader
              title="Today's schedule"
              subtitle={
                loading
                  ? "Loading…"
                  : scheduled === 0
                    ? "Nothing booked"
                    : `${scheduled} appointment${scheduled === 1 ? "" : "s"}, sorted by start time`
              }
            />

            <div className="flex flex-col gap-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))
              ) : sortedAppts.length === 0 ? (
                <div className="fc-card p-0 overflow-hidden">
                  <EmptyState
                    icon="inbox"
                    title="No appointments today"
                    description="Your schedule is clear. New cases will appear here as they're confirmed."
                  />
                </div>
              ) : (
                sortedAppts.map(appt => (
                  <AppointmentCard key={appt.id} appt={appt} />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
