import { NextResponse } from 'next/server';
import { recordTier } from '@/lib/ai-telemetry';

/**
 * Server-side proxy for /ai/provider-copilot. Graceful Tier-3 backup option so
 * the provider screen always show on screen something useful even if the engine
 * is offline.
 */
interface CopilotPayload {
  symptoms?: string;
  nurse_validated_brief?: string;
  vitals?: Record<string, unknown>;
  known_diagnoses?: string[];
  known_allergies?: string[];
  current_medications?: string[];
  proposed_action?: string;
}

export async function POST(req: Request) {
  const body: CopilotPayload = await req.json().catch(() => ({}));

  const base = (process.env.AI_ENGINE_URL ?? 'http://localhost:8001/analyze-intake')
    .replace(/\/analyze-intake$/, '')
    .replace(/\/$/, '');

  try {
    const response = await fetch(`${base}/ai/provider-copilot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? 'frudgecare-internal-dev-secret',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`provider-copilot upstream ${response.status}`);

    const result = await response.json();
    recordTier('provider-copilot', result?.source_tier);
    return NextResponse.json(result);
  } catch (error) {
    console.error('provider-copilot — falling back to Tier 3:', error);

    recordTier('provider-copilot', 3);
    return NextResponse.json({
      differential_dx: [
        {
          diagnosis: 'Pending clinician determination',
          probability: 'unknown',
          reasoning:
            'Decision-support engine unavailable. Proceed with standard history + exam; do not rely on automated suggestions.',
          icd10_code: null,
        },
      ],
      drug_interaction_alerts: (body.current_medications ?? []).slice(0, 3).map(
        m => `Cross-check ${m} against the patient's current regimen before prescribing.`,
      ),
      recommended_tests: [],
      clinical_pearls: [],
      disclaimer:
        'Decision support offline — all suggestions here are placeholders; apply clinical judgment.',
      source_tier: 3,
      provenance: [] as string[],
    });
  }
}
