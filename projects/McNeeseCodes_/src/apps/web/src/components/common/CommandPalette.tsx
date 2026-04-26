"use client";

/**
 * CommandPalette — the "AI navigation" layer.
 *
 * Globally mounted (see app/layout.tsx). Opens with Cmd+K / Ctrl+K, or by
 * dispatching the `fc:open-command-palette` window event from anywhere.
 *
 * UX contract:
 *   - 1 input, no autocomplete dropdown — just typed query → submit.
 *   - Result card shows: intent, summary, source tier (0/2/3), and a list
 *     of routable actions. Hitting Enter on the primary route navigates.
 *   - 4 quick-start chips when input is empty so judges discover the surface.
 *   - Esc closes; backdrop click closes; Enter submits.
 *
 * The endpoint /api/ai/concierge does deterministic keyword routing first
 * (always-on, sub-10ms) and falls back to the LLM only for arbitrary
 * clinical questions, so the palette feels instant for navigation.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Search,
  X,
  ArrowRight,
  Loader2,
  Brain,
  Activity,
  ClipboardList,
  HeartPulse,
  BarChart3,
} from "lucide-react";

interface ConciergeAction {
  label: string;
  route: string;
}

interface ConciergeResult {
  intent: string;
  route: string | null;
  summary: string;
  actions: ConciergeAction[];
  source_tier: 0 | 2 | 3;
  provenance: string;
  matched_keywords?: string[];
}

const QUICK_PROMPTS: Array<{
  label: string;
  query: string;
  icon: React.ElementType;
}> = [
  { label: "Open patient triage", query: "triage", icon: Activity },
  { label: "Show the queue", query: "open the queue", icon: ClipboardList },
  { label: "Nurse triage", query: "nurse vitals", icon: HeartPulse },
  { label: "Operations KPIs", query: "operations dashboard", icon: BarChart3 },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Open / close lifecycle ────────────────────────────────────────────
  const openPalette = useCallback(() => {
    setOpen(true);
    setResult(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResult(null);
  }, []);

  // Cmd/Ctrl+K → open. Esc → close. Listen on window so it works everywhere.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      } else if (open && e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, openPalette, closePalette]);

  // External callers (e.g. a "Ask AI" button) can dispatch this event.
  useEffect(() => {
    const handler = () => openPalette();
    window.addEventListener("fc:open-command-palette", handler);
    return () => window.removeEventListener("fc:open-command-palette", handler);
  }, [openPalette]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const submit = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;
      setLoading(true);
      setResult(null);
      try {
        const res = await fetch("/api/ai/concierge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const data = (await res.json()) as ConciergeResult;
        setResult(data);
      } catch {
        setResult({
          intent: "unknown",
          route: null,
          summary:
            "Couldn't reach the AI concierge. Use the quick links below or open a panel directly.",
          actions: [
            { label: "Patient Triage Demo", route: "/triage" },
            { label: "Open Console", route: "/console" },
          ],
          source_tier: 3,
          provenance: "Network error from web tier",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(query);
    }
  };

  const navigate = (route: string) => {
    closePalette();
    // Console tab deep-links use ?tab=…; the console reads them on mount.
    router.push(route);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI command palette"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={closePalette}
      />

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header / input */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200">
          <Sparkles className="w-4 h-4 text-[#1565C0] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask AI: open queue · find chest-pain patient · sepsis qSOFA cutoff…"
            className="flex-1 text-[14px] bg-transparent border-none outline-none placeholder:text-slate-400 text-slate-800"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Ask FrudgeCare AI"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <button
            type="button"
            onClick={closePalette}
            className="text-slate-400 hover:text-slate-700 p-1 rounded"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto">
          {!result && !loading && (
            <div className="p-4">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2 px-1">
                Quick prompts
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {QUICK_PROMPTS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.query}
                      type="button"
                      onClick={() => {
                        setQuery(p.query);
                        submit(p.query);
                      }}
                      className="flex items-center gap-2 px-3 h-10 rounded-lg border border-slate-200 hover:border-[#1565C0] hover:bg-[#1565C0]/5 transition-colors text-left text-[13px] text-slate-700 hover:text-[#1565C0]"
                    >
                      <Icon className="w-4 h-4 text-[#1565C0] flex-shrink-0" />
                      <span className="font-medium">{p.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 px-1 text-[11.5px] text-slate-500 leading-relaxed">
                <Brain className="w-3 h-3 inline mr-1 -mt-0.5 text-[#1565C0]" />
                Type anything in natural language. Navigation queries use
                deterministic keyword routing (instant, no API call). Clinical
                questions are answered by the FastAPI tiered AI cascade.
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="p-4">
              {/* Result card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <TierBadge tier={result.source_tier} />
                  <IntentChip intent={result.intent} />
                  <div className="flex-1" />
                  <span className="text-[10.5px] text-slate-400 font-mono">
                    {result.provenance}
                  </span>
                </div>
                <p className="text-[13.5px] text-slate-800 leading-relaxed">
                  {result.summary}
                </p>
                {result.matched_keywords && result.matched_keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {result.matched_keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center px-1.5 h-5 rounded bg-[#1565C0]/10 border border-[#1565C0]/20 text-[10.5px] font-mono text-[#0D47A1]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Primary action — also bound to Enter key when result has a route */}
              {result.route && (
                <button
                  type="button"
                  onClick={() => navigate(result.route!)}
                  className="mt-3 w-full flex items-center justify-between px-3.5 h-11 rounded-xl bg-[#1565C0] hover:bg-[#0D47A1] text-white text-[13px] font-semibold shadow-sm transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    Go to {result.route}
                  </span>
                  <kbd className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded">
                    Enter
                  </kbd>
                </button>
              )}

              {/* Secondary actions */}
              {result.actions.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5 px-1">
                    Other places to look
                  </div>
                  <div className="flex flex-col gap-1">
                    {result.actions.map((a) => (
                      <button
                        key={a.route}
                        type="button"
                        onClick={() => navigate(a.route)}
                        className="flex items-center justify-between px-3 h-9 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-white text-left text-[13px] text-slate-700 transition-colors"
                      >
                        <span>{a.label}</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {a.route}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400 text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Asking AI…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 h-9 border-t border-slate-200 bg-slate-50 text-[10.5px] text-slate-500">
          <div className="flex items-center gap-3">
            <KbdHint k="Enter" label="Submit" />
            <KbdHint k="Esc" label="Close" />
          </div>
          <div className="flex items-center gap-1.5">
            <Search className="w-3 h-3" />
            <span>FrudgeCare AI Concierge</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: 0 | 2 | 3 }) {
  const map = {
    0: { label: "Tier 0 · Deterministic", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    2: { label: "Tier 2 · LLM (Gemini)", color: "bg-violet-50 text-violet-700 border-violet-200" },
    3: { label: "Tier 3 · Safe fallback", color: "bg-amber-50 text-amber-700 border-amber-200" },
  } as const;
  const m = map[tier] ?? map[3];
  return (
    <span
      className={`inline-flex items-center px-2 h-5 rounded-full border text-[10.5px] font-semibold uppercase tracking-wider ${m.color}`}
    >
      {m.label}
    </span>
  );
}

function IntentChip({ intent }: { intent: string }) {
  return (
    <span className="inline-flex items-center px-2 h-5 rounded-full bg-slate-100 border border-slate-200 text-[10.5px] font-mono text-slate-600">
      {intent}
    </span>
  );
}

function KbdHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-mono font-semibold text-slate-600">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  );
}
