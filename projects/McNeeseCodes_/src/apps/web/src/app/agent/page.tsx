"use client";

/**
 * /agent — FrudgeCare Agentic Triage demo.
 *
 * One screen. The user picks a pre-loaded case (or writes one), hits
 * "Run Agent", and watches the autonomous workflow unfold:
 *
 *   1. Tool calls execute in deterministic order against the local
 *      clinical knowledge base (red flags, guidelines, vitals scoring,
 *      drug interactions, ICD-10 coding).
 *   2. Gemini synthesises the final urgency call from the collected
 *      evidence (with deterministic fallback when the LLM is rate
 *      limited).
 *   3. The agent commits to the verdict via the
 *      escalate_to_provider tool.
 *
 * Renders the full reasoning trace as a vertical timeline so judges can
 * see exactly what the agent did and why. Auth: bypassed by AppShell.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  HeartPulse,
  Loader2,
  Pill,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Workflow,
  Zap,
} from "lucide-react";
import { ModelChip, RoleChip } from "@/components/common/RoleChip";

// ---------------------------------------------------------------------
// Types — mirror the FastAPI /ai/agentic-triage response shape.
// ---------------------------------------------------------------------

type ToolName =
  | "check_red_flags"
  | "lookup_clinical_guideline"
  | "evaluate_vitals_signs"
  | "check_drug_interaction"
  | "code_diagnosis_icd10"
  | "synthesise_verdict"
  | "escalate_to_provider";

type TraceStep = {
  step: number;
  kind: "tool_call" | "synthesis" | "model_error";
  tool?: ToolName;
  args?: Record<string, unknown>;
  preview?: string;
  result_summary?: string;
  result?: Record<string, unknown>;
  synthesised_by?: "gemini" | "deterministic";
  error?: string;
};

type AgentVerdict = {
  urgency: "CRITICAL" | "URGENT" | "MODERATE" | "LOW" | "ROUTINE";
  rationale: string;
  first_actions: string[];
};

type AgentResponse = {
  agent_available: boolean;
  synthesis_mode: "llm" | "deterministic" | "offline";
  verdict: AgentVerdict;
  trace: TraceStep[];
  steps_used: number;
  max_steps: number;
  tools_offered: string[];
  model: string;
  /** Which LLM provider produced the synthesis. New in F-05. */
  provider?: "openai" | "gemini" | "deterministic" | string;
  elapsed_ms: number;
  stop_reason: string;
  architecture: string;
};

type Scenario = {
  id: string;
  label: string;
  hint: string;
  icon: React.ElementType;
  body: {
    narrative: string;
    age: number;
    sex?: string;
    known_medications?: string[];
    measured_vitals?: Record<string, number>;
  };
};

// ---------------------------------------------------------------------
// Pre-loaded scenarios — judges click one, see the agent work.
// ---------------------------------------------------------------------

const SCENARIOS: Scenario[] = [
  {
    id: "acs",
    label: "Crushing chest pain",
    hint: "Suspected ACS",
    icon: HeartPulse,
    body: {
      narrative:
        "62 year old male, sudden crushing chest pain radiating to left arm, sweating, started 30 minutes ago, history of high blood pressure, takes lisinopril daily.",
      age: 62,
      sex: "male",
      known_medications: ["lisinopril"],
      measured_vitals: { pulse: 110, bp_systolic: 165, o2_sat: 95 },
    },
  },
  {
    id: "hypoglycemia",
    label: "Diabetic shaky & confused",
    hint: "Severe hypoglycemia",
    icon: Zap,
    body: {
      narrative:
        "28 year old type 1 diabetic feeling shaky, sweating, confused after skipping lunch, can barely speak in full sentences.",
      age: 28,
      known_medications: ["insulin glargine", "insulin lispro"],
      measured_vitals: { pulse: 118, glucose: 48, bp_systolic: 105 },
    },
  },
  {
    id: "stroke",
    label: "Sudden facial droop",
    hint: "Possible stroke",
    icon: Brain,
    body: {
      narrative:
        "58 year old female with sudden right-side facial drooping, slurred speech and left arm weakness for 25 minutes. History of hypertension.",
      age: 58,
      sex: "female",
      known_medications: ["amlodipine"],
      measured_vitals: { pulse: 88, bp_systolic: 178 },
    },
  },
  {
    id: "headache",
    label: "Mild 2-day headache",
    hint: "Low-acuity baseline",
    icon: Stethoscope,
    body: {
      narrative:
        "35 year old female, mild headache for 2 days, no fever, no neck stiffness, no vision changes. Takes ibuprofen as needed and feels slightly better.",
      age: 35,
      sex: "female",
      known_medications: ["ibuprofen"],
    },
  },
];

