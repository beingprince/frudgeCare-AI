-- ─────────────────────────────────────────────────────────────────
-- 20240425000000 — minimal cases table for the intake-form flow.
-- ─────────────────────────────────────────────────────────────────
-- Why a minimal schema (and not the full 20240417 initial_schema.sql)?
--   • The full schema wires up auth, RLS with auth.jwt(), and FKs to
--     patient_profiles/users tables. We don't have user accounts in the
--     intake flow yet (front-desk types on a patient's behalf), so those
--     FKs would block every insert.
--   • This file gives us a single, fully-permissive `cases` table that
--     captures everything the intake form sends, with no required
--     references. We graduate to the full relational schema once auth
--     and patient profiles are wired in.
--
-- Run me from Supabase Dashboard → SQL Editor → New Query → Run.
-- Idempotent: dropping and re-creating is safe in a fresh project; on a
-- project with data you'd want a non-destructive ALTER path.
-- ─────────────────────────────────────────────────────────────────

drop table if exists public.cases cascade;

create table public.cases (
    -- Identity
    id                          uuid primary key default gen_random_uuid(),
    case_code                   text unique not null,
    patient_id                  text,
    submitted_by_user_id        text,

    -- Lifecycle
    status                      text not null default 'intake_submitted',
    source_channel              text not null default 'intake_form',

    -- Triage outputs (analyze-intake)
    urgency_suggested           text,
    urgency_final               text,
    urgency_reason              text,
    structured_summary          text,
    risky_flags                 text[] not null default '{}',
    ai_clinician_brief          text,

    -- Intake form inputs (verbatim from /patient/intake)
    symptom_text                text,
    duration_text               text,
    severity_hint               text,
    additional_details          text,

    patient_full_name           text,
    patient_date_of_birth       date,
    patient_age                 int,
    patient_gender              text,
    patient_phone               text,
    patient_phone_country       text,
    patient_email               text,

    preferred_timing            text,
    preferred_provider          text,
    patient_history             text,

    -- AI artifacts (Gemini → templated cascade)
    ai_patient_profile          jsonb,

    -- Bookkeeping
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

-- Useful indexes for common reads
create index if not exists cases_case_code_idx  on public.cases (case_code);
create index if not exists cases_status_idx     on public.cases (status);
create index if not exists cases_created_at_idx on public.cases (created_at desc);

-- updated_at trigger
create or replace function public.handle_cases_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists cases_updated_at on public.cases;
create trigger cases_updated_at
before update on public.cases
for each row execute procedure public.handle_cases_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- RLS — hackathon-grade.
--   • service_role (used by lib/supabase-admin.ts) bypasses RLS by
--     design — the API routes need no policy.
--   • anon gets read-only access for any future client-side queries.
--   • authenticated mirrors anon for now; tighten when auth lands.
-- ─────────────────────────────────────────────────────────────────

alter table public.cases enable row level security;

drop policy if exists "anon read cases"          on public.cases;
drop policy if exists "authenticated read cases" on public.cases;

create policy "anon read cases"
  on public.cases for select
  to anon
  using (true);

create policy "authenticated read cases"
  on public.cases for select
  to authenticated
  using (true);

-- Self-test inserts you can run after applying:
--
--   insert into public.cases (case_code, symptom_text, severity_hint, status)
--   values ('FC-C-TEST00', 'Sample headache', 'mild', 'intake_submitted');
--
--   select id, case_code, symptom_text, created_at from public.cases;
--
