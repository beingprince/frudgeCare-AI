# FC-PLAN-0001 — FrudgeCare AI Finishing Plan

| Field           | Value                                                  |
| --------------- | ------------------------------------------------------ |
| Plan ID         | FC-PLAN-0001                                           |
| Plan version    | 1.0                                                    |
| Authored        | 2026-04-25                                             |
| Author          | Engineering pair (Prince + agent)                      |
| Audience        | Build team, hackathon judges, post-hack handoff        |
| Companion docs  | `documents/audit/frudgecare-program-audit.txt` (FC-AUDIT-0001) |
| Hackathon event | CareDevi AI Healthcare Innovation Hackathon 2026       |
| Submission PR   | https://github.com/caredevi-innovation-lab/hackathon-2026-projects/pull/19 |

---

## 0. How to read this document

This is a working build plan, not a spec. It exists because we are entering the
final stretch of the hackathon and the user (team lead) has asked for six new
capabilities at once. Doing them all is not realistic before the deadline, and
some of them have hidden dependencies (API keys, OAuth, scraping risk) that
need to be resolved before any code is worth writing.

The plan is organised the same way the audit doc is organised: every section
has a HUMAN paragraph first, then a TECHNICAL block. Engineers can scan the
technical blocks; product/judges can read the human ones. Every feature ends
with a P0 / P1 / P2 priority tag.

If a section is tagged BLOCKED it cannot start until the user answers a
specific question, which is collected in section 9 ("Open questions for the
user — please answer before we build").

---

## 1. Current state of the system (as of 2026-04-25 19:45 CDT)

### A. Human language

The product code repo (`beingprince/frudgeCare-AI`) is up to date with the
agentic triage feature added earlier today. The hackathon submission PR #19
is also up to date — its `submit/McNeeseCodes_` branch was just refreshed
with a docs commit that describes the agent. So **on the GitHub side, nothing
is missing right now**.

On the runtime side, three things are noteworthy:

1. **Gemini is silently degraded.** A live smoke test of `/analyze-intake`
   returns `source_tier: 2`. That means the system is falling all the way
   through to the deterministic templated path. The `GEMINI_API_KEY` is
   present in `services/ai-engine/.env`. The most likely cause is that
   today's free-tier quota has been exhausted (we hit `429 RESOURCE_EXHAUSTED`
   repeatedly during agent debugging). The engine catches the exception and
   silently falls to Tier 2 — which is correct behaviour, but the demo
   currently looks like "the AI doesn't work".
2. **Three zombie dev servers are still bound to ports 3000, 8001, 8002.**
   This will trip up the next `npm run dev`. Needs a clean restart.
3. **The `/triage` page does not state who it is for.** The user flagged this
   directly. The page is functionally a public no-auth kiosk for the patient,
   but nothing on the screen says so. Same for `/agent` (judges-only).

### B. Technical

| Symptom                              | Evidence                                               | Root cause                                                                                          | Fix lane                                            |
| ------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `/analyze-intake` returns Tier 2     | `source_tier=2`, `model=null`, no `reasoning` from LLM | Free-tier Gemini daily quota exhausted (`429`) during agent dev today                               | Wait 24h OR add a second key OR pay $0.50 for paid tier |
| Three ports occupied                  | `Get-NetTCPConnection` shows 3000/8001/8002 listening  | Old `concurrently`-spawned next + uvicorn processes survived previous Ctrl-C                        | Kill PIDs 24636 / 28040 / 1784, then `npm run dev`  |
| `/triage` audience unclear            | Page header reads "Patient Triage Demo", no role chip  | Spec is right (audit §7.1) but UI never shipped the explicit "for the patient kiosk" call-out       | One-line header pill: `For: Patient kiosk`          |
| Agentic feature mislabelled (mental) | User said "agentic ai from alibaba cloud"              | Alibaba DashScope was attempted but blocked by workspace binding. Agent now runs on Gemini 2.5 Flash-Lite | Honesty in UI: `Powered by Google Gemini` chip      |

Endpoints currently shipped on the FastAPI engine:

```
POST /analyze-intake              POST /orchestrator/handoff-to-provider
POST /ai/triage-cascade           POST /orchestrator/submit-provider-action
POST /ai/agentic-triage           POST /ai/rank-queue
POST /ai/nurse-assist             POST /ai/provider-copilot
POST /ai/build-patient-profile    GET  /health
```

