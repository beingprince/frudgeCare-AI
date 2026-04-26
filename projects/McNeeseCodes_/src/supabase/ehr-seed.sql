-- Synthetic EHR records (Synthea-style) — DEMO ONLY, no real PHI.
-- Seeded against the first patient_profiles row so the demo has something
-- to render in the nurse and provider EHR panels.

INSERT INTO public.ehr_records (patient_profile_id, record_type, fhir_resource_type, data, source)
SELECT
  pp.id,
  'medication',
  'MedicationRequest',
  jsonb_build_object(
    'resourceType', 'MedicationRequest',
    'status', 'active',
    'medication', jsonb_build_object('text', 'Lisinopril 10mg'),
    'dosageInstruction', jsonb_build_array(
      jsonb_build_object('text', 'Take 1 tablet by mouth once daily',
        'timing', jsonb_build_object('repeat', jsonb_build_object('frequency', 1, 'period', 1, 'periodUnit', 'd')))
    ),
    'reasonCode', jsonb_build_array(jsonb_build_object('text', 'Hypertension')),
    'authoredOn', '2024-01-15'
  ),
  'synthea'
FROM public.patient_profiles pp LIMIT 1;

INSERT INTO public.ehr_records (patient_profile_id, record_type, fhir_resource_type, data, source)
SELECT
  pp.id,
  'allergy',
  'AllergyIntolerance',
  jsonb_build_object(
    'resourceType', 'AllergyIntolerance',
    'clinicalStatus', jsonb_build_object('text', 'active'),
    'code', jsonb_build_object('text', 'Penicillin'),
    'reaction', jsonb_build_array(
      jsonb_build_object(
        'manifestation', jsonb_build_array(jsonb_build_object('text', 'Anaphylaxis')),
        'severity', 'severe'
      )
    ),
    'recordedDate', '2018-03-10'
  ),
  'synthea'
FROM public.patient_profiles pp LIMIT 1;

INSERT INTO public.ehr_records (patient_profile_id, record_type, fhir_resource_type, data, source)
SELECT
  pp.id,
  'diagnosis',
  'Condition',
  jsonb_build_object(
    'resourceType', 'Condition',
    'clinicalStatus', jsonb_build_object('text', 'active'),
    'code', jsonb_build_object(
      'text', 'Type 2 Diabetes Mellitus',
      'coding', jsonb_build_array(
        jsonb_build_object('system', 'http://snomed.info/sct', 'code', '44054006', 'display', 'Type 2 diabetes mellitus')
      )
    ),
    'onsetDateTime', '2021-06-20',
    'note', jsonb_build_array(jsonb_build_object('text', 'Well-controlled on Metformin'))
  ),
  'synthea'
FROM public.patient_profiles pp LIMIT 1;

INSERT INTO public.ehr_records (patient_profile_id, record_type, fhir_resource_type, data, source)
SELECT
  pp.id,
  'lab_result',
  'Observation',
  jsonb_build_object(
    'resourceType', 'Observation',
    'status', 'final',
    'code', jsonb_build_object(
      'text', 'HbA1c',
      'coding', jsonb_build_array(
        jsonb_build_object('system', 'http://loinc.org', 'code', '4548-4', 'display', 'Hemoglobin A1c/Hemoglobin.total in Blood')
      )
    ),
    'valueQuantity', jsonb_build_object('value', 7.2, 'unit', '%', 'system', 'http://unitsofmeasure.org'),
    'effectiveDateTime', '2024-03-01',
    'interpretation', jsonb_build_array(jsonb_build_object('text', 'Normal'))
  ),
  'synthea'
FROM public.patient_profiles pp LIMIT 1;
