/**
 * /api/nurse/assessments
 *
 * Save a completed nurse triage assessment. Used by the nurse
 * handoff flow before transitioning the case to provider_review_pending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

function generateAssessmentId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < bytes.length; i++) id += alphabet[bytes[i] % alphabet.length];
  return `NA-${id}`;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const assessmentId = generateAssessmentId();
  const record = { ...body, id: assessmentId };

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('nurse_assessments')
      .insert(record)
      .select('id')
      .single();

    if (error) {
      console.error('Supabase nurse_assessments insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ assessmentId: data.id });
  }

  return NextResponse.json({ assessmentId });
}
