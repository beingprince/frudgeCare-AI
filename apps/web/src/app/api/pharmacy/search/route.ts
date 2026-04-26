/**
 * /api/pharmacy/search — BFF for the medication purchase finder.
 *
 * Forwards (drug, zip) to the FastAPI engine which calls Tavily Search
 * (when TAVILY_API_KEY is set) or returns a curated demo set otherwise.
 * Public on purpose: same kiosk audience as /triage.
 *
 * On engine outage we return an offline envelope so the UI can render a
 * friendly hidden state instead of throwing.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type PharmacyResult = {
  name: string;
  url: string;
  snippet: string;
  estimated_prices: string[];
  score: number | null;
  channel: 'in_store' | 'mail_order' | 'coupon';
  source: 'tavily' | 'demo_curated';
};

type EngineResponse = {
  mode: 'live' | 'demo';
  drug: string;
  zip: string;
  results: PharmacyResult[];
  note?: string;
  fetched_at?: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const drug = (url.searchParams.get('drug') || '').trim();
  const zip = (url.searchParams.get('zip') || '').trim();

  if (!drug || !zip) {
    return NextResponse.json({
      ok: true,
      mode: 'demo' as const,
      drug,
      zip,
      results: [] as PharmacyResult[],
      note: 'Drug name and ZIP are both required.',
    });
  }

  const base = process.env.AI_ENGINE_BASE_URL || 'http://localhost:8002';
  const params = new URLSearchParams({ drug, zip });
  const target = `${base}/pharmacy/search?${params.toString()}`;

  try {
    const r = await fetch(target, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) {
      throw new Error(`engine returned ${r.status}`);
    }
    const body = (await r.json()) as EngineResponse;
    return NextResponse.json({
      ok: true,
      mode: body.mode ?? 'demo',
      drug: body.drug ?? drug,
      zip: body.zip ?? zip,
      results: body.results ?? [],
      note: body.note ?? '',
      fetched_at: body.fetched_at ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error('[pharmacy/search] engine unreachable:', err);
    return NextResponse.json({
      ok: false,
      mode: 'demo' as const,
      drug,
      zip,
      results: [] as PharmacyResult[],
      note: 'AI engine unreachable; pharmacy finder offline.',
    });
  }
}
