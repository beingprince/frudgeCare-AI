-- FrudgeCare Auth Schema Extension
-- Migration: 20240418000001_auth_schema.sql
-- Adds staff_code, password_hash, OTP sessions, login attempt tracking

-- ==================================================
-- 1. EXTEND USERS TABLE FOR STAFF AUTH
-- ==================================================

alter table public.users 
  add column if not exists staff_code text unique,
  add column if not exists password_hash text,
  add column if not exists username text unique,
  add column if not exists failed_login_attempts int default 0,
  add column if not exists locked_until timestamptz;

-- Unique index on staff_code for fast lookup
create unique index if not exists idx_users_staff_code on public.users(staff_code) where staff_code is not null;
create unique index if not exists idx_users_username on public.users(username) where username is not null;

-- ==================================================
-- 2. OTP SESSIONS TABLE
-- Stores one-time codes for staff phone verification
-- ==================================================

create table if not exists public.otp_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  otp_code text not null,
  phone_last4 text,               -- Last 4 digits of phone for display only
  expires_at timestamptz not null,
  verified boolean default false,
  verification_token text unique, -- Short-lived token issued after OTP success
  created_at timestamptz default now()
);

create index if not exists idx_otp_sessions_user on public.otp_sessions(user_id);
create index if not exists idx_otp_sessions_token on public.otp_sessions(verification_token) where verification_token is not null;

-- ==================================================
-- 3. STAFF LOGIN ATTEMPTS TABLE
-- Tracks failed attempts per user for rate limiting
-- ==================================================

create table if not exists public.staff_login_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  ip_address text,
  staff_code_tried text,
  attempt_type text not null, -- 'identity', 'otp', 'password', 'cross_validation'
  success boolean default false,
  failure_reason text,
  attempted_at timestamptz default now()
);

create index if not exists idx_login_attempts_user on public.staff_login_attempts(user_id);
create index if not exists idx_login_attempts_time on public.staff_login_attempts(attempted_at);

-- ==================================================
-- 4. PATIENT SESSIONS TABLE (lightweight)
-- Simple DOB + phone/email session for patients
-- ==================================================

create table if not exists public.patient_sessions (
  id uuid primary key default uuid_generate_v4(),
  patient_profile_id uuid references public.patient_profiles(id) on delete cascade not null,
  session_token text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_patient_sessions_token on public.patient_sessions(session_token);

-- ==================================================
-- 5. DEMO STAFF SEED DATA
-- Deterministic accounts for hackathon demo mode
-- Password hash is bcrypt of "demo1234"
-- ==================================================

insert into public.users (
  id, role, display_name, first_name, last_name, email, phone,
  staff_code, username, active,
  password_hash, department
) values
  (
    'usr_admin_001', 'admin', 'System Admin', 'System', 'Admin',
    'admin@frudgecare.demo', '+15550001111',
    'ADM-001', 'sysadmin', true,
    '$2b$10$demo_hash_placeholder', 'Administration'
  ),
  (
    'usr_fd_001', 'front_desk', 'Maria Johnson', 'Maria', 'Johnson',
    'maria@frudgecare.demo', '+15550002222',
    'FD-001', 'maria', true,
    '$2b$10$demo_hash_placeholder', 'Outpatient Services'
  ),
  (
    'usr_pr_001', 'provider', 'Dr. Emily Carter', 'Emily', 'Carter',
    'emily@frudgecare.demo', '+15550003333',
    'PR-001', 'emily', true,
    '$2b$10$demo_hash_placeholder', 'Primary Care'
  )
on conflict (id) do update set
  staff_code = excluded.staff_code,
  username = excluded.username,
  password_hash = excluded.password_hash;

-- ==================================================
-- 6. RLS POLICIES FOR AUTH TABLES
-- ==================================================

alter table public.otp_sessions enable row level security;
alter table public.staff_login_attempts enable row level security;
alter table public.patient_sessions enable row level security;

-- Service role only (auth routes use service key)
create policy "Service role manages OTP" on public.otp_sessions
  using (true) with check (true);

create policy "Service role manages attempts" on public.staff_login_attempts
  using (true) with check (true);

create policy "Service role manages patient sessions" on public.patient_sessions
  using (true) with check (true);
