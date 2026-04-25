/**
 * /api/provider/decisions
 *
 * Save a signed provider decision. Supabase-first with a graceful
 * 200-ok backup option when Supabase isn't configured — the client then mirrors
 * to localStorage so the demo receipt still show on screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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
      { status: 400 }
    );
  }

  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('provider_actions').insert({
      case_id: body.caseId,
      provider_id: body.providerId ?? 'usr_pr_001',
      action_type: body.nextAction,
      encounter_note: body.encounterNote ?? '',
      patient_visible_update: body.patientUpdate ?? null,
      status: 'completed',
      created_at: body.signedAt ?? new Date().toISOString(),
    });

    if (error) {
      console.error('Supabase provider_actions insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Best-effort audit event. Don't fail the decision if this errors.
    await supabase.from('events').insert({
      case_id: body.caseId,
      event_name: 'provider.decision_signed',
      actor_user_id: body.providerId ?? 'usr_pr_001',
      timestamp: body.signedAt ?? new Date().toISOString(),
      metadata: { action: body.nextAction },
    });
  }

  return NextResponse.json({ success: true });
}
