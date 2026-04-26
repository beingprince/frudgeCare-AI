-- Deterministic Demo Seed for FrudgeCare AI
-- Based on the Definitive Build Contract

-- 1. SEED USERS
insert into public.users (id, role, display_name, first_name, last_name, email, phone, active, department)
values 
  ('usr_fd_001', 'front_desk', 'Maria Johnson', 'Maria', 'Johnson', 'maria.frontdesk@frudgecare.demo', '+1-337-555-1001', true, 'Front Desk'),
  ('usr_pr_001', 'provider', 'Dr. Emily Carter', 'Emily', 'Carter', 'emily.carter@frudgecare.demo', '+1-337-555-2001', true, 'Primary Care'),
  ('usr_ops_001', 'operations', 'Noah Brooks', 'Noah', 'Brooks', 'ops@frudgecare.demo', '+1-337-555-3001', true, 'Operations')
on conflict (id) do nothing;

-- 2. SEED PATIENT PROFILES
insert into public.patient_profiles (id, user_id, patient_code, full_name, date_of_birth, sex, phone, email, preferred_contact_method, address_city, allergies, chronic_conditions)
values 
  ('pat_001', null, 'FC-P-1001', 'John Miller', '1993-08-11', 'Male', '+1-337-555-4001', 'john.miller@example.com', 'sms', 'Lake Charles', '{Penicillin}', '{Asthma}'),
  ('pat_002', null, 'FC-P-1002', 'Ava Thompson', '1987-02-19', 'Female', '+1-337-555-4010', 'ava.t@example.com', 'email', 'Sulphur', '{}', '{Diabetes Type 2}')
on conflict (id) do nothing;

-- 3. SEED CASES
insert into public.cases (id, case_code, patient_id, symptom_text, symptom_tags, duration_text, severity_hint, urgency_suggested, urgency_final, urgency_reason, risky_flags, structured_summary, assigned_front_desk_user_id, assigned_provider_user_id, status)
values 
  ('case_001', 'FC-C-5001', 'pat_001', 'Chest tightness since early morning with shortness of breath when walking upstairs.', '{chest discomfort, shortness of breath}', 'Started 6 hours ago', 'severe', 'high', 'high', 'Chest symptoms and breathing concern require urgent review.', '{chest symptom, breathing difficulty}', 'Adult patient reports chest tightness and shortness of breath with exertion. Review immediately and place in urgent queue.', 'usr_fd_001', 'usr_pr_001', 'confirmed'),
  ('case_002', 'FC-C-5002', 'pat_002', 'Persistent cough for four days, mild fever at night, tiredness.', '{cough, fever, fatigue}', '4 days', 'moderate', 'medium', 'medium', 'Stable but should be seen soon.', '{}', 'Patient reports cough, mild fever, and fatigue for four days. No severe distress noted in intake.', 'usr_fd_001', null, 'under_review')
on conflict (id) do nothing;

-- 4. SEED APPOINTMENTS
insert into public.appointments (id, case_id, patient_id, provider_user_id, scheduled_date, start_time, end_time, status, location_label, queue_bucket, urgent_slot, reminder_state)
values 
  ('appt_001', 'case_001', 'pat_001', 'usr_pr_001', '2026-04-25', '09:15', '09:35', 'confirmed', 'Exam Room 2', 'urgent_reserved', true, 'sent')
on conflict (id) do nothing;

-- Update case with appointment link
update public.cases set linked_appointment_id = 'appt_001' where id = 'case_001';

-- 5. SEED EVENTS
insert into public.events (id, event_name, case_id, patient_id, actor_role, timestamp, metadata)
values 
  ('evt_001', 'intake_submitted', 'case_001', 'pat_001', 'patient', '2026-04-25T08:05:00Z', '{"preferred_date": "2026-04-25"}'),
  ('evt_002', 'urgency_suggested', 'case_001', 'pat_001', 'admin', '2026-04-25T08:06:00Z', '{"urgency_suggested": "high"}'),
  ('evt_003', 'case_reviewed', 'case_001', 'pat_001', 'front_desk', '2026-04-25T08:09:00Z', '{"action": "approved"}')
on conflict (id) do nothing;

-- 6. SEED AUDIT LOG
insert into public.audit_log (id, table_name, record_id, field_name, old_value, new_value, changed_by_user_id, changed_by_role, reason)
values 
  ('audit_001', 'cases', 'case_001', 'urgency_final', 'null', 'high', 'usr_fd_001', 'front_desk', 'Front desk approved urgent review after staff check.')
on conflict (id) do nothing;
