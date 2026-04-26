/**
 * /api/demo/synthea — BFF for the Synthea-curated demo patient list.
 *
 * Pulls the 10 curated FHIR R4 patient summaries from the FastAPI engine
 * and returns them to the /triage picker. No auth (public kiosk demo).
 *
 * If the engine is unreachable we return an empty list with a flag so
 * the UI can hide the picker entirely instead of showing a broken
 * dropdown. This is the same offline-fallback shape the rest of the BFF
 * uses.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type DemoPatient = {
  id: string;
  label: string;
  bucket: string;
  age: number;
  sex: string;
  postal_code: string;
  city: string;
  state: string;
  active_conditions: string[];
  active_medications: string[];
  allergies: string[];
  last_vitals: Record<string, number>;
  narrative_seed: string;
};

type EngineResponse = {
  count: number;
  patients: DemoPatient[];
  source?: string;
  note?: string;
};

export async function GET() {
  const base = process.env.AI_ENGINE_BASE_URL || 'http://localhost:8002';
  const url = `${base}/demo/synthea-patients`;

  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) {
      throw new Error(`engine returned ${r.status}`);
    }
    const body = (await r.json()) as EngineResponse;
    return NextResponse.json({
      ok: true,
      count: body.count ?? body.patients.length,
      patients: body.patients ?? [],
      source: body.source ?? 'unknown',
      note: body.note ?? '',
    });
  } catch (err) {
    console.error('[demo/synthea] engine unreachable:', err);
    return NextResponse.json({
      ok: false,
      count: 0,
      patients: [] as DemoPatient[],
      source: 'offline',
      note: 'AI engine unreachable; demo patient list unavailable.',
    });
  }
}
