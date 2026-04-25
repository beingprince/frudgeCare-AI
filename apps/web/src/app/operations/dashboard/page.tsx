"use client";

/**
 * Operations dashboard.
 * Tone: staff / operations — analytical, calm, controlled accent usage.
 * Routed through `.fc-card` primitives and unified section headers.
 */

import React, { useEffect, useState } from "react";
import { KPICard } from "@/components/shared/Cards";
import { PageHeader, SectionHeader } from "@/components/shared/PageHeader";
import { StatusChip } from "@/components/shared/StatusChip";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import {
  Activity, Users, Clock, AlertTriangle, Sparkles, Database, Shield,
} from "lucide-react";
import Link from "next/link";

// --- Mock Data ---
const FUNNEL_DATA = [
  { name: 'Intake',           count: 145 },
  { name: 'Nurse Triage',     count: 98  },
  { name: 'Provider Review',  count: 64  },
  { name: 'Resolved/Closed',  count: 42  },
];

const RESPONSE_TIME_DATA = [
  { time: '08:00', triage: 12, provider: 45 },
  { time: '10:00', triage: 18, provider: 35 },
  { time: '12:00', triage: 25, provider: 55 },
  { time: '14:00', triage: 15, provider: 30 },
  { time: '16:00', triage: 10, provider: 25 },
];

const LOAD_DIST_DATA = [
  { name: 'Dr. Carter', value: 24 },
  { name: 'Dr. Smith',  value: 18 },
  { name: 'Dr. Yoon',   value: 31 },
  { name: 'Dr. Patel',  value: 15 },
];

/** Chart palette — decorative series (spec 20 § 4.1). Primary brand + tonal grey. */
const CHART_SERIES = ['#0F4C81', '#0F766E', '#64748B', '#94A3B8'];
const PRIMARY  = '#0F4C81';
const SECONDARY = '#0F766E';

const BOTTLENECKS = [
  { stage: 'Awaiting Lab Results', count: 18, trend: '+4' },
  { stage: 'Patient Form Pending', count: 14, trend: '-2' },
  { stage: 'Provider Approval',    count: 9,  trend: '+1' },
];

const AUDIT_HIGHLIGHTS: { rule: string; occurrence: number; risk: 'Low'|'Med'|'High' }[] = [
  { rule: 'Suggestion overridden by clinician',   occurrence: 12, risk: 'Low'  },
  { rule: 'High urgency > 2-hour wait',           occurrence: 3,  risk: 'High' },
  { rule: 'Unsigned encounters',                  occurrence: 8,  risk: 'Med'  },
];

