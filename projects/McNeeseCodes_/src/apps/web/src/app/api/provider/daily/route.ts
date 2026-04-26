/**
 * GET /api/provider/daily
 *
 * Lists "today's" work for a provider from **cases** that are actually in the
 * provider queue (nurse handoff → provider_review_pending / provider_action_issued).
 *
 * The /provider/daily *page* used to read only `appointments` with status
 * `confirmed` — but the hackathon flow never creates appointment rows when a
 * nurse sends a case, so the list was always empty. This route is the fix.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { MockAppointment, MockCase, MockPatient } from '@/lib/mock-service';

const PROVIDER_QUEUE_STATUSES = [
  'provider_review_pending',
  'provider_action_issued',
] as const;

function pad2(n: number) {
  return String(Math.min(23, Math.max(0, n))).padStart(2, '0');
}

/** HH:mm from total minutes in day */
function fmtClock(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = Math.floor(totalMins % 60);
  return `${pad2(h)}:${String(m).padStart(2, '0')}`;
}

/**
 * Staggered slot times from handoff/updated time so the board looks ordered.
 */
function timesFromRow(row: { updated_at?: string | null; created_at?: string | null }, index: number) {
  const iso = row.updated_at || row.created_at;
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const start = 8 * 60 + 30 + index * 22;
    return { start_time: fmtClock(start), end_time: fmtClock(start + 20) };
  }
  const base = d.getHours() * 60 + d.getMinutes() + index * 2;
  const start = Math.min(20 * 60, Math.max(7 * 60, base % (14 * 60) + 7 * 60));
  return { start_time: fmtClock(start), end_time: fmtClock(start + 20) };
}

function buildPatientFromCase(row: Record<string, unknown>): MockPatient {
  const name = (row.patient_full_name as string) || 'Patient';
  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return {
    id: (row.patient_id as string) || 'walk-in',
    patient_code: (row as { patient_id?: string }).patient_id
      ? `FC-P-${String((row as { patient_id: string }).patient_id).slice(0, 6)}`
      : 'FC-P-WALKIN',
    full_name: name,
    initials: initials || 'P',
    date_of_birth: (row.patient_date_of_birth as string) || '—',
    sex: (row.patient_gender as string) || '—',
    phone: (row.patient_phone as string) || '',
    email: (row.patient_email as string) || '',
    preferred_contact_method: 'phone',
    preferred_language: 'en',
    address_city: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    allergies: [],
    chronic_conditions: [],
  };
}

/**
 * Shapes a Supabase `cases` row + synthetic patient into MockCase.
 */
function buildCaseFromRow(row: Record<string, unknown>, patient: MockPatient): MockCase {
  return {
    id: String(row.id),
    case_code: (row.case_code as string) || String(row.id).slice(0, 8),
    patient_id: patient.id,
    symptom_text: (row.symptom_text as string) || '—',
    symptom_tags: (row.symptom_tags as string[]) || [],
    duration_text: (row.duration_text as string) || '',
    severity_hint: (row.severity_hint as MockCase['severity_hint']) || 'mild',
    urgency_suggested: (row.urgency_suggested as MockCase['urgency_suggested']) || 'low',
    urgency_final: (row.urgency_final as MockCase['urgency_final']) || undefined,
    urgency_reason: (row.urgency_reason as string) || undefined,
    risky_flags: (row.risky_flags as string[]) || [],
    structured_summary: (row.structured_summary as string) || undefined,
    status: (row.status as MockCase['status']) || 'provider_review_pending',
    source_channel: (row.source_channel as string) || 'intake',
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
    patient_full_name: (row.patient_full_name as string) || undefined,
    patient_date_of_birth: (row.patient_date_of_birth as string) || undefined,
    patient_age: (row.patient_age as number) ?? undefined,
    patient_gender: (row.patient_gender as string) || undefined,
    patient_phone: (row.patient_phone as string) || undefined,
    patient_email: (row.patient_email as string) || undefined,
    additional_details: (row.additional_details as string) || undefined,
    ai_clinician_brief: (row.ai_clinician_brief as string) || undefined,
    patient,
  } as MockCase;
}

function rowToAppointment(row: Record<string, unknown>, index: number): MockAppointment {
  const patient = buildPatientFromCase(row);
  const caseObj = buildCaseFromRow(row, patient);
  const { start_time, end_time } = timesFromRow(
    { updated_at: row.updated_at as string, created_at: row.created_at as string },
    index,
  );
  const u = (row.urgency_final || row.urgency_suggested || '') as string;
  const urgent = u === 'high';

  return {
    id: `queue-${row.id}`,
    case_id: String(row.id),
    patient_id: patient.id,
    provider_user_id: 'usr_pr_001',
    scheduled_date: new Date().toISOString().slice(0, 10),
    start_time,
    end_time,
    status: 'confirmed',
    location_label: urgent ? 'Triage — priority review' : 'Triage — awaiting provider',
    queue_bucket: 'provider_queue',
    urgent_slot: urgent,
    reminder_state: 'n/a',
    reschedule_count: 0,
    provider_name: 'Dr. Emily Carter',
    provider_dept: 'Primary Care',
    case: caseObj,
    patient,
  };
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ items: [], source: 'no_admin' as const });
  }

  const { data: rows, error } = await admin
    .from('cases')
    .select('*')
    .in('status', [...PROVIDER_QUEUE_STATUSES])
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[provider/daily]', error);
    return NextResponse.json(
      { error: error.message, items: [] },
      { status: 500 },
    );
  }

  const items = (rows ?? []).map((r, i) =>
    rowToAppointment(r as Record<string, unknown>, i),
  );

  return NextResponse.json({
    items,
    source: 'supabase' as const,
    count: items.length,
  });
}
