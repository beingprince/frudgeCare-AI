# FrudgeCare AI — System Flow

This document is the canonical, code-grounded picture of how FrudgeCare AI works end-to-end. It is derived from:

- `apps/web/src/lib/caseStateMachine.ts` — the 9-state case finite-state machine.
- `services/ai-engine/main.py` and `services/ai-engine/tiered_ai.py` — the FastAPI AI engine and its tiered fallback.
- `apps/web/src/app/api/**` — the Next.js API routes that broker every action.
- `documents/product/working flow and vision of the system.txt` — the product vision and the "Action Loop".

If the code and this document disagree, the code wins — please update this file in the same PR.

---

## 1. End-to-end system flowchart

Roles, the case state machine, the AI engine, and the shared infrastructure in one view.

```mermaid
flowchart TD
    %% ===== ACTORS =====
    P([Patient])
    FD([Front Desk])
    N([Clinical Nurse])
    DR([Provider / Doctor])
    AD([Admin])

    %% ===== STAGE 1: INTAKE =====
    P -->|fills dynamic symptom form| F1[/patient/intake/]
    F1 -->|POST /api/cases/create| S1[(case: intake_submitted)]
    S1 -->|POST /api/ai/analyze-intake| AI1{{AI Engine: /analyze-intake}}

    %% ===== AI TIERED FALLBACK =====
    AI1 --> T0[Tier 0: KB retrieval]
    T0 --> T1[Tier 1: Gemini verifier]
    T1 --> T2[Tier 2: templated]
    T2 --> T3[Tier 3: safe default]
    T3 --> BRIEF[[Patient Summary Brief +<br/>urgency High/Med/Low]]
    BRIEF -->|transition| S2[(case: ai_pretriage_ready)]

    %% ===== STAGE 2: FRONT DESK =====
    S2 --> FDQ[/front-desk dashboard/]
    FD --> FDQ
    FDQ -->|POST /api/ai/rank-queue| AI2{{AI Engine: /rank-queue<br/>smart queue + bottleneck alerts}}
    AI2 --> FDQ
    FDQ -->|assign provider + slot| S3[(case: frontdesk_review)]
    S3 -->|push to nurse| S4[(case: nurse_triage_pending)]

    %% ===== STAGE 3: NURSE =====
    N --> NW[/nurse dashboard/]
    S4 --> NW
    NW -->|open case| S5[(case: nurse_triage_in_progress)]
    NW -->|POST /api/ai/nurse-assist| AI3{{AI Engine: /nurse-assist<br/>vitals flags · allergy alerts ·<br/>SBAR questions · drug interactions}}
    AI3 --> NW
    NW -->|POST /api/nurse/assessments<br/>validate + handoff brief| S6[(case: nurse_validated)]

    %% ===== INVARIANT GATE =====
    S6 -->|POST /orchestrator/handoff-to-provider<br/>requires is_validated=true<br/>AND non-empty handoff brief| GATE{{Strict handoff invariant}}
    GATE -- pass --> S7[(case: provider_review_pending)]
    GATE -- fail --> REJ[[403 Workflow Violation]]

    %% ===== STAGE 4: PROVIDER =====
    DR --> PW[/provider dashboard/]
    S7 --> PW
    PW -->|POST /api/ai/provider-copilot| AI4{{AI Engine: /provider-copilot<br/>differential dx · ICD-10 ·<br/>recommended tests · drug alerts}}
    AI4 --> PW
    PW -->|POST /api/provider/decisions<br/>orders / treatment| S8[(case: provider_action_issued)]

    %% ===== STAGE 5: SAFETY LOOP =====
    S8 --> SAFE[Nurse executes orders]
    SAFE -->|Comply| S9[(case: disposition_finalized)]
    SAFE -->|Refuse with remarks| PW

    %% ===== STAGE 6: PATIENT FEEDBACK =====
    S2 -. real-time status .-> P
    S3 -. real-time status .-> P
    S7 -. real-time status .-> P
    S9 -. resolution .-> P

    %% ===== ADMIN / OPS =====
    AD --> OPS[/operations + admin/]
    OPS -->|/api/operations/kpis| KPI[KPIs]
    OPS -->|/api/operations/ai-reliability| REL[AI tier mix · provenance]
    OPS -->|/api/admin/accounts| ACC[Account mgmt]

    %% ===== SHARED INFRA =====
    subgraph INFRA[Shared infrastructure]
      DB[(Supabase Postgres<br/>cases · assessments · decisions · ehr)]
      FSM[[caseStateMachine.ts<br/>canTransition gate]]
      SEC[[INTERNAL_API_SECRET<br/>x-internal-secret header]]
    end

    S1 & S2 & S3 & S4 & S5 & S6 & S7 & S8 & S9 --- DB
    GATE --- FSM
    AI1 & AI2 & AI3 & AI4 --- SEC

    classDef state fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef ai fill:#fef3c7,stroke:#b45309,color:#78350f;
    classDef actor fill:#ecfccb,stroke:#4d7c0f,color:#365314;
    classDef gate fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d;
    class S1,S2,S3,S4,S5,S6,S7,S8,S9 state;
    class AI1,AI2,AI3,AI4,T0,T1,T2,T3 ai;
    class P,FD,N,DR,AD actor;
    class GATE,REJ gate;
```

