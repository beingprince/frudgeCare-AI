/**
 * GET /api/cases/queue
 *
 * Lists cases that should appear on the front-desk queue: newly submitted
 * intakes through front-desk review (before nurse handoff). Staff session
 * optional for read in dev; production should gate via proxy on /front-desk/*.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { MOCK_CASES } from '@/lib/mock-service';
import type { Case, CaseStatus } from '@/types';

/** Statuses that still need / may need front-desk attention */
const QUEUE_STATUSES: CaseStatus[] = [
  'intake_submitted',
  'ai_pretriage_ready',
  'frontdesk_review',
  'submitted',
  'under_review',
];

function inQueue(status: string): boolean {
  return QUEUE_STATUSES.includes(status as CaseStatus);
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[cases/queue]', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }
    const rows = (data ?? []) as Case[];
    const filtered = rows.filter((c) => inQueue(c.status));
    return NextResponse.json({ cases: filtered });
  }

  const mock = MOCK_CASES.filter((c) => inQueue(c.status));
  return NextResponse.json({ cases: mock as unknown as Case[] });
}
