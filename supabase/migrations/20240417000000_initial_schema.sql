-- Definitive Schema for FrudgeCare AI
-- Based on the Definitive Build Contract

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==================================================
-- 1. GLOBAL ENUMS
-- ==================================================

create type public.user_role as enum ('patient', 'front_desk', 'provider', 'operations', 'admin');
create type public.case_status as enum ('submitted', 'under_review', 'scheduled', 'confirmed', 'in_visit', 'follow_up_needed', 'referred', 'resolved', 'cancelled', 'escalated');
create type public.urgency_level as enum ('high', 'medium', 'low');
create type public.appointment_status as enum ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'rescheduled', 'no_show');
create type public.follow_up_type as enum ('none', 'return_visit', 'specialist_referral', 'urgent_escalation');
create type public.severity_hint as enum ('mild', 'moderate', 'severe');
create type public.contact_method as enum ('sms', 'email', 'phone');

-- ==================================================
-- 2. TABLES
-- ==================================================

-- A. USERS
create table if not exists public.users (
    id uuid primary key default uuid_generate_v4(),
    role public.user_role not null,
    display_name text not null,
    first_name text not null,
    last_name text not null,
    email text unique not null,
    phone text,
    active boolean default true,
    avatar_url text,
    department text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- B. PATIENT_PROFILES
create table if not exists public.patient_profiles (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(id) on delete set null,
    patient_code text unique not null,
    full_name text not null,
    date_of_birth date not null,
    sex text not null,
    phone text not null,
    email text not null,
    preferred_contact_method public.contact_method not null default 'email',
    preferred_language text default 'English',
    address_city text,
    emergency_contact_name text,
    emergency_contact_phone text,
    allergies text[] default '{}',
    chronic_conditions text[] default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- C. CASES
create table if not exists public.cases (
    id uuid primary key default uuid_generate_v4(),
    case_code text unique not null,
    patient_id uuid references public.patient_profiles(id) not null,
    submitted_by_user_id uuid references public.users(id),
    symptom_text text not null,
    symptom_tags text[] default '{}',
    duration_text text not null,
    severity_hint public.severity_hint not null,
    preferred_time_window text,
    preferred_date date,
    urgency_suggested public.urgency_level not null,
    urgency_final public.urgency_level,
    urgency_reason text,
    risky_flags text[] default '{}',
    structured_summary text,
    assigned_front_desk_user_id uuid references public.users(id),
    assigned_provider_user_id uuid references public.users(id),
    linked_appointment_id uuid, -- FKey added after appointments table
    status public.case_status not null default 'submitted',
    source_channel text default 'patient_form',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- D. APPOINTMENTS
create table if not exists public.appointments (
    id uuid primary key default uuid_generate_v4(),
    case_id uuid references public.cases(id) on delete cascade not null,
    patient_id uuid references public.patient_profiles(id) not null,
    provider_user_id uuid references public.users(id) not null,
    scheduled_date date not null,
    start_time time not null,
    end_time time not null,
    status public.appointment_status not null default 'pending',
    location_label text default 'Exam Room',
    queue_bucket text,
    urgent_slot boolean default false,
    reminder_state text default 'not_sent',
    reschedule_count int default 0,
    last_rescheduled_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Add FKey to cases for appointments
alter table public.cases 
add constraint fk_cases_appointment 
foreign key (linked_appointment_id) 
references public.appointments(id) 
on delete set null;

-- E. VISIT_NOTES
create table if not exists public.visit_notes (
    id uuid primary key default uuid_generate_v4(),
    case_id uuid references public.cases(id) on delete cascade not null,
    appointment_id uuid references public.appointments(id) on delete cascade not null,
    provider_user_id uuid references public.users(id) not null,
    visit_summary text not null,
    assessment text not null,
    outcome text,
    follow_up_type public.follow_up_type default 'none',
    follow_up_timeframe text,
    referral_flag boolean default false,
    referral_target text,
    escalation_flag boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- F. EVENTS (Single source of truth for analytics)
create table if not exists public.events (
    id uuid primary key default uuid_generate_v4(),
    event_name text not null, -- Map to contract enums in app logic
    case_id uuid references public.cases(id) on delete cascade not null,
    patient_id uuid references public.patient_profiles(id) not null,
    appointment_id uuid references public.appointments(id),
    actor_role public.user_role not null,
    actor_user_id uuid references public.users(id),
    timestamp timestamptz default now(),
    metadata jsonb default '{}'::jsonb
);

-- G. AUDIT_LOG
create table if not exists public.audit_log (
    id uuid primary key default uuid_generate_v4(),
    table_name text not null,
    record_id uuid not null,
    field_name text,
    old_value text,
    new_value text,
    changed_by_user_id uuid references public.users(id) not null,
    changed_by_role public.user_role not null,
    changed_at timestamptz default now(),
    reason text
);

-- ==================================================
-- 3. SECURITY (RLS)
-- ==================================================

alter table public.users enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.cases enable row level security;
alter table public.appointments enable row level security;
alter table public.visit_notes enable row level security;
alter table public.events enable row level security;
alter table public.audit_log enable row level security;

-- Example: Operations can see everything
create policy "Ops can view all" on public.users for select using (auth.jwt()->>'role' = 'operations');
-- More complex RLS will be seeded as needed for the app logic

-- ==================================================
-- 4. UTILITIES
-- ==================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger users_updated_at before update on public.users for each row execute procedure public.handle_updated_at();
create trigger patient_profiles_updated_at before update on public.patient_profiles for each row execute procedure public.handle_updated_at();
create trigger cases_updated_at before update on public.cases for each row execute procedure public.handle_updated_at();
create trigger appointments_updated_at before update on public.appointments for each row execute procedure public.handle_updated_at();
create trigger visit_notes_updated_at before update on public.visit_notes for each row execute procedure public.handle_updated_at();
