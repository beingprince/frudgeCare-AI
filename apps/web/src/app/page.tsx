"use client";

/**
 * Landing — FrudgeCare demo entry (patient-facing theme per UX foundations:
 * primary #0F4C81, calm copy, no favicon, no “AI stack” jargon on the public hero).
 *
 * Staff workflows live under /console; this page stays human and readable.
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowUpRight,
  LayoutDashboard,
  HeartPulse,
  ClipboardList,
  Users,
  Stethoscope,
} from "lucide-react";

const ENTRY_POINTS = [
  {
    title: "Start your visit (demo)",
    eyebrow: "Patients & guests",
    href: "/triage",
    icon: HeartPulse,
    description:
      "Describe what you are feeling in plain language. Your answers are organized into a clear summary the front desk and nurse can use—before you see a clinician.",
    bullets: ["No account required", "Mobile-friendly", "You stay in control of what is shared"],
  },
  {
    title: "Clinical decision support (demo)",
    eyebrow: "Transparent assist",
    href: "/agent",
    icon: ClipboardList,
    description:
      "See how guided checks (vitals ranges, interaction hints, and clinical references) are combined into a single recommendation you can read step by step.",
    bullets: ["Shows each check", "Uses the same knowledge base as triage", "Designed for review, not autopilot"],
  },
  {
    title: "Staff workspace",
    eyebrow: "Care team",
    href: "/console",
    icon: LayoutDashboard,
    description:
      "Front desk queue, nurse triage, provider review, and operations in one place—aligned with the staff console spec (dense, task-first layout).",
    bullets: ["Queue & handoffs", "Nurse validation", "Provider decisions"],
  },
];

const STEPS = [
  { title: "Tell us what is wrong", body: "Your story is captured once and carried forward—no retyping at the window." },
  { title: "The right person reviews", body: "Front desk, triage nurse, and provider each see what they need—when it is their turn." },
  { title: "Clear next steps", body: "You get a simple status view; the team gets structured notes for safe follow-up." },
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
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      {/* Top brand strip — patient scope: CSS var primary */}
      <div className="px-5 md:px-8 lg:px-12 py-5 flex items-center justify-between border-b border-[#E2E8F0] bg-white/90">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[var(--radius-card)] flex items-center justify-center text-white font-bold text-lg shadow-resting"
            style={{ backgroundColor: "var(--primary)" }}
          >
            F
          </div>
          <div className="leading-tight">
            <div className="fc-page-title text-[20px] md:text-[22px]">FrudgeCare</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Coordinated intake &amp; handoff (demo)
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openPalette}
          className="hidden sm:inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-[var(--radius-control)] border border-[#E2E8F0] bg-white hover:border-[var(--primary)] hover:bg-slate-50 transition-colors text-[13px] text-slate-600 fc-focus-ring"
        >
          <span>Shortcuts</span>
          <kbd className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10.5px] font-mono font-semibold text-slate-500">
            {isMac ? "⌘" : "Ctrl"}+K
          </kbd>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-12 py-10 md:py-14">
        <div className="max-w-5xl w-full space-y-10 md:space-y-12">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="text-center space-y-4"
          >
            <span className="inline-flex items-center gap-2 px-3 h-7 rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              CareDevi Healthcare Innovation Hackathon · April 2026
            </span>

            <h1 className="text-[32px] md:text-[44px] font-bold text-slate-900 tracking-tight leading-[1.12]">
              Care that starts with{" "}
              <span style={{ color: "var(--primary)" }}>listening</span>, not paperwork.
            </h1>

            <p className="text-[15px] md:text-[16px] text-slate-600 max-w-2xl mx-auto leading-relaxed">
              FrudgeCare is a demo of a single, connected path from your first description of symptoms
              to the moment a provider is ready to see you—with nursing and front desk handoffs
              in between, so nothing gets lost.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {ENTRY_POINTS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.href}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + i * 0.06, duration: 0.35 }}
                >
                  <Link
                    href={p.href}
                    className="group block h-full fc-card fc-card-interactive p-6 md:p-7 no-underline"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-12 h-12 rounded-[var(--radius-card)] flex items-center justify-center text-white shadow-resting"
                        style={{ backgroundColor: "var(--primary)" }}
                      >
                        <Icon size={22} strokeWidth={1.75} />
                      </div>
                      <ArrowUpRight
                        size={20}
                        className="text-slate-300 group-hover:text-[var(--primary)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
                      />
                    </div>

                    <div className="fc-eyebrow mb-1 text-[var(--primary)]">{p.eyebrow}</div>
                    <h2 className="text-[19px] font-bold text-slate-900 mb-2 tracking-tight">
                      {p.title}
                    </h2>
                    <p className="text-[13.5px] text-slate-600 leading-relaxed mb-4">
                      {p.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {p.bullets.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center px-2.5 h-6 rounded-[6px] border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600"
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

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.35 }}
            className="fc-card p-6 md:p-8 max-w-3xl mx-auto"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-[var(--primary)]" aria-hidden />
              <h3 className="fc-section-title text-[15px]">How the demo is meant to feel</h3>
            </div>
            <ol className="space-y-4">
              {STEPS.map((s, idx) => (
                <li key={s.title} className="flex gap-4">
                  <span
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                    style={{ backgroundColor: "var(--primary)" }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold text-slate-900">{s.title}</div>
                    <p className="text-[13px] text-slate-600 mt-0.5 leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.div>
        </div>
      </div>

      <footer className="px-5 md:px-8 lg:px-12 py-6 border-t border-[#E2E8F0] bg-white/80">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-slate-500">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-[var(--primary)]" aria-hidden />
            <span>FrudgeCare demo · McNeeseCodes_ · Not for real clinical use.</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Built with care-first UI tokens</span>
            <span aria-hidden>·</span>
            <span>Staff views use the clinical console theme</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
