import { NextResponse } from 'next/server';
import { recordTier } from '@/lib/ai-telemetry';

/**
 * Server-side proxy for /ai/nurse-assist.
 *
 * Graceful-degradation contract: if the FastAPI engine is down, return a
 * minimal but clinically useful Tier-3 shape (vitals-range checks and a
 * generic documentation hint) so the nurse workspace is never empty.
 */
interface NurseAssistPayload {
  symptoms?: string;
  vitals?: Record<string, number | string | null | undefined>;
  ai_pretriage_brief?: string;
  known_allergies?: string[];
  current_medications?: string[];
  active_diagnoses?: string[];
}

interface VitalsFlag {
  field: string;
  value: number | string;
  status: 'normal' | 'warning' | 'critical';
  note: string;
}

function buildVitalsFlags(vitals: NurseAssistPayload['vitals'] = {}): VitalsFlag[] {
  const flags: VitalsFlag[] = [];
  const sys = Number(vitals.bp_systolic);
  const dia = Number(vitals.bp_diastolic);
  const pulse = Number(vitals.pulse);
  const temp = Number(vitals.temp_f);
  const o2 = Number(vitals.o2_sat);

  if (sys >= 180 || dia >= 120) {
    flags.push({ field: 'Blood pressure', value: `${sys || '?'}/${dia || '?'}`, status: 'critical', note: 'Hypertensive crisis range — notify provider immediately.' });
  } else if (sys >= 140 || dia >= 90) {
    flags.push({ field: 'Blood pressure', value: `${sys || '?'}/${dia || '?'}`, status: 'warning', note: 'Stage 2 hypertension range.' });
  }
  if (pulse > 120) flags.push({ field: 'Pulse', value: pulse, status: 'warning', note: 'Tachycardia — investigate cause.' });
  if (pulse > 0 && pulse < 50) flags.push({ field: 'Pulse', value: pulse, status: 'warning', note: 'Bradycardia — confirm with manual read.' });
  if (temp >= 103) flags.push({ field: 'Temperature', value: `${temp}°F`, status: 'critical', note: 'High-grade fever — sepsis screen recommended.' });
  else if (temp >= 100.4) flags.push({ field: 'Temperature', value: `${temp}°F`, status: 'warning', note: 'Fever present.' });
  if (o2 > 0 && o2 < 92) flags.push({ field: 'O₂ saturation', value: `${o2}%`, status: 'critical', note: 'Hypoxia — escalate and prepare oxygen.' });
  return flags;
}

export async function POST(req: Request) {
  const body: NurseAssistPayload = await req.json().catch(() => ({}));

  const base = (process.env.AI_ENGINE_URL ?? 'http://localhost:8001/analyze-intake')
    .replace(/\/analyze-intake$/, '')
    .replace(/\/$/, '');

  try {
    const response = await fetch(`${base}/ai/nurse-assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? 'frudgecare-internal-dev-secret',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`nurse-assist upstream ${response.status}`);

    const result = await response.json();
    recordTier('nurse-assist', result?.source_tier);
    return NextResponse.json(result);
  } catch (error) {
    console.error('nurse-assist — falling back to deterministic Tier 3:', error);

    const vitalsFlags = buildVitalsFlags(body.vitals);
    const allergies = body.known_allergies ?? [];
    const meds = body.current_medications ?? [];

    recordTier('nurse-assist', 3);
    return NextResponse.json({
      vitals_flags: vitalsFlags,
      allergy_alerts: allergies.map(a => `Verify avoidance of ${a}-class agents.`),
      suggested_questions: [
        'Has severity changed in the last hour?',
        'Any new symptoms since intake was submitted?',
        'Last dose and adherence to maintenance medications?',
      ],
      documentation_hints: [
        meds.length
          ? `Confirm last dose time for: ${meds.slice(0, 3).join(', ')}.`
          : 'Capture current medication list before handoff.',
        'Record manual vitals or explicit reason they were not taken.',
      ],
      drug_interactions: [] as unknown[],
      source_tier: 3,
      provenance: [] as string[],
    });
  }
}
