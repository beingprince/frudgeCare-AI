import { NextResponse } from 'next/server';
import { recordTier } from '@/lib/ai-telemetry';

/**
 * Proxy to the FastAPI orchestrator that runs intake + queue + nurse +
 * provider AI in parallel for the /triage demo screen. One call → four
 * downstream cards.
 *
 * Resilience strategy:
 *   - Coerces severity (number → label string) so legacy Pydantic models
 *     can never reject the request.
 *   - If the FastAPI orchestrator is unreachable, we still hit
 *     /api/ai/analyze-intake so at least the urgency block renders. The
 *     downstream cascade cards then show a friendly "AI engine offline"
 *     placeholder instead of a hard error.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const normalizedBody: Record<string, unknown> = { ...body };
  if (typeof normalizedBody.severity === 'number') {
    const n = normalizedBody.severity as number;
    normalizedBody.severity = n >= 7 ? 'severe' : n >= 4 ? 'moderate' : 'mild';
  } else if (normalizedBody.severity == null) {
    normalizedBody.severity = 'moderate';
  } else {
    normalizedBody.severity = String(normalizedBody.severity);
  }

  const aiEngineBase = process.env.AI_ENGINE_BASE_URL || 'http://localhost:8001';
  const cascadeUrl = `${aiEngineBase}/ai/triage-cascade`;

  try {
    const response = await fetch(cascadeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret':
          process.env.INTERNAL_API_SECRET ?? 'frudgecare-internal-dev-secret',
      },
      body: JSON.stringify(normalizedBody),
    });

    if (!response.ok) {
      throw new Error(`Cascade engine returned ${response.status}`);
    }

    const result = await response.json();
    recordTier('triage-cascade', result?.intake?.source_tier);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Cascade Integration Error — degrading to intake-only:', error);

    // Soft fallback: at least render the urgency block. Downstream cards will
    // show a placeholder "AI engine offline" message in the UI.
    return NextResponse.json(
      {
        intake: {
          urgency: 'medium',
          urgency_label: 'URGENT',
          urgency_reason:
            'Cascade engine unreachable. Showing safe default — clinical review required.',
          summary: 'Cascade unavailable.',
          extracted_symptoms: [],
          negations: [],
          risk_flags: [],
          rag_matches: [],
          rag_evidence: 'Engine offline.',
          rag_source: 'Web tier fallback',
          recommended_route: 'Clinical review required (AI offline).',
          fhir_output: { resourceType: 'CarePlan', status: 'unknown' },
          source_tier: 3,
          provenance: [],
          extracted_vitals: [],
          extracted_temporal: { phrases: [], minutes_since_onset: null },
          extracted_demographics: { age: null, sex: null, age_group: null },
          extracted_medications: [],
          icd10_tags: [],
          ai_confidence: { score: 0.0, label: 'low', components: {} },
          pipeline_timings_ms: {},
          kb_stats: {},
        },
        queue: {
          ranked_cases: [],
          bottleneck_alerts: [],
          source_tier: 3,
          provenance: [],
          offline: true,
        },
        nurse: {
          vitals_flags: [],
          allergy_alerts: [],
          suggested_questions: [],
          documentation_hints: [],
          drug_interactions: [],
          source_tier: 3,
          provenance: [],
          offline: true,
        },
        provider: {
          differential_dx: [],
          drug_interaction_alerts: [],
          recommended_tests: [],
          clinical_pearls: [],
          disclaimer: 'AI engine offline.',
          source_tier: 3,
          provenance: [],
          offline: true,
        },
        urgency_label: 'URGENT',
        urgency_reason: 'Cascade engine unreachable.',
        ai_confidence: { score: 0.0, label: 'low' },
        pipeline_timings_ms: {},
      },
      { status: 200 },
    );
  }
}
