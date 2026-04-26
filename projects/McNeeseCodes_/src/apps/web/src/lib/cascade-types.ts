/**
 * Cascade types — shared between /triage (preview only), /nurse (the
 * canonical place a real cascade gets executed), and /patient/status
 * (the live readout the patient sees while waiting in the lobby).
 *
 * Schema mirrors the FastAPI orchestrator response from
 * `/ai/triage-cascade` so the BFF route is a thin pass-through.
 */

export type CascadeQueue = {
  ranked_cases: { case_id: string; rank: number; reason: string; alert?: string | null }[];
  bottleneck_alerts: string[];
  source_tier: number;
  current_case_id?: string;
  offline?: boolean;
};

export type CascadeNurse = {
  vitals_flags: { field: string; value: number | string; status: string; note: string }[];
  allergy_alerts: string[];
  suggested_questions: string[];
  documentation_hints: string[];
  drug_interactions: { matched_on: string[]; severity?: string; recommendation?: string }[];
  source_tier: number;
  offline?: boolean;
};

export type CascadeProvider = {
  differential_dx: { diagnosis: string; probability: string; reasoning: string; icd10_code?: string }[];
  drug_interaction_alerts: string[];
  recommended_tests: string[];
  clinical_pearls: string[];
  disclaimer: string;
  source_tier: number;
  offline?: boolean;
};

export type CascadeData = {
  queue: CascadeQueue;
  nurse: CascadeNurse;
  provider: CascadeProvider;
  totalMs?: number;
};

/**
 * Provider note shape — surfaces in /patient/status as a "messages from
 * your care team" feed once a clinician marks a note as patient-visible.
 */
export interface ProviderNote {
  id: string;
  authorRole: "nurse" | "provider" | "front_desk";
  authorLabel: string;
  body: string;
  createdAt: string;
  patientVisible: boolean;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Defensive normaliser. The orchestrator already returns this shape but
 * older Tier-3 fallbacks can drop fields, so we coerce everything before
 * handing it to the React layer.
 */
export function normalizeCascade(raw: unknown): CascadeData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const queueRaw = (r.queue ?? {}) as Record<string, unknown>;
  const nurseRaw = (r.nurse ?? {}) as Record<string, unknown>;
  const providerRaw = (r.provider ?? {}) as Record<string, unknown>;
  const timings = (r.pipeline_timings_ms ?? {}) as Record<string, unknown>;

  return {
    queue: {
      ranked_cases: asArray<Record<string, unknown>>(queueRaw.ranked_cases).map((c) => ({
        case_id: String(c.case_id ?? ""),
        rank: typeof c.rank === "number" ? (c.rank as number) : 0,
        reason: String(c.reason ?? ""),
        alert: (c.alert as string | null | undefined) ?? null,
      })),
      bottleneck_alerts: asArray<string>(queueRaw.bottleneck_alerts).map(String),
      source_tier: typeof queueRaw.source_tier === "number" ? (queueRaw.source_tier as number) : 3,
      current_case_id:
        typeof queueRaw.current_case_id === "string" ? queueRaw.current_case_id : undefined,
      offline: queueRaw.offline === true,
    },
    nurse: {
      vitals_flags: asArray<Record<string, unknown>>(nurseRaw.vitals_flags).map((f) => ({
        field: String(f.field ?? ""),
        value: (f.value as number | string) ?? "",
        status: String(f.status ?? "normal"),
        note: String(f.note ?? ""),
      })),
      allergy_alerts: asArray<string>(nurseRaw.allergy_alerts).map(String),
      suggested_questions: asArray<string>(nurseRaw.suggested_questions).map(String),
      documentation_hints: asArray<string>(nurseRaw.documentation_hints).map(String),
      drug_interactions: asArray<Record<string, unknown>>(nurseRaw.drug_interactions).map((d) => ({
        matched_on: asArray<string>(d.matched_on).map(String),
        severity: typeof d.severity === "string" ? d.severity : undefined,
        recommendation:
          typeof d.recommendation === "string" ? d.recommendation : undefined,
      })),
      source_tier: typeof nurseRaw.source_tier === "number" ? (nurseRaw.source_tier as number) : 3,
      offline: nurseRaw.offline === true,
    },
    provider: {
      differential_dx: asArray<Record<string, unknown>>(providerRaw.differential_dx).map((d) => ({
        diagnosis: String(d.diagnosis ?? ""),
        probability: String(d.probability ?? "low"),
        reasoning: String(d.reasoning ?? ""),
        icd10_code: typeof d.icd10_code === "string" ? d.icd10_code : undefined,
      })),
      drug_interaction_alerts: asArray<string>(providerRaw.drug_interaction_alerts).map(String),
      recommended_tests: asArray<string>(providerRaw.recommended_tests).map(String),
      clinical_pearls: asArray<string>(providerRaw.clinical_pearls).map(String),
      disclaimer: String(providerRaw.disclaimer ?? ""),
      source_tier:
        typeof providerRaw.source_tier === "number" ? (providerRaw.source_tier as number) : 3,
      offline: providerRaw.offline === true,
    },
    totalMs:
      typeof timings.cascade_total_ms === "number"
        ? (timings.cascade_total_ms as number)
        : undefined,
  };
}
