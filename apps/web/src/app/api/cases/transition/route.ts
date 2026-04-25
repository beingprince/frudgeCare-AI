/**
 * /api/cases/transition
 *
 * Authoritative case data transitioner. Uses the central FSM helper so
 * impossible moves (e.g. intake_submitted -> disposition_finalized) are
 * rejected with 422 before any DB write.
 *
 * Writes the transition into cases.status and inserts an audit event.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { updateMockCase } from '@/lib/mock-service';
import { canTransition, type CaseStatus } from '@/lib/caseStateMachine';

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

  const updatePayload: Record<string, unknown> = {
    status: to_status,
    updated_at: new Date().toISOString(),
  };
  if (assessment_id) updatePayload.active_nurse_assessment_id = assessment_id;

  // Prefer service-role (same as /api/cases/create and queue) so RLS does not block staff flows.
  const db = getSupabaseAdmin() ?? (isSupabaseConfigured() ? supabase : null);
  if (db) {
    const { error: caseErr } = await db
      .from('cases')
      .update(updatePayload)
      .eq('id', case_id);

    if (caseErr) {
      console.error('[cases/transition] case update', caseErr);
      return NextResponse.json({ error: caseErr.message }, { status: 500 });
    }

    const { error: eventErr } = await db.from('events').insert({
      case_id,
      event_name: event_type ?? 'case.transition',
      actor_user_id: actor_id ?? null,
      timestamp: new Date().toISOString(),
      metadata: { from_status, to_status, assessment_id: assessment_id ?? null },
    });
    if (eventErr) {
      console.error('[cases/transition] event insert', eventErr);
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }
  } else {
    const mock = updateMockCase(case_id, { status: to_status });
    if (!mock) {
      return NextResponse.json(
        { error: 'Case not found (mock store)' },
        { status: 404 },
      );
    }
  }

  return NextResponse.json({ success: true, new_status: to_status });
}
