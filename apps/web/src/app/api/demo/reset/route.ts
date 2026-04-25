import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return NextResponse.json(
      { error: 'Demo reset is only available in demo mode.' },
      { status: 403 }
    );
  }

  try {
    // 1. Clear dynamic tables (Order matters for FKeys)
    await supabase.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('visit_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Break FKey in cases before deleting appointments
    await supabase.from('cases').update({ linked_appointment_id: null }).neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('cases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // We keep Users and Patient Profiles static for the demo personas

    // 2. Re-seed master demo cases (Deterministic)
    const { data: case1 } = await supabase.from('cases').insert({
      id: '00000000-case-5001',
      case_code: 'FC-C-5001',
      patient_id: 'pat_001',
      symptom_text: 'Chest tightness since early morning with shortness of breath when walking upstairs.',
      duration_text: 'Started 6 hours ago',
      severity_hint: 'severe',
      urgency_suggested: 'high',
      urgency_final: 'high',
      urgency_reason: 'Chest symptoms and breathing concern require urgent review.',
      risky_flags: ['chest symptom', 'breathing difficulty'],
      structured_summary: 'Adult patient reports chest tightness and shortness of breath with exertion. Review immediately and place in urgent queue.',
      status: 'confirmed'
    }).select().single();

    const { data: appt1 } = await supabase.from('appointments').insert({
      id: '00000000-appt-5001',
      case_id: '00000000-case-5001',
      patient_id: 'pat_001',
      provider_user_id: 'usr_pr_001',
      scheduled_date: new Date().toISOString().split('T')[0],
      start_time: '09:15',
      end_time: '09:35',
      status: 'confirmed',
      location_label: 'Exam Room 2',
      urgent_slot: true
    }).select().single();

    await supabase.from('cases').update({ linked_appointment_id: '00000000-appt-5001' }).eq('id', '00000000-case-5001');

    await supabase.from('events').insert([
      { event_name: 'intake_submitted', case_id: '00000000-case-5001', patient_id: 'pat_001', actor_role: 'patient', timestamp: new Date().toISOString() },
      { event_name: 'urgency_suggested', case_id: '00000000-case-5001', patient_id: 'pat_001', actor_role: 'admin', timestamp: new Date().toISOString() }
    ]);

    return NextResponse.json({ success: true, message: 'System reset to deterministic demo state.' });
  } catch (error) {
    console.error('Reset Error:', error);
    return NextResponse.json({ error: 'Failed to reset system.' }, { status: 500 });
  }
}
