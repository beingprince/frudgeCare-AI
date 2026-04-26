# Page ↔ Route Wiring Matrix

**Status:** Audited and fixed on 2026-04-25 in preparation for the CareDevi
Hackathon 2026 demo (Apr 26, 4:00 PM CDT).

This document is the canonical answer to "is page X actually talking to
route Y, and does the data flow on through to page Z?" Every Next.js page
in `apps/web/src/app/**/page.tsx` and every API route in
`apps/web/src/app/api/**/route.ts` is enumerated, classified, and tagged
with its real upstream/downstream wiring.

The audit was driven by:
- An end-to-end smoke test that walked one fresh case through the full
  state machine (`intake_submitted → … → provider_action_issued`) and
  read each page's data source after every transition.
- The canonical state machine in
  `apps/web/src/lib/caseStateMachine.ts` and the workflow ownership
  contract in `documents/ux design/18-workflow-ownership.md`.

---

## 1. Frontend pages (21 total)

Legend:
- ✅ Wired to live backend (Supabase via API route, or AI engine)
- 🟡 Wired but degrades to mock when env / DB is unavailable
- ❌ Mock-only at the time of the audit (now fixed unless noted)
- 📌 Static / no data fetch (intentional)

| Page | Reads from | Writes to | Status |
|---|---|---|---|
| `/` | — | — | 📌 Landing |
| `/triage` (public demo) | `POST /api/ai/analyze-intake`, `POST /api/ai/triage-cascade`, `POST /api/cases/create`, plus `GET /api/demo/synthea`, `GET /api/community/similar`, `GET /api/pharmacy/search` (panels) | `cases` (via create) | ✅ |
| `/agent` | `POST /api/ai/agentic-triage` | — | ✅ |
| `/console` | (lazy MUI showcases; no data) | — | 📌 |
| `/settings` | `POST /api/demo/reset` | `cases`, `events` (cleared) | ✅ |
| `/admin/accounts` | `GET/POST /api/admin/accounts`, `PATCH/DELETE /api/admin/accounts/[id]` | `accounts` table | ✅ |
| `/billing` | — | — | 📌 (illustrative) |
| `/patient/intake` | `POST /api/patient/register`, `POST /api/ai/analyze-intake`, `POST /api/ai/build-patient-profile`, `POST /api/cases/create` | `patient_profiles`, `cases` | ✅ |
| `/patient/status` | `GET /api/auth/session`, `GET /api/patient/me/cases`, `GET /api/cases/[caseId]` | — | ✅ |
| `/patient/history` | `GET /api/patient/me/cases` (FIXED — was MOCK_HISTORY only) | — | ✅ |
| `/patient/questionnaire` | (local-state form, hands off to `/patient/intake`) | — | 📌 |
| `/front-desk/queue` | `GET /api/cases/queue`, `POST /api/ai/rank-queue`, `POST /api/cases/transition` | `cases.status` | ✅ |
| `/front-desk/case/[id]` | direct `supabase.from('cases')` + `MOCK` fallback | direct `supabase.update` | 🟡 (acceptable; bypasses BFF) |
| `/front-desk/appointments` | `MOCK_APPOINTMENTS` only | — | 🟡 (acceptable; demo-only screen) |
| `/nurse` | `GET /api/cases/nurse-queue` | — | ✅ |
| `/nurse/case/[caseId]` | `GET /api/cases/[caseId]`, `POST /api/ai/nurse-assist`, `POST /api/nurse/assessments`, `POST /api/cases/transition` | `cases.ai_patient_profile.nurse_assessment`, `cases.status` | ✅ |
| `/provider/daily` | direct `supabase.from('appointments')` + `MOCK` fallback | — | 🟡 |
| `/provider/case/[id]` | **FIXED**: `GET /api/cases/[caseId]` (folds nurse_assessment from `ai_patient_profile`); `POST /api/provider/decisions`; `POST /api/cases/transition` (×2) | `provider_actions`, `cases.ai_patient_profile.provider_decision`, `cases.status` | ✅ |
| `/operations/dashboard` | `GET /api/operations/kpis`, `GET /api/operations/ai-reliability` | — | ✅ |
| `/operations/audit` | `MOCK_AUDIT` only (events table not deployed) | — | 🟡 (blocked by missing `events` table; falls back gracefully) |

