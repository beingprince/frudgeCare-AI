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

/**
 * Whitelist of columns we know exist on `public.cases` (per
 * supabase/migrations/20240425000000_intake_cases_minimal.sql +
 * 20240426 patient_profile_id FK). Callers historically over-shared
 * payload (e.g. the intake form sends `urgency` and `recommended_route`
 * which Supabase rejects with "column not found"). We filter to this
 * allowlist before insert and fold any extras into ai_patient_profile
 * so nothing is silently lost.
 */
const CASE_COLUMNS = new Set<string>([
  'case_code',
  'patient_id',
  'submitted_by_user_id',
  'status',
  'source_channel',
  'urgency_suggested',
  'urgency_final',
  'urgency_reason',
  'structured_summary',
  'risky_flags',
  'ai_clinician_brief',
  'symptom_text',
  'duration_text',
  'severity_hint',
  'additional_details',
  'patient_full_name',
  'patient_date_of_birth',
  'patient_age',
  'patient_gender',
  'patient_phone',
  'patient_phone_country',
  'patient_email',
  'preferred_timing',
  'preferred_provider',
  'patient_history',
  'ai_patient_profile',
  'patient_profile_id',
  'created_at',
  'updated_at',
]);

/**
 * Extras from body that don't map to a column. We fold these into
 * ai_patient_profile.client_extras so the row keeps a record of
 * everything the client sent (useful for /patient/status to display
 * the recommended_route, for example).
 */
function partitionForCases(body: Record<string, unknown>): {
  row: Record<string, unknown>;
  extras: Record<string, unknown>;
} {
  const row: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  // Map common-but-misnamed fields.
  if ('urgency' in body && !('urgency_final' in body)) {
    row.urgency_final = body.urgency;
    row.urgency_suggested = body.urgency;
  }
  for (const [k, v] of Object.entries(body)) {
    if (k === 'urgency') continue; // handled above
    if (CASE_COLUMNS.has(k)) row[k] = v;
    else extras[k] = v;
  }
  return { row, extras };
}

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

  const { row: insertRow, extras } = partitionForCases(body);
  insertRow.case_code = caseCode;
  // Drop any client-supplied `id` so we don't fight Postgres' default.
  delete (insertRow as Record<string, unknown>).id;
  if (patientProfileId) insertRow.patient_profile_id = patientProfileId;

  // Fold unmapped fields (e.g. recommended_route) into ai_patient_profile
  // under a client_extras key so the data is preserved without breaking
  // the schema-strict insert.
  if (Object.keys(extras).length > 0) {
    const baseProfile =
      typeof insertRow.ai_patient_profile === 'object' &&
      insertRow.ai_patient_profile !== null
        ? (insertRow.ai_patient_profile as Record<string, unknown>)
        : {};
    insertRow.ai_patient_profile = {
      ...baseProfile,
      client_extras: {
        ...(typeof baseProfile.client_extras === 'object' && baseProfile.client_extras !== null
          ? (baseProfile.client_extras as Record<string, unknown>)
          : {}),
        ...extras,
      },
    };
  }

  const admin = getSupabaseAdmin();
  if (admin) {
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
    ...insertRow,
    id: caseCode,
    case_code: caseCode,
    patient_profile_id: patientProfileId,
  };
  addMockCase(mockRow);
  return NextResponse.json({ caseId: caseCode });
}
