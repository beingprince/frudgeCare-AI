-- ─────────────────────────────────────────────────────────────────
-- 20240427000000 — staff accounts + bcrypt-seeded demo users
-- ─────────────────────────────────────────────────────────────────
-- Adds the missing staff side of the auth model and seeds one user
-- per role so we can exercise every panel end-to-end against the
-- real database.
--
-- Why this migration exists
-- -------------------------
-- The 5-step staff login flow (`/auth/staff/[panel]`) was always going
-- to authenticate against a `users` table — but the only seeded data we
-- had so far was an in-memory `DEMO_STAFF_ACCOUNTS` constant. With real
-- Supabase credentials present, the production code path 401'd every
-- staff login because the table genuinely didn't exist.
--
-- This migration:
--
--   1. `staff_users`            — canonical staff identity. One row per
--      front_desk / nurse / provider / admin / operations user. Holds
--      the bcrypt password hash, the staff_code + username pair the
--      verify-identity step matches against, and the lockout counters
--      the rate limiter increments.
--   2. `staff_login_attempts`   — one row per cross-validation attempt,
--      success or failure. The login route was already inserting into
--      this table; we just need it to actually exist.
--   3. `audit_log`              — minimal version of the table referenced
--      by `logAuthEvent()` (the helper currently console-logs but the
--      column shape is the contract we'll graduate to).
--   4. Seeded demo users        — one per role, with a real bcrypt hash
--      generated server-side via pgcrypto. The hash format `$2a$12$…`
--      is interoperable with bcryptjs in Node, so the same `demo1234`
--      password works whether you log in through the UI or the SQL
--      editor.
--
-- Idempotent: safe to re-run. Seeds use ON CONFLICT (staff_code) to
-- avoid creating duplicates.
--
-- Run from Supabase Dashboard → SQL Editor → New Query → Run.
-- ─────────────────────────────────────────────────────────────────

-- pgcrypto gives us crypt() + gen_salt() so we can create bcrypt hashes
-- inside the seed block below without a separate seeder script. The
-- output is the same `$2a$NN$...` format that bcryptjs.compare()
-- accepts at runtime, so logins authenticate as expected.
create extension if not exists pgcrypto;


-- 1) STAFF USERS ─────────────────────────────────────────────────
create table if not exists public.staff_users (
    id                      uuid primary key default gen_random_uuid(),

    -- Role gates which panel the user can sign into. Mirrors the
    -- UserRole enum in app/types.ts. Plain text (not enum) so the
    -- admin UI can introduce new roles without a migration.
    role                    text not null
        check (role in ('front_desk','nurse','provider','operations','admin')),

    -- Used by /auth/staff verify-identity. We keep them as separate
    -- columns rather than a single composite key so the admin UI can
    -- rename one without invalidating the other.
    staff_code              text not null unique,
    username                text not null unique,

    display_name            text not null,
    email                   text not null unique,
    phone                   text,
    phone_country           text,
    department              text,

    -- Bcrypt hash of the password. Plaintext MUST never appear here.
    password_hash           text not null,

    -- Account lifecycle / lockout
    active                  boolean      not null default true,
    failed_login_attempts   int          not null default 0,
    locked_until            timestamptz,

    created_at              timestamptz  not null default now(),
    updated_at              timestamptz  not null default now()
);

create index if not exists staff_users_role_idx
    on public.staff_users (role);
create index if not exists staff_users_email_idx
    on public.staff_users (lower(email));

-- updated_at maintenance
create or replace function public.handle_staff_users_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists staff_users_updated_at on public.staff_users;
create trigger staff_users_updated_at
    before update on public.staff_users
    for each row execute procedure public.handle_staff_users_updated_at();

alter table public.staff_users enable row level security;
drop policy if exists "service_role full"  on public.staff_users;
create policy "service_role full"           on public.staff_users
    for all to service_role using (true) with check (true);


-- 2) STAFF LOGIN ATTEMPTS ────────────────────────────────────────
create table if not exists public.staff_login_attempts (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid,                       -- nullable: pre-identity attempts
    attempt_type    text not null,              -- 'identity' | 'otp' | 'cross_validation'
    success         boolean not null default false,
    failure_reason  text,
    ip              text,
    user_agent      text,
    created_at      timestamptz not null default now()
);

create index if not exists staff_login_attempts_user_id_idx
    on public.staff_login_attempts (user_id);
create index if not exists staff_login_attempts_created_at_idx
    on public.staff_login_attempts (created_at desc);

alter table public.staff_login_attempts enable row level security;
drop policy if exists "service_role full"  on public.staff_login_attempts;
create policy "service_role full"           on public.staff_login_attempts
    for all to service_role using (true) with check (true);


-- 3) AUDIT LOG ───────────────────────────────────────────────────
-- Skinny version of the audit_log table from the original schema.
-- Just enough to drop logAuthEvent() inserts into a real table when
-- we wire that up; for now most callers still console.log.
create table if not exists public.audit_log (
    id              uuid primary key default gen_random_uuid(),
    event           text not null,
    user_id         text,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx
    on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
drop policy if exists "service_role full"  on public.audit_log;
create policy "service_role full"           on public.audit_log
    for all to service_role using (true) with check (true);


-- 4) SEED ONE ACCOUNT PER ROLE ───────────────────────────────────
-- Password for every demo account is `demo1234`. The hash is computed
-- here with pgcrypto so the migration is fully self-contained — no
-- separate seeder script, no env-dependent setup. Re-running this
-- block is safe thanks to the staff_code unique constraint and the
-- ON CONFLICT clause.
insert into public.staff_users
    (role, staff_code, username, display_name, email, phone, phone_country, department, password_hash)
values
    ('admin',      'ADM-001', 'sysadmin', 'System Admin',     'admin@frudgecare.demo', '+15550009999', 'US', 'Operations',
        crypt('demo1234', gen_salt('bf', 10))),
    ('front_desk', 'FD-001',  'maria',    'Maria Johnson',    'maria@frudgecare.demo', '+15550002222', 'US', 'Front Desk',
        crypt('demo1234', gen_salt('bf', 10))),
    ('nurse',      'NU-001',  'sarah',    'Sarah Chen, RN',   'sarah@frudgecare.demo', '+15550005678', 'US', 'Triage',
        crypt('demo1234', gen_salt('bf', 10))),
    ('provider',   'PR-001',  'emily',    'Dr. Emily Carter', 'emily@frudgecare.demo', '+15550003333', 'US', 'Primary Care',
        crypt('demo1234', gen_salt('bf', 10)))
on conflict (staff_code) do nothing;


-- 5) SEED ONE PATIENT ACCOUNT ────────────────────────────────────
-- John Miller — matches the in-memory DEMO_PATIENT_ACCOUNTS row in
-- lib/auth.ts so demo and DB stay in sync. We match on (phone, dob)
-- to detect an existing seed, since patient_profiles intentionally
-- has no UNIQUE on either of those alone.
insert into public.patient_profiles
    (full_name, date_of_birth, gender, phone, phone_country, email, password_hash)
select
    'John Miller', '1990-01-15', 'Male', '+15550100001', 'US',
    'john@frudgecare.demo',
    crypt('demo1234', gen_salt('bf', 10))
where not exists (
    select 1 from public.patient_profiles
    where phone = '+15550100001' and date_of_birth = '1990-01-15'
);
