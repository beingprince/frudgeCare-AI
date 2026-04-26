"""
Curate a small, demographic-balanced set of Synthea FHIR R4 patients
for the FrudgeCare demo.

Why this exists
---------------

A raw Synthea bundle is enormous (1300+ entries per patient, ~3 MB each
JSON file, ~35 MB for the public sample bundle). For the hackathon demo
we want:

  - Fast startup (no FHIR parsing on the hot path)
  - Small repo footprint (no 35 MB binary committed to git)
  - A representative spread of demographics so the demo doesn't always
    show the same flavour of patient
  - A narrative seed string the AI can reason over instead of having to
    flatten the whole FHIR bundle on every request

So this module takes the raw bundles, extracts a slim
``PatientSummary`` for each, scores them for diversity, and writes the
top-10 selections to ``sample_patients/patients.json``. That file is
what the runtime loader reads.

Run as a script
---------------

    python curate.py --source <path/to/synthea_sample_data_fhir_latest.zip> \\
                     --out sample_patients/patients.json

If ``--source`` is a directory, every ``*.json`` inside it is treated as
a Synthea bundle. If it is a ``.zip``, the archive is extracted to a
temp directory first.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import io
import json
import random
import sys
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Conditions that are "social findings" rather than clinical issues.
# Synthea seeds these into nearly every patient and they pollute the
# differential. Filtered out before we hand the patient to the demo.
_SOCIAL_FINDINGS_BLOCKLIST = {
    "received higher education",
    "limited social contact",
    "social isolation",
    "stress",
    "full-time employment",
    "part-time employment",
    "unemployed",
    "not in labor force",
    "lives alone",
    "lives with family",
    "victim of intimate partner abuse",
    "history of pulmonary embolism",  # noisy code that fires from claims
    # Synthea also seeds these as "conditions" but they are administrative
    # or educational metadata, not clinical findings the triage AI should
    # see. Filtered to keep the demo focused on real symptoms.
    "educated to high school level",
    "medication review due",
    "risk activity involvement",
    "housing unsatisfactory",
    "only received primary school education",
    "history of single seizure",  # historical, not present complaint
    "dental caries",              # ubiquitous, distracts from chief complaint
    "impacted molars",            # same
}

# Demographic buckets we want at least one patient in each of, so the
# demo dropdown shows a real spread instead of 10 elderly white men.
DEMOGRAPHIC_BUCKETS: List[Dict[str, Any]] = [
    {"id": "geriatric_cardiac",     "min_age": 65, "max_age": 110, "must_match": ["coronary", "myocard", "atrial fibrill", "hyperten"]},
    {"id": "geriatric_metabolic",   "min_age": 65, "max_age": 110, "must_match": ["diabet", "hyperlipid", "obesi"]},
    {"id": "adult_chronic",         "min_age": 30, "max_age": 64,  "must_match": ["hyperten", "diabet", "asthma", "copd", "depress"]},
    {"id": "adult_acute",           "min_age": 18, "max_age": 64,  "must_match": ["fracture", "lacer", "viral", "sinus", "infect"]},
    {"id": "young_adult_mental",    "min_age": 18, "max_age": 39,  "must_match": ["depress", "anxiet", "stress", "mood"]},
    {"id": "young_adult_metabolic", "min_age": 18, "max_age": 39,  "must_match": ["prediabet", "obesi", "hyperlipid"]},
    {"id": "pediatric_routine",     "min_age": 0,  "max_age": 17,  "must_match": []},
    {"id": "pediatric_acute",       "min_age": 0,  "max_age": 17,  "must_match": ["otitis", "viral", "asthma", "respirat"]},
    {"id": "female_reproductive",   "min_age": 18, "max_age": 64,  "must_match": ["pregn", "preeclamps", "miscarr", "menorr"], "sex": "female"},
    {"id": "male_geriatric_cancer", "min_age": 50, "max_age": 110, "must_match": ["cancer", "neoplasm", "tumor", "carcinoma"], "sex": "male"},
]


# ----------------------------------------------------------------------
# Data shape
# ----------------------------------------------------------------------

@dataclasses.dataclass
class PatientSummary:
    """A slim, JSON-serialisable view of one Synthea patient.

    Only fields the demo actually needs. Field names match what the
    /triage form expects so the BFF can hand this straight to the UI.
    """

    id: str
    label: str          # human-friendly dropdown label, e.g. "Andrew W. (79M, hyperlipidemia, prediabetes)"
    bucket: str         # demographic bucket id
    age: int
    sex: str            # "male" | "female" | "unknown"
    postal_code: str
    city: str
    state: str
    active_conditions: List[str]
    active_medications: List[str]
    allergies: List[str]
    last_vitals: Dict[str, Any]
    narrative_seed: str # one-paragraph free-text the AI can reason over

    def to_dict(self) -> Dict[str, Any]:
        return dataclasses.asdict(self)


# ----------------------------------------------------------------------
# Bundle parsing helpers
# ----------------------------------------------------------------------

def _iter_bundles_from_source(source: Path) -> Iterable[Tuple[str, Dict[str, Any]]]:
    """Yield (bundle_filename, parsed_bundle) for every bundle under source.

    Accepts either a directory of .json files or a .zip archive.
    """
    if source.is_dir():
        for path in sorted(source.glob("*.json")):
            try:
                with path.open("r", encoding="utf-8") as fh:
                    yield path.name, json.load(fh)
            except (OSError, json.JSONDecodeError) as exc:
                print(f"[curate] skipping {path.name}: {exc}", file=sys.stderr)
        return

    if source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source, "r") as zf:
            for name in sorted(zf.namelist()):
                if not name.endswith(".json"):
                    continue
                if name.startswith(("hospitalInformation", "practitionerInformation")):
                    continue
                try:
                    with zf.open(name) as fh:
                        yield name, json.loads(fh.read().decode("utf-8"))
                except (zipfile.BadZipFile, json.JSONDecodeError, OSError) as exc:
                    print(f"[curate] skipping {name}: {exc}", file=sys.stderr)
        return

    raise ValueError(f"source must be a directory or .zip: {source}")


def _years_old(birth_date: str, ref: Optional[dt.date] = None) -> int:
    """Compute age in whole years. Returns 0 on parse failure."""
    if not birth_date:
        return 0
    try:
        bd = dt.date.fromisoformat(birth_date.split("T")[0])
    except ValueError:
        return 0
    today = ref or dt.date.today()
    return today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))


def _is_active(resource: Dict[str, Any]) -> bool:
    """True if the FHIR resource is currently active (not resolved/inactive)."""
    cs = resource.get("clinicalStatus") or {}
    coding = (cs.get("coding") or [{}])[0]
    return (coding.get("code") or "active").lower() == "active"


def _filter_clinical(condition_display: str) -> bool:
    """Drop social-finding pseudo-conditions from the differential."""
    if not condition_display:
        return False
    low = condition_display.lower()
    return not any(b in low for b in _SOCIAL_FINDINGS_BLOCKLIST)


# Tokens at the start of a Synthea medication display string that are
# really just dosage / formulation noise. We strip them so labels and
# narratives say "metoprolol" instead of "24 HR metoprolol".
_MED_PREFIX_NOISE = {
    "24", "12", "8", "120", "72",
    "hr", "mg", "ml", "mcg", "g",
    "actuat", "tablet", "capsule",
    "extended", "release", "oral",
    "topical", "cream", "spray", "inhaler",
}


def _clean_med_name(med_display: str) -> str:
    """Return a human-friendly medication label.

    Synthea displays come back as ``"24 HR metoprolol succinate 100 MG
    Extended Release Oral Tablet"``. The first real word ("metoprolol")
    is what a clinician thinks of when they see the medication. We walk
    the tokens skipping numbers, units, and packaging words until we hit
    the first real ingredient name.
    """
    if not med_display:
        return ""
    tokens = med_display.split()
    for tok in tokens:
        clean = tok.strip(",.;").lower()
        if not clean:
            continue
        # skip if it is purely numeric (handles "24", "100", "0.4")
        try:
            float(clean.replace("/", ".").rstrip("%"))
            continue
        except ValueError:
            pass
        if clean in _MED_PREFIX_NOISE:
            continue
        if any(ch.isdigit() for ch in clean):
            # things like "0.4", "100mg", "24hr" — skip
            continue
        return clean
    return tokens[0].lower() if tokens else ""


def _extract_vitals(observations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pull the most recent vital sign measurements we care about."""
    wanted = {
        "8867-4":  "pulse",          # Heart rate
        "8480-6":  "bp_systolic",    # Systolic BP
        "8462-4":  "bp_diastolic",   # Diastolic BP
        "8310-5":  "temp_c",         # Body temperature
        "9279-1":  "respiratory",    # Respiratory rate
        "59408-5": "o2_sat",         # SpO2
        "2339-0":  "glucose",        # Blood glucose
        "39156-5": "bmi",            # BMI
    }
    latest: Dict[str, Tuple[dt.datetime, float]] = {}
    for obs in observations:
        for code in (obs.get("code", {}).get("coding") or []):
            key = wanted.get(code.get("code"))
            if not key:
                continue
            value = obs.get("valueQuantity", {}).get("value")
            if value is None:
                continue
            try:
                ts_raw = obs.get("effectiveDateTime") or obs.get("issued") or "1970-01-01T00:00:00Z"
                ts = dt.datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
            except ValueError:
                ts = dt.datetime.fromtimestamp(0, tz=dt.timezone.utc)
            prev = latest.get(key)
            if prev is None or ts > prev[0]:
                latest[key] = (ts, float(value))
    return {k: round(v[1], 1) for k, v in latest.items()}


