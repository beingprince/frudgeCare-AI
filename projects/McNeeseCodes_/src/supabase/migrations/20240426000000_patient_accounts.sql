-- ─────────────────────────────────────────────────────────────────
-- 20240426000000 — patient accounts: profiles, OTP sessions, FK on cases
-- ─────────────────────────────────────────────────────────────────
-- Bridges the gap between intake submission and patient login.
--
-- Why this migration exists
-- -------------------------
-- Until now, the intake form created a `cases` row with a hardcoded
-- placeholder patient_id and no auth identity attached. A patient could
-- not log back in to retrieve what they entered, because no account
-- was ever created. This migration adds:
--
--   1. `public.patient_profiles` — the account record. Holds the real
--      identifiers (phone, email, dob), the bcrypt password hash, and
--      the gender/country fields the intake form already collects.
--      This is what `/auth/patient/verify-identity` queries against.
--
--   2. `public.otp_sessions` — short-lived rows that back the OTP step
--      of the patient login flow. The route handlers were already
--      written against this table; we just need to actually create it.
--
--   3. `public.cases.patient_profile_id` — a nullable FK so existing
--      anonymous-intake rows are not invalidated, but new submissions
--      can bind a case to a real account. We deliberately do NOT make
--      it NOT NULL: front-desk-driven walk-ins still happen and may
--      pre-create cases before the patient picks a password.
--
-- Idempotent: safe to run on top of the previous minimal-cases migration.
-- Run from Supabase Dashboard → SQL Editor → New Query → Run.
-- ─────────────────────────────────────────────────────────────────

-- 1) PATIENT PROFILES ────────────────────────────────────────────
create table if not exists public.patient_profiles (
    id              uuid primary key default gen_random_uuid(),

    -- Identifiers used by /auth/patient/verify-identity. Either phone
    -- OR email is required at registration time; both are recommended
    -- so the OTP step can fall back across channels.
    full_name       text not null,
    date_of_birth   date not null,
    gender          text,
    phone           text,
    phone_country   text,
    email           text,

    -- Bcrypt hash. Plaintext passwords MUST never land here.
    password_hash   text not null,

    -- Audit
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Unique-ish lookups. We cannot use a hard UNIQUE because the same
-- (phone, dob) pair could in principle exist for distinct legitimate
-- patients; the application layer enforces "no duplicate" by checking
-- (phone OR email) + dob before inserting.
create index if not exists patient_profiles_phone_idx
    on public.patient_profiles (phone);
create index if not exists patient_profiles_email_idx
    on public.patient_profiles (lower(email));
create index if not exists patient_profiles_dob_idx
    on public.patient_profiles (date_of_birth);

-- updated_at maintenance
create or replace function public.handle_patient_profiles_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists patient_profiles_updated_at on public.patient_profiles;
create trigger patient_profiles_updated_at
    before update on public.patient_profiles
    for each row execute procedure public.handle_patient_profiles_updated_at();

-- RLS — only the service_role writes; nothing else needs read access
-- yet (the API routes use the admin client which bypasses RLS).
alter table public.patient_profiles enable row level security;
drop policy if exists "service_role full"            on public.patient_profiles;
create policy "service_role full"                    on public.patient_profiles
    for all to service_role using (true) with check (true);


-- 2) OTP SESSIONS ────────────────────────────────────────────────
create table if not exists public.otp_sessions (
    id                  uuid primary key default gen_random_uuid(),
    user_id             text not null,            -- patient_profiles.id (uuid as text)
    otp_code            text not null,
    expires_at          timestamptz not null,
    verified            boolean not null default false,
    verification_token  text,
    created_at          timestamptz not null default now()
);

create index if not exists otp_sessions_user_id_idx
    on public.otp_sessions (user_id);
create index if not exists otp_sessions_token_idx
    on public.otp_sessions (verification_token);

alter table public.otp_sessions enable row level security;
drop policy if exists "service_role full"  on public.otp_sessions;
create policy "service_role full"           on public.otp_sessions
    for all to service_role using (true) with check (true);


-- 3) LINK CASES → PATIENT PROFILES ────────────────────────────────
-- Add the FK column only if it doesn't already exist, so this stays
-- idempotent on top of the minimal-cases migration.
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'cases'
          and column_name  = 'patient_profile_id'
    ) then
        alter table public.cases
            add column patient_profile_id uuid
            references public.patient_profiles(id) on delete set null;
        create index cases_patient_profile_id_idx
            on public.cases (patient_profile_id);
    end if;
end$$;