// --- Chart tooltip ---
interface TooltipPayload { color: string; name: string; value: number | string; }
const CustomTooltip = ({
  active, payload, label,
}: { active?: boolean; payload?: TooltipPayload[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="fc-card p-3 text-[12px]">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-500">{entry.name}:</span>
          <span className="font-medium text-slate-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

interface OpsKPIs {
  activeCases: number;
  avgTriageMinutes: number;
  providerBacklog: number;
  escalationRate: number;
  aiAccuracyRate: number;
  casesToday: number;
}

interface AIReliability {
  total: number;
  tier1Pct: number;
  tier2Pct: number;
  tier3Pct: number;
  llmSuccessRate: number;
  groundedRate: number;
}

const FALLBACK_KPIS: OpsKPIs = {
  activeCases: 145,
  avgTriageMinutes: 16,
  providerBacklog: 24,
  escalationRate: 0.042,
  aiAccuracyRate: 0.91,
  casesToday: 27,
};

const FALLBACK_RELIABILITY: AIReliability = {
  total: 0,
  tier1Pct: 0,
  tier2Pct: 0,
  tier3Pct: 0,
  llmSuccessRate: 0,
  groundedRate: 0,
};

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<OpsKPIs>(FALLBACK_KPIS);
  const [reliability, setReliability] = useState<AIReliability>(FALLBACK_RELIABILITY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/operations/kpis");
        if (!res.ok) return;
        const data: OpsKPIs = await res.json();
        if (!cancelled) setKpis(data);
      } catch {
        // Keep backup option KPIs — silent failure is fine on a dashboard.
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/operations/ai-reliability");
        if (!res.ok) return;
        const data: AIReliability = await res.json();
        if (!cancelled) setReliability(data);
      } catch {
        // Counters are temporary; absence is normal on a fresh process.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <PageHeader
        title="Operations dashboard"
        subtitle="Clinic throughput, response times, and model-assist reliability."
        actions={
          <span className="hidden sm:inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-[8px] text-[12px] font-medium">
            Last 24 hours
          </span>
        }
      />

      <div className="px-4 md:px-6 py-5 md:py-6 flex flex-col md:grid md:grid-cols-12 gap-4 md:gap-5 pb-10">
        {/* KPI row */}
        <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          <KPICard
            title="Active cases"
            value={String(kpis.activeCases)}
            icon={<Activity size={18} strokeWidth={1.75} />}
            info="Cases that are open across all stages — intake, triage, or provider review."
            trend={{ direction: "up", label: `+${kpis.casesToday} today`, tone: "neutral" }}
            footer={<span className="text-slate-500 font-medium">{kpis.casesToday} new today</span>}
          />
          <KPICard
            title="Avg triage time"
            value={`${kpis.avgTriageMinutes}m`}
            icon={<Clock size={18} strokeWidth={1.75} />}
            info="Median minutes from intake submission to nurse handoff."
            trend={{ direction: "up", label: "over target", tone: "negative" }}
            footer={<span className="text-slate-500 font-medium">Target 12m</span>}
          />
          <KPICard
            title="Provider backlog"
            value={String(kpis.providerBacklog)}
            icon={<Users size={18} strokeWidth={1.75} />}
            info="Open cases assigned to a provider but not yet seen."
            trend={{ direction: "down", label: "vs yesterday", tone: "positive" }}
            footer={<span className="text-slate-500 font-medium">Across all providers</span>}
          />
          <KPICard
            title="Escalation rate"
            value={`${(kpis.escalationRate * 100).toFixed(1)}%`}
            icon={<AlertTriangle size={18} strokeWidth={1.75} />}
            info="Share of cases escalated to a higher urgency by nurse or provider."
            emphasis
            className="fc-highlight-warn"
            footer={<span className="text-slate-500 font-medium">Model concordance {(kpis.aiAccuracyRate * 100).toFixed(0)}%</span>}
          />
        </div>

        {/* Decision-support reliability — distribution across response tiers. */}
        <div className="md:col-span-12 fc-card p-5">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={16} className="text-[#1565C0]" />
                <h3 className="fc-section-title">Decision-support reliability</h3>
                <InfoTooltip
                  label="Decision-support reliability"
                  description="Every model-assist response flows through a cascade: knowledge-base retrieval, model verification, knowledge-base only, and finally a rule-based safe default. This card shows which tier actually served traffic in the current session."
                />
                <span className="fc-badge fc-badge-soft">live</span>
              </div>
              <p className="text-[12px] text-slate-500 leading-relaxed max-w-xl">
                Every suggestion is traced back to its source — knowledge base, model, or rule. Use this to track where the system depends on the language model vs. its grounded fallbacks.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-semibold tracking-tight text-slate-900 tabular-nums">
                {reliability.groundedRate.toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-500">grounded in source data</div>
              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{reliability.total} calls tracked</div>
            </div>
          </div>

          {/* Tier distribution bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex mb-3">
            <div className="h-full bg-violet-500" style={{ width: `${reliability.tier1Pct}%` }} title={`Model + KB: ${reliability.tier1Pct}%`} />
            <div className="h-full bg-teal-500"   style={{ width: `${reliability.tier2Pct}%` }} title={`KB only: ${reliability.tier2Pct}%`} />
            <div className="h-full bg-amber-500"  style={{ width: `${reliability.tier3Pct}%` }} title={`Safe default: ${reliability.tier3Pct}%`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-start gap-2 p-3 border border-violet-200 bg-violet-50/60 rounded-[10px]">
              <Sparkles size={14} className="text-violet-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-semibold text-violet-800 tabular-nums">{reliability.tier1Pct.toFixed(1)}%</span>
                  <span className="fc-badge fc-badge-primary">Model + KB</span>
                </div>
                <div className="text-[11px] text-slate-500">Reasoning model checked against knowledge base</div>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 border border-teal-200 bg-teal-50/60 rounded-[10px]">
              <Database size={14} className="text-teal-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-semibold text-teal-800 tabular-nums">{reliability.tier2Pct.toFixed(1)}%</span>
                  <span className="fc-badge fc-badge-soft">KB only</span>
                </div>
                <div className="text-[11px] text-slate-500">Model unavailable — response built from knowledge base</div>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 border border-amber-200 bg-amber-50/60 rounded-[10px]">
              <Shield size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-semibold text-amber-800 tabular-nums">{reliability.tier3Pct.toFixed(1)}%</span>
                  <span className="fc-badge fc-badge-warn">Safe default</span>
                </div>
                <div className="text-[11px] text-slate-500">No model, no match — conservative rule-based floor</div>
              </div>
            </div>
          </div>
        </div>

        {/* Funnel */}
        <div className="md:col-span-6 fc-card p-5 flex flex-col min-h-[300px] md:h-[320px]">
          <SectionHeader
            title="Patient throughput funnel"
            info="Counts by workflow stage over the last 24 hours. Drop-offs between stages indicate handoff lag."
          />
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={FUNNEL_DATA} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }} width={120} axisLine={false} tickLine={false} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="count" fill={PRIMARY} radius={[0, 4, 4, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottlenecks */}
        <div className="md:col-span-6 fc-card p-5 flex flex-col min-h-[300px] md:h-[320px]">
          <SectionHeader
            title="Active bottlenecks"
            info="Stages where cases are waiting longest. Trend is day-over-day."
          />
          <div className="flex flex-col gap-2">
            {BOTTLENECKS.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 border border-slate-200 rounded-[10px] hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-[#0F4C81] text-[14px]">
                    {b.count}
                  </div>
                  <span className="font-medium text-slate-700 text-[13px]">{b.stage}</span>
                </div>
                <div
                  className={`text-[12px] font-semibold ${
                    b.trend.startsWith('+') ? 'text-[#C62828]' : 'text-emerald-600'
                  }`}
                >
                  {b.trend} today
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/front-desk/queue"
            className="mt-4 py-2 text-[12px] font-semibold text-[#0F4C81] hover:underline underline-offset-4 text-left self-start fc-focus-ring"
          >
            View full queue report →
          </Link>
        </div>

        {/* Processing trend */}
        <div className="lg:col-span-8 md:col-span-12 fc-card p-5 flex flex-col h-[300px] md:h-[320px]">
          <SectionHeader
            title="Processing time trend"
            subtitle="Minutes per stage, 8 AM – 4 PM"
            info="Time from case entry to stage completion. Lower is better."
          />
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={RESPONSE_TIME_DATA} margin={{ left: -20, right: 10, top: 10 }}>
                <defs>
                  <linearGradient id="fcTriage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SECONDARY} stopOpacity={0.18}/>
                    <stop offset="95%" stopColor={SECONDARY} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="fcProvider" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.22}/>
                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area type="monotone" name="Provider Review" dataKey="provider" stroke={PRIMARY}   strokeWidth={2} fillOpacity={1} fill="url(#fcProvider)" />
                <Area type="monotone" name="Nurse Triage"    dataKey="triage"   stroke={SECONDARY} strokeWidth={2} fillOpacity={1} fill="url(#fcTriage)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Load distribution */}
        <div className="lg:col-span-4 md:col-span-12 fc-card p-5 flex flex-col min-h-[280px] md:h-[320px]">
          <SectionHeader
            title="Provider load"
            info="Active case count per provider today. Used for rebalancing assignments."
          />
          <div className="flex-1 min-h-[160px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={LOAD_DIST_DATA} innerRadius={58} outerRadius={78} paddingAngle={2} dataKey="value">
                  {LOAD_DIST_DATA.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
              <span className="text-[24px] font-semibold text-slate-900 tracking-tight">88</span>
              <span className="fc-eyebrow">Active</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
            {LOAD_DIST_DATA.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-[12px] text-slate-600">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_SERIES[index] }} />
                {entry.name}
              </div>
            ))}
          </div>
        </div>

        {/* Scheduling quality */}
        <div className="md:col-span-6 fc-card p-5 h-auto md:h-[280px]">
          <SectionHeader
            title="Scheduling quality"
            info="How appointments ended yesterday: kept, rescheduled within 24 hours, or missed."
          />
          <div className="flex flex-col gap-5 mt-2">
            {[
              { label: 'Appointments Kept',     value: 84, tone: 'bg-emerald-500' },
              { label: 'Rescheduled (<24hr)',   value: 11, tone: 'bg-[#E65100]' },
              { label: 'No-shows',              value: 5,  tone: 'bg-[#C62828]' },
            ].map(row => (
              <div key={row.label}>
                <div className="text-[12px] text-slate-500 font-medium mb-1.5 flex justify-between">
                  <span>{row.label}</span>
                  <span className="font-semibold text-slate-900">{row.value}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${row.tone}`} style={{ width: `${row.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit highlights */}
        <div className="md:col-span-6 fc-card p-5 h-auto md:h-[280px]">
          <SectionHeader
            title="Audit highlights"
            info="Rules triggered in the current window. Click a row to jump to the full audit log."
          />
          <div className="flex flex-col border border-slate-200 rounded-[10px] overflow-hidden">
            <div className="grid grid-cols-12 gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200 fc-eyebrow">
              <div className="col-span-8">Rule triggered</div>
              <div className="col-span-2 text-center">Events</div>
              <div className="col-span-2 text-center">Risk</div>
            </div>
            {AUDIT_HIGHLIGHTS.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-2 px-3 py-2.5 border-b last:border-b-0 border-slate-100 items-center text-[13px]"
              >
                <div className="col-span-8 font-medium text-slate-700">{item.rule}</div>
                <div className="col-span-2 text-center font-semibold text-slate-900">{item.occurrence}</div>
                <div className="col-span-2 flex justify-center">
                  <StatusChip
                    size="compact"
                    status={
                      item.risk === 'High' ? 'urgency-high'
                      : item.risk === 'Med' ? 'urgency-medium'
                      : 'urgency-low'
                    }
                    label={item.risk}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