def _extract_allergies(entries: List[Dict[str, Any]]) -> List[str]:
    out: List[str] = []
    for e in entries:
        r = e.get("resource", {})
        if r.get("resourceType") != "AllergyIntolerance":
            continue
        for c in (r.get("code", {}).get("coding") or []):
            disp = c.get("display")
            if disp:
                out.append(disp)
    return sorted(set(out))


# ----------------------------------------------------------------------
# Patient summary extraction
# ----------------------------------------------------------------------

def extract_summary(filename: str, bundle: Dict[str, Any]) -> Optional[PatientSummary]:
    """Convert one Synthea bundle into a slim PatientSummary, or None
    if the bundle does not have a Patient resource."""
    entries = bundle.get("entry") or []

    patient_resource: Optional[Dict[str, Any]] = None
    conditions: List[Dict[str, Any]] = []
    medications: List[Dict[str, Any]] = []
    observations: List[Dict[str, Any]] = []

    for e in entries:
        r = e.get("resource") or {}
        rt = r.get("resourceType")
        if rt == "Patient":
            patient_resource = r
        elif rt == "Condition":
            conditions.append(r)
        elif rt == "MedicationRequest":
            medications.append(r)
        elif rt == "Observation":
            observations.append(r)

    if not patient_resource:
        return None

    name_obj = (patient_resource.get("name") or [{}])[0]
    given = " ".join(name_obj.get("given") or [])
    family = name_obj.get("family") or ""
    initial = (family[:1] + ".") if family else ""

    age = _years_old(patient_resource.get("birthDate", ""))
    sex = (patient_resource.get("gender") or "unknown").lower()

    address = (patient_resource.get("address") or [{}])[0]
    postal = (address.get("postalCode") or "00000")[:5] or "00000"
    city = address.get("city") or ""
    state = address.get("state") or ""

    # Active, clinical, deduplicated.
    active_cond_displays = []
    for c in conditions:
        if not _is_active(c):
            continue
        coding = (c.get("code", {}).get("coding") or [{}])[0]
        disp = coding.get("display")
        if disp and _filter_clinical(disp):
            active_cond_displays.append(disp)
    active_cond_displays = sorted(set(active_cond_displays))

    active_med_displays = []
    for m in medications:
        if (m.get("status") or "").lower() != "active":
            continue
        coding = (m.get("medicationCodeableConcept", {}).get("coding") or [{}])[0]
        disp = coding.get("display")
        if disp:
            active_med_displays.append(disp)
    active_med_displays = sorted(set(active_med_displays))

    allergies = _extract_allergies(entries)
    vitals = _extract_vitals(observations)

    # Pick a chief complaint candidate for the narrative seed: the most
    # recent active condition that isn't a social finding.
    chief = active_cond_displays[0] if active_cond_displays else "general check-up"

    label_meds = ""
    if active_med_displays:
        clean_first = _clean_med_name(active_med_displays[0])
        if clean_first:
            label_meds = f", on {clean_first}"

    label = (
        f"{given} {initial} ({age}{sex[:1].upper() if sex else '?'}, "
        f"{chief.lower()}{label_meds})"
    )

    narrative_seed = _compose_narrative(age, sex, chief, active_cond_displays,
                                        active_med_displays, vitals)

    return PatientSummary(
        id=str(patient_resource.get("id") or filename.split(".")[0]),
        label=label,
        bucket="unassigned",
        age=age,
        sex=sex,
        postal_code=postal,
        city=city,
        state=state,
        active_conditions=active_cond_displays[:8],
        active_medications=active_med_displays[:8],
        allergies=allergies[:6],
        last_vitals=vitals,
        narrative_seed=narrative_seed,
    )


