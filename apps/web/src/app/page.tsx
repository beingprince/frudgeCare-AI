"use client";

/**
 * Landing — hackathon MVP entry.
 *
 * Two equal-weight CTAs:
 *   1. Patient Triage Demo  → /triage  (the AI hero — single screen, no login)
 *   2. Staff Console        → /console (unified panel shell — Front Desk · Nurse ·
 *                                       Provider · Operations in one tabbed surface)
 *
 * Tertiary chip row reminds the operator that the global Cmd+K AI Concierge
 * is reachable from anywhere, including this page.
 *
 * No auth. No persona switcher. No hidden routes. Anything else worth
 * showing is exactly one click away from one of these two screens.
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowUpRight,
  Activity,
  LayoutDashboard,
  Sparkles,
  Brain,
  Layers,
  Database,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

const ENTRY_POINTS = [
  {
    title: "Patient Triage Demo",
    eyebrow: "AI hero",
    href: "/triage",
    icon: Activity,
    description:
      "One screen, one symptom narrative, four AI layers. Watch NLP extraction, RAG-grounded guidelines, Gemini reasoning and the full downstream cascade fan out in real time.",
    bullets: ["NLP entity extraction", "RAG clinical guidelines", "Gemini reasoning", "FHIR CarePlan output"],
    accent: "#1565C0",
  },
  {
    title: "Staff Console",
    eyebrow: "Unified shell",
    href: "/console",
    icon: LayoutDashboard,
    description:
      "Front Desk queue, Nurse triage, Provider daily list and Operations KPIs collapsed into one tabbed surface. No sign-in, no role switcher — every panel is one click away.",
    bullets: ["Queue prioritization", "Vital sign validation", "Daily encounters", "Funnel analytics"],
    accent: "#0D47A1",
  },
];

const AI_LAYERS = [
  { icon: Brain, label: "LLM (Gemini 2.5 Flash-Lite)" },
  { icon: Database, label: "RAG over clinical guidelines" },
  { icon: Layers, label: "NLP regex entity extraction" },
  { icon: ShieldCheck, label: "Tier 0→3 safe fallback" },
];

export default function Home() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/mac/i.test(navigator.platform));
    }
  }, []);

  const openPalette = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fc:open-command-palette"));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 flex flex-col">
      {/* Top brand strip */}
      <div className="px-6 lg:px-12 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1565C0] flex items-center justify-center text-white font-black text-lg shadow-sm">
            F
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-slate-900 tracking-tight">
              FrudgeCare
            </div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#1565C0]">
              AI Healthcare Platform
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openPalette}
          className="hidden sm:inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-slate-200 bg-white hover:border-[#1565C0] hover:bg-[#1565C0]/5 transition-colors text-[13px] text-slate-500"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#1565C0]" />
          <span>Ask AI</span>
          <kbd className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10.5px] font-mono font-semibold text-slate-500">
            {isMac ? "⌘" : "Ctrl"}+K
          </kbd>
        </button>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-12 py-10">
        <div className="max-w-5xl w-full space-y-12">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center space-y-5"
          >
            <span className="inline-flex items-center gap-2 px-3 h-7 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              CareDevi AI Hackathon 2026 · MVP submission
            </span>

            <h1 className="text-[40px] lg:text-[56px] font-bold text-slate-900 tracking-tight leading-[1.05]">
              From symptom narrative to care plan in{" "}
              <span className="text-[#1565C0]">under three seconds</span>.
            </h1>

            <p className="text-[16px] text-slate-600 max-w-3xl mx-auto leading-relaxed">
              FrudgeCare collapses the entire triage workflow into one AI cascade —
              NLP extraction, RAG-grounded clinical guidelines, Gemini reasoning,
              and a downstream queue / nurse / provider fan-out — exposed through
              two screens and one global command bar. No login required.
            </p>
          </motion.div>

          {/* Two big CTAs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {ENTRY_POINTS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.08, duration: 0.4 }}
                >
                  <Link
                    href={p.href}
                    className="group block h-full bg-white rounded-2xl border border-slate-200 hover:border-[#1565C0] hover:shadow-xl transition-all p-7 no-underline"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm"
                        style={{ backgroundColor: p.accent }}
                      >
                        <Icon size={22} strokeWidth={1.75} />
                      </div>
                      <ArrowUpRight
                        size={20}
                        className="text-slate-300 group-hover:text-[#1565C0] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
                      />
                    </div>

                    <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#1565C0] mb-1">
                      {p.eyebrow}
                    </div>
                    <h2 className="text-[22px] font-bold text-slate-900 mb-2.5 tracking-tight">
                      {p.title}
                    </h2>
                    <p className="text-[13.5px] text-slate-600 leading-relaxed mb-4">
                      {p.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {p.bullets.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center px-2 h-6 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* AI layer chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              AI Stack
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {AI_LAYERS.map((l) => {
                const Icon = l.icon;
                return (
                  <span
                    key={l.label}
                    className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-slate-200 bg-white text-[11.5px] font-medium text-slate-600"
                  >
                    <Icon className="w-3.5 h-3.5 text-[#1565C0]" />
                    {l.label}
                  </span>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 lg:px-12 py-6 border-t border-slate-200 bg-white/60 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11.5px] text-slate-500">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-3.5 h-3.5 text-[#1565C0]" />
            <span>
              Built for the CareDevi AI Healthcare Innovation Hackathon · April
              2026
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10.5px] text-slate-400">
            <span>Next.js 16</span>
            <span>·</span>
            <span>FastAPI</span>
            <span>·</span>
            <span>Gemini 2.5</span>
            <span>·</span>
            <span>Tailwind</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
