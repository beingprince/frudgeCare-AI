/**
 * /api/cases/[caseId]
 *
 * Read a single case (with the AI-built patient profile) by its uuid id
 * or its human-readable `case_code` (e.g. FC-C-XXXXXX). Used by
 * /patient/status and downstream surfaces (front-desk card, nurse
 * pre-brief).
 *
 * Resolution order:
 *   1. Supabase via the SERVICE_ROLE admin client.
 *   2. Mock temporary store backup option.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMockCaseById, MOCK_CASES, type MockCase } from '@/lib/mock-service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  if (!caseId) {
    return NextResponse.json({ error: 'caseId is required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (admin) {
    // Build the filter dynamically: if it looks like a uuid we match by
    // `id`, otherwise by `case_code`. We can't blanket-or both because
    // sending a non-uuid into `id.eq.…` returns a `22P02 invalid input
    // syntax for uuid` error from Postgres.
    const isUuid = UUID_RE.test(caseId);
    const query = admin.from('cases').select('*').limit(1);
    const { data, error } = isUuid
      ? await query.eq('id', caseId).maybeSingle()
      : await query.eq('case_code', caseId).maybeSingle();

    if (error) {
      console.error('Supabase case fetch error:', error);
      return NextResponse.json(
        { error: 'DB read failed', detail: error.message },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    return NextResponse.json({ case: data });
  }

  // ── Mock backup option ─────────────────────────────────────────────
  let mockCase: MockCase | null = getMockCaseById(caseId);
  if (!mockCase) {
    mockCase =
      MOCK_CASES.find(c => c.id === caseId || c.case_code === caseId) ?? null;
  }
  if (!mockCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  return NextResponse.json({ case: mockCase });
}