def _compose_narrative(
    age: int,
    sex: str,
    chief: str,
    conditions: List[str],
    medications: List[str],
    vitals: Dict[str, Any],
) -> str:
    """Build a one-paragraph narrative the AI can reason over directly."""
    sex_word = {"male": "male", "female": "female"}.get(sex, "patient")
    bits: List[str] = [
        f"{age} year old {sex_word} presenting today for evaluation."
    ]
    if chief and chief.lower() != "general check-up":
        bits.append(f"Reports concerns related to {chief.lower()}.")
    if len(conditions) > 1:
        others = ", ".join(c.lower() for c in conditions[1:5])
        bits.append(f"Active problems include {others}.")
    if medications:
        cleaned = [_clean_med_name(m) for m in medications[:5]]
        cleaned = [c for c in cleaned if c]
        if cleaned:
            bits.append(f"Current medications: {', '.join(cleaned)}.")
    if vitals:
        parts = []
        if "bp_systolic" in vitals and "bp_diastolic" in vitals:
            parts.append(f"BP {int(vitals['bp_systolic'])}/{int(vitals['bp_diastolic'])}")
        if "pulse" in vitals:
            parts.append(f"HR {int(vitals['pulse'])}")
        if "o2_sat" in vitals:
            parts.append(f"SpO2 {int(vitals['o2_sat'])}%")
        if "temp_c" in vitals:
            parts.append(f"temp {vitals['temp_c']}C")
        if parts:
            bits.append("Most recent vitals: " + ", ".join(parts) + ".")
    return " ".join(bits)


