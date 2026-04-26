/**
 * lib/ehr-service.ts
 *
 * Thin EHR access layer. Talks to Supabase when configured, falls back
 * to an in-file demo dataset modeled after the Synthea FHIR R4 shapes.
 *
 * Callers (nurse workspace, provider case view) always receive the same
 * EHRRecord shape whether the demo or real DB is in use.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface EHRRecord {
  id: string;
  patient_profile_id: string;
  record_type: 'medication' | 'allergy' | 'diagnosis' | 'lab_result' | 'vital_history' | 'immunization' | 'procedure';
  fhir_resource_type: string;
  // FHIR data package are intentionally free-shape — different resource types
  // (MedicationRequest vs AllergyIntolerance vs Observation) carry wildly
  // different fields, so we store the full JSON and let callers read the
  // subset they need.
  data: Record<string, unknown> & {
    medication?: { text?: string };
    code?: { text?: string; coding?: { system?: string; code?: string }[] };
    reaction?: { manifestation?: { text?: string }[]; severity?: string }[];
    valueQuantity?: { value?: number; unit?: string };
  };
  recorded_at: string;
  source: string;
}

const DEMO_EHR: EHRRecord[] = [
  {
    id: 'ehr-001',
    patient_profile_id: 'pat_001',
    record_type: 'medication',
    fhir_resource_type: 'MedicationRequest',
    recorded_at: '2024-01-15',
    source: 'synthea',
    data: {
      resourceType: 'MedicationRequest',
      status: 'active',
      medication: { text: 'Lisinopril 10mg' },
      reasonCode: [{ text: 'Hypertension' }],
      dosageInstruction: [{ text: 'Take 1 tablet by mouth once daily' }],
    },
  },
  {
    id: 'ehr-002',
    patient_profile_id: 'pat_001',
    record_type: 'medication',
    fhir_resource_type: 'MedicationRequest',
    recorded_at: '2022-08-12',
    source: 'synthea',
    data: {
      resourceType: 'MedicationRequest',
      status: 'active',
      medication: { text: 'Metformin 500mg' },
      reasonCode: [{ text: 'Type 2 Diabetes Mellitus' }],
      dosageInstruction: [{ text: 'Take 1 tablet by mouth twice daily with meals' }],
    },
  },
  {
    id: 'ehr-003',
    patient_profile_id: 'pat_001',
    record_type: 'allergy',
    fhir_resource_type: 'AllergyIntolerance',
    recorded_at: '2018-03-10',
    source: 'synthea',
    data: {
      resourceType: 'AllergyIntolerance',
      clinicalStatus: { text: 'active' },
      code: { text: 'Penicillin' },
      reaction: [{ manifestation: [{ text: 'Anaphylaxis' }], severity: 'severe' }],
    },
  },
  {
    id: 'ehr-004',
    patient_profile_id: 'pat_001',
    record_type: 'diagnosis',
    fhir_resource_type: 'Condition',
    recorded_at: '2021-06-20',
    source: 'synthea',
    data: {
      resourceType: 'Condition',
      clinicalStatus: { text: 'active' },
      code: {
        text: 'Type 2 Diabetes Mellitus',
        coding: [{ system: 'http://snomed.info/sct', code: '44054006' }],
      },
    },
  },
  {
    id: 'ehr-005',
    patient_profile_id: 'pat_001',
    record_type: 'diagnosis',
    fhir_resource_type: 'Condition',
    recorded_at: '2019-11-05',
    source: 'synthea',
    data: {
      resourceType: 'Condition',
      clinicalStatus: { text: 'active' },
      code: {
        text: 'Essential (primary) Hypertension',
        coding: [{ system: 'http://snomed.info/sct', code: '59621000' }],
      },
    },
  },
  {
    id: 'ehr-006',
    patient_profile_id: 'pat_001',
    record_type: 'lab_result',
    fhir_resource_type: 'Observation',
    recorded_at: '2024-03-01',
    source: 'synthea',
    data: {
      resourceType: 'Observation',
      status: 'final',
      code: {
        text: 'HbA1c',
        coding: [{ system: 'http://loinc.org', code: '4548-4' }],
      },
      valueQuantity: { value: 7.2, unit: '%' },
      interpretation: [{ text: 'Normal' }],
    },
  },
];

export async function getPatientEHR(patientProfileId: string): Promise<EHRRecord[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('ehr_records')
      .select('*')
      .eq('patient_profile_id', patientProfileId)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('EHR fetch error:', error);
      return DEMO_EHR;
    }
    return (data as EHRRecord[]) ?? [];
  }
  return DEMO_EHR;
}

export async function getPatientAllergies(patientProfileId: string): Promise<string[]> {
  const records = await getPatientEHR(patientProfileId);
  return records
    .filter(r => r.record_type === 'allergy')
    .map(r => r.data.code?.text ?? 'Unknown allergy');
}

export async function getPatientMedications(patientProfileId: string): Promise<string[]> {
  const records = await getPatientEHR(patientProfileId);
  return records
    .filter(r => r.record_type === 'medication')
    .map(r => r.data.medication?.text ?? 'Unknown medication');
}

export async function getPatientDiagnoses(patientProfileId: string): Promise<string[]> {
  const records = await getPatientEHR(patientProfileId);
  return records
    .filter(r => r.record_type === 'diagnosis')
    .map(r => r.data.code?.text ?? 'Unknown diagnosis');
}

/** Synchronous demo helper for client components that need instant data. */
export function getDemoEHR(): EHRRecord[] {
  return DEMO_EHR;
}
