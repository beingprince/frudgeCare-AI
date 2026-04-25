-- Migration: Uncompressing Care Coordination Workflow
-- Description: Implement nurse_assessments and provider_actions layers.

-- 1. ENUMS

-- Expanding case_status safely (Supabase/Postgres 12+ supports IF NOT EXISTS for adding enum values)
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'intake_submitted';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'ai_pretriage_ready';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'frontdesk_review';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'nurse_triage_pending';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'nurse_triage_in_progress';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'provider_review_pending';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'provider_action_issued';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'followup_pending';

CREATE TYPE public.nurse_assessment_status AS ENUM ('draft', 'in_progress', 'completed', 'handed_off');
CREATE TYPE public.action_status AS ENUM ('pending', 'completed', 'deferred', 'refused');

-- 2. NURSE_ASSESSMENTS
CREATE TABLE IF NOT EXISTS public.nurse_assessments (
    id uuid primary key default uuid_generate_v4(),
    case_id uuid references public.cases(id) on delete cascade not null,
    
    -- Discrete Clinical Fields
    primary_complaint text,
    onset text,
    duration text,
    severity int,
    progression text,
    associated_symptoms text[],
    denied_symptoms text[],
    aggravating_factors text,
    relieving_factors text,
    red_flags_checked jsonb default '{}'::jsonb,
    
    -- Coordination & Contact
    patient_reachable boolean default true,
    unreachable_reason text,
    callback_required boolean default false,
    incomplete_reason text,
    escalation_reason text,
    contact_outcome text,
    
    -- Narrative & Handoff
    nurse_clinical_summary text,
    provider_handoff_brief text,
    additional_structured_data jsonb default '{}'::jsonb,
    
    -- Metadata
    status public.nurse_assessment_status not null default 'draft',
    is_validated boolean default false,
    validated_by_user_id uuid references public.users(id),
    validated_at timestamptz,
    assessment_completed_at timestamptz,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Active trigger for nurse_assessments updated_at
CREATE TRIGGER nurse_assessments_updated_at 
BEFORE UPDATE ON public.nurse_assessments 
FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 3. CASES MODIFICATION
ALTER TABLE public.cases
ADD COLUMN IF NOT EXISTS active_nurse_assessment_id uuid references public.nurse_assessments(id) on delete set null;

-- 4. PROVIDER_ACTIONS (The Action Layer)
CREATE TABLE IF NOT EXISTS public.provider_actions (
    id uuid primary key default uuid_generate_v4(),
    case_id uuid references public.cases(id) on delete cascade not null,
    provider_user_id uuid references public.users(id) not null,
    active_nurse_assessment_id uuid references public.nurse_assessments(id) on delete set null,
    
    assigned_actor_id uuid references public.users(id),
    action_type text not null,
    remarks text,
    due_date timestamptz,
    status public.action_status not null default 'pending',
    patient_visible_update text,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Active trigger for provider_actions updated_at
CREATE TRIGGER provider_actions_updated_at 
BEFORE UPDATE ON public.provider_actions 
FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 5. RLS Setup
ALTER TABLE public.nurse_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_actions ENABLE ROW LEVEL SECURITY;
