/**
 * POST /api/data-deletion/request
 * Demo: any surface can request removal of a case; admin approves in /admin/accounts.
 * Stores a pending flag + timestamp text inside cases.ai_patient_profile (no new table).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: { case_id?: string; reason?: string; requested_by?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const caseId = body.case_id?.trim();
  if (!caseId) {
    return NextResponse.json({ error: 'case_id is required' }, { status: 400 });
  }

  const requestedAt = new Date().toISOString();
  const reason = (body.reason ?? 'User requested data removal (demo)').slice(0, 2000);

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Server storage not configured' },
      { status: 503 },
    );
  }

  const isUuid = UUID_RE.test(caseId);
  const q = admin.from('cases').select('id, ai_patient_profile').limit(1);
  const { data: row, error: loadErr } = isUuid
    ? await q.eq('id', caseId).maybeSingle()
    : await q.eq('case_code', caseId).maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const base =
    typeof row.ai_patient_profile === 'object' && row.ai_patient_profile !== null
      ? (row.ai_patient_profile as Record<string, unknown>)
      : {};
  const merged = {
    ...base,
    deletion_request: {
      state: 'pending' as const,
      requestedAt,
      /** Plain-text timestamp copy for audit (per product request). */
      requestedAtText: requestedAt,
      reason,
      requestedBy: (body.requested_by ?? 'demo-user').slice(0, 200),
    },
  };

  const { error: upErr } = await admin
    .from('cases')
    .update({
      ai_patient_profile: merged,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, caseId: row.id, requestedAt });
}