Files that already exist and we should reuse, not duplicate:

- `services/ai-engine/retrieval.py`     local KB lookups (vitals, drugs, ICD-10)
- `services/ai-engine/tiered_ai.py`     four-tier cascade with red-flag override
- `services/ai-engine/agent_tools.py`   six tools the agent can call
- `services/ai-engine/agent_react.py`   scripted agent + LLM synthesis
- `services/ai-engine/knowledge_base/`  JSON KBs (patterns, drugs, vitals, ICD)

---

## 2. What the user asked for (parsed verbatim)

The user's last message (paraphrased into discrete asks):

1. **F-01 Synthea-driven intake** — "I have 10 zip files dataset downloaded
   from synthea.mitre.org. The program should be able to give the form that we
   used at the time of development but don't create any account."
   → Pre-fill the patient intake form from a real Synthea FHIR patient,
     selectable from a dropdown, no login.
2. **F-02 Community similarity panel** — "from r/medicine and r/symptoms make
   a place to show the similarity for those."
   → A new section on the triage result that says "patients describing
     similar symptoms on community forums report …" with 2-3 cards.
3. **F-03 Buy-the-medicine flow** — "if he wants to buy the medicine he can
   just put it somehow we need that feature. It asks for the zip code and
   find some of the shops and then have to scan their pricing and details
   and show."
   → User enters drug name + ZIP, system returns nearby pharmacies with
     pricing, source URL, and distance.
4. **F-04 Audience clarity on /triage** — "at the triage page this should be
   completely defined as this is for whom."
   → Visual chip: For: Patient kiosk / For: Provider preview / etc.
5. **F-05 Agentic AI honesty** — "there is already agentic ai from alibaba
   cloud."
   → Decide: relabel agent screen as Gemini-powered (correct) OR keep
     Alibaba branding (dishonest, scoring risk). Recommendation: Gemini.
6. **F-06 End-to-end wiring** — "we have to wire the system really from
   front to back flow so that we can update other information accordingly."
   → Make sure each new feature flows: UI → BFF → engine → KB → audit log →
     UI refresh. No half-wired panels.

---

## 3. Hackathon timeline reality-check

### A. Human language

Today is **Saturday, April 25, 2026, 19:45 CDT**. The CareDevi hackathon
weekend ends in roughly 24-30 hours. We can build and demo, we cannot
re-architect. Realistic scope inside a 24h window with one engineer + one AI
pair is about **2 P0 features end-to-end + 1 P1 wired enough to demo + all
P2s deferred**.

### B. Technical

Hard time budget assuming a single ~12h working block tomorrow (the rest is
sleep + buffer):

| Feature | Build hours (E2E) | Risk    | Hackathon priority |
| ------- | ----------------- | ------- | ------------------ |
| F-04 Audience chip on /triage      | 0.5 | low     | **P0** |
| F-05 Honest model labelling        | 0.5 | low     | **P0** |
| Restart Gemini on a fresh quota    | 0.1 | low     | **P0** |
| F-01 Synthea intake pre-fill       | 3.0 | medium  | **P0** |
| F-06 End-to-end wiring audit + fix | 2.0 | medium  | **P0** |
| F-03 Pharmacy price (mock)         | 3.0 | medium  | **P1** |
| F-02 Reddit similarity (cached)    | 2.5 | medium  | **P1** |
| F-03 Pharmacy price (real web)     | 6.0 | **high**, ToS-fragile | **P2 / cut** |
| F-02 Reddit similarity (live API)  | 4.0 | **high**, OAuth + rate | **P2 / cut** |

P0 = ship to demo. P1 = ship if time. P2 = explicitly cut and put in the
"Future Work" section of the README so judges know the team thought about
it.

---

## 4. Architecture deltas required

### A. Human language

Three new things have to live somewhere in the codebase:

1. **A way to read Synthea bundles.** The 35 MB FHIR R4 zip lives in your
   Downloads folder today. We will copy a small curated subset (10 patients)
   into the repo so the demo runs offline and judges can clone-and-go. The AI
   engine gets a new `synthea/` module that knows how to load those bundles
   into a flat patient summary the intake form can pre-fill.
