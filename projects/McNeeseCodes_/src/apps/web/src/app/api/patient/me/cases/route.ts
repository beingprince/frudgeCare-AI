/**
 * GET /api/patient/me/cases
 *
 * Returns the list of cases owned by the currently authenticated
 * patient, newest first. Used by /patient/status to redirect a
 * just-logged-in patient to their most recent case (and, eventually,
 * to show on screen an "all my cases" list).
 *
 * Requires a valid `fc_session` cookie with role=patient.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface CaseSummary {
  id: string;
  case_code: string;
  status: string | null;
  urgency_final: string | null;
  urgency_suggested: string | null;
  symptom_text: string | null;
  created_at: string | null;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'patient') {
    return NextResponse.json(
      { success: false, error: 'Not authenticated as a patient.' },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    // No DB → nothing to list (the demo backup option in /api/cases/create
    // uses the temporary mock store but that's not keyed by patient
    // profile, so we just return empty here rather than risk leaking
    // someone else's mock case).
    return NextResponse.json({ cases: [] satisfies CaseSummary[] });
  }

  const { data, error } = await admin
    .from('cases')
    .select(
      'id, case_code, status, urgency_final, urgency_suggested, symptom_text, created_at',
    )
    .eq('patient_profile_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[patient/me/cases]', error);
    return NextResponse.json(
      { success: false, error: 'Could not load your cases.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ cases: (data ?? []) as CaseSummary[] });
}
