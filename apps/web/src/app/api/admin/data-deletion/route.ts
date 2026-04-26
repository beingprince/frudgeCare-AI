/**
 * Admin: list pending data-deletion requests, approve (redact + audit timestamp text).
 * GET  — returns cases with ai_patient_profile.deletion_request.state === "pending"
 * POST — { case_id, approve: true } finalizes: saves approvedAtText, redacts PII fields.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DelReq = {
  state?: string;
  requestedAt?: string;
  requestedAtText?: string;
  reason?: string;
  requestedBy?: string;
  approvedAtText?: string;
};

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const { data: rows, error } = await admin
    .from('cases')
    .select('id, case_code, status, created_at, ai_patient_profile, patient_full_name, symptom_text');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pending = (rows ?? [])
    .map((r) => {
      const p = r.ai_patient_profile as Record<string, unknown> | null;
      const d = p?.deletion_request as DelReq | undefined;
      if (d?.state !== 'pending') return null;
      return {
        id: r.id,
        caseCode: r.case_code,
        status: r.status,
        createdAt: r.created_at,
        reason: d.reason,
        requestedAt: d.requestedAtText ?? d.requestedAt,
        requestedBy: d.requestedBy,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ requests: pending });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  let body: { case_id?: string; approve?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const caseId = body.case_id?.trim();
  if (!caseId || body.approve !== true) {
    return NextResponse.json(
      { error: 'case_id and approve: true are required' },
      { status: 400 },
    );
  }

  const isUuid = UUID_RE.test(caseId);
  const q = admin
    .from('cases')
    .select('id, ai_patient_profile, status')
    .limit(1);
  const { data: row, error: loadErr } = isUuid
    ? await q.eq('id', caseId).maybeSingle()
    : await q.eq('case_code', caseId).maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const approvedAt = new Date();
  const approvedAtText = approvedAt.toISOString();

  const base =
    typeof row.ai_patient_profile === 'object' && row.ai_patient_profile !== null
      ? (row.ai_patient_profile as Record<string, unknown>)
      : {};
  const prev = (base.deletion_request as DelReq | undefined) ?? {};

  const merged = {
    ...base,
    deletion_request: {
      ...prev,
      state: 'approved',
      approvedAtText,
      /** Duplicate key name requested for plain-text DB visibility */
      deletion_approved_at_txt: approvedAtText,
    },
    redaction: {
      completedAt: approvedAtText,
      note: 'PII redacted on admin approval (demo).',
    },
  };

  const { error: upErr } = await admin
    .from('cases')
    .update({
      patient_full_name: 'Redacted',
      symptom_text: '[Removed per approved deletion request]',
      additional_details: null,
      ai_patient_profile: merged,
      status: 'disposition_finalized',
      updated_at: approvedAt.toISOString(),
    })
    .eq('id', row.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    caseId: row.id,
    /** Echo for UI / logs */
    deletion_approved_at_txt: approvedAtText,
  });
}
