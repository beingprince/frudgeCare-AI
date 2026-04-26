"use client";

/**
 * SyntheaPicker — dropdown that pre-fills the triage form from a real
 * (synthetic) Synthea FHIR R4 patient bundle.
 *
 * Why this exists
 * ---------------
 * The demo scenarios above are hand-written. Judges sometimes ask
 * "would this work on real EHR data?" — this picker answers yes. Each
 * option is a slim summary of an actual Synthea-generated patient
 * (118 in the public bundle, 10 curated for the demo). Picking one
 * fills the symptom textarea with a clinically grounded narrative seed
 * built from the patient's active conditions, current medications, and
 * most recent vital signs, plus selects the right age group.
 *
 * Auth: the underlying /api/demo/synthea route is public — same
 * audience as /triage itself (patient-kiosk demo, no login).
 *
 * Failure modes:
 *   - engine offline    -> picker hides itself silently (no broken UI)
 *   - empty patient list -> picker hides itself
 *   - fetch error       -> small inline message, picker still hides
 */

import { useEffect, useState } from "react";
import { Database, Loader2, UserCheck } from "lucide-react";

export type SyntheaPatient = {
  id: string;
  label: string;
  bucket: string;
  age: number;
  sex: string;
  postal_code: string;
  city: string;
  state: string;
  active_conditions: string[];
  active_medications: string[];
  allergies: string[];
  last_vitals: Record<string, number>;
  narrative_seed: string;
};

type FetchResponse = {
  ok: boolean;
  count: number;
  patients: SyntheaPatient[];
  source: string;
  note?: string;
};

export type SyntheaSelection = {
  patient: SyntheaPatient;
  ageGroup: "Pediatric" | "Adult" | "Geriatric";
};

export function SyntheaPicker({
  onSelect,
  className = "",
}: {
  onSelect: (selection: SyntheaSelection) => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<SyntheaPatient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/demo/synthea", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = (await r.json()) as FetchResponse;
        if (cancelled) return;
        setPatients(body.patients ?? []);
        setError(body.ok ? null : body.note ?? "Engine offline");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load patients");
        setPatients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide silently if there is nothing to show.
  if (!loading && patients.length === 0) {
    return null;
  }

  const handleChange = (id: string) => {
    setPickedId(id);
    if (!id) return;
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;
    onSelect({
      patient,
      ageGroup: ageGroupFor(patient.age),
    });
  };

  return (
    <div className={`mb-4 rounded-[12px] border border-emerald-200 bg-emerald-50/60 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
            <Database size={14} />
          </span>
          <div className="leading-tight">
            <div className="text-[12px] font-bold text-emerald-900">
              Or use a real Synthea patient
            </div>
            <div className="text-[10.5px] text-emerald-700">
              FHIR R4 · synthea.mitre.org · 10 curated demo cases · no PHI
            </div>
          </div>
        </div>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-emerald-700" />
        ) : (
          <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <UserCheck size={11} /> {patients.length} loaded
          </span>
        )}
      </div>

      {error ? (
        <div className="text-[11px] text-rose-700">
          Could not load Synthea patients: {error}.
        </div>
      ) : (
        <select
          value={pickedId}
          onChange={(e) => handleChange(e.target.value)}
          disabled={loading || patients.length === 0}
          className="fc-text-input fc-focus-ring w-full text-[12.5px]"
          aria-label="Pick a Synthea demo patient"
        >
          <option value="">— pick a patient to pre-fill the form —</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {bucketEmoji(p.bucket)} {p.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ageGroupFor(age: number): "Pediatric" | "Adult" | "Geriatric" {
  if (age < 18) return "Pediatric";
  if (age >= 65) return "Geriatric";
  return "Adult";
}

function bucketEmoji(bucket: string): string {
  // Tiny visual hint per demographic bucket. No real emojis (per repo
  // policy elsewhere) — uses Unicode shapes that render the same on
  // every platform.
  switch (bucket) {
    case "geriatric_cardiac":
    case "male_geriatric_cancer":
      return "[GE]";
    case "geriatric_metabolic":
      return "[GM]";
    case "adult_chronic":
    case "adult_acute":
      return "[AD]";
    case "young_adult_mental":
    case "young_adult_metabolic":
      return "[YA]";
    case "pediatric_routine":
    case "pediatric_acute":
      return "[PE]";
    case "female_reproductive":
      return "[FR]";
    default:
      return "[--]";
  }
}
