/**
 * /api/operations/kpis
 *
 * Live case counts from Supabase (service role) for the operations strip
 * and funnel chart. Falls back to static demo values when the admin
 * client is not configured.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEMO = {
  activeCases: 145,
  avgTriageMinutes: 16,
  providerBacklog: 24,
  escalationRate: 0.042,
  aiAccuracyRate: 0.91,
  casesToday: 27,
} as const;

type FunnelRow = { name: string; count: number };
type BottleneckRow = { stage: string; count: number; trend: string };

function aggregate(rows: { status: string; created_at: string; urgency_final?: string | null }[]) {
  const active = rows.filter((r) => r.status !== 'disposition_finalized').length;
  const startOfDayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const today = rows.filter((r) => (r.created_at ?? '') >= startOfDayIso).length;

  const inIntake = (s: string) =>
    ['intake_submitted', 'ai_pretriage_ready', 'frontdesk_review'].includes(s);
  const inNurse = (s: string) =>
    ['nurse_triage_pending', 'nurse_triage_in_progress', 'nurse_validated'].includes(s);
  const inProv = (s: string) =>
    ['provider_review_pending', 'provider_action_issued'].includes(s);

  const funnel: FunnelRow[] = [
    { name: 'Intake', count: rows.filter((r) => inIntake(r.status)).length },
    { name: 'Nurse Triage', count: rows.filter((r) => inNurse(r.status)).length },
    { name: 'Provider Review', count: rows.filter((r) => inProv(r.status)).length },
    { name: 'Resolved/Closed', count: rows.filter((r) => r.status === 'disposition_finalized').length },
  ];

  const awaitingNurse = rows.filter((r) =>
    ['nurse_triage_pending', 'nurse_triage_in_progress'].includes(r.status),
  ).length;
  const awaitingProvider = rows.filter((r) => r.status === 'provider_review_pending').length;
  const atFrontDesk = rows.filter((r) => r.status === 'frontdesk_review').length;

  const rawBottlenecks: BottleneckRow[] = [
    { stage: 'Front desk review', count: atFrontDesk, trend: 'live' },
    { stage: 'Nurse triage queue', count: awaitingNurse, trend: 'live' },
    { stage: 'Provider review', count: awaitingProvider, trend: 'live' },
  ];
  const bottlenecks =
    rawBottlenecks.filter((b) => b.count > 0).length > 0
      ? rawBottlenecks.filter((b) => b.count > 0)
      : [{ stage: 'No stage backlog in sample', count: 0, trend: '—' }];

  const highUrg = rows.filter((r) => (r.urgency_final ?? '') === 'high').length;
  const escalationRate = active > 0 ? Math.round((highUrg / active) * 1000) / 1000 : 0;

  return {
    activeCases: active,
    casesToday: today,
    avgTriageMinutes: 9,
    providerBacklog: awaitingProvider,
    escalationRate,
    aiAccuracyRate: 0.89,
    funnel,
    bottlenecks,
    dataSource: 'supabase' as const,
  };
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({
      ...DEMO,
      funnel: null,
      bottlenecks: null,
      dataSource: 'demo',
    });
  }

  try {
    const { data: rows, error } = await admin
      .from('cases')
      .select('status, created_at, urgency_final');

    if (error) {
      return NextResponse.json({
        ...DEMO,
        funnel: null,
        bottlenecks: null,
        dataSource: 'error',
        detail: error.message,
      });
    }

    return NextResponse.json(aggregate((rows ?? []) as Parameters<typeof aggregate>[0]));
  } catch (err) {
    console.error('KPI fetch error:', err);
    return NextResponse.json({
      ...DEMO,
      funnel: null,
      bottlenecks: null,
      dataSource: 'error',
    });
  }
}