2. **A community-evidence service.** This is a new endpoint that returns
   "what people on Reddit say about symptoms like X". Whether the data is
   live or cached is a product decision (see §9, Q2). Either way the engine
   exposes a single consistent shape so the UI doesn't care.
3. **A pharmacy-pricing service.** New endpoint that takes drug + ZIP and
   returns a ranked list of nearby pharmacies with prices. Whether the data
   is mock, scraped, or from a real API is a product decision (see §9, Q3).

### B. Technical

```
services/ai-engine/
  synthea/
    __init__.py
    loader.py             # zip + json -> Patient summary dataclass
    sample_patients/      # 10 curated FHIR bundles (committed to repo)

  community/
    __init__.py
    reddit_corpus.py      # cached posts, keyword index, similarity scoring
    sample_posts.json     # curated seed corpus, ~50 entries from r/medicine
                          # and r/AskDocs (NOT r/symptoms — does not exist)

  pharmacy/
    __init__.py
    finder.py             # zip -> [pharmacy{name, addr, distance, prices}]
    sample_inventory.json # curated drug pricing seed (CVS/Walgreens/Walmart)

  main.py                 # +3 endpoints:
                          #   GET  /demo/synthea-patients
                          #   POST /community/similar-experiences
                          #   POST /pharmacy/find

apps/web/src/app/
  triage/page.tsx         # + audience chip, + community panel,
                          #   + medicine purchase mini-modal
  triage/lib/
    syntheaPicker.tsx     # new component: dropdown of demo patients
    communityPanel.tsx    # new component: 3 community cards
    medicineFinder.tsx    # new component: drug + ZIP -> pharmacy list

apps/web/src/app/api/
  community/route.ts      # BFF -> /community/similar-experiences
  pharmacy/route.ts       # BFF -> /pharmacy/find
  demo/synthea/route.ts   # BFF -> /demo/synthea-patients

documents/plans/
  FC-PLAN-0001-finishing-plan.md   (this file)
```

No database schema changes. No new auth surface. No new external services
beyond the optional Reddit / web-search APIs (gated by §9).

---

## 5. Feature-by-feature build sheet

### F-01 — Synthea-driven intake pre-fill (P0)

**Human:** A "Demo with a real patient" dropdown appears at the top of the
intake form. Picking "Mr. Mayer (67M, hypertension)" instantly fills the
narrative, age, sex, medications, and active conditions from the actual
Synthea FHIR Bundle. No account, no login. The user can still edit before
submitting.

**Technical:**

- Loader extracts from each `Bundle.entry`:
  - `Patient.name`, `birthDate`, `gender`, `address.postalCode`
  - `Condition` resources where `clinicalStatus = active`
  - `MedicationRequest` resources where `status = active`
  - `AllergyIntolerance` resources
  - Most recent `Observation.vital-signs` set
- Curate 10 patients to commit (size, demographic spread, condition variety):
  - 2 geriatric cardiac, 2 adult chronic, 2 adult acute, 2 paediatric,
    2 mental-health (Synthea provides depression / anxiety records).
- Endpoint shape:
  ```
  GET /demo/synthea-patients
  → { patients: [{ id, label, age, sex, narrative_seed,
                   medications, allergies, conditions, vitals }] }
  ```
- UI: top of `/triage`, MUI Select with patient labels. Selecting fires a
  state update that pre-fills the textarea, age, sex, medications.
- Acceptance: pick any of the 10, hit Run, watch the cascade fire on data
  that came from a real (synthetic) FHIR bundle.

### F-02 — Community similarity panel (P1, cached path)

**Human:** Below the AI verdict, a "How others have described this" section
shows 2-3 cards quoting community posts whose symptoms vector is close to
the patient's narrative. Each card has source link, post date, and a
disclaimer chip. We are NOT giving advice, only showing community context.

**Technical:**

- r/symptoms does not exist on Reddit. Real candidates: r/AskDocs,
  r/medicine, r/HealthAnxiety. Pick **r/AskDocs** (most clinically grounded).
- Cached path: hand-curate ~50 posts (title + first paragraph + URL + date)
  into `community/sample_posts.json`. Index by tokenised stem set.
