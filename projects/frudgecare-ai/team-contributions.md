# Team Contributions


This document maps every team member of McNeeseCodes_ to the actual files and decisions they own in the FrudgeCare AI codebase. It also records the rough timeline of the hackathon weekend so the contribution history is auditable.


All times are in Central Daylight Time. The hackathon began on Saturday April 25 at 8 AM CDT and the hard cutoff is on Sunday April 26 at 4 PM CDT.




## 1. Team Overview


| Name | Role | Primary Areas |
| ---- | ---- | ------------- |
| Prince Pudasaini | Team Lead, Full Stack Engineer, AI Engineer | Architecture, frontend, backend, AI engine, integration |
| Rita Thapa Chhetri | Clinical and Nursing Workflow Advisor | Clinical accuracy, vital sign thresholds, nurse workflow review |
| David Okpo | Frontend Design Ideation | User interface direction, layout decisions, demo flow |
| Solida Tan | RAG Dataset Curation, Idea Development, Presentation | Clinical guideline corpus, scenario design, slides, presenting |




## 2. Prince Pudasaini


Role. Team Lead, Full Stack Engineer, AI Engineer.


Owns the end to end build. Wrote the application code, designed the AI cascade, and assembled the submission package.


### Files owned


Frontend.


* `apps/web/src/app/page.tsx`
* `apps/web/src/app/triage/page.tsx`
* `apps/web/src/app/console/page.tsx`
* `apps/web/src/components/common/CommandPalette.tsx`
* `apps/web/src/components/common/AppShell.tsx`
* `apps/web/src/components/common/RoleSidebar.tsx`
* `apps/web/src/proxy.ts`


Backend for frontend.


* `apps/web/src/app/api/ai/analyze-intake/route.ts`
* `apps/web/src/app/api/ai/concierge/route.ts`
* `apps/web/src/app/api/ai/triage-cascade/route.ts`


AI engine.


* `services/ai-engine/main.py`
* `services/ai-engine/tiered_ai.py`
* `services/ai-engine/requirements.txt`


Configuration and submission.


* `apps/web/.env.example`
* `services/ai-engine/.env.example`
* `.gitignore`
* `LICENSE`
* `README.md`
* `SUBMISSION.md`
* `projects/frudgecare-ai/README.md`
* `projects/frudgecare-ai/responsible-ai.md`
* `projects/frudgecare-ai/team-contributions.md`
* `projects/frudgecare-ai/src/README.md`
* `projects/frudgecare-ai/demo/README.md`
* `projects/frudgecare-ai/demo/demo-script.md`


### Key decisions


* Choose a tiered AI cascade over a single model call so the system stays usable when the language model is down or out of quota.
* Keep the existing platform code on disk and add two new screens on top, instead of building a new application from scratch.
* Move from `gemini-2.5-flash` to `gemini-2.5-flash-lite` after hitting the free tier daily quota during smoke testing. The lite model has a much higher daily limit and lower latency.
* Use word boundary regex matching for ICD-10 tagging and medication extraction after the substring matcher produced false positives.
* Build a global command palette as the navigation layer instead of expanding the sidebar.




## 3. Rita Thapa Chhetri


Role. Clinical and Nursing Workflow Advisor.


Provides clinical input on what the AI is allowed to flag, what counts as a critical vital sign, and how the nurse handoff card should read so it is useful in real practice.


### Files reviewed and validated


* `services/ai-engine/knowledge_base/vitals_ranges.json` for the warning and critical thresholds on blood pressure, heart rate, oxygen saturation, temperature, and respiratory rate.
* `services/ai-engine/knowledge_base/icd10_codes.json` for the curated subset of ICD-10 codes used by the auto tagger.
* The clinical heuristics inside `services/ai-engine/main.py` under `CLINICAL_GUIDELINES`. Reviewed the qSOFA style sepsis screening, the NIHSS style stroke checks, the paediatric fever red flags, and the acute coronary syndrome triggers for clinical accuracy.
* The nurse handoff card content rendered on the triage page, including which vital flags appear and in what order.
* The four pre filled demo scenarios. Chest pain, sepsis signs, stroke signs, and paediatric fever. Reviewed for realism and appropriate red flags.


### Key decisions


* Set conservative defaults so under triage is harder than over triage.
* Confirm that temperature thresholds correctly account for both Celsius and Fahrenheit.
* Confirm that the Cmd plus K command palette never auto promotes a case from triaged to in care without a nurse click.




## 4. David Okpo


Role. Frontend Design Ideation.


Owns the visual direction of the product and the overall user flow. Decides what each screen should feel like and how an operator moves between them.


### Areas owned


* The two screen entry decision. One screen for the patient triage demo. One screen for the unified staff console. Anything else reachable through the command palette.
* The colour palette. Primary blue at `#1565C0`, semantic urgency colours for high, medium, and low.
* The card layout for the AI cascade results on the triage page. Vitals card. NLP entities card. RAG evidence card. Provider brief card.
* The command palette interaction model. Quick prompts, results card with tier badge, navigational actions.
* The demo flow. Which scenario to click first. What to point at. When to switch screens.


