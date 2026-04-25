export type UserRole = 'patient' | 'front_desk' | 'nurse' | 'provider' | 'operations' | 'admin';

/**
 * Canonical case statuses. Must stay in lock-step with
 * `apps/web/src/lib/caseStateMachine.ts`. Additional legacy / soft
 * statuses are kept below to maintain back-compat with older mock data.
 */
export type CaseStatus =
  // FSM canonical (caseStateMachine.ts):
  | 'intake_submitted'
  | 'ai_pretriage_ready'
  | 'frontdesk_review'
  | 'nurse_triage_pending'
  | 'nurse_triage_in_progress'
  | 'nurse_validated'
  | 'provider_review_pending'
  | 'provider_action_issued'
  | 'disposition_finalized'
  // Legacy / soft statuses still referenced by older mock data:
  | 'in_visit'
  | 'followup_pending'
  | 'referred'
  | 'resolved'
  | 'cancelled'
  | 'escalated'
  | 'submitted'
  | 'under_review'
  | 'scheduled'
  | 'confirmed';

export type NurseAssessmentStatus = 'draft' | 'in_progress' | 'completed' | 'handed_off';
export type ActionStatus = 'pending' | 'completed' | 'deferred' | 'refused';

export type UrgencyLevel = 'high' | 'medium' | 'low';

export type AppointmentStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'checked_in' 
  | 'completed' 
  | 'cancelled' 
  | 'rescheduled' 
  | 'no_show';

export type FollowUpType = 'none' | 'return_visit' | 'specialist_referral' | 'urgent_escalation';

export type SeverityHint = 'mild' | 'moderate' | 'severe';

export type ContactMethod = 'sms' | 'email' | 'phone';

export interface User {
  id: string;
  role: UserRole;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  active: boolean;
  avatar_url?: string;
  department?: string;
  created_at: string;
}

export interface PatientProfile {
  id: string;
  user_id?: string;
  patient_code: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  phone: string;
  email: string;
  preferred_contact_method: ContactMethod;
  preferred_language: string;
  address_city?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  allergies: string[];
  chronic_conditions: string[];
}

/**
 * AIPatientProfile — the structured profile produced by the
 * /ai/build-patient-profile LLM layer. Save on the case row at intake
 * time so every downstream surface (patient status page, front-desk card,
 * nurse pre-brief) reads the same coherent narrative instead of raw form
 * fields. Optional because legacy cases pre-date this layer.
 */
export interface AIPatientProfile {
  display_name: string;
  age?: number | null;
  chief_complaint_short: string;
  narrative_summary: string;
  key_clinical_signals: string[];
  lifestyle_factors: string[];
  recommended_questions_for_nurse: string[];
  red_flags_for_team: string[];
  next_step_for_patient: string;
  disclaimer: string;
  source_tier: number;
  provenance: string[];
}

export interface Case {
  id: string;
  case_code: string;
  patient_id: string;
  submitted_by_user_id?: string;
  symptom_text: string;
  symptom_tags: string[];
  duration_text: string;
  severity_hint: SeverityHint;
  preferred_time_window?: string;
  preferred_date?: string;
  urgency_suggested: UrgencyLevel;
  urgency_final?: UrgencyLevel;
  urgency_reason?: string;
  risky_flags: string[];
  structured_summary?: string;
  active_nurse_assessment_id?: string;
  assigned_front_desk_user_id?: string;
  assigned_provider_user_id?: string;
  linked_appointment_id?: string;
  status: CaseStatus;
  source_channel: string;
  created_at: string;
  updated_at: string;

  // ── Captured intake fields (carried through from the form) ──
  patient_full_name?: string;
  patient_date_of_birth?: string;
  patient_age?: number | null;
  patient_gender?: string;
  patient_phone?: string;          // E.164-style with country dial code, e.g. "+1 (555) 123-4567"
  patient_phone_country?: string;  // ISO-3166 alpha-2, e.g. "US"
  patient_email?: string;
  additional_details?: string;
  preferred_timing?: 'asap' | 'today' | 'flexible';
  preferred_provider?: string;
  patient_history?: string;

  // ── AI artifacts ──
  ai_clinician_brief?: string;
  ai_patient_profile?: AIPatientProfile;
}

export interface Appointment {
  id: string;
  case_id: string;
  patient_id: string;
  provider_user_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  location_label: string;
  queue_bucket?: string;
  urgent_slot: boolean;
  reminder_state: string;
  reschedule_count: number;
}

export interface Event {
  id: string;
  event_name: string;
  case_id: string;
  patient_id: string;
  appointment_id?: string;
  actor_role: UserRole;
  actor_user_id?: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface NurseAssessment {
  id: string;
  case_id: string;
  
  primary_complaint?: string;
  onset?: string;
  duration?: string;
  severity?: number;
  progression?: string;
  associated_symptoms: string[];
  denied_symptoms: string[];
  aggravating_factors?: string;
  relieving_factors?: string;
  red_flags_checked: Record<string, any>;
  
  patient_reachable: boolean;
  unreachable_reason?: string;
  callback_required: boolean;
  incomplete_reason?: string;
  escalation_reason?: string;
  contact_outcome?: string;
  
  nurse_clinical_summary?: string;
  provider_handoff_brief?: string;
  additional_structured_data: Record<string, any>;
  
  status: NurseAssessmentStatus;
  is_validated: boolean;
  validated_by_user_id?: string;
  validated_at?: string;
  assessment_completed_at?: string;
  
  created_at: string;
  updated_at: string;
}

export interface ProviderAction {
  id: string;
  case_id: string;
  provider_user_id: string;
  active_nurse_assessment_id?: string;
  
  assigned_actor_id?: string;
  action_type: string;
  remarks?: string;
  due_date?: string;
  
  status: ActionStatus;
  patient_visible_update?: string;
  
  created_at: string;
  updated_at: string;
}
