/**
 * /api/cases/transition
 *
 * Authoritative case data transitioner. Uses the central FSM helper so
 * impossible moves (e.g. intake_submitted -> disposition_finalized) are
 * rejected with 422 before any DB write.
 *
 * Writes the transition into cases.status and (best-effort) appends an
 * audit row to the events table.
 *
 * Schema-tolerance:
 * ─────────────────
 * The hackathon Supabase project ships with a minimal `cases` table and
 * does NOT include `events` or an `active_nurse_assessment_id` column.
 * The full relational schema lives in earlier migration files but was
 * never applied in this project. To keep the front-desk → nurse →
 * provider flow working today (without forcing the user to run SQL in
 * the dashboard mid-hackathon), this route:
 *
 *   1. Updates `cases.status` (always).
 *   2. Stores `assessment_id` under `cases.ai_patient_profile.active_nurse_assessment_id`
 *      because the dedicated column doesn't exist.
 *   3. Inserts an `events` row only if that table exists; absence is
 *      logged and swallowed so the transition still returns success.
 *      The case status update is the source of truth — the audit row
 *      is nice-to-have.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { updateMockCase } from '@/lib/mock-service';
import { canTransition, type CaseStatus } from '@/lib/caseStateMachine';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST error code thrown when a relation/column doesn't exist. */
function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? '').toLowerCase();
  return (
    err.code === 'PGRST205' ||
    err.code === 'PGRST204' ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the 'active_nurse_assessment_id' column")
  );
}

export async function POST(req: NextRequest) {
  let body: {
    case_id?: string;
    from_status?: CaseStatus;
    to_status?: CaseStatus;
    actor_id?: string;
    event_type?: string;
    assessment_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { case_id, from_status, to_status, actor_id, event_type, assessment_id } = body;

  if (!case_id || !from_status || !to_status) {
    return NextResponse.json(
      { error: 'case_id, from_status, and to_status are required' },
      { status: 400 }
    );
  }

  if (!canTransition(from_status, to_status)) {
    return NextResponse.json(
      { error: `Invalid transition: ${from_status} -> ${to_status}` },
      { status: 422 }
    );
  }

  // Prefer service-role (same as /api/cases/create and queue) so RLS does not block staff flows.
  const db = getSupabaseAdmin() ?? (isSupabaseConfigured() ? supabase : null);
  if (db) {
    // case_id may arrive as either the uuid `id` or the human `case_code`
    // (FC-C-XXXXXX). Resolve to the row before updating so we never write
    // to the wrong column.
    const isUuid = UUID_RE.test(case_id);
    const lookup = db.from('cases').select('id, ai_patient_profile').limit(1);
    const { data: existingRow, error: lookupErr } = isUuid
      ? await lookup.eq('id', case_id).maybeSingle()
      : await lookup.eq('case_code', case_id).maybeSingle();

    if (lookupErr) {
      console.error('[cases/transition] lookup', lookupErr);
      return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    }
    if (!existingRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      status: to_status,
      updated_at: new Date().toISOString(),
    };

    // Stash assessment_id inside ai_patient_profile because the live
    // schema doesn't expose a dedicated column for it.
    if (assessment_id) {
      const baseProfile =
        typeof existingRow.ai_patient_profile === 'object' &&
        existingRow.ai_patient_profile !== null
          ? (existingRow.ai_patient_profile as Record<string, unknown>)
          : {};
      updatePayload.ai_patient_profile = {
        ...baseProfile,
        active_nurse_assessment_id: assessment_id,
      };
    }

    const { error: caseErr } = await db
      .from('cases')
      .update(updatePayload)
      .eq('id', existingRow.id);

    if (caseErr) {
      console.error('[cases/transition] case update', caseErr);
      return NextResponse.json({ error: caseErr.message }, { status: 500 });
    }

    // Best-effort audit row. The events table doesn't exist on the
    // hackathon project; we log + continue so the FSM step still
    // succeeds for the caller.
    let auditPersisted = true;
    const { error: eventErr } = await db.from('events').insert({
      case_id: existingRow.id,
      event_name: event_type ?? 'case.transition',
      actor_user_id: actor_id ?? null,
      timestamp: new Date().toISOString(),
      metadata: { from_status, to_status, assessment_id: assessment_id ?? null },
    });
    if (eventErr) {
      auditPersisted = false;
      if (isMissingRelation(eventErr)) {
        console.warn(
          '[cases/transition] events table missing — audit row dropped, status update still applied',
        );
      } else {
        console.error('[cases/transition] event insert', eventErr);
      }
    }

    return NextResponse.json({
      success: true,
      new_status: to_status,
      audit_persisted: auditPersisted,
    });
  }

  const mock = updateMockCase(case_id, { status: to_status });
  if (!mock) {
    return NextResponse.json(
      { error: 'Case not found (mock store)' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, new_status: to_status, audit_persisted: false });
}
