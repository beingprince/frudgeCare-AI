/**
 * AI Telemetry — lightweight in-process counters for observability.
 *
 * Every AI call flowing through the Next.js proxy routes records the
 * `source_tier` it got back from the FastAPI engine. The operations
 * dashboard reads these counters to show an AI-reliability card:
 *   "92% Tier 1 (grounded AI) · 7% Tier 2 (local KB) · 1% Tier 3 (safe default)"
 *
 * This is intentionally temporary: counters reset on server restart. For
 * production, write to a durable store (Supabase `ai_events` table) from
 * the same `record()` call.
 */

export type AIEndpoint =
  | 'analyze-intake'
  | 'rank-queue'
  | 'nurse-assist'
  | 'provider-copilot'
  | 'build-patient-profile';

interface TierCounters {
  tier1: number;
  tier2: number;
  tier3: number;
  total: number;
  lastRecordedAt: string | null;
}

type CountersByEndpoint = Record<AIEndpoint, TierCounters>;

const INITIAL_ENDPOINT_STATE: TierCounters = {
  tier1: 0,
  tier2: 0,
  tier3: 0,
  total: 0,
  lastRecordedAt: null,
};

function createEmptyCounters(): CountersByEndpoint {
  return {
    'analyze-intake':         { ...INITIAL_ENDPOINT_STATE },
    'rank-queue':             { ...INITIAL_ENDPOINT_STATE },
    'nurse-assist':           { ...INITIAL_ENDPOINT_STATE },
    'provider-copilot':       { ...INITIAL_ENDPOINT_STATE },
    'build-patient-profile':  { ...INITIAL_ENDPOINT_STATE },
  };
}

// Attach the counter to the Node globalThis so hot-reloads in dev don't
// reset it constantly (Next.js recompiles individual modules).
type TelemetryHost = typeof globalThis & { __fcAiTelemetry?: CountersByEndpoint };
const host = globalThis as TelemetryHost;
if (!host.__fcAiTelemetry) {
  host.__fcAiTelemetry = createEmptyCounters();
}
const counters: CountersByEndpoint = host.__fcAiTelemetry;

export function recordTier(endpoint: AIEndpoint, tier: number | undefined): void {
  if (!tier || tier < 1 || tier > 3) return;
  const slot = counters[endpoint];
  if (!slot) return;
  if (tier === 1) slot.tier1 += 1;
  else if (tier === 2) slot.tier2 += 1;
  else if (tier === 3) slot.tier3 += 1;
  slot.total += 1;
  slot.lastRecordedAt = new Date().toISOString();
}

export function getTierStats() {
  const endpoints = Object.entries(counters).map(([name, c]) => ({
    endpoint: name as AIEndpoint,
    tier1: c.tier1,
    tier2: c.tier2,
    tier3: c.tier3,
    total: c.total,
    lastRecordedAt: c.lastRecordedAt,
  }));

  const total  = endpoints.reduce((s, e) => s + e.total, 0);
  const tier1  = endpoints.reduce((s, e) => s + e.tier1, 0);
  const tier2  = endpoints.reduce((s, e) => s + e.tier2, 0);
  const tier3  = endpoints.reduce((s, e) => s + e.tier3, 0);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  return {
    total,
    tier1Pct: pct(tier1),
    tier2Pct: pct(tier2),
    tier3Pct: pct(tier3),
    llmSuccessRate: pct(tier1),
    groundedRate: pct(tier1 + tier2),
    byEndpoint: endpoints,
  };
}
