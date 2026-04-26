import { NextResponse } from 'next/server';
import { recordTier } from '@/lib/ai-telemetry';

/**
 * /api/ai/build-patient-profile
 *
 * Proxy to the FastAPI engine's profile synthesizer. This is the LLM
 * "profile maker" the patient flow relies on: it takes the intake form
 * + the analyze-intake result and returns a structured patient profile
 * that gets save on the case row and show on screen on /patient/status
 * (and surfaced to the front-desk + nurse downstream).
 *
 * Resilience layers — same shape as /api/ai/analyze-intake:
 *   1. FastAPI runs Tier 1 (Gemini) → Tier 2 (templated). Either way it
 *      returns a valid profile.
 *   2. If FastAPI itself is unreachable, we degrade locally to a Tier 3
 *      profile so the patient page never sees an error.
 *   3. Every successful response's `source_tier` is recorded for the
 *      ops dashboard.
 */

const ENGINE_BASE =
  process.env.NEXT_PUBLIC_AI_ENGINE_URL ?? 'http://localhost:8001';

interface ProfileBody {
  full_name?: string;
  date_of_birth?: string;
  age?: number | null;
  chief_complaint?: string;
  severity?: string;
  duration?: string;
  additional_details?: string;
  medical_history?: string;
  preferred_timing?: string;
  preferred_provider?: string;
  pretriage_urgency?: string;
  pretriage_summary?: string;
  pretriage_risks?: string[];
  pretriage_clinician_brief?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ProfileBody;

  const url = `${ENGINE_BASE.replace(/\/$/, '')}/ai/build-patient-profile`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret':
          process.env.INTERNAL_API_SECRET ?? 'frudgecare-internal-dev-secret',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`AI engine returned ${response.status}`);
    }

    const result = await response.json();
    recordTier('build-patient-profile', result?.source_tier);
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'build-patient-profile: AI engine unreachable — local Tier 3 fallback:',
      error,
    );

    const name = (body.full_name ?? '').trim() || 'Unnamed patient';
    const chief = (body.chief_complaint ?? '').trim() || 'Reason for visit not stated';
    const firstName = name.split(' ')[0] || 'there';

    const fallback = {
      display_name: name,
      age: body.age ?? null,
      chief_complaint_short: chief.slice(0, 80),
      narrative_summary:
        `Hi ${firstName} — we received your intake. ` +
        (body.chief_complaint
          ? `You told us about ${body.chief_complaint.toLowerCase().replace(/\.$/, '')}` +
            (body.duration ? `, going on for ${body.duration}.` : '.')
          : 'A nurse will review your details shortly.') +
        ' A nurse validates every case before a provider is assigned.',
      key_clinical_signals: [
        body.chief_complaint && `Chief complaint: ${body.chief_complaint}`,
        body.severity && `Severity: ${body.severity}`,
        body.duration && `Duration: ${body.duration}`,
        body.medical_history && `Relevant history: ${body.medical_history}`,
      ].filter(Boolean) as string[],
      lifestyle_factors: [],
      recommended_questions_for_nurse: [
        'Are the symptoms getting better, worse, or staying the same?',
        'What makes it better or worse?',
        'Any associated symptoms not on the form?',
      ],
      red_flags_for_team: body.pretriage_risks ?? [],
      next_step_for_patient:
        'A nurse will reach out shortly to confirm details and schedule your visit.',
      disclaimer:
        'AI-generated profile from patient intake. Suggestions only — a clinician validates every detail before it informs care.',
      source_tier: 3,
      provenance: [] as string[],
    };
    recordTier('build-patient-profile', 3);
    return NextResponse.json(fallback);
  }
}
