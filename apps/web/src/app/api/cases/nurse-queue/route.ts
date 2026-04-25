/**
 * GET /api/cases/nurse-queue
 *
 * Cases waiting in nurse triage (after front desk handoff through completed
 * nurse review). Backed by Supabase admin or in-memory mock store.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { MOCK_CASES } from '@/lib/mock-service';
import type { Case, CaseStatus } from '@/types';

const NURSE_QUEUE_STATUSES: CaseStatus[] = [
  'nurse_triage_pending',
  'nurse_triage_in_progress',
  'nurse_validated',
];

function inNurseQueue(status: string): boolean {
  return NURSE_QUEUE_STATUSES.includes(status as CaseStatus);
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from('cases')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[cases/nurse-queue]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as Case[];
    return NextResponse.json({
      cases: rows.filter((c) => inNurseQueue(c.status)),
    });
  }

  const mock = MOCK_CASES.filter((c) => inNurseQueue(c.status));
  return NextResponse.json({ cases: mock as unknown as Case[] });
}
