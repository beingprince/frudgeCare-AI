"use client";

/**
 * AICoPilotPanel
 *
 * Level 4 clinical decision support for the provider workspace.
 * Calls POST /ai/provider-copilot on mount (with a static demo data package
 * when no live case context is available) and show on screen the response as
 * a compact, skimmable suggestion card. The provider can collapse it
 * at will — this is a co-pilot, not a co-decider.
 */

import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, ChevronDown, ChevronUp, AlertTriangle, FlaskConical, BookOpen } from "lucide-react";
import { SourceTierBadge } from "@/components/shared/ProvenanceBadges";
import { InfoTooltip } from "@/components/shared/InfoTooltip";

interface DiagnosisSuggestion {
  diagnosis: string;
  probability: "high" | "medium" | "low" | "unknown" | string;
  reasoning: string;
  icd10_code?: string | null;
}

interface CopilotResponse {
  differential_dx: DiagnosisSuggestion[];
  drug_interaction_alerts: string[];
  recommended_tests: string[];
  clinical_pearls: string[];
  disclaimer: string;
  source_tier?: number;
  provenance?: string[];
}

interface Props {
  symptoms: string;
  nurseBrief: string;
  vitals?: Record<string, unknown>;
  knownDiagnoses?: string[];
  knownAllergies?: string[];
  currentMedications?: string[];
}

const PROBABILITY_STYLES: Record<string, string> = {
  high:    "bg-red-50 border-red-200 text-red-700",
  medium:  "bg-amber-50 border-amber-200 text-amber-700",
  low:     "bg-slate-50 border-slate-200 text-slate-600",
  unknown: "bg-slate-50 border-slate-200 text-slate-500",
};

export function AICoPilotPanel({
  symptoms,
  nurseBrief,
  vitals = {},
  knownDiagnoses = [],
  knownAllergies = [],
  currentMedications = [],
}: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Same-origin proxy hides INTERNAL_API_SECRET and emits a Tier-3
        // backup option if the FastAPI engine is unreachable.
        const res = await fetch("/api/ai/provider-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symptoms,
            nurse_validated_brief: nurseBrief,
            vitals,
            known_diagnoses: knownDiagnoses,
            known_allergies: knownAllergies,
            current_medications: currentMedications,
          }),
        });
        if (!res.ok) throw new Error("co-pilot unavailable");
        const data: CopilotResponse = await res.json();
        if (!cancelled) setResult(data);
      } catch {
        /* Route returns Tier-3 JSON even on failure; this catch is defensive. */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [symptoms, nurseBrief, vitals, knownDiagnoses, knownAllergies, currentMedications]);

  return (
    <section className="fc-card fc-highlight-primary p-0 overflow-hidden" aria-labelledby="copilot-heading">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-5 py-3.5 bg-slate-50 hover:bg-slate-100"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-[#1565C0]" aria-hidden="true" />
          <h3 id="copilot-heading" className="text-[14px] font-semibold text-slate-900 truncate">Case co-pilot</h3>
          <InfoTooltip
            label="Case co-pilot"
            description="Differential diagnoses, interactions, and test suggestions drawn from the clinical knowledge base. Everything here is a starting point for your decision — nothing is ordered automatically."
          />
          {result?.source_tier && (
            <SourceTierBadge tier={result.source_tier} provenance={result.provenance ?? []} />
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 py-4 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Reviewing clinical context…
            </div>
          )}

          {result && !loading && (
            <>
              {result.differential_dx.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Differential diagnoses</div>
                  <div className="flex flex-col gap-2">
                    {result.differential_dx.map((dx, i) => (
                      <div key={i} className="border border-slate-200 rounded-[10px] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-slate-900">{dx.diagnosis}</span>
                              {dx.icd10_code && (
                                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                                  {dx.icd10_code}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">{dx.reasoning}</p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PROBABILITY_STYLES[dx.probability] ?? PROBABILITY_STYLES.low}`}>
                            {dx.probability}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.drug_interaction_alerts.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-600" /> Drug interaction alerts
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {result.drug_interaction_alerts.map((alert, i) => (
                      <li key={i} className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-[8px] px-2.5 py-1.5">
                        {alert}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.recommended_tests.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <FlaskConical className="w-3 h-3 text-slate-500" /> Recommended tests
                  </div>
                  <ul className="flex flex-col gap-1">
                    {result.recommended_tests.map((t, i) => (
                      <li key={i} className="text-[12px] text-slate-700 flex items-start gap-1.5">
                        <span className="text-slate-400 mt-0.5">›</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.clinical_pearls.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-slate-500" /> Clinical pearls
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {result.clinical_pearls.map((p, i) => (
                      <li key={i} className="text-[12px] text-slate-700 italic bg-slate-50 border border-slate-200 rounded-[8px] px-2.5 py-1.5 leading-relaxed">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
                {result.disclaimer}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
