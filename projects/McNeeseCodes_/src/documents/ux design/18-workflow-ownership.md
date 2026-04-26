# 18 — Workflow Ownership & Case State Machine

> This file elevates the nurse → provider handoff (and surrounding workflow) from **gated UI** to **explicit ownership + state transitions**. Everything below is binding guidance; the current implementation only partially honors it (see `21-known-design-debt.md`).

---

## 1. Roles

| Role | Primary surfaces | Scope |
|---|---|---|
| **Patient** | `/patient/intake`, `/patient/status`, `/patient/history` | Self-report, consent, follow-up |
| **Front-desk** | `/front-desk/queue`, `/front-desk/case/[id]`, `/front-desk/appointments` | Admin completeness, routing, urgency override, schedule |
| **Nurse** | `/nurse` | Clinical triage, symptom validation, findings capture, handoff preparation |
| **Provider (Doctor)** | `/provider/daily`, `/provider/case/[id]` | Clinical decision, diagnosis, disposition, final sign-off |
| **Operations** | `/operations/dashboard`, `/operations/audit` | Read-only analytics + audit governance |
| **System** | — | Runs AI intake draft, generates risk flags, writes transition events |

---

## 2. Case state machine

Every case has a single canonical status. Pages must render based on status, not ad-hoc boolean flags.

```
submitted
  → front_desk_reviewed
    → nurse_in_progress
      → nurse_validated
        → provider_pending
          → provider_reviewed
            → disposition_finalized
```

Forward-only transitions (excepting `reopen` — see §4). Each transition fires an audit event captured by `/operations/audit`.

### Status reference

| Status | Owner | What it means | Who can advance it |
|---|---|---|---|
| `submitted` | System | Patient completed intake wizard. | Front-desk moves to `front_desk_reviewed`. |
| `front_desk_reviewed` | Front-desk | Admin completeness + routing + urgency override confirmed. | Any nurse picks up → `nurse_in_progress`. |
| `nurse_in_progress` | Nurse (assigned) | Triage underway; questionnaire + findings being captured. | The assigned nurse only → `nurse_validated`. |
| `nurse_validated` | Nurse (assigned) | All required findings present, validation checkpoint green, handoff brief built. | Nurse explicitly marks handoff-ready → `provider_pending`. |
| `provider_pending` | Provider pool | Case awaits a doctor. Appears in provider daily list. | Any provider opens → `provider_reviewed`. |
| `provider_reviewed` | Provider (assigned) | Doctor has opened and is actively reviewing. | Assigned provider only → `disposition_finalized`. |
| `disposition_finalized` | Provider (assigned) | Clinical decision recorded; case closed to editing except via reopen. | Operations / admin can `reopen` with reason. |

---

## 3. Handoff contracts (what each transition guarantees)

### 3.1 Front-desk → Nurse (`front_desk_reviewed → nurse_in_progress`)

Required before advancing:
- Patient identity verified (MRN or demo ID on file).
- Registration packet complete.
- Initial urgency set (patient-declared or front-desk override).
- At least one reason-for-visit captured.

Nurse `/nurse` page **must** show these fields as pre-populated context in the left rail.

### 3.2 Nurse → Provider (`nurse_validated → provider_pending`) — most critical

**Required before the "Send to Provider" CTA becomes enabled:**

| Category | Required fields |
|---|---|
| Identity | Name, age/DOB, MRN |
| Complaint | Chief complaint text, duration, severity (1–10) |
| Vitals | BP, HR, temp, SpO₂ (if captured); each is either numeric or explicitly marked `not-taken` with reason |
| Symptom questionnaire | All `required=true` items answered |
| Findings | At least one nurse-authored finding OR explicit "no abnormal findings" toggle |
| Risk flags | Acknowledged if any AI-raised flag is `high` |
| Validation checkpoint | All green; any red item blocks handoff |
| Handoff brief | Auto-generated AI summary **reviewed and confirmed** by the nurse (explicit confirm button; silent pass-through not allowed) |

**On successful handoff:**
- Case status advances to `provider_pending`.
- An audit event `nurse.handoff_ready` is written with the nurse's ID and a frozen snapshot of the findings at that moment.
- The case becomes read-only for the nurse except via `reopen`.
- The case appears in provider daily list with a "handoff ready" badge.

### 3.3 Provider review (`provider_pending → provider_reviewed → disposition_finalized`)

