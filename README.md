# FrudgeCare AI


A patient walks in, types their symptoms once, and the system produces a ready to action plan for the front desk, the nurse, and the provider at the same time. Built by team McNeeseCodes_ for the CareDevi AI Healthcare Innovation Hackathon 2026 under the AI Patient Triage track.


The full hackathon submission lives at `projects/frudgecare-ai/`. The actual application code lives in `apps/web/` and `services/ai-engine/` so that the build tooling works without symlinks.




## Team McNeeseCodes_


| Member | Role |
| ------ | ---- |
| Prince Pudasaini | Team Lead, Full Stack Engineer, AI Engineer |
| Rita Thapa Chhetri | Clinical and Nursing Workflow Advisor |
| David Okpo | Frontend Design Ideation |
| Solida Tan | RAG Dataset Curation, Idea Development, Presentation |


A more detailed breakdown of who built what is in `projects/frudgecare-ai/team-contributions.md`.




## Quick start


The project has two services that need to run together. The web app and the AI engine.


Step 1. Install web dependencies.


```bash
npm install
```


Step 2. Install Python dependencies for the AI engine.


```bash
cd services/ai-engine
python -m pip install -r requirements.txt
cd ../..
```


Step 3. Copy the environment templates.


```bash
cp apps/web/.env.example apps/web/.env.local
cp services/ai-engine/.env.example services/ai-engine/.env
```


Step 4. Open `services/ai-engine/.env` and paste a Google Gemini API key into `GEMINI_API_KEY`. This step is optional. Without a key the demo still runs end to end at the deterministic tier and the user interface shows a lower tier badge.


Step 5. Start both services.


```bash
npm run dev
```


The web app runs on `http://localhost:3000` and the AI engine runs on `http://localhost:8001`.




## What is in this repository


```
apps/
  web/                          Next.js 16 frontend with the App Router
    src/app/page.tsx            Landing page with the two button entry
    src/app/triage/             Patient triage demo on a single screen
    src/app/console/            Unified staff shell with four tabs
    src/app/api/ai/             Concierge, analyze intake, triage cascade
    src/components/common/CommandPalette.tsx
                                Global command palette opened by Cmd or Ctrl plus K

services/
  ai-engine/                    Python 3.11 with FastAPI
    main.py                     Endpoints, NLP extractors, RAG retrieval, FHIR builder
    tiered_ai.py                Tiered language model selector with safe fallback
    knowledge_base/             Synthea synthetic FHIR bundles, vital sign reference
                                ranges, ICD-10 code reference data

projects/
  frudgecare-ai/                Hackathon submission folder
    README.md                   Project overview judges read first
    responsible-ai.md           Required for all teams
    team-contributions.md       Who built what, with timestamps
    src/README.md               Index pointing back at the application code
    demo/                       Screenshots and the three minute walkthrough script

SUBMISSION.md                   Step by step for opening the pull request
LICENSE                         MIT license
```




## How the system works


A free text symptom narrative enters at `/triage`. The Next.js backend for frontend proxies the request to the Python AI engine endpoint at `/analyze-intake`. The engine runs four layers in sequence.


Layer one is regex based clinical natural language processing. It pulls vitals, demographics, time markers, medications, and ICD-10 candidates from the narrative. Word boundary matching prevents common substrings from triggering false positives.


Layer two is retrieval augmented generation. A twelve entry inline corpus of clinical heuristics is searched with deterministic keyword scoring. The top three matches come back with the keywords that fired so the operator can verify the source.


Layer three is the language model. Google Gemini 2.5 Flash Lite is asked for entity extraction, negations, risk flags, and structured JSON only. It is never asked for free form clinical advice.


Layer four is the safe deterministic fallback. When the language model is unreachable or returns nothing usable, the engine drops to a conservative default. The fallback is labelled in the response so the operator can see exactly what happened.


Every response carries a `source_tier` field so the user interface can show which layer answered. A separate orchestrator at `/ai/triage-cascade` fans the same input out to the queue, nurse, and provider AI subsystems in parallel and returns the combined JSON.


The web shell exposes all of this through two pages and one global helper. The triage page at `/triage`. The console page at `/console`. And a command palette opened by Cmd plus K on macOS or Ctrl plus K on Windows and Linux. The palette is backed by `/api/ai/concierge` and routes natural language requests across the entire platform.




## Stack


Frontend


* Next.js 16 with the App Router
* React 19
* TypeScript
* Tailwind CSS for utility classes
* Material UI 6 for the design system
* framer motion for transitions
* lucide react for icons
* Recharts for the operations dashboard


Backend for frontend


* Next.js Route Handlers acting as a thin proxy to the AI engine
* Soft fallback shapes so the user interface never breaks when the engine is offline


AI engine


* Python 3.11
* FastAPI with Uvicorn
* `google-generativeai` SDK for Gemini 2.5 Flash Lite
* asyncio for the parallel cascade orchestrator


Health data standards


* HL7 FHIR R4 with `CarePlan` and `Observation` resources
* ICD-10-CM for diagnosis candidates
* Synthea synthetic patient bundles for demo data




## Limitations


The team was honest with itself about the scope of a thirty six hour build. The following are known limitations rather than oversights.


All demo patients are synthetic. They were generated by Synthea. No real patient data has touched the system at any point during development or the demo.


The twelve entry retrieval corpus is paraphrased from public clinical heuristics and lives inline in the engine. A production system would replace it with a versioned, clinician curated knowledge base with full citation tracking.


No fine tuning was performed on the language model. The team controls prompts and post processing only. The model itself is hosted inference.


No real authentication is in place during the demo. The demo mode flag is set to true in the web environment file. The middleware bypass lives at `apps/web/src/proxy.ts`.


No formal bias evaluation has been performed. The Responsible AI document describes the gap and what would close it.


This is a hackathon prototype. It is not a medical device.




## License


MIT. See `LICENSE` at the repository root.


This software must not be used to make decisions about real patients.
