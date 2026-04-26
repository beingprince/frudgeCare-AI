/**
 * /api/nurse/assessments
 *
 * Save a completed nurse triage assessment. Used by the nurse handoff
 * flow before transitioning the case to provider_review_pending.
 *
 * Persistence strategy:
 * ─────────────────────
 * The hackathon Supabase project does NOT include a dedicated
 * `nurse_assessments` table. Rather than fail the handoff, we:
 *
 *   1. Try to insert into `nurse_assessments` (works once the table
 *      lands).
 *   2. Always merge the assessment into `cases.ai_patient_profile`
 *      under a `nurse_assessment` key so the provider page can read it
 *      via /api/cases/[id]. This is what actually keeps the data
 *      "travelling" from the nurse to the provider today.
 *
 * Returned assessmentId is then handed back to /api/cases/transition
 * so the case row also carries `active_nurse_assessment_id` (also
 * stashed inside ai_patient_profile until the column exists).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateAssessmentId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < bytes.length; i++) id += alphabet[bytes[i] % alphabet.length];
  return `NA-${id}`;
}

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? '').toLowerCase();
  return (
    err.code === 'PGRST205' ||
    err.code === 'PGRST204' ||
    msg.includes('could not find the table')
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const assessmentId = generateAssessmentId();
  const caseId = typeof body.case_id === 'string' ? body.case_id : null;
  const record = { ...body, id: assessmentId };

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ assessmentId, persisted: 'memory_only' });
  }

  // 1) Try the dedicated table first. If it exists, great — we get a
  //    real audit row. If not, swallow + fall through to step 2.
  let dedicatedTablePersisted = true;
  const { error: insertErr } = await admin
    .from('nurse_assessments')
    .insert(record);
  if (insertErr) {
    dedicatedTablePersisted = false;
    if (!isMissingRelation(insertErr)) {
      console.error('[nurse/assessments] insert', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    console.warn(
      '[nurse/assessments] nurse_assessments table missing — folding into cases.ai_patient_profile.nurse_assessment',
    );
  }

  // 2) Fold into the case row so the provider page can actually see
  //    the nurse's clinical work via /api/cases/[id]. This is what
  //    makes the front-desk → nurse → provider data pipeline real
  //    against the live (limited) schema.
  if (caseId) {
    const isUuid = UUID_RE.test(caseId);
    const lookup = admin.from('cases').select('id, ai_patient_profile').limit(1);
    const { data: row, error: lookupErr } = isUuid
      ? await lookup.eq('id', caseId).maybeSingle()
      : await lookup.eq('case_code', caseId).maybeSingle();

    if (lookupErr) {
      console.error('[nurse/assessments] case lookup', lookupErr);
      // Don't 500 — the assessment id is still valid, the caller can
      // proceed to the transition step.
    } else if (row) {
      const baseProfile =
        typeof row.ai_patient_profile === 'object' && row.ai_patient_profile !== null
          ? (row.ai_patient_profile as Record<string, unknown>)
          : {};
      const merged = {
        ...baseProfile,
        nurse_assessment: record,
        active_nurse_assessment_id: assessmentId,
      };
      const { error: updateErr } = await admin
        .from('cases')
        .update({
          ai_patient_profile: merged,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (updateErr) {
        console.error('[nurse/assessments] case update', updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    assessmentId,
    persisted: dedicatedTablePersisted ? 'table_and_case' : 'case_only',
  });
}