---

## 2. API routes (35 total)

### Auth
| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/session` | GET | Read `fc_session` cookie. Used by `/patient/status`, `/patient/history`. |
| `/api/auth/logout` | POST | Clears session cookie. |
| `/api/auth/patient/login`, `send-otp`, `verify-otp`, `verify-identity` | POST | Patient OTP flow. |
| `/api/auth/staff/login`, `send-otp`, `verify-otp`, `verify-identity` | POST | Staff OTP flow. |

### Cases
| Route | Methods | Purpose |
|---|---|---|
| `/api/cases/create` | POST | Schema-tolerant create on `cases`. Whitelisted columns; extras folded into `ai_patient_profile.client_extras`. |
| `/api/cases/[caseId]` | GET | Resolves UUID OR case_code. Returns full row including `ai_patient_profile.nurse_assessment` and `ai_patient_profile.provider_decision`. |
| `/api/cases/queue` | GET | Front-desk queue listing. |
| `/api/cases/nurse-queue` | GET | Nurse queue listing (filtered by status). |
| `/api/cases/transition` | POST | FSM-validated status update. Best-effort `events` audit insert (table currently missing). |

### Nurse
| Route | Methods | Purpose |
|---|---|---|
| `/api/nurse/assessments` | POST | Persists nurse triage. Tries `nurse_assessments` table; **always** folds into `cases.ai_patient_profile.nurse_assessment` so the provider page reads it via `/api/cases/[caseId]`. |

### Provider
| Route | Methods | Purpose |
|---|---|---|
| `/api/provider/decisions` | POST | **HARDENED**: tries `provider_actions` table; always folds into `cases.ai_patient_profile.provider_decision`; best-effort `events` insert. |

### AI (BFF → Python AI engine on `:8002`)
| Route | Methods | Purpose |
|---|---|---|
| `/api/ai/analyze-intake` | POST | Tiered cascade (OpenAI primary → Gemini fallback → KB). Returns `llm_provider` / `llm_model` for honest UI attribution. |
| `/api/ai/triage-cascade` | POST | Same cascade, exposes raw tier metadata for `/triage`. |
| `/api/ai/build-patient-profile` | POST | Build a structured profile from intake fields. |
| `/api/ai/nurse-assist` | POST | Nurse triage suggestions (questionnaire, vitals interpretation). |
| `/api/ai/provider-copilot` | POST | Provider clinical co-pilot (DDx, orders). |
| `/api/ai/rank-queue` | POST | Reorder front-desk queue by urgency. |
| `/api/ai/agentic-triage` | POST | ReAct-style scripted agent for `/agent`. |
| `/api/ai/concierge` | POST | Patient-facing concierge / question answering. |

### Patient
| Route | Methods | Purpose |
|---|---|---|
| `/api/patient/register` | POST | Walk-in or self-serve patient profile registration. |
| `/api/patient/me/cases` | GET | Lists cases owned by the session patient. Used by `/patient/status` and `/patient/history`. |

### Admin
| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/accounts`, `/api/admin/accounts/[id]` | GET/POST/PATCH/DELETE | CRUD for staff accounts. |

### Operations
| Route | Methods | Purpose |
|---|---|---|
| `/api/operations/kpis` | GET | KPI strip on `/operations/dashboard`. |
| `/api/operations/ai-reliability` | GET | AI reliability gauges. |

### Demo helpers
| Route | Methods | Purpose |
|---|---|---|
| `/api/demo/synthea` | GET | Loads curated Synthea bundles for `/triage` quick-fill. |
| `/api/demo/reset` | POST | Wipes demo cases + events. |
| `/api/community/similar` | GET | Cached Reddit `r/AskDocs` similarity panel. |
| `/api/pharmacy/search` | GET | Tavily-backed pharmacy + price lookup. |