What a provider **must** see when they open a `provider_pending` case:
1. Patient context rail (pre-populated).
2. Nurse handoff brief at top of clinical summary rail (clearly marked "Nurse brief — validated HH:MM by <nurse name>").
3. All nurse-authored findings, flagged as editable **only** by the provider (nurse inputs are visually marked "from nurse — read-only to you unless you reopen").
4. Decision rail with disposition choices, Rx area, follow-up scheduling, and final sign-off button.

**Provider-only abilities:**
- Author/modify diagnosis.
- Author/modify prescriptions.
- Select disposition.
- Trigger `disposition_finalized`.

**Provider may NOT silently overwrite** a nurse-authored finding. Editing a nurse finding requires:
- A reopen-with-reason dialog OR
- Adding a new provider-authored finding that supersedes it (audit trail preserves both).

### 3.4 The "not cleared" state (current UI is a gate, must become a handshake)

**Today:** if a case is `nurse_in_progress` (triage not cleared), `/provider/case/[id]` renders a centered amber placeholder.

**Required:** the placeholder must convert into an informational state that shows:
- Current owner (which nurse, when picked up).
- Checklist of what's still missing (from § 3.2 list).
- Read-only patient context so provider can still plan around it.
- Button "Request escalation" that notifies the nurse without bypassing the workflow.

The **block** on editing must remain; the **blindness** must end.

---

## 4. Reopen / exception transitions

| Transition | Allowed actor | Required reason | Effect |
|---|---|---|---|
| `nurse_validated → nurse_in_progress` | Nurse (owner) | Free-text reason | Case returns to editable for nurse. Provider pool is notified. |
| `provider_reviewed → nurse_in_progress` | Provider | "Need more triage" + reason | Sends back to nurse; nurse sees inline provider note. |
| `disposition_finalized → provider_reviewed` | Provider (same), within 4 h | Amendment reason | Unlocks provider edits; preserves finalization audit. |
| `disposition_finalized → provider_reviewed` | Operations | Compliance reopen + case ID + reason | Requires operations role. |
| `any → void` | Operations | Void reason | Terminal; no further edits; remains visible in audit. |

All reopens write to `/operations/audit` as `case.reopen` events.

---

## 5. Editable-by-whom matrix

| Field | Patient | Front-desk | Nurse | Provider | Ops |
|---|---|---|---|---|---|
| Demographics | At intake only | Correct | Read | Read | Correct (audit) |
| Urgency (patient-declared) | At intake | Override | Read | Read | Read |
| Chief complaint | At intake | Clarify only | Clarify only | Amend with note | Read |
| Vitals | — | — | Write | Amend with note | Read |
| Symptom questionnaire | At intake | — | Write | Read | Read |
| Nurse findings | — | — | Write until validated | Amend-with-new-entry only | Read |
| Diagnosis | — | — | — | Write | Read |
| Prescriptions | — | — | — | Write | Read |
| Disposition | — | — | — | Write (finalize) | Reopen only |
| Audit notes | — | — | — | — | Write |

---

## 6. UI implications (what each page must express)

| Page | Must render |
|---|---|
| `/front-desk/queue` | Case rows tagged with current status chip using the names in §2. |
| `/front-desk/case/[id]` | Registration completeness checklist; urgency override is distinct from patient-declared urgency. |
| `/nurse` | Validation checkpoint must map to the § 3.2 required list. Handoff CTA must be disabled (with reason tooltip) until all items pass. |
| `/provider/daily` | Show only `provider_pending` + `provider_reviewed` cases. "Handoff ready" badge required. |
| `/provider/case/[id]` | Honor § 3.3 fully. Replace current hard gate with § 3.4 informational state. |
| `/operations/audit` | Every state transition renders as a row with actor, timestamp, status-from, status-to, reason. |

---

## 7. Known gaps vs current implementation

See `21-known-design-debt.md § Workflow` for the tracked list. Highlights:

- `/provider/case/[id]` currently shows the full-page amber gate — must evolve to § 3.4.
- `/nurse` validation-checkpoint fields are partially present but not contract-aligned (some fields from § 3.2 are not enforced before enabling handoff CTA).
- Status chip vocabulary on `/front-desk/queue` uses human-readable labels that don't 1:1 match the § 2 state names — unify.
- Audit events are emitted inconsistently; see `/operations/audit` doc.
