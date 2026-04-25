# FrudgeCare AI


Track. AI Patient Triage.


Event. CareDevi AI Healthcare Innovation Hackathon 2026.


Team. McNeeseCodes_.


A patient walks in, types their symptoms once, and the system produces a ready to action plan for the front desk, the nurse, and the provider at the same time. Two screens. No login. Built across the hackathon weekend.




## 1. Team Members


| Name | Role | GitHub |
| ---- | ---- | ------ |
| Prince Pudasaini | Team Lead, Full Stack Engineer, AI Engineer | @beingprince |
| Rita Thapa Chhetri | Clinical and Nursing Workflow Advisor | handle pending |
| David Okpo | Frontend Design Ideation | handle pending |
| Solida Tan | RAG Dataset Curation, Idea Development, Presentation | handle pending |


The GitHub handles for the three contributors marked pending will be added to the table once each member confirms their account. A complete breakdown of who built what, with timestamps for each contribution, is in `team-contributions.md`.




## 2. Problem Statement


A walk in patient with chest pain, a fever, or stroke symptoms gets asked the same questions three times. Once at the front desk. Once by the nurse. Once by the provider. Each role rebuilds the story in its own tool. Vital signs, negations such as "no shortness of breath", and timing details get lost between handoffs.


Existing AI in healthcare is bolted onto a single screen at a time. Nothing reads the patient narrative once and feeds every downstream role. That gap is what slows down triage and hides safety signals. It is also where AI can help most without replacing clinical judgement.




## 3. Solution


FrudgeCare AI takes a free text symptom narrative on one screen and runs four AI layers against it in sequence.


Layer one. Natural language processing. Regex based extractors pull vitals, demographics, time markers, medications, and ICD-10 candidates with word boundary matching. The word boundary check is what stops common substrings from producing false positives.


Layer two. Retrieval augmented generation. The engine searches an inline corpus of twelve paraphrased clinical heuristics, including qSOFA style sepsis screening, NIHSS style stroke checks, paediatric fever red flags, and acute coronary syndrome triggers. The top three matches come back with the keywords that fired so the operator can verify the source.


Layer three. Language model reasoning. Google Gemini 2.5 Flash Lite is asked through a tiered selector. The prompt asks for entities, negations, risk flags, and structured JSON. It never asks for free form clinical advice. Every response carries a `source_tier` and a confidence score.


Layer four. Safe fallback. If the language model is unreachable or returns nothing usable, the engine drops to a conservative deterministic default and labels the response so the operator can see what happened.


The same engine output is then fanned out by an orchestrator at `/ai/triage-cascade` into three role views. A front desk priority block, a nurse handoff card with vital flags, and a provider brief with a disposition recommendation. All three render side by side on the same triage page.


The same engine and the same outputs power a unified `/console` screen that has tabs for the four staff panels. Front Desk Queue. Nurse Triage. Provider Daily List. Operations Dashboard. Operators reach any panel without signing in. A global command palette opened by Cmd plus K or Ctrl plus K accepts natural language requests such as "open the queue", "show provider daily", or "patient Maria Lopez". Deterministic keyword routing fires first. The language model is the fallback for clinical questions.


Two pages and one keyboard shortcut replace what used to be twenty three separate routes.


### What the system does not do


The system does not auto route, auto medicate, auto discharge, or auto escalate. Every state transition still requires a human click. The state machine in the engine enforces this.


The system does not present scores without provenance. Every AI touched field shows which tier produced it and a one line explanation.


The system is not a medical device. See `responsible-ai.md` for the full set of guardrails and known limitations.




## 4. Tech Stack


Frontend.


* Next.js 16 with the App Router
* React 19
* TypeScript
* Tailwind CSS
* Material UI 6
* framer motion
* lucide react
* Recharts


Backend for frontend.


* Next.js Route Handlers as a thin proxy to the AI engine
* Soft fallback shapes so the user interface never breaks when the engine is offline


AI engine.


* Python 3.11
* FastAPI with Uvicorn
* `google-generativeai` SDK for Gemini 2.5 Flash Lite
* Regex based clinical NLP for vitals, demographics, temporal markers, medications, and ICD-10
* Inline RAG corpus with deterministic keyword scoring
* asyncio for the parallel triage cascade


Health data standards.


* HL7 FHIR R4. The engine emits a `CarePlan` resource with embedded `Observation` resources for vitals.
* ICD-10-CM codes for problem list candidates, sourced from `services/ai-engine/knowledge_base/icd10_codes.json`.
* Synthea generated synthetic FHIR patients for demo data.


Tooling.


