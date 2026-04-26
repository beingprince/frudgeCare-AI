"""
FrudgeCare AI Engine — Synthea demo patient module.

Exposes a small set of curated FHIR R4 Synthea patients so the /triage
demo can pre-fill the intake form with a realistic synthetic case in one
click. The curated set is committed to the repo at::

    services/ai-engine/synthea/sample_patients/patients.json

so the demo runs offline without the full 35 MB Synthea download. To
regenerate the curated set from a fresh Synthea bundle::

    python -m services.ai-engine.synthea.curate \\
        --source <path/to/synthea_sample_data_fhir_latest.zip>

The curation logic lives in ``curate.py``. The runtime loader lives in
``loader.py`` and is what FastAPI imports.
"""

from .loader import (
    PatientSummary,
    list_demo_patients,
    load_demo_patients,
)

__all__ = [
    "PatientSummary",
    "list_demo_patients",
    "load_demo_patients",
]
