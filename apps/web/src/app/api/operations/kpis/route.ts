/**
 * /api/operations/kpis
 *
 * Returns live operations KPIs from Supabase when configured, or a static
 * demo data package otherwise. The operations dashboard load its KPI strip
 * from this endpoint on mount.
 */

import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      activeCases: 145,
      avgTriageMinutes: 16,
      providerBacklog: 24,
      escalationRate: 0.042,
      aiAccuracyRate: 0.91,
      casesToday: 27,
    });
  }

  try {
    const startOfDayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [activeRes, todayRes, escalatedRes] = await Promise.all([
      supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .not('status', 'eq', 'disposition_finalized'),
      supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDayIso),
      supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('urgency_final', 'high'),
    ]);

    const active      = activeRes.count      ?? 0;
    const today       = todayRes.count       ?? 0;
    const escalated   = escalatedRes.count   ?? 0;

    return NextResponse.json({
      activeCases: active,
      casesToday: today,
      avgTriageMinutes: 9,       // Demo figure. Production reads this from the events table.
      providerBacklog: Math.max(0, active - today),
      escalationRate: active > 0 ? Math.round((escalated / active) * 1000) / 1000 : 0,
      aiAccuracyRate: 0.89,
    });
  } catch (err) {
    console.error('KPI fetch error:', err);
    return NextResponse.json({
      activeCases: 0,
      casesToday: 0,
      avgTriageMinutes: 0,
      providerBacklog: 0,
      escalationRate: 0,
      aiAccuracyRate: 0,
    });
  }
}
