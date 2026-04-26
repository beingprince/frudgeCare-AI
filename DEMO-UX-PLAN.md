# Demo UX & wiring plan (April 2026)

This file is committed to the repo (unlike `documents/`, which stays local). It records what we aligned to the UX pack and what remains transitional.

## Principles

- **Public / patient surfaces** use the patient theme: CSS variables in `globals.css` (`--primary #0F4C81`, `--background #F1F5F9`), `.fc-card`, `.fc-page-title`, no custom favicon.
- **Staff surfaces** stay on the MUI staff theme (`C.primary #1565C0`, App shell) per `documents/ux design/00-design-system-foundations.md` (that path is local-only; the app source is the runtime source of truth).

## Shipped in this iteration

1. **Landing (`/`)** — Care-first copy; three entry cards; “How the demo is meant to feel” steps; removed hero “AI stack” chip row and model name stack in the footer.
2. **Root layout** — Removed emoji data-URL favicon; title/description use plain language.
3. **Nurse → provider** — Provider case view treats `nurse_assessment.is_validated` as clearing the gate even if a transition lags; RR vitals key `rr` mapped to the provider grid; “vitals not obtained” path shows a note; escalation now **saves** a handoff via `/api/nurse/assessments` before transitioning.
4. **Operations** — `/api/operations/kpis` uses the service-role client to count real cases and returns `funnel` + `bottlenecks`; dashboard charts use live data when `dataSource === "supabase"`.
5. **Data removal (demo)** — `POST /api/data-deletion/request` stores a pending request under `ai_patient_profile.deletion_request`; **Admin → Data removal** lists pending rows; `POST /api/admin/data-deletion` approves, writes `deletion_approved_at_txt`, redacts name/symptom, closes the case.
6. **PDF exports** — Shared `lib/clientPdf.ts`; triage output and patient status (intake receipt + full visit summary) download as PDF.

## Follow-ups (not blocking the demo)

- Unify MUI/Tailwind breakpoints (known debt D-01).
- Replace remaining static **time-series** chart on the operations dashboard with stored events when an `events` table exists.
- Optional: nurse case page one-click “Export handoff PDF” using the same helper.

## Git

Push to `main` on `beingprince/frudgeCare-AI` with a conventional commit message describing the demo UX + wiring batch.
