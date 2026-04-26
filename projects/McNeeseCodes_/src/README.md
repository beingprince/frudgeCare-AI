# Source Code — FrudgeCare AI

This folder contains the full FrudgeCare AI source tree, packaged inside the hackathon submission folder so judges can review every line without having to clone a second repository.

The layout below mirrors the team's working repository at <https://github.com/beingprince/McNeeseCodes_>.

---

## Layout

```
src/
  apps/
    web/                       Next.js 16 frontend (App Router, React 19, Tailwind 4, MUI 6)
      src/app/                 Routes (triage, console, patient, nurse, provider, front-desk, api)
      src/components/          Shared UI (CommandPalette, Disclosure, etc.)
      src/lib/                 Theme tokens, cascade store, triage receipt PDF, etc.
      public/                  Static assets

  services/
    ai-engine/                 Python 3.11 FastAPI service (Gemini + GPT-4o-mini, tiered AI)
      main.py                  FastAPI entrypoint
      tiered_ai.py             T0–T3 routing
      agent_react.py           ReAct agent loop
      agent_tools.py           Tool definitions (RAG, KB lookups, Tavily, etc.)
      retrieval.py             Knowledge-base retrieval
      pharmacy.py              Tavily-backed pharmacy + Maps directions URL builder
      community.py             Community resource finder
      knowledge_base/          JSON KB (red flags, symptom patterns, RAG corpus)
      synthea/
        sample_patients/       Curated slim Synthea FHIR summaries (committed)
        loader.py              Bundle loader
        curate.py              Slim-summary builder

  supabase/
    migrations/                Postgres schema migrations
    seed.sql                   Demo seed data
    ehr-seed.sql               EHR / FHIR seed

  documents/
    audit/                     Program audit
    engineering/               Engineering notes
    mobile-design/             Mobile design specs
    plans/                     Sprint and finishing plans
    product/                   Product decisions
    ux design/                 Design system foundations + per-page specs

  packages/                    (Reserved for shared TS packages; currently empty)

  package.json                 npm workspace root
  package-lock.json
  LICENSE
  .gitignore                   Standard Next.js + Python ignore rules
```

> **Note on Synthea bundles.** The raw extracted FHIR bundles (`services/ai-engine/synthea/_extracted/`) are regenerable from the public Synthea zip and are intentionally not committed. The curated slim summaries the engine actually reads at runtime live under `synthea/sample_patients/` and are included.

---

## Running locally from this folder

The `package.json` here is the same npm workspace root used in production. From inside `projects/McNeeseCodes_/src/`:

```bash
# 1. Install JS dependencies (frontend + workspace)
npm install

# 2. Install Python dependencies for the AI engine
cd services/ai-engine
python -m venv .venv
.venv/Scripts/activate          # Windows PowerShell:  .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ../..

# 3. Configure environment
cp apps/web/.env.example apps/web/.env.local
cp services/ai-engine/.env.example services/ai-engine/.env
# Then fill in: GEMINI_API_KEY, OPENAI_API_KEY, TAVILY_API_KEY,
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 4. Run both services
npm run dev          # starts Next.js on :3000 and the AI engine on :8002 concurrently
```

Smoke-test routes:

- `http://localhost:3000/triage` — patient self-triage flow (with pharmacy locator, community resources, send-to-front-desk handoff)
- `http://localhost:3000/console` — unified staff console (Cmd+K palette)
- `http://localhost:3000/nurse/case/[caseId]` — nurse cascade & live updates
- `http://localhost:3000/provider/case/[caseId]` — provider review (the design reference for the entire site)
- `http://localhost:3000/patient/status` — patient live dashboard with provider notes

The AI engine exposes its FastAPI docs at `http://localhost:8002/docs`.

---

## What lives where (quick index)

| Layer | File |
| ----- | ---- |
| Patient triage UI | `apps/web/src/app/triage/page.tsx` |
| Pharmacy locator (Maps directions URL) | `apps/web/src/app/triage/PharmacyFinder.tsx` |
| Community resources | `apps/web/src/app/triage/CommunityPanel.tsx` |
| Send-to-front-desk modal | `apps/web/src/app/triage/SendToFrontDeskModal.tsx` |
| Patient live dashboard | `apps/web/src/app/patient/status/page.tsx` |
| Nurse cascade runner | `apps/web/src/app/nurse/case/[caseId]/page.tsx` |
| Provider review (design reference) | `apps/web/src/app/provider/case/[caseId]/page.tsx` |
| Triage receipt PDF builder | `apps/web/src/lib/triage-receipt.ts` |
| Cascade in-memory store | `apps/web/src/lib/cascade-store.ts` |
| Cascade types (shared) | `apps/web/src/lib/cascade-types.ts` |
| BFF: analyze intake | `apps/web/src/app/api/ai/analyze-intake/route.ts` |
| BFF: triage cascade | `apps/web/src/app/api/ai/triage-cascade/route.ts` |
| BFF: pharmacy search | `apps/web/src/app/api/pharmacy/search/route.ts` |
| BFF: case create / fetch / cascade | `apps/web/src/app/api/cases/.../route.ts` |
| AI engine entrypoint | `services/ai-engine/main.py` |
| AI tier router (T0–T3) | `services/ai-engine/tiered_ai.py` |
| ReAct agent | `services/ai-engine/agent_react.py` |
| Pharmacy backend (Tavily + Maps) | `services/ai-engine/pharmacy.py` |
| Knowledge base | `services/ai-engine/knowledge_base/` |
| Design system | `documents/ux design/00-design-system-foundations.md` |
| Provider case spec (the canonical layout) | `documents/ux design/13-provider-case.md` |
| Card component spec | `documents/ux design/90-component-card.md` |

---

## Why the source is duplicated here

The team's working repository (`https://github.com/beingprince/McNeeseCodes_`) is the live development repo with full git history. Per the hackathon submission template (`SUBMISSION.md` Section 4), teams may copy the source into `projects/<team>/src/` so judges can review the code without leaving the organizer's monorepo. We've done that here.

The two trees are kept in sync at submission time. For day-to-day development, work happens in the working repository.

---

## Tech stack at a glance

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Material UI 6, framer-motion, lucide-react
- **BFF:** Next.js Route Handlers in `apps/web/src/app/api/`
- **AI Engine:** Python 3.11, FastAPI, Uvicorn, Google Gemini `gemini-2.5-flash-lite`, OpenAI `gpt-4o-mini`
- **Health-data standards:** HL7 FHIR R4, ICD-10-CM, Synthea synthetic patient cohort
- **Database:** Supabase (Postgres) with row-level security
- **External integrations:** Tavily (web search for pharmacy locator), Google Maps (directions deep-links)

See `../README.md` (one level up) for the full project overview, problem statement, architecture, and team table.