---

## 3. End-to-end smoke test (verified Apr 25, 2026 21:43 CDT)

A single freshly-created case (`FC-C-BATLOZ`,
`f3e45546-4ef4-40cf-b3f6-6cd4efe54d9d`) was walked through the full FSM:

| Step | Status after | Verified via |
|---|---|---|
| Patient intake | `intake_submitted` | `POST /api/cases/create` returned UUID + case_code |
| AI pretriage ready | `ai_pretriage_ready` | `POST /api/cases/transition` |
| Front-desk reviewed | `frontdesk_review` | same |
| Routed to nurse | `nurse_triage_pending` | same |
| Nurse picked up | `nurse_triage_in_progress` | same |
| Nurse handoff | `provider_review_pending` | `POST /api/nurse/assessments` (`persisted: case_only`) + `POST /api/cases/transition` |
| Provider decision signed | `provider_action_issued` | `POST /api/provider/decisions` (`persisted: case_only`) + `POST /api/cases/transition` |

After every transition, `GET /api/cases/[caseId]` was re-issued and the
expected payload appeared. In particular, after the nurse handoff,
`case.ai_patient_profile.nurse_assessment` carried the chief complaint,
ESI, vitals (BP 165/95, HR 110, SpO₂ 95), and the validated narrative —
all of which the new `/provider/case/[id]` loader now renders as the
nurse brief, vitals grid, assessment fields, and risk-flag chips on the
provider page.

After the provider's decision,
`case.ai_patient_profile.provider_decision` carried the action,
encounter note, and patient-visible message. `/patient/status?caseId=…`
reads the same row and surfaces the patient-visible part.

---

## 4. Known schema gaps (graceful degrade, not blockers)

The hackathon Supabase project ships with a minimal `cases` table only.
The following are NOT deployed; every API route that wanted them now
degrades cleanly (returns success, logs a warning, folds the data into
JSONB on `cases.ai_patient_profile`):

- `events` — audit log. `cases/transition`, `provider/decisions`,
  `nurse/assessments` all skip the audit insert when this is missing.
- `nurse_assessments` — handoff records. Folded into
  `cases.ai_patient_profile.nurse_assessment`.
- `provider_actions` — signed decisions. Folded into
  `cases.ai_patient_profile.provider_decision`.
- `appointments` — used by `/provider/daily` and
  `/front-desk/appointments`; absence falls back to mock data.

This is documented in `documents/ux design/21-known-design-debt.md` and
the route-level docstrings.

---

## 5. Fixes shipped during this audit

1. **`/provider/case/[id]` rewired to live data**
   - Added `loadProviderCaseView(id)` async loader in
     `apps/web/src/app/provider/case/[id]/_data/case-view.ts`.
   - Added `buildViewFromApiCase` that maps a real `cases` row plus the
     folded nurse handoff into the existing `ProviderCaseView` shape.
   - Page now shows a loading state, then real patient + nurse data.
     Mock-001 demo case still works.
2. **Provider decisions persist server-side**
   - `apps/web/src/app/api/provider/decisions/route.ts` rewritten to
     mirror the schema-tolerant pattern used by `nurse/assessments`:
     service-role client, dedicated table best-effort, JSONB fold-in
     fallback, audit insert tolerated.
   - Page advances the case to `provider_action_issued` (and
     `disposition_finalized` for close-and-discharge) via
     `/api/cases/transition` after the decision is saved.
   - Decision is keyed by the canonical case UUID, not the URL string,
     so it works whether the user landed via UUID or `case_code`.
3. **`/patient/history` shows real cases**
   - Page now calls `/api/patient/me/cases` and links each row to
     `/patient/status?caseId=<uuid>`. Falls back to a small demo strip
     for unauthenticated visitors.
4. **End-to-end smoke test** (above) re-run to verify nothing regressed.