- Similarity: cosine over a tiny TF-IDF vectoriser fit on the 50 posts.
  No embeddings needed at this scale; keeps the demo CPU-only.
- Endpoint:
  ```
  POST /community/similar-experiences
  body: { narrative: str, top_k: int = 3 }
  → { matches: [{ source: "r/AskDocs", title, excerpt, url,
                  posted_on, similarity_score }],
      disclaimer: "These are user-reported community posts. Not medical advice." }
  ```
- Live path (BLOCKED on §9 Q2): swap cached corpus for live fetch via
  Reddit's public JSON endpoint (no OAuth needed for read-only) with a
  small in-memory cache and User-Agent header.
- Acceptance: narrative containing "chest pain radiating" surfaces 3 posts
  about cardiac chest discomfort, each with a working source URL.

### F-03 — Buy-medicine pharmacy finder (P1, mock path)

**Human:** On the verdict card, any prescribed drug becomes a small "Find
nearby" button. Clicking it opens a modal asking for ZIP code, then returns
3-5 nearby pharmacies with the listed price for that drug, distance, and a
"Get directions" link.

**Technical:**

- Mock path: curate `pharmacy/sample_inventory.json` containing 10 common
  drugs across 3 chains (CVS, Walgreens, Walmart) for 5 ZIPs (one per
  region). About 150 rows. Realistic prices pulled from publicly visible
  GoodRx ranges (cited as examples in the JSON file).
- Endpoint:
  ```
  POST /pharmacy/find
  body: { drug_name: str, zip_code: str, radius_miles: float = 10 }
  → { pharmacies: [{ name, address, distance_miles, price_usd,
                     in_stock, source_url }],
      drug_name_normalised, zip_code, generated_at }
  ```
- Live path (BLOCKED on §9 Q3): replace mock with a real web-search
  pipeline. Two viable sub-paths:
   - **(a)** Tavily / SerpAPI / Brave search for `"<drug> price near <zip>"`
     with HTML snippet parse. Needs a key.
   - **(b)** GoodRx public API (requires partnership) — not realistic for
     a hackathon.
- ZIP → coordinates: ship a tiny static `zip_centroids.json` (5 ZIPs is
  enough for the demo). For real launch, hit USPS / Geonames.
- Acceptance: type "metformin" and ZIP "70601" (Lake Charles), get back
  3 pharmacies with prices and addresses.

### F-04 — /triage audience chip (P0)

**Human:** The triage page header gets one extra pill that says exactly who
this screen is for. Same on the agent screen and the staff console screens.

**Technical:**

- Add a `<RoleChip>` component used in the page header of:
  - `/triage`        — `For: Patient kiosk`        (blue)
  - `/agent`         — `For: Judges & engineers`   (purple)
  - `/console`       — `For: Staff (front desk, nurse, provider, ops)` (green)
- One file, no API impact.
- Acceptance: every screen says who it is for above the fold.

### F-05 — Agentic AI honesty pass (P0)

**Human:** The agent screen currently says "Tool-calling agent" without a
model name. The user thinks of it as "Alibaba" because we tried Qwen first.
We will label it correctly: "Powered by Google Gemini 2.5 Flash-Lite, with
deterministic fallback when the LLM is unavailable." That is what the code
actually does, and judges will check.

**Technical:**

- One header chip on `/agent`: `Model: Gemini 2.5 Flash-Lite`.
- One footnote in `/agent` page: "If Gemini is rate-limited or offline, the
  agent commits the verdict from deterministic tool output and the
  `synthesis_mode` field flips to `deterministic`."
- One sentence added to README §3 paragraph on the agent.
- Acceptance: a judge reading the screen knows what model is running and
  what happens when it isn't.

### F-06 — End-to-end wiring audit (P0)

**Human:** Each new endpoint must be reachable from the UI without manual
curl, and each UI element must show a useful state (loading / data / error /
offline). No half-wired panels.

**Technical:** A wiring checklist that I will run after each feature lands.