---

## 2. Case state machine

The canonical happy path enforced by `canTransition()` in `apps/web/src/lib/caseStateMachine.ts` and re-validated server-side by `POST /api/cases/transition`. A bug in any UI page can never write an impossible state because the API rejects it.

```mermaid
stateDiagram-v2
    [*] --> intake_submitted
    intake_submitted --> ai_pretriage_ready: AI analyze-intake
    ai_pretriage_ready --> frontdesk_review: front desk picks up
    frontdesk_review --> nurse_triage_pending: routed to nurse
    nurse_triage_pending --> nurse_triage_in_progress: nurse opens case
    nurse_triage_in_progress --> nurse_validated: nurse signs off
    nurse_triage_in_progress --> provider_review_pending: escalate (skip path)
    nurse_validated --> provider_review_pending: handoff invariant passes
    provider_review_pending --> provider_action_issued: orders issued
    provider_action_issued --> disposition_finalized: orders complied
    disposition_finalized --> [*]
```

| Status                     | Label              | Owner       |
| -------------------------- | ------------------ | ----------- |
| `intake_submitted`         | Submitted          | Patient     |
| `ai_pretriage_ready`       | AI Triage Ready    | AI Engine   |
| `frontdesk_review`         | Front Desk Review  | Front Desk  |
| `nurse_triage_pending`     | Awaiting Nurse     | Front Desk  |
| `nurse_triage_in_progress` | Nurse In Progress  | Nurse       |
| `nurse_validated`          | Nurse Validated    | Nurse       |
| `provider_review_pending`  | Awaiting Provider  | Provider    |
| `provider_action_issued`   | Decision Issued    | Provider    |
| `disposition_finalized`    | Closed             | Nurse / AI  |

---

## 3. AI tiered-resilience flow

Every AI endpoint (`/analyze-intake`, `/ai/rank-queue`, `/ai/nurse-assist`, `/ai/provider-copilot`) follows the same 4-tier degradation. The system never hard-fails — if Gemini is unavailable, KB retrieval, templated rules, and a safe-default tier still produce a structured, audit-friendly response.

```mermaid
flowchart LR
    REQ[Request from Next.js<br/>with x-internal-secret] --> AUTH{Secret valid?}
    AUTH -- no --> X[401 Unauthorized]
    AUTH -- yes --> T0[Tier 0<br/>Knowledge Base<br/>retrieval.py]
    T0 --> Q0{Confident?}
    Q0 -- yes --> OUT[(Response +<br/>source_tier +<br/>provenance)]
    Q0 -- no --> T1[Tier 1<br/>Gemini as verifier<br/>tiered_ai.py]
    T1 --> Q1{LLM available<br/>and grounded?}
    Q1 -- yes --> OUT
    Q1 -- no --> T2[Tier 2<br/>Templated rules]
    T2 --> Q2{Pattern matched?}
    Q2 -- yes --> OUT
    Q2 -- no --> T3[Tier 3<br/>Safe default<br/>conservative urgency]
    T3 --> OUT
```

