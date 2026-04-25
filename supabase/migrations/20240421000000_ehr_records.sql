-- Phase 4: EHR records table — stores synthetic FHIR-shaped medical history.
-- Demo data only. No real PHI. Structure intentionally mirrors a subset
-- of HL7 FHIR R4 resources (MedicationRequest, AllergyIntolerance,
-- Condition, Observation, Immunization, Procedure) so the app can speak
-- the interoperability standard when it integrates with a real EHR.

CREATE TABLE IF NOT EXISTS public.ehr_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id  uuid REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  record_type         text NOT NULL CHECK (record_type IN (
                         'medication', 'allergy', 'diagnosis', 'lab_result',
                         'vital_history', 'immunization', 'procedure'
                      )),
  fhir_resource_type  text,
  fhir_resource_id    text,
  data                jsonb NOT NULL,
  recorded_at         timestamptz DEFAULT now(),
  source              text DEFAULT 'synthea' CHECK (source IN ('synthea', 'manual', 'imported', 'demo')),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.ehr_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages ehr_records"
  ON public.ehr_records FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Clinical staff read ehr_records"
  ON public.ehr_records FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS ehr_records_patient_idx ON public.ehr_records (patient_profile_id, record_type);
CREATE INDEX IF NOT EXISTS ehr_records_fhir_idx    ON public.ehr_records (fhir_resource_type);
