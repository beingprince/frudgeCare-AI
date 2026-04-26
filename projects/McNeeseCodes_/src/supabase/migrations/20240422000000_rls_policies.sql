-- Phase 9: basic Row-Level Security baselines.
-- These policies are intentionally permissive for the hackathon demo but
-- illustrate the intended production shape. Tighten per-role in production.

-- ─── cases ───────────────────────────────────────────────────────────────
-- Patients see only their own cases. Clinical/operations staff see all.
DROP POLICY IF EXISTS "Patients see own cases" ON public.cases;
CREATE POLICY "Patients see own cases"
  ON public.cases FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('front_desk', 'nurse', 'provider', 'operations', 'admin')
    )
  );

-- ─── events (audit log) ──────────────────────────────────────────────────
-- Any authenticated user can read the audit log for transparency.
-- Writes go through service_role only (from the API routes).
DROP POLICY IF EXISTS "Staff read audit log" ON public.events;
CREATE POLICY "Staff read audit log"
  ON public.events FOR SELECT TO authenticated
  USING (true);

-- ─── ehr_records ─────────────────────────────────────────────────────────
-- Only clinical roles may read EHR records. Tighten to own-patient scope
-- in production using the assignment tables (appointments, cases).
DROP POLICY IF EXISTS "Clinical staff read EHR" ON public.ehr_records;
CREATE POLICY "Clinical staff read EHR"
  ON public.ehr_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('nurse', 'provider', 'admin')
    )
  );

-- ─── nurse_assessments ───────────────────────────────────────────────────
-- Nurses read/write their own assessments; providers may read all cleared
-- ones; admins and operations read-only.
DROP POLICY IF EXISTS "Nurses manage own assessments" ON public.nurse_assessments;
CREATE POLICY "Nurses manage own assessments"
  ON public.nurse_assessments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'nurse'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'nurse'
    )
  );

DROP POLICY IF EXISTS "Providers read assessments" ON public.nurse_assessments;
CREATE POLICY "Providers read assessments"
  ON public.nurse_assessments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('provider', 'operations', 'admin')
    )
  );