Every response carries `source_tier` (0–3) and `provenance[]`, which the Operations dashboard reads via `/api/operations/ai-reliability` to monitor tier mix over time.

---

## 4. Endpoint map

### Next.js API routes (`apps/web/src/app/api`)

| Route                              | Purpose                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| `POST /api/cases/create`           | Create a case from the patient intake form.                      |
| `POST /api/cases/transition`       | Move a case between statuses; rejects illegal transitions.       |
| `POST /api/nurse/assessments`      | Persist nurse assessment + validated handoff brief.              |
| `POST /api/provider/decisions`     | Persist provider orders / treatment steps.                       |
| `POST /api/ai/analyze-intake`      | Proxy to AI engine `/analyze-intake`.                            |
| `POST /api/ai/rank-queue`          | Proxy to AI engine `/ai/rank-queue`.                             |
| `POST /api/ai/nurse-assist`        | Proxy to AI engine `/ai/nurse-assist`.                           |
| `POST /api/ai/provider-copilot`    | Proxy to AI engine `/ai/provider-copilot`.                       |
| `GET  /api/operations/kpis`        | Operational KPIs for the operations dashboard.                   |
| `GET  /api/operations/ai-reliability` | Tier-mix and provenance telemetry for AI calls.               |
| `*    /api/admin/accounts`         | Admin account management.                                        |

All AI proxies attach `x-internal-secret: $INTERNAL_API_SECRET` before calling the FastAPI engine.

### AI engine (`services/ai-engine/main.py`)

| Route                                      | Purpose                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `POST /analyze-intake`                     | Pre-triage: urgency, summary, risks, clinician brief.                |
| `POST /ai/rank-queue`                      | Front-desk smart queue + bottleneck alerts.                          |
| `POST /ai/nurse-assist`                    | Vitals flags, allergy alerts, SBAR questions, drug interactions.     |
| `POST /ai/provider-copilot`                | Differential dx + ICD-10, recommended tests, drug-interaction alerts. |
| `POST /orchestrator/handoff-to-provider`   | Enforces nurse-validation invariant before provider review.          |
| `POST /orchestrator/submit-provider-action`| Enforces "must read a valid nurse assessment" before issuing orders. |
| `GET  /health`                             | Liveness + LLM availability.                                         |

---

## 5. Hard invariants (don't break these)

1. **No status skipping.** `caseStateMachine.canTransition(from, to)` is the only legal transition oracle, and `/api/cases/transition` re-validates it server-side.
2. **Nurse-before-provider.** `/orchestrator/handoff-to-provider` returns `403 Workflow Violation` unless `is_validated === true` **and** `provider_handoff_brief` is non-empty.
3. **No orders without a read assessment.** `/orchestrator/submit-provider-action` returns `403` unless `active_nurse_assessment_id` is present.
4. **Internal-only AI engine.** Every AI route requires `x-internal-secret`; the browser never calls the FastAPI engine directly — only the Next.js API routes do.
5. **Graceful AI degradation.** If `GEMINI_API_KEY` is missing or Gemini errors out, the engine logs and continues in KB-only mode (Tier 0/2/3); it never raises a 5xx for an LLM outage.
6. **Provenance is mandatory.** Every AI response sets `source_tier` and `provenance[]` so Operations can audit which tier produced a decision.

---

## 6. Roles & responsibilities

- **Patient** — source of truth for symptoms; consumer of real-time case status.
- **Front Desk** — traffic management, AI-ranked queue, slot assignment.
- **Clinical Nurse** — primary coordinator, gatekeeper of clinical data, validates AI output before any provider sees it.
- **Provider / Doctor** — final clinical authority; issues orders / treatment using the co-pilot.
- **Admin** — account management, system configuration, operations dashboards.
- **AI (Orchestrator)** — background engine that pre-triages, ranks, assists, and proposes — but never auto-decides.
