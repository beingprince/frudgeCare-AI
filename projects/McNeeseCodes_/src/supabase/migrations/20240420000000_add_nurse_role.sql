-- Add nurse to user_role enum (Phase 1 / F-01)
-- Note: ADD VALUE IF NOT EXISTS requires Postgres 12+.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'nurse';

-- Insert demo nurse account (password_hash is placeholder for demo mode only;
-- real bcrypt hash must be written before production use).
INSERT INTO public.users (
  id, email, role, display_name, first_name, last_name, staff_code, username, password_hash, phone
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'sarah@frudgecare.demo',
  'nurse',
  'Sarah Chen, RN',
  'Sarah',
  'Chen',
  'NU-001',
  'sarah',
  '$2b$10$demo_hash_placeholder',
  '+1 (555) 000-5678'
) ON CONFLICT (id) DO NOTHING;