### Key decisions


* Hide the sidebar on the triage page and on the console page so judges focus on the working product, not on the chrome.
* Use tier badges with colour coding so operators can see at a glance which AI layer answered.
* Show the matched keywords on the RAG evidence card so the operator can verify the source.




## 5. Solida Tan


Role. RAG Dataset Curation, Idea Development, Presentation.


Owns the clinical knowledge that the retrieval layer searches against, the framing of the project pitch, and the presentation.


### Areas owned


* The twelve entry inline clinical guideline corpus inside `services/ai-engine/main.py` under `CLINICAL_GUIDELINES`. Each entry is a short paraphrase of a public clinical heuristic with associated keywords for the matcher.
* The framing of the AI Patient Triage idea and the choice of the four demo scenarios.
* The three minute demo script in `projects/frudgecare-ai/demo/demo-script.md`. Reviewed for clarity and timing.
* The presentation slides used during demo day.
* Will present the final demo to the judges.


### Key decisions


* Pick widely known clinical patterns for the corpus so judges from any clinical background recognise the references. qSOFA, NIHSS style stroke checks, paediatric fever red flags, and acute coronary syndrome.
* Keep each guideline short and cite the matched keywords so the operator can see why a guideline fired.
* Build the demo script around four pre filled scenarios so there is no typing on stage and the demo is reproducible.




## 6. Timeline


All times Central Daylight Time on Saturday April 25 unless noted.


| Time | Event | Owner |
| ---- | ----- | ----- |
| 7 15 AM | Check in opens in `#hackathon-demo-day` | All |
| 8 30 AM | Team check in posted | Prince |
| 8 45 AM | Opening session and mentor breakout | All |
| 9 30 AM | GitHub repository scaffold created | Prince |
| 9 45 AM | Hacking begins. Audit of the existing FrudgeCare platform across all twenty three pages | Prince |
| 10 15 AM | Strategy decision. Keep the platform, add a single triage page, then collapse the rest behind a console and a command palette | Prince and David |
| 10 30 AM | Visual direction agreed. Primary blue, two screen entry, tier badges everywhere | David |
| 10 45 AM | Initial scenario list drafted. Chest pain, sepsis, stroke, paediatric fever | Solida |
| 11 00 AM | Build of the patient triage page begins | Prince |
| 11 30 AM | First wire of `/api/ai/analyze-intake` proxying the FastAPI engine | Prince |
| 12 00 PM | Engine extension. Clinical NLP extractors for vitals, demographics, temporal markers, medications, ICD-10 | Prince |
| 12 15 PM | Vital sign thresholds reviewed and corrected | Rita |
| 12 30 PM | Inline clinical guideline corpus assembled, twelve entries, with matched keyword lists | Solida and Prince |
| 12 45 PM | RAG retrieval logic implemented with deterministic keyword scoring | Prince |
| 1 00 PM | Gemini system prompt updated to ask for entities, negations, risk flags, and structured JSON only | Prince |
| 1 15 PM | First successful end to end run. Severity coercion bug fixed. Pydantic model made permissive | Prince |
| 1 30 PM | Move from `gemini-2.5-flash` to `gemini-2.5-flash-lite` after the free tier daily quota for the standard model was exhausted | Prince |
| 1 45 PM | Triage page card layout finalised. Vitals card, NLP entities card, RAG evidence card, provider brief card | David and Prince |
| 2 00 PM | Aggressive consolidation strategy locked in. Remove the auth gates, build a unified console, build the command palette | Prince and David |
| 2 15 PM | Build of the unified `/console` page with four tabs | Prince |
| 2 30 PM | Build of the global command palette and the `/api/ai/concierge` endpoint | Prince |
| 2 45 PM | Landing page replaced with the two button entry. Demo mode confirmed across all routes | Prince |
| 2 55 PM | Final smoke test across the triage, console, and command palette paths | Prince |
| 3 00 PM | Submission package authored. Project README, responsible AI document, demo script | Prince |
| 3 15 PM | Team contributions document and rewrite for tone | Prince |
| 4 00 PM | Milestone commit window opens. First push to GitHub planned | All |
| 4 30 PM onward | Demo screenshots and presentation slide work begins | David and Solida |


On Sunday April 26 the team will run a final smoke test, polish the demo script, record the demo video if possible, and submit the pull request before the 4 PM CDT hard cutoff.




## 7. Notes for Mentors and Judges


Mentor feedback contributes twenty percent of the final score. Five percent comes from teamwork, which requires a multi person contribution record. This document is the team contribution record.


Each member listed above has a clearly scoped responsibility and a verifiable footprint in the repository. The commit history will continue to reflect this division as the team adds screenshots and the recorded demo video before submission.