// ---------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------

const URGENCY_STYLES: Record<
  AgentVerdict["urgency"],
  { bg: string; ring: string; label: string; text: string }
> = {
  CRITICAL: {
    bg: "bg-red-600",
    ring: "ring-red-200",
    label: "CRITICAL",
    text: "text-white",
  },
  URGENT: {
    bg: "bg-orange-500",
    ring: "ring-orange-200",
    label: "URGENT",
    text: "text-white",
  },
  MODERATE: {
    bg: "bg-amber-400",
    ring: "ring-amber-200",
    label: "MODERATE",
    text: "text-amber-950",
  },
  LOW: {
    bg: "bg-emerald-500",
    ring: "ring-emerald-200",
    label: "LOW",
    text: "text-white",
  },
  ROUTINE: {
    bg: "bg-slate-500",
    ring: "ring-slate-200",
    label: "ROUTINE",
    text: "text-white",
  },
};

const TOOL_STYLES: Record<
  ToolName,
  { icon: React.ElementType; color: string; pretty: string }
> = {
  check_red_flags: {
    icon: ShieldAlert,
    color: "text-red-600 bg-red-50 border-red-200",
    pretty: "Red Flag Rules",
  },
  lookup_clinical_guideline: {
    icon: Database,
    color: "text-blue-600 bg-blue-50 border-blue-200",
    pretty: "Clinical Guidelines",
  },
  evaluate_vitals_signs: {
    icon: HeartPulse,
    color: "text-rose-600 bg-rose-50 border-rose-200",
    pretty: "Vitals Scoring",
  },
  check_drug_interaction: {
    icon: Pill,
    color: "text-purple-600 bg-purple-50 border-purple-200",
    pretty: "Drug Interactions",
  },
  code_diagnosis_icd10: {
    icon: Workflow,
    color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    pretty: "ICD-10 Coding",
  },
  synthesise_verdict: {
    icon: Brain,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    pretty: "Reasoning Synthesis",
  },
  escalate_to_provider: {
    icon: CheckCircle2,
    color: "text-cyan-600 bg-cyan-50 border-cyan-200",
    pretty: "Provider Escalation",
  },
};

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function AgentPage() {
  const [narrative, setNarrative] = useState(SCENARIOS[0].body.narrative);
  const [age, setAge] = useState<number | "">(SCENARIOS[0].body.age);
  const [meds, setMeds] = useState(
    (SCENARIOS[0].body.known_medications ?? []).join(", "),
  );
  const [vitalsJson, setVitalsJson] = useState(
    JSON.stringify(SCENARIOS[0].body.measured_vitals ?? {}, null, 0),
  );

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const loadScenario = (s: Scenario) => {
    setNarrative(s.body.narrative);
    setAge(s.body.age);
    setMeds((s.body.known_medications ?? []).join(", "));
    setVitalsJson(JSON.stringify(s.body.measured_vitals ?? {}, null, 0));
    setResponse(null);
    setError(null);
  };

  const toggleStep = (n: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const runAgent = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setExpandedSteps(new Set());

    let parsedVitals: Record<string, number> | null = null;
    if (vitalsJson.trim()) {
      try {
        parsedVitals = JSON.parse(vitalsJson);
      } catch {
        setError("Vitals JSON is invalid. Use {\"pulse\": 110, ...} format.");
        setLoading(false);
        return;
      }
    }

    const medsArray = meds
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/ai/agentic-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          narrative,
          age: typeof age === "number" ? age : null,
          known_medications: medsArray.length ? medsArray : null,
          measured_vitals: parsedVitals,
        }),
      });
      const data = (await res.json()) as AgentResponse;
      setResponse(data);
    } catch (e) {
      setError(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const u = response?.verdict.urgency
    ? URGENCY_STYLES[response.verdict.urgency]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      {/* Header */}
      <div className="px-6 lg:px-12 py-5 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-slate-500 hover:text-[#1565C0] transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1565C0] to-[#0D47A1] flex items-center justify-center text-white shadow-sm">
              <Sparkles size={18} />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold text-slate-900 tracking-tight">
                Agentic Triage
              </div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#1565C0]">
                Tool-calling clinical agent
              </div>
            </div>
            <RoleChip
              audience="judge"
              detail="Engineering preview · agent reasoning trace"
              className="hidden md:inline-flex"
            />
          </div>
          <div className="hidden md:flex items-center gap-2">
            <ModelChip
              model={response?.model}
              mode={response?.synthesis_mode}
            />
            <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              6 tools · KB-grounded
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Input */}
          <div className="lg:col-span-2 space-y-4">
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-3">
                1. Pre-loaded scenarios
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SCENARIOS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => loadScenario(s)}
                      className="group text-left p-3 rounded-xl border border-slate-200 hover:border-[#1565C0] hover:bg-[#1565C0]/5 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-[#1565C0] mb-1.5" />
                      <div className="text-[12.5px] font-semibold text-slate-900 leading-tight">
                        {s.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {s.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                2. Patient narrative
              </div>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-mono leading-relaxed focus:outline-none focus:border-[#1565C0] focus:ring-2 focus:ring-[#1565C0]/20"
                placeholder="Free-text symptom story…"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10.5px] font-semibold uppercase text-slate-500 tracking-wider">
                    Age
                  </label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) =>
                      setAge(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#1565C0]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10.5px] font-semibold uppercase text-slate-500 tracking-wider">
                    Medications (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={meds}
                    onChange={(e) => setMeds(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] font-mono focus:outline-none focus:border-[#1565C0]"
                    placeholder="lisinopril, metformin"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold uppercase text-slate-500 tracking-wider">
                  Vitals (JSON)
                </label>
                <input
                  type="text"
                  value={vitalsJson}
                  onChange={(e) => setVitalsJson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#1565C0]"
                  placeholder='{"pulse": 110, "bp_systolic": 165}'
                />
              </div>
            </section>

            <button
              type="button"
              onClick={runAgent}
              disabled={loading || !narrative.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 h-12 rounded-xl bg-[#1565C0] text-white text-[14px] font-semibold shadow-sm hover:bg-[#0D47A1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Agent reasoning…
                </>
              ) : (
                <>
                  Run Agent
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                {error}
              </div>
            )}

            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-3">
                Tools available to the agent
              </div>
              <ul className="space-y-1.5">
                {(Object.keys(TOOL_STYLES) as ToolName[]).map((t) => {
                  const meta = TOOL_STYLES[t];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={t}
                      className="flex items-center gap-2 text-[12.5px] text-slate-700"
                    >
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border ${meta.color}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="font-medium">{meta.pretty}</span>
                      <span className="font-mono text-[10.5px] text-slate-400">
                        {t}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* RIGHT: Verdict + Trace */}
          <div className="lg:col-span-3 space-y-4">
            {!response && !loading && (
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/40 p-12 text-center">
                <Cpu className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <div className="text-[15px] font-semibold text-slate-700">
                  Pick a scenario and hit Run Agent.
                </div>
                <div className="text-[12.5px] text-slate-500 mt-1">
                  You will see every tool call, every result, and the
                  agent&apos;s final urgency commit.
                </div>
              </div>
            )}

            {loading && (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <Loader2 className="w-8 h-8 text-[#1565C0] animate-spin mx-auto mb-3" />
                <div className="text-[14px] font-semibold text-slate-700">
                  Agent is reasoning…
                </div>
                <div className="text-[12px] text-slate-500 mt-1">
                  Running tools against the local clinical KB and synthesising
                  a verdict.
                </div>
              </div>
            )}

            {response && u && (
              <>
                {/* Verdict card */}
                <section
                  className={`rounded-2xl border-2 ${u.bg} ${u.text} p-6 ring-8 ${u.ring}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] opacity-90">
                        Agent Verdict
                      </div>
                      <div className="text-[40px] font-black tracking-tight leading-none mt-1">
                        {u.label}
                      </div>
                      <p className="mt-3 text-[14px] leading-relaxed opacity-95 max-w-prose">
                        {response.verdict.rationale}
                      </p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 opacity-80" />
                  </div>

                  {response.verdict.first_actions.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-white/30">
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] opacity-90 mb-2">
                        First Actions
                      </div>
                      <ul className="space-y-1.5">
                        {response.verdict.first_actions.map((a, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-[13px]"
                          >
                            <ArrowRight className="w-3.5 h-3.5 mt-1 flex-shrink-0 opacity-80" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                {/* Run metadata strip */}
                <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">
                      {response.elapsed_ms} ms
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Workflow className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">
                      {response.steps_used} steps
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Brain className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">
                      Synthesis: {response.synthesis_mode}
                    </span>
                    {response.synthesis_mode === "deterministic" && (
                      <span
                        className="text-[10px] text-amber-700 font-medium"
                        title="LLM was unavailable — verdict was derived deterministically from tool evidence"
                      >
                        (LLM unavailable)
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Cpu className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono text-[11px]">
                      {response.model}
                    </span>
                  </span>
                </section>

                {/* Trace timeline */}
                <section className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Agent Trace
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {response.architecture}
                    </div>
                  </div>

                  <ol className="space-y-3">
                    {response.trace.map((step) => {
                      const isExpanded = expandedSteps.has(step.step);
                      const meta = step.tool ? TOOL_STYLES[step.tool] : null;
                      const Icon = meta?.icon ?? Brain;
                      return (
                        <li
                          key={step.step}
                          className="relative pl-9"
                        >
                          {/* timeline dot */}
                          <div
                            className={`absolute left-0 top-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${
                              step.kind === "model_error"
                                ? "border-red-300 bg-red-50 text-red-600"
                                : meta
                                ? meta.color
                                : "border-slate-300 bg-white text-slate-600"
                            }`}
                          >
                            {step.step}
                          </div>

                          <div className="rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                            <button
                              type="button"
                              onClick={() => toggleStep(step.step)}
                              className="w-full text-left px-3.5 py-2.5 flex items-center gap-3"
                            >
                              <Icon
                                className={`w-4 h-4 flex-shrink-0 ${
                                  step.kind === "model_error"
                                    ? "text-red-500"
                                    : "text-slate-700"
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <div className="text-[13px] font-semibold text-slate-900">
                                    {step.tool
                                      ? TOOL_STYLES[step.tool].pretty
                                      : step.kind === "synthesis"
                                      ? "Reasoning Synthesis"
                                      : "Model Error"}
                                  </div>
                                  {step.tool && (
                                    <span className="font-mono text-[10.5px] text-slate-400">
                                      {step.tool}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12px] text-slate-600 mt-0.5 truncate">
                                  {step.preview ??
                                    step.error ??
                                    step.result_summary}
                                </div>
                              </div>
                              <span className="text-[12px] font-medium text-slate-700 flex items-center gap-1">
                                {step.result_summary && (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px]">
                                    {step.result_summary}
                                  </span>
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-slate-100 px-3.5 py-3 bg-slate-50/60 space-y-2">
                                {step.args && Object.keys(step.args).length > 0 && (
                                  <div>
                                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                      args
                                    </div>
                                    <pre className="text-[11.5px] font-mono text-slate-700 whitespace-pre-wrap break-words bg-white rounded-md border border-slate-200 px-2.5 py-1.5">
                                      {JSON.stringify(step.args, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {step.result && (
                                  <div>
                                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                      result
                                    </div>
                                    <pre className="text-[11.5px] font-mono text-slate-700 whitespace-pre-wrap break-words bg-white rounded-md border border-slate-200 px-2.5 py-1.5 max-h-72 overflow-auto">
                                      {JSON.stringify(step.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {step.error && (
                                  <div>
                                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-red-600 mb-1">
                                      error
                                    </div>
                                    <pre className="text-[11.5px] font-mono text-red-700 whitespace-pre-wrap break-words bg-red-50 rounded-md border border-red-200 px-2.5 py-1.5">
                                      {step.error}
                                    </pre>
                                  </div>
                                )}
                                {step.synthesised_by && (
                                  <div className="text-[11.5px] text-slate-600">
                                    Synthesised by{" "}
                                    <span className="font-mono font-semibold text-slate-800">
                                      {step.synthesised_by}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
