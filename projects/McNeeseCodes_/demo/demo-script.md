# Three Minute Demo Script


The hackathon demo slot is three minutes plus two minutes of question and answer. This script gets the whole product across in three minutes flat with one minute of buffer for questions.




## 1. Setup before judging


Run these commands once before the judging slot.


```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp services/ai-engine/.env.example services/ai-engine/.env
```


Open `services/ai-engine/.env` and paste a Google Gemini API key into `GEMINI_API_KEY`. This step is optional but recommended.


```bash
npm run dev
```


Open `http://localhost:3000` in a browser at 1280 by 800 minimum. Confirm the green pill on the landing page that says Demo, no login. Confirm the Cmd plus K hint in the top right.




## 2. The three minute walkthrough


### 2.1 Landing page, ten seconds


Open the root URL.


Say. Two screens. No login. Anything else you want to reach is one keyboard shortcut away. That is the bet we are making.


Show the two buttons. Hover over the AI stack chip row. Name the four layers out loud. NLP. RAG. LLM. Deterministic fallback.


### 2.2 Patient triage hero, ninety seconds


Click Patient Triage Demo.


Say. One screen. The patient narrative goes in on the left, the entire AI cascade comes out on the right.


Step one. Click the Sepsis Signs scenario card. The text area fills automatically.


Step two. Click Run AI triage.


Step three. While the request runs, point at the four AI layer pills sitting above the loading state. They are visible before the response arrives so judges know what is about to happen.


Step four. When the result lands, walk left to right.


* Confidence and Tier pills at the top. Say. Tier 2 means Gemini answered. Tier 0 would have been deterministic.
* Vitals card. Point at the qSOFA flag.
* NLP entities card. Symptoms, negations, risk flags.
* RAG evidence card. Point at the matched keyword chips. Say. These are not just identifiers. They are the exact tokens that fired against the guideline corpus.
* FHIR CarePlan JSON at the bottom. Say. FHIR R4. Drops into any electronic health record that speaks FHIR.


Step five. Click Run downstream cascade. Three role tinted cards fan out.


* Queue rank for the front desk priority.
* Nurse handoff with vital flags and an escalation hint.
* Provider brief with a disposition recommendation.


Say. Same engine. Three audiences. One symptom, one cascade.


### 2.3 Console and command palette, sixty seconds


Press Cmd plus K. Type `operations dashboard`. Hit Enter.


Say. Cmd plus K is the AI concierge. Deterministic keyword routing fires sub millisecond. Clinical questions fall through to the language model.


The Console opens on the Operations tab. Show the live KPI strip, the funnel, and the AI tier mix.


Click the Nurse tab. Show the embedded nurse triage list. Note what is not on the screen. No sidebar. No role switcher. No sign in prompt.


Press Cmd plus K again. Type `patient Maria Lopez`. Hit Enter.


Say. Patient lookup routes back to the front desk queue with the search term pre filled. The AI is the navigation layer for the whole platform.


### 2.4 Why this won the AI track, twenty seconds


Say. Single screen triage proves the AI works end to end. The console proves the platform exists behind it. Cmd plus K proves the AI is also how you navigate. Tier badges everywhere prove we know what we don't know. That is the responsible AI story in `responsible-ai.md`.


Stop. Take questions.




## 3. Recovery script if something fails on stage


| Symptom | What to say and do |
| ------- | ------------------ |
| The triage page shows an AI engine unreachable banner | Say. This is the Tier 3 fallback. The platform never breaks. Point at the amber tier badge. |
| The command palette does not open with the keyboard shortcut | Click the Ask AI Cmd plus K button in the top right of the console header. The palette also opens from there. |
| A console tab is blank for two seconds | Each tab is lazy loaded. The first click is slow on a cold start. Every subsequent click is instant. Wait it out. |
| Gemini returns a 429 quota exhausted error | Already mitigated by using Flash Lite. If it still fires, the demo continues at Tier 1 with the badge clearly shown. |




## 4. Screenshots manifest


Place the following PNG files in this folder before submitting. Filenames are referenced from the project README.


| Filename | What to capture |
| -------- | --------------- |
| `01-landing.png` | Landing page with both call to action cards visible |
| `02-triage-input.png` | Triage page with the Sepsis scenario filled into the text area |
| `03-triage-result.png` | Triage page after submit, showing NLP, RAG, and FHIR result blocks |
| `04-cascade.png` | Triage cascade fan out, the three role tinted cards |
| `05-cmdk-empty.png` | Command palette empty state with the four quick prompts visible |
| `06-cmdk-result.png` | Command palette after a query, showing the result card and tier badge |
| `07-console-front-desk.png` | Console on the Front Desk tab |
| `08-console-operations.png` | Console on the Operations tab with the KPI strip and funnel |