| Layer                | Test                                                             |
| -------------------- | ---------------------------------------------------------------- |
| FastAPI endpoint     | Hits with sample payload, returns 200 + expected shape           |
| BFF route            | Hits with same payload via `fetch`, returns 200 + same shape     |
| Component            | Renders for: loading, success, empty, error                       |
| Audience chip        | Present and correct                                              |
| Tier badge / source  | Visible (Tier 1/2/3 for cascade; Mode for agent; Mock for new)   |
| Demo offline path    | Disconnect engine — UI still degrades gracefully                 |

---

## 6. Build order (24h plan)

### A. Human language

We work top-down: kill the zombie processes, ship the cheap wins (audience
chip + honesty pass), then attack Synthea, then community + pharmacy if
time permits, then re-wire and demo.

### B. Technical

```
Hour  Block                                                        Owner
────  ──────────────────────────────────────────────────────────── ──────────
0.0   Stop zombie servers, clean restart on 3000/8001              agent (now)
0.1   F-04 audience chip across 3 routes                            agent
0.6   F-05 agent model label + README sentence                      agent
1.0   F-01 Synthea loader + 10 curated bundles + endpoint           agent
3.5   F-01 UI: dropdown + pre-fill                                  agent
4.5   F-06 wiring pass on Synthea path                              agent
5.0   F-02 community cached corpus + endpoint                       agent
7.0   F-02 UI panel + wiring pass                                   agent
8.0   F-03 mock pharmacy + endpoint                                 agent
10.0  F-03 modal UI + wiring pass                                   agent
11.0  Smoke test full demo flow on each of 4 personas               pair
12.0  Buffer / docs / screenshot capture                            user
```

If we lose Hours 5-10 we still ship: zombie kill + audience chip + honesty
pass + Synthea intake. That alone is enough to rebut "the AI doesn't work"
because Synthea pre-fill is a visible new feature the audit doc doesn't yet
list.

---

## 7. Risk register

| ID   | Risk                                                                   | Likelihood | Impact | Mitigation                                                                                          |
| ---- | ---------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| R-01 | Gemini quota stays exhausted into demo day                              | medium     | high   | Add a second key on a different Google account; OR enable paid tier (~$0.50). Demo can run on Tier 2 cleanly already. |
| R-02 | Reddit live fetch ToS / rate limit                                      | high       | medium | Ship cached corpus path only, label as "curated community sample".                                  |
| R-03 | Real pharmacy scraping fragile / legal                                  | high       | medium | Ship mock path only, label as "demo pricing snapshot".                                              |
| R-04 | Synthea bundle parse explodes on a malformed entry                      | low        | medium | Wrap loader in try/except per entry; ship the 10 hand-validated bundles only.                       |
| R-05 | Time blow-up on UI polish for community + pharmacy                      | medium     | medium | Each panel has a static "demo data" badge so we can ship un-styled if needed.                       |
| R-06 | Demo machine port conflicts on judging day                              | medium     | high   | Ship a `scripts/clean-restart.ps1` that kills 3000/8001/8002 before `npm run dev`.                   |

---

## 8. Out of scope (explicitly cut)

These were considered and intentionally excluded. Listed here so judges
reading the repo see the team made deliberate decisions, not omissions.

- Real-time GPS for pharmacy locator (using ZIP centroids only).
- Reddit OAuth integration (cached corpus only).
- Insurance / copay calculation for medicine prices.
- Pharmacy availability checking via real inventory APIs.
- Multi-language support for community posts.
- Embedding-based similarity for community matching (TF-IDF is enough).
- HIPAA-grade audit logging for the new community/pharmacy endpoints
  (they are read-only and contain no PHI).

---

## 9. Open questions for the user — please answer before we build

> **The agent will not start coding F-01..F-03 until these are answered.**
> The cheap wins (F-04 audience chip, F-05 honesty pass, zombie restart)
> can start immediately and do not need answers.

**Q1 — Web search / pricing API key.** Do you have an API key for any of
the following? Pick one or "none". Each option costs different effort.

  a. Tavily Search       (free tier 1000 req/mo, easiest)
  b. Brave Search API    (free tier 2000 req/mo)
  c. SerpAPI             (free tier 100 req/mo)
  d. Google CSE          (free 100/day, needs CSE setup)
  e. None — ship mock pharmacy data only

**Q2 — Reddit / community source.** Pick one:

  a. Cached curated corpus (50 posts, hand-picked, no API) — fastest, safest
  b. Live read-only Reddit JSON (no OAuth, fragile to rate-limit)
  c. Skip community panel, focus the time on F-01 + F-03

