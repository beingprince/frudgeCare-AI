"use client";

/**
 * /console — Unified AI-driven staff shell.
 *
 * MVP collapse target: replaces 17 scattered staff pages with one tabbed
 * surface. Each tab embeds the existing panel page as-is so we don't lose
 * fidelity, but the operator never has to navigate / sign in / pick a role.
 *
 * Header lives only here (sidebar bypass — see AppShell BYPASS_EXACT). The
 * Cmd/Ctrl+K palette is mounted globally in layout.tsx and is reachable from
 * every page; the hint badge in the header is just the discoverability tease.
 *
 * Tab content is lazy-imported so the first paint of /console is just the
 * chrome — heavy panels only mount when their tab is selected (and stay
 * mounted on subsequent switches via React's `lazy` cache).
 */

import React, { lazy, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ClipboardList,
  Stethoscope,
  HeartPulse,
  Activity,
  BarChart3,
  Sparkles,
  Command,
  ArrowUpRight,
  Loader2,
} from "lucide-react";

// Lazy-import each panel page directly. They're "use client" default exports
// and self-contained (own toolbar / data fetch / dialogs).
const FrontDeskQueue = lazy(() => import("@/app/front-desk/queue/page"));
const NurseList = lazy(() => import("@/app/nurse/page"));
const ProviderDaily = lazy(() => import("@/app/provider/daily/page"));
const OpsDashboard = lazy(() => import("@/app/operations/dashboard/page"));

type TabId = "front-desk" | "nurse" | "provider" | "operations";

interface TabDef {
  id: TabId;
  label: string;
  sub: string;
  icon: React.ElementType;
  Component: React.ComponentType;
  accent: string;
}

const TABS: TabDef[] = [
  {
    id: "front-desk",
    label: "Front Desk",
    sub: "Queue · Assign · Schedule",
    icon: ClipboardList,
    Component: FrontDeskQueue,
    accent: "#1565C0",
  },
  {
    id: "nurse",
    label: "Nurse",
    sub: "Triage · Vitals · Handoff",
    icon: HeartPulse,
    Component: NurseList,
    accent: "#0F766E",
  },
  {
    id: "provider",
    label: "Provider",
    sub: "Daily list · Disposition",
    icon: Stethoscope,
    Component: ProviderDaily,
    accent: "#9333EA",
  },
  {
    id: "operations",
    label: "Operations",
    sub: "KPIs · Funnel · AI insights",
    icon: BarChart3,
    Component: OpsDashboard,
    accent: "#0D47A1",
  },
];

function isTabId(v: string | null): v is TabId {
  return (
    v === "front-desk" || v === "nurse" || v === "provider" || v === "operations"
  );
}

export default function ConsolePage() {
  // useSearchParams must be inside a Suspense boundary in Next.js 16.
  return (
    <Suspense fallback={<div className="h-screen bg-[#F4F6F8]" />}>
      <ConsoleInner />
    </Suspense>
  );
}

function ConsoleInner() {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<TabId>("front-desk");
  const [isMac, setIsMac] = useState(false);

  // Deep-link support: /console?tab=nurse (sent by Cmd+K concierge results
  // and by external buttons that want to jump to a specific panel).
  useEffect(() => {
    const t = searchParams?.get("tab");
    if (isTabId(t)) setActive(t);
  }, [searchParams]);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/mac/i.test(navigator.platform));
    }
  }, []);

  const ActiveComponent =
    TABS.find((t) => t.id === active)?.Component ?? FrontDeskQueue;
  const activeTab = TABS.find((t) => t.id === active);

  const openCommandPalette = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fc:open-command-palette"));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F4F6F8]">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4 px-5 h-14">
          <Link
            href="/"
            className="flex items-center gap-2 group"
            aria-label="Back to entry"
          >
            <div className="w-9 h-9 rounded-xl bg-[#1565C0] flex items-center justify-center text-white font-black text-base shadow-sm group-hover:shadow-md transition-shadow">
              F
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-[14px] font-bold text-slate-900 tracking-tight">
                FrudgeCare
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#1565C0]">
                AI Console
              </span>
            </div>
          </Link>

          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-[10.5px] font-semibold text-emerald-700 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Demo · No login
          </span>

          <div className="flex-1" />

          {/* Cmd+K trigger — clickable hint that opens the global palette */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden sm:inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition-colors text-[13px] text-slate-500"
            aria-label="Open AI command palette"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1565C0]" />
            <span>Ask AI anything…</span>
            <kbd className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10.5px] font-mono font-semibold text-slate-500">
              {isMac ? "⌘" : "Ctrl"}
              <span className="opacity-60">+</span>K
            </kbd>
          </button>

          <Link
            href="/triage"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#1565C0] hover:bg-[#0D47A1] text-white text-[13px] font-semibold shadow-sm transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Patient Triage Demo</span>
            <span className="sm:hidden">Triage</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
          </Link>
        </div>

        {/* ── TABS ─────────────────────────────────────────────────────── */}
        <nav
          className="flex items-stretch gap-1 px-3 overflow-x-auto"
          role="tablist"
          aria-label="Console panels"
        >
          {TABS.map((t) => {
            const isActive = t.id === active;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.id)}
                className={`relative inline-flex items-center gap-2 h-11 px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-[#1565C0]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: isActive ? t.accent : undefined }}
                />
                <span className="font-semibold">{t.label}</span>
                <span className="hidden lg:inline text-[11.5px] text-slate-400 font-normal">
                  · {t.sub}
                </span>
                {isActive && (
                  <span
                    className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t-full"
                    style={{ backgroundColor: t.accent }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ── PANEL BODY ───────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-[13px]">
                Loading {activeTab?.label ?? "panel"}…
              </span>
            </div>
          }
        >
          {/* Mount each tab independently so they keep their own state. */}
          <div className={active === "front-desk" ? "block h-full" : "hidden"}>
            <FrontDeskQueue />
          </div>
          <div className={active === "nurse" ? "block h-full" : "hidden"}>
            <NurseList />
          </div>
          <div className={active === "provider" ? "block h-full" : "hidden"}>
            <ProviderDaily />
          </div>
          <div className={active === "operations" ? "block h-full" : "hidden"}>
            <OpsDashboard />
          </div>
        </Suspense>
      </main>
    </div>
  );
}
