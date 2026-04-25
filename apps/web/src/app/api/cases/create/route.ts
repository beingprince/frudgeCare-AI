/**
 * /api/cases/create
 *
 * Creates a case from patient intake.
 *
 * Resolution order:
 *   1. Supabase via the SERVICE_ROLE admin client (skip RLS).
 *   2. Mock temporary store (used when env vars are missing or look like
 *      placeholders, so the demo never hard-blocks on missing infra).
 *
 * Patient binding
 * ---------------
 * If the request carries an `fc_session` cookie (set by either
 * `/api/patient/register` or `/api/login/patient/login`), we ALWAYS bind
 * the new case to that session's `userId`. This is the canonical owner.
 *
 * If there is no session but the body sets `patient_profile_id`, we
 * accept it as-is — front-desk staff can create a case on behalf of a
 * patient whose account already exists.
 *
 * Anonymous walk-ins (no session, no body field) still succeed: the
 * `patient_profile_id` column is nullable on purpose.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { addMockCase } from '@/lib/mock-service';
import { getSession } from '@/lib/auth';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateCaseCode(): string {
  // 6-char alphanumeric suffix, uppercase — matches existing FC-C- format.
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < bytes.length; i++) id += alphabet[bytes[i] % alphabet.length];
  return `FC-C-${id}`;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const caseCode = generateCaseCode();

  // Decide who owns this case. Prefer the session (a logged-in patient
  // can never accidentally bind a case to someone else's profile);
  // fall back to body for staff-driven flows.
  const session = await getSession();
  let patientProfileId: string | null = null;
  if (session?.role === 'patient' && UUID_RE.test(session.userId)) {
    patientProfileId = session.userId;
  } else if (
    typeof body.patient_profile_id === 'string' &&
    UUID_RE.test(body.patient_profile_id)
  ) {
    patientProfileId = body.patient_profile_id;
  }
  // Strip whatever the body claimed about ownership; we already
  // resolved the canonical value above.
  delete (body as Record<string, unknown>).patient_profile_id;

  const admin = getSupabaseAdmin();
  if (admin) {
    const insertRow: Record<string, unknown> = {
      ...body,
      case_code: caseCode,
    };
    // Drop any client-supplied `id` so we don't fight Postgres' default.
    delete (insertRow as Record<string, unknown>).id;
    if (patientProfileId) insertRow.patient_profile_id = patientProfileId;

    const { data, error } = await admin
      .from('cases')
      .insert(insertRow)
      .select('id, case_code')
      .single();

    if (error) {
      console.error('Supabase case insert error:', error);
      return NextResponse.json(
        { error: 'DB insert failed', detail: error.message, hint: error.hint },
        { status: 500 },
      );
    }
    return NextResponse.json({ caseId: data.case_code, uuid: data.id });
  }

  // ── Mock backup option ─────────────────────────────────────────────
  const mockRow = {
    ...body,
    id: caseCode,
    case_code: caseCode,
    patient_profile_id: patientProfileId,
  };
  addMockCase(mockRow);
  return NextResponse.json({ caseId: caseCode });
}