**Q3 — Agent model honesty.** Pick one:

  a. Label the agent honestly: "Powered by Google Gemini 2.5 Flash-Lite"
     with the deterministic-fallback footnote. (Recommended.)
  b. Keep the Alibaba branding even though Gemini is what runs. (Risky.)
  c. Add Alibaba Qwen as a real second-opinion call IF you can resolve the
     workspace binding before midnight tonight.

**Q4 — Synthea patient curation.** Pick one:

  a. Agent picks 10 patients across the demographic spread (default).
  b. User wants to hand-pick — please name them or pick from a shortlist.

**Q5 — Hackathon deadline.** What is the actual cutoff for the PR being
merge-blocked? (Best guess from the org repo: Sunday 2026-04-26 23:59 CDT.
Confirm or correct.)

---

## 10. Definition of done (for this plan as a whole)

We can call FrudgeCare AI "submission-ready" when **all** of the following
are true:

1. The five P0 items in §3 are merged on `main` and on the PR #19 branch.
2. `npm run dev` brings up both servers cleanly with no port conflict.
3. `/triage` shows the audience chip and a working Synthea pre-fill.
4. `/agent` shows the honest model label.
5. The README in `projects/McNeeseCodes_/` reflects the new features.
6. The 8 demo screenshots are captured (David's task per the demo script).
7. The 3-minute demo video is recorded.
8. PR #19 title is renamed to `[Submission] McNeeseCodes_ - FrudgeCare AI`.

P1 items (community, pharmacy real data) are bonus. P2 items are documented
as "Future work" in the README.

---

## 11. Decisions locked in (answers to §9)

Recorded 2026-04-25 19:55 CDT after the user answered the unblocker questions.

| ID  | Decision                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- |
| Q1  | **Tavily Search** for web/pharmacy pricing. User to provide `TAVILY_API_KEY`.                  |
| Q2  | **Live Reddit JSON** for community panel. Use no-OAuth `https://www.reddit.com/r/<sub>/search.json` with a 5-minute in-memory cache and a hard-coded `User-Agent`. Cached corpus seed is shipped as the offline fallback when Reddit rate-limits or 5xx's. |
| Q3  | **Auto-detect agent model.** Engine now looks for `OPENAI_API_KEY` first, then `GEMINI_API_KEY`, then deterministic. Whichever fires is reported in the response payload and rendered honestly on `/agent`. User to (optionally) provide `OPENAI_API_KEY`. |
| Q4  | **Agent-curated 10 Synthea patients** across the demographic spread.                           |
| Q5  | **Hard deadline: Sunday 2026-04-26 16:00 CDT.** ~20 wall-clock hours from plan write-up; ~12 of those usable build time after sleep. |

### Side effects of Q3 choice

The honest model label means the engine response always carries an `agent_model`
field. The `/agent` page reads it and shows one of:

  - `Powered by OpenAI GPT-4o-mini`     (if `OPENAI_API_KEY` set)
  - `Powered by Google Gemini 2.5 Flash-Lite`  (current default)
  - `Deterministic fallback` (when both keys are absent or quota-exhausted)

No UI change is required when the user adds the OpenAI key — the chip flips
automatically on next request.

### Side effects of Q5 (16:00 cutoff)

The 16:00 cutoff is two hours earlier than the Sunday-midnight estimate in §6.
The build order in §6 still stands, but the buffer at the end of the day
shrinks. Specifically:

  - Hours 11.0-12.0 (smoke test + buffer) compress to 30 minutes each.
  - F-03 pharmacy is now formally **at risk**. If by Hour 8 we are not
    starting that block, it gets cut and replaced with a `pharmacy.coming_soon`
    placeholder card on the verdict screen.
  - Demo video recording must happen Sunday morning, not Sunday afternoon.

---

## Change log

| Date       | Author          | Change                                                              |
| ---------- | --------------- | ------------------------------------------------------------------- |
| 2026-04-25 | Prince + agent  | Initial plan, written before any F-01..F-03 code is touched.        |
| 2026-04-25 | Prince + agent  | Section 11 added: locked-in answers to Q1-Q5 plus their side effects. |
