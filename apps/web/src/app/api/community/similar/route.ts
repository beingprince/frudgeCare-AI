/**
 * /api/community/similar — BFF for the Reddit similarity panel.
 *
 * Forwards the symptom narrative to the FastAPI engine which fans out
 * to the curated subreddit allowlist (AskDocs, medicine, HealthAnxiety)
 * and returns up to ~6 ranked threads. Public on purpose: same kiosk
 * audience as /triage.
 *
 * If the engine is unreachable we return an empty result envelope with
 * source="offline" so the panel can hide itself rather than throwing.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type CommunityPost = {
  id: string;
  title: string;
  snippet: string;
  subreddit: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  similarity: number;
};

type EngineResponse = {
  query: string;
  subreddits: string[];
  results: CommunityPost[];
  source: 'reddit' | 'cache' | 'offline';
  fetched_at: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const subs = (url.searchParams.get('subs') || '').trim();

  if (!q) {
    return NextResponse.json({
      ok: true,
      query: '',
      subreddits: [],
      results: [] as CommunityPost[],
      source: 'offline' as const,
      note: 'No symptom narrative provided.',
    });
  }

  const base = process.env.AI_ENGINE_BASE_URL || 'http://localhost:8002';
  const params = new URLSearchParams({ q });
  if (subs) params.set('subs', subs);
  const target = `${base}/community/similar?${params.toString()}`;

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
      query: body.query,
      subreddits: body.subreddits ?? [],
      results: body.results ?? [],
      source: body.source ?? 'offline',
      fetched_at: body.fetched_at ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error('[community/similar] engine unreachable:', err);
    return NextResponse.json({
      ok: false,
      query: q,
      subreddits: [],
      results: [] as CommunityPost[],
      source: 'offline' as const,
      note: 'AI engine unreachable; community panel hidden.',
    });
  }
}
