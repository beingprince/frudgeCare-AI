import { NextResponse } from 'next/server';
import { recordTier } from '@/lib/ai-telemetry';

/**
 * Server-side proxy for the FastAPI /ai/rank-queue endpoint.
 *
 * Why a proxy and not a direct browser → FastAPI call:
 *   1. The internal shared-secret (INTERNAL_API_SECRET) must never leave
 *      the Node server — a cross-origin browser get would expose it.
 *   2. We get a deterministic Tier-3 backup option if the engine is unreachable,
 *      so the UI never sits on a spinner forever when the Python service
 *      is offline.
 *   3. Every successful response is recorded to telemetry so the ops
 *      dashboard shows live reliability numbers.
 */
interface IncomingCase {
  case_id: string;
  urgency?: 'low' | 'medium' | 'high' | string;
  submitted_at?: string;
  current_status?: string;
  wait_minutes?: number;
  provider_assigned?: boolean;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const base = (process.env.AI_ENGINE_URL ?? 'http://localhost:8001/analyze-intake')
    .replace(/\/analyze-intake$/, '')
    .replace(/\/$/, '');

  try {
    const response = await fetch(`${base}/ai/rank-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? 'frudgecare-internal-dev-secret',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`rank-queue upstream ${response.status}`);

    const result = await response.json();
    recordTier('rank-queue', result?.source_tier);
    return NextResponse.json(result);
  } catch (error) {
    console.error('rank-queue — falling back to deterministic Tier 3:', error);

    // Deterministic heuristic: urgency rank × wait-time bucket, then submission order.
    const urgencyWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const cases: IncomingCase[] = Array.isArray(body?.cases) ? body.cases : [];

    const ranked = [...cases]
      .sort((a, b) => {
        const wa = urgencyWeight[a.urgency ?? 'low'] ?? 3;
        const wb = urgencyWeight[b.urgency ?? 'low'] ?? 3;
        if (wa !== wb) return wa - wb;
        return (b.wait_minutes ?? 0) - (a.wait_minutes ?? 0);
      })
      .map((c, i) => ({
        case_id: c.case_id,
        rank: i + 1,
        reason:
          c.urgency === 'high'
            ? 'High-urgency flag — see first.'
            : c.urgency === 'medium'
            ? `Moderate urgency, waiting ${c.wait_minutes ?? 0} min.`
            : 'Routine — see after acute cases.',
      }));

    const unassignedHigh = cases.filter(c => c.urgency === 'high' && !c.provider_assigned).length;
    const alerts = unassignedHigh > 0
      ? [`${unassignedHigh} high-urgency case${unassignedHigh > 1 ? 's' : ''} still unassigned.`]
      : [];

    recordTier('rank-queue', 3);
    return NextResponse.json({
      ranked_cases: ranked,
      bottleneck_alerts: alerts,
      source_tier: 3,
      provenance: [] as string[],
    });
  }
}