# ----------------------------------------------------------------------
# Curation: pick a balanced set of 10
# ----------------------------------------------------------------------

def _matches_bucket(summary: PatientSummary, bucket: Dict[str, Any]) -> bool:
    if not (bucket["min_age"] <= summary.age <= bucket["max_age"]):
        return False
    if bucket.get("sex") and summary.sex != bucket["sex"]:
        return False
    must = bucket.get("must_match") or []
    if must:
        haystack = " ".join(summary.active_conditions).lower()
        if not any(m in haystack for m in must):
            return False
    return True


def curate_set(
    summaries: List[PatientSummary],
    target: int = 10,
    seed: int = 13,
) -> List[PatientSummary]:
    """Pick ``target`` summaries with as many distinct buckets as possible.

    The result is shuffled deterministically so the demo dropdown does
    not always start with the same entry.
    """
    rng = random.Random(seed)
    chosen: List[PatientSummary] = []
    chosen_ids: set = set()

    # Greedy fill by bucket.
    for bucket in DEMOGRAPHIC_BUCKETS:
        if len(chosen) >= target:
            break
        candidates = [s for s in summaries if s.id not in chosen_ids and _matches_bucket(s, bucket)]
        if not candidates:
            continue
        rng.shuffle(candidates)
        pick = candidates[0]
        pick.bucket = bucket["id"]
        chosen.append(pick)
        chosen_ids.add(pick.id)

    # Top-up with anything we have not seen yet.
    if len(chosen) < target:
        leftovers = [s for s in summaries if s.id not in chosen_ids]
        rng.shuffle(leftovers)
        for s in leftovers[: target - len(chosen)]:
            s.bucket = s.bucket or "unbucketed"
            chosen.append(s)

    rng.shuffle(chosen)
    return chosen[:target]


# ----------------------------------------------------------------------
# Script entry point
# ----------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Curate Synthea demo patients.")
    parser.add_argument(
        "--source",
        type=Path,
        required=True,
        help="Path to a Synthea FHIR R4 .zip OR a directory of bundle JSONs.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "sample_patients" / "patients.json",
        help="Where to write the curated patients.json.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help="Number of patients to keep.",
    )
    args = parser.parse_args(argv)

    print(f"[curate] reading bundles from {args.source}")
    summaries: List[PatientSummary] = []
    for filename, bundle in _iter_bundles_from_source(args.source):
        try:
            summary = extract_summary(filename, bundle)
        except Exception as exc:  # noqa: BLE001 — best-effort over many files
            print(f"[curate] failed on {filename}: {exc}", file=sys.stderr)
            continue
        if summary:
            summaries.append(summary)

    print(f"[curate] extracted {len(summaries)} patient summaries")
    chosen = curate_set(summaries, target=args.count)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                "generated_from": str(args.source),
                "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "count": len(chosen),
                "patients": [s.to_dict() for s in chosen],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[curate] wrote {len(chosen)} patients to {args.out}")
    for s in chosen:
        print(f"  - [{s.bucket}] {s.label}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
