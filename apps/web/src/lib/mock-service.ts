/**
 * This is our fake database for testing and demos.
 *
 * It holds:
 *  - 5 detailed patient profiles
 *  - 20 different medical cases
 *  - 10 appointments linked to patients
 *  - Some basic stats and charts
 *
 * It is built to look exactly like our real database, so the app
 * doesn't have to know if it's using fake data or real data.
 */

import type { Case, PatientProfile, Appointment, CaseStatus, UrgencyLevel } from '@/types';

// Types that include extra connected data, exactly like what the database gives us back.

export interface MockPatient extends PatientProfile {
  // A simple way to get the text shown in user profile pictures.
  initials: string;
}

export interface MockCase extends Case {
  patient: MockPatient;      // Data connected from the patient profiles
}

export interface MockAppointment extends Appointment {
  patient:       MockPatient;     // Data connected from the patient profiles
  case:          MockCase;        // joined from cases
  provider_name: string;          // joined from users
  provider_dept: string;
}

// UTILITIES

const TODAY    = new Date().toISOString().split('T')[0];
const initials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const daysAgo  = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// PATIENTS — 5 richly detailed profiles

export const MOCK_PATIENTS: MockPatient[] = [];

// A quick way to find a patient by their ID without searching the whole list.
const PATIENT_MAP = new Map(MOCK_PATIENTS.map(p => [p.id, p]));

/** Finds a patient by their ID. If it can't find one, it just returns the first patient. */
export function getMockPatientById(id: string): MockPatient | null {
  return PATIENT_MAP.get(id) ?? null;
}

// CASES — 20 cases covering all statuses and urgency levels

export const MOCK_CASES: MockCase[] = [];

// Lookup map
const CASE_MAP = new Map(MOCK_CASES.map(c => [c.id, c]));

/**
 * Finds a case using either its internal ID or its public code.
 *
 * This makes it easy for the app to find a case no matter which
 * identifier it currently has.
 */
export function getMockCaseById(id: string): MockCase | null {
  const direct = CASE_MAP.get(id);
  if (direct) return direct;
  return MOCK_CASES.find(c => c.id === id || c.case_code === id) ?? null;
}

/** Returns a list of cases that match a specific status. */
export function getMockCasesByStatus(status: CaseStatus): MockCase[] {
  return MOCK_CASES.filter(c => c.status === status);
}

/**
 * Adds a new case to our fake database. This allows the app to
 * act like it's saving data even when the real database is turned off.
 */
export function addMockCase(newCase: Partial<MockCase> & { id: string }): MockCase {
  const hydrated: MockCase = {
    symptom_tags:                [],
    duration_text:               '',
    severity_hint:               'mild',
    urgency_final:               'low',
    risky_flags:                 [],
    structured_summary:          '',
    source_channel:              'intake_form',
    assigned_front_desk_user_id: 'usr_fd_001',
    created_at:                  new Date().toISOString(),
    updated_at:                  new Date().toISOString(),
    ...newCase,
    patient: newCase.patient_id ? getMockPatientById(newCase.patient_id) || {
      id: 'pat_auto',
      patient_code: 'FC-P-AUTO',
      full_name: 'Walk-in Patient',
      initials: 'WP',
      date_of_birth: '1900-01-01',
      sex: 'Unknown',
      phone: '',
      email: '',
      preferred_contact_method: 'phone',
      preferred_language: 'en',
      address_city: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      allergies: [],
      chronic_conditions: []
    } : {
      id: 'pat_auto',
      patient_code: 'FC-P-AUTO',
      full_name: 'Walk-in Patient',
      initials: 'WP',
      date_of_birth: '1900-01-01',
      sex: 'Unknown',
      phone: '',
      email: '',
      preferred_contact_method: 'phone',
      preferred_language: 'en',
      address_city: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      allergies: [],
      chronic_conditions: []
    },
  } as MockCase;
  MOCK_CASES.push(hydrated);
  CASE_MAP.set(hydrated.id, hydrated);
  return hydrated;
}

/**
 * Updates an existing case in our fake database. This lets the front desk
 * assign doctors or update statuses without needing a real database.
 */
export function updateMockCase(
  idOrCode: string,
  patch: Partial<MockCase>,
): MockCase | null {
  const existing = MOCK_CASES.find(c => c.id === idOrCode || c.case_code === idOrCode);
  if (!existing) return null;
  Object.assign(existing, patch, { updated_at: new Date().toISOString() });
  return existing;
}

