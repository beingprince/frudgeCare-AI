/**
 * /api/provider/decisions
 *
 * Save a signed provider decision.
 *
 * Persistence strategy (schema-tolerant, mirrors /api/nurse/assessments):
 *   1. Try `provider_actions` insert via the SERVICE_ROLE admin client
 *      (skips RLS so the demo doesn't depend on per-role grants).
 *   2. Always merge the decision into `cases.ai_patient_profile.provider_decision`
 *      so /provider/case/[id] and /patient/status can render it even when
 *      the dedicated table is absent (current hackathon Supabase project).
 *   3. Best-effort `events` audit insert — never fails the response.
 *
 * The client-side `saveDecision` mirrors to localStorage on top of all
 * this, so the receipt always reappears after a refresh.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? '').toLowerCase();
  return (
    err.code === 'PGRST205' ||
    err.code === 'PGRST204' ||
    msg.includes('could not find the table') ||
    msg.includes('relation') && msg.includes('does not exist')
  );
}

export async function POST(req: NextRequest) {
  let body: {
    caseId?: string;
    providerId?: string;
    providerName?: string;
    nextAction?: string;
    encounterNote?: string;
    patientUpdate?: string | null;
    signedAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.caseId || !body.nextAction) {
    return NextResponse.json(
      { error: 'caseId and nextAction are required' },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    // No Supabase configured at all — caller will mirror to localStorage.
    return NextResponse.json({ success: true, persisted: 'memory_only' });
  }

  const providerId = body.providerId ?? 'usr_pr_001';
  const signedAt = body.signedAt ?? new Date().toISOString();

  // 1) Best-effort dedicated table.
  let dedicatedTablePersisted = true;
  const insertPayload = {
    case_id: body.caseId,
    provider_id: providerId,
    action_type: body.nextAction,
    encounter_note: body.encounterNote ?? '',
    patient_visible_update: body.patientUpdate ?? null,
    status: 'completed',
    created_at: signedAt,
  };
  const { error: actionErr } = await admin
    .from('provider_actions')
    .insert(insertPayload);
  if (actionErr) {
    dedicatedTablePersisted = false;
    if (!isMissingRelation(actionErr)) {
      console.error('[provider/decisions] provider_actions insert', actionErr);
      // Don't 500 — try to at least fold into the case row so the data
      // is still recoverable via /api/cases/[id].
    } else {
      console.warn(
        '[provider/decisions] provider_actions table missing — folding into cases.ai_patient_profile.provider_decision',
      );
    }
  }

  // 2) Always fold into cases.ai_patient_profile so /api/cases/[id]
  //    surfaces the decision to the patient + provider pages.
  let caseFolded = false;
  const isUuid = UUID_RE.test(body.caseId);
  const lookup = admin.from('cases').select('id, ai_patient_profile, status').limit(1);
  const { data: row, error: lookupErr } = isUuid
    ? await lookup.eq('id', body.caseId).maybeSingle()
    : await lookup.eq('case_code', body.caseId).maybeSingle();

  if (!lookupErr && row) {
    const baseProfile =
      typeof row.ai_patient_profile === 'object' && row.ai_patient_profile !== null
        ? (row.ai_patient_profile as Record<string, unknown>)
        : {};
    const merged = {
      ...baseProfile,
      provider_decision: {
        provider_id: providerId,
        provider_name: body.providerName ?? null,
        action: body.nextAction,
        encounter_note: body.encounterNote ?? '',
        patient_update: body.patientUpdate ?? null,
        signed_at: signedAt,
      },
    };
    const { error: updateErr } = await admin
      .from('cases')
      .update({
        ai_patient_profile: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updateErr) {
      console.error('[provider/decisions] case update', updateErr);
    } else {
      caseFolded = true;
    }
  } else if (lookupErr) {
    console.error('[provider/decisions] case lookup', lookupErr);
  }

  // 3) Best-effort audit event. A missing events table must not fail
  //    the decision write — the user already saw the success state
  //    optimistically by the time we get here in most flows.
  let auditPersisted = true;
  const { error: auditErr } = await admin.from('events').insert({
    case_id: row?.id ?? body.caseId,
    event_name: 'provider.decision_signed',
    actor_user_id: providerId,
    timestamp: signedAt,
    metadata: { action: body.nextAction },
  });
  if (auditErr) {
    auditPersisted = false;
    if (!isMissingRelation(auditErr)) {
      console.warn('[provider/decisions] audit insert', auditErr);
    }
  }

  return NextResponse.json({
    success: true,
    persisted: dedicatedTablePersisted
      ? caseFolded
        ? 'table_and_case'
        : 'table_only'
      : caseFolded
      ? 'case_only'
      : 'memory_only',
    auditPersisted,
  });
}