* npm workspaces for `apps/web` and `services/ai-engine`
* `concurrently` to run web and AI engine together with `npm run dev`




## 5. Setup Instructions


Requirements.


* Node.js 20 or newer
* Python 3.11 or newer
* A Google AI Studio API key for Gemini, optional. The demo runs without it but stays at the deterministic tier.


Step 1. Install web dependencies.


```bash
npm install
```


Step 2. Install AI engine dependencies.


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


Step 4. Open `services/ai-engine/.env` and paste a Google Gemini API key into `GEMINI_API_KEY`. This step is optional. If skipped, the demo still runs end to end at the deterministic tier and the user interface shows a lower tier badge.


Step 5. Start both services.


```bash
npm run dev
```


The web app runs on `http://localhost:3000` and the AI engine runs on `http://localhost:8001`.


### What you should see


The landing page has two buttons. Patient Triage Demo and Staff Console.


Pressing Cmd plus K on macOS or Ctrl plus K on Windows and Linux opens the AI command palette anywhere in the application.


The Patient Triage Demo has four pre filled scenarios. Chest Pain. Stroke Signs. Sepsis Signs. Paediatric Fever. Pick one, submit, and the four AI layers fire in sequence with their tier badges visible.


The Staff Console has four tabs. Front Desk Queue. Nurse Triage. Provider Daily List. Operations Dashboard. All four pull from the same AI engine.




## 6. Demo


Live walkthrough. See `demo/demo-script.md` for the three minute script the team uses during judging.


Screenshots. The eight screenshots referenced in the script live in the `demo/` folder.


Recorded demo video. To be added before submission.


Live deployment. The system runs locally. See Setup Instructions above.




## 7. Source Code


The full source lives at the root of the repository. This `projects/McNeeseCodes_/` folder is the hackathon submission entry. The actual code lives where the build tooling expects it.


* `apps/web/` for the Next.js frontend
* `services/ai-engine/` for the Python FastAPI AI engine


The submission `src/` folder contains a one page index pointing at the real folders. See `src/README.md`.




## 8. Limitations


The team was honest with itself about the scope of a thirty six hour build. The following are known limitations rather than oversights.


All demo patients are synthetic. They were generated by Synthea. No real patient data has touched the system at any point.


The twelve entry retrieval corpus is paraphrased from public clinical heuristics and lives inline in `services/ai-engine/main.py`. A production system would replace it with a versioned, clinician curated knowledge base with full citation tracking.


No fine tuning was performed on the language model. The team controls prompts and post processing only.


No real authentication is in place during the demo. The demo mode flag is set to true. The middleware bypass lives at `apps/web/src/proxy.ts`.


In memory state is used for cases. Mock data lives in `apps/web/src/lib/mock-service.ts`. Supabase wiring exists but is optional and not required for the demo.


English only. The NLP extractors and the language model prompts are not translated.


No bias evaluation has been performed. See `responsible-ai.md` for the gap and what would close it.




## 9. Repository Structure


```
frudgeCareAI/

  apps/
    web/                         Next.js 16 frontend
      src/app/
        page.tsx                 Landing page with the two button entry
        triage/                  Patient triage demo on a single screen
        console/                 Unified staff shell with four tabs
        api/ai/                  Concierge, analyze intake, triage cascade
      src/components/common/CommandPalette.tsx
                                 Global Cmd plus K palette

  services/
    ai-engine/                   Python FastAPI AI engine
      main.py                    Endpoints, NLP, RAG, FHIR builder
      tiered_ai.py               Language model cascade with safe fallback
      knowledge_base/            Synthea FHIR, vital ranges, ICD-10 reference

  projects/
    McNeeseCodes_/               Hackathon submission folder
      README.md                  This file
      responsible-ai.md          Required for all teams
      team-contributions.md      Who built what, with timestamps
      src/                       Index pointing at the real code
      demo/                      Screenshots and demo script

  README.md                      Repository level overview
  SUBMISSION.md                  Step by step for opening the pull request
  LICENSE                        MIT
```




## 10. Credits and Acknowledgements


* Synthea at `https://synthea.mitre.org` for synthetic FHIR patient data
* HL7 FHIR R4 at `https://hl7.org/fhir/R4/` for the care plan and observation schemas
* Google Gemini 2.5 Flash Lite for the language model used in entity extraction and reasoning
* CareDevi and Gazuntite for organising the hackathon and providing the participant resources


Code authored during the CareDevi AI Healthcare Innovation Hackathon 2026 on April 25 to 26 CDT. License terms are in the `LICENSE` file at the repository root.