/** A simple object that holds all our database functions together. */
export const mockService = {
  addCase: addMockCase,
  updateCase: updateMockCase,
  getCaseById: getMockCaseById,
  getCasesByStatus: getMockCasesByStatus,
};

/** Finds all cases that match a specific urgency level. */
export function getMockCasesByUrgency(level: UrgencyLevel): MockCase[] {
  return MOCK_CASES.filter(c => (c.urgency_final ?? c.urgency_suggested) === level);
}

// APPOINTMENTS — 10 cross-linked to cases + patients

const PROVIDERS = [
  { id: 'usr_pr_001', name: 'Dr. Emily Carter', dept: 'Primary Care',      location: 'Exam Room 1' },
  { id: 'usr_pr_002', name: 'Dr. Marcus Lee',   dept: 'Pediatrics',        location: 'Exam Room 2' },
  { id: 'usr_pr_003', name: 'Dr. Sarah Chen',   dept: 'Internal Medicine', location: 'Exam Room 3' },
];

export const MOCK_PROVIDERS = PROVIDERS;

const makeAppt = (
  overrides: Partial<MockAppointment> & {
    id: string; case_id: string; patient_id: string; provider_user_id: string;
    start_time: string; end_time: string;
  }
): MockAppointment => {
  const prov = PROVIDERS.find(p => p.id === overrides.provider_user_id) ?? PROVIDERS[0];
  const caseObj = CASE_MAP.get(overrides.case_id) ?? null;
  const patient = PATIENT_MAP.get(overrides.patient_id) ?? null;
  if (!caseObj || !patient) throw new Error("Mock patient/case required to make appt");
  return {
    scheduled_date:  TODAY,
    status:          'confirmed',
    location_label:  prov.location,
    queue_bucket:    'general',
    urgent_slot:     false,
    reminder_state:  'sent',
    reschedule_count:0,
    provider_name:   prov.name,
    provider_dept:   prov.dept,
    case:            caseObj,
    patient,
    ...overrides,
  };
};

export const MOCK_APPOINTMENTS: MockAppointment[] = [];

const APPOINTMENT_MAP = new Map(MOCK_APPOINTMENTS.map(a => [a.id, a]));

/** Finds all appointments a specific doctor has today. */
export function getMockAppointmentsByProvider(providerId: string): MockAppointment[] {
  return MOCK_APPOINTMENTS.filter(a => a.provider_user_id === providerId);
}

/** Finds all appointments on a specific day. */
export function getMockAppointmentsByDate(date: string): MockAppointment[] {
  return MOCK_APPOINTMENTS.filter(a => a.scheduled_date === date);
}

// ANALYTICS — computed from real mock data above

const HIGH_COUNT   = MOCK_CASES.filter(c => (c.urgency_final ?? c.urgency_suggested) === 'high').length;
const MEDIUM_COUNT = MOCK_CASES.filter(c => (c.urgency_final ?? c.urgency_suggested) === 'medium').length;
const LOW_COUNT    = MOCK_CASES.filter(c => (c.urgency_final ?? c.urgency_suggested) === 'low').length;

export const MOCK_STATS = {
  total_cases:        String(MOCK_CASES.length),
  submissions:        String(getMockCasesByStatus('submitted').length),
  under_review:       String(getMockCasesByStatus('under_review').length),
  in_visit:           String(getMockCasesByStatus('in_visit').length),
  completions:        String(getMockCasesByStatus('resolved').length),
  todays_appointments:String(MOCK_APPOINTMENTS.length),
  urgency_high:       String(HIGH_COUNT),
  utilization:        '73%',
  escalations:        String(HIGH_COUNT),
};

export const MOCK_TREND_DATA = [
  { name: 'Mon', submissions: 8,  completions: 6  },
  { name: 'Tue', submissions: 14, completions: 11 },
  { name: 'Wed', submissions: 12, completions: 9  },
  { name: 'Thu', submissions: 18, completions: 14 },
  { name: 'Fri', submissions: 22, completions: 18 },
  { name: 'Sat', submissions: 10, completions: 8  },
  { name: 'Sun', submissions: 6,  completions: 5  },
];

export const MOCK_URGENCY_DATA = [
  { name: 'High',   value: HIGH_COUNT,   color: '#C62828' },
  { name: 'Medium', value: MEDIUM_COUNT, color: '#E65100' },
  { name: 'Low',    value: LOW_COUNT,    color: '#2E7D32' },
];

export const DEMO_ANALYSIS = {
  urgency:   'high' as const,
  summary:   'Awaiting clinical assessment.',
  risks:     [],
  reasoning: 'AI triage empty.',
};
