# UI Design Concept (As Applied)

Companion to `documents/ux design/00-design-system-foundations.md`. That
file is the spec. This file is the audit: which design tokens are being
used today, on which page, and where we're still off-spec.

Last updated: 2026-04-25 during the wiring matrix sweep
(`page-route-wiring-matrix.md`).

---

## 1. Concept in one paragraph

FrudgeCare AI uses **two scopes that share one visual language**:

- **Patient / public** scope (Tailwind + CSS vars, primary `#0F4C81`).
  Warmer, mobile-first, full-bleed cards, generous tap targets. Used by
  every `/`, `/triage`, `/agent`, `/patient/*`, `/auth/patient` surface.
- **Staff / clinical** scope (MUI theme, primary `#1565C0`). Cooler,
  dense, AppShell-wrapped, dual-rail or three-rail workspaces. Used by
  every `/front-desk/*`, `/nurse/*`, `/provider/*`, `/operations/*`,
  `/admin/*`, `/auth/staff`, `/settings`, `/console`.

Both scopes share the same **named primitives** in `globals.css`:

| Class | Replaces | Where |
|---|---|---|
| `.fc-card` | `bg-white border rounded-[16px] shadow-resting` | Every card on every page |
| `.fc-card-interactive` | per-page hover/focus inventions | List rows, link cards |
| `.fc-card-feature` | landing/persona card variants | `/`, `/triage` panels |
| `.fc-page-title`, `.fc-page-subtitle` | `text-3xl italic uppercase tracking-tight` etc. | Every page header |
| `.fc-section-title` | per-card `<h2 className="text-[14px] font-semibold ...">` | Every card head |
| `.fc-eyebrow` | per-card `text-[10px] uppercase tracking-widest` | Card eyebrows |
| `.fc-focus-ring` | manual `outline-2 outline-offset-2 outline-primary` | Every interactive |
| `.fc-table`, `.fc-toolbar` | hand-rolled table chrome | Queue, audit, accounts |
| `.fc-badge-*` (5 tones) | per-page chip color stacks | All chips |
| `.fc-highlight-*` (4 tones) | inset rail emphasis | Top-of-queue card, red-flag brief |
| `.fc-dl` | `<dl className="flex justify-between">` repeats | Patient context rails |

Reference component primitives (extracted): `<StatusChip>`, `<CaseHeader>`,
`<CaseTimeline>`, `<MobileStickyCTA>`, `<Toast>`. These match specs
`90`, `91`, `93`, `94`, `96`.

---

## 2. Archetype assignment (verified)

Every page has an explicit archetype per `00-design-system-foundations § 2.1`.

| Page | Archetype | Width applied | Spec | OK? |
|---|---|---|---|---|
| `/` | Persona | `max-w-6xl` | `max-w-6xl` | ✅ |
| `/triage` (public) | Decision workspace | full | full | ✅ |
| `/agent` | Persona | `max-w-6xl` | (new) | ✅ |
| `/sign-in`, `/auth/staff/[panel]`, `/auth/patient` | Focused form | `max-w-md` | `max-w-md` | ✅ |
| `/auth/staff` | Readable narrative | `max-w-4xl` | `max-w-4xl` | ✅ |
| `/patient/intake` | Focused form | `760 px` | `760 px` | ✅ |
| `/patient/status` | Focused form | `720 px` | `720 px` | ✅ |
| `/patient/history` | Readable narrative | **fixed today: `max-w-4xl`** | `max-w-4xl` | ✅ (was `max-w-3xl`) |
| `/front-desk/queue` | Decision workspace | full | full | ✅ |
| `/front-desk/case/[id]` | Operational queue | `1280 px` | `1280 px` | ✅ |
| `/front-desk/appointments` | Operational queue | `1280 px` | `1280 px` | ✅ |
| `/nurse` | Decision workspace | full | full | ✅ |
| `/nurse/case/[caseId]` | Decision workspace | full | full | ✅ |
| `/provider/daily` | Readable narrative | `900 px` | `900 px` | ✅ |
| `/provider/case/[id]` | Decision workspace (3-rail) | full + 3 rails | full + `320/1fr/360` | 🟡 — uses `280px / 1fr / 320px`. Documented exception (clinical workspace fits the AI co-pilot rail at 320 px). Carried in `21-known-design-debt § T-07` (added). |
| `/operations/dashboard` | Analytics | full | full | ✅ |
| `/operations/audit` | Raw table | full, no max | full, no max | ✅ |
| `/settings` | Readable narrative | `max-w-4xl` | `max-w-4xl` | ✅ |
| `/admin/accounts` | Decision workspace | full | (new) | ✅ |

---

## 3. Color & typography (canonical, no bespoke values)

### 3.1 Color tokens used by the new/changed code

- `var(--primary)` (`#0F4C81`) — patient surfaces (provider page CTAs, patient/history link card hover, patient/status, intake).
- `MUI C.primary` (`#1565C0`) — staff workspaces (queue, nurse, dashboard).
- `--urgency-{high,medium,low}` — only on chips and CaseHeader urgency badges. Charts must not borrow them (spec 20 § 4 / 10.4).
- Text ladder: `slate-900 / slate-700 / slate-500 / slate-400` mapped to MUI text1/2/3/4. No new gray literals introduced.
- Status chip surface uses the canonical map in `<StatusChip>` (spec 93). No raw colors in pages.

### 3.2 Typography roles used in changed code

| Role | Where in updated code |
|---|---|
| `title-page` (17–22, 700) | `.fc-page-title` on `/patient/history`, `/provider/case/[id]` loading + not-found states. |
| `title-card` (17, 600) | "Case not found" + provider gate headers. |
| `body-default` (14, 400) | Provider gate explanation paragraph. |
| `body` (13, 400) | Patient/history list rows. |
| `dense-body` (12, 400) | Demo-fallback footnote on `/patient/history`, last-updated metadata. |
| `eyebrow` (10, 700 UPPER) | `.fc-eyebrow` for case-id stamp on `/patient/history`. |
| `meta` (11, 400) | Footer hints. |

No raw `text-[18px] italic uppercase tracking-tight` patterns introduced in this audit.

---

## 4. Spacing applied (8-px grid only)

Every padding/gap in code touched today resolves to a 4 / 8 multiple:

| Where | Tailwind | Resolved px |
|---|---|---|
| `/patient/history` outer | `px-5 md:px-6 py-8 md:py-10` | 20 / 24 / 32 / 40 |
| List card padding | `p-5` | 20 |
| List row gap | `gap-3` | 12 |
| Header icon block | `w-11 h-11 rounded-[12px]` | 44 / 12 |
| Provider loading card | `p-6 md:p-8` | 24 / 32 |
| Provider gate amber card | `p-5 md:p-6` | 20 / 24 |
| Provider gate handoff list | `gap-2`, `mt-3`, `mt-5` | 8 / 12 / 20 |

---

## 5. Concept rules going forward

1. **Use `.fc-card` / `.fc-card-interactive` / `.fc-card-feature`.** Never `bg-white border border-slate-300 rounded-[N]` again.
2. **Page header must use `.fc-page-title` + `.fc-page-subtitle`.** No italic / UPPER / `tracking-tighter` overrides.
3. **Card heads use `.fc-section-title`; eyebrows use `.fc-eyebrow`.** Never restate `text-[10px] tracking-widest font-bold UPPER` per page.
4. **Status display goes through `<StatusChip>`** (spec 93). The status-chip vocabulary is canonical and ties to the case state machine.
5. **All interactives carry `.fc-focus-ring`.** No bare `outline-none`.
6. **Lists, tables, queues use `.fc-table` / `.fc-toolbar`.** No re-implementations.
7. **One scope per surface.** Patient = CSS vars, staff = MUI `C`. Components shared across both scopes pull tokens from their local context.
8. **Archetype first, width second.** Width values come from § 2 of the spec, not invented per page.
9. **Reduced motion respected globally** via `globals.css` `@media (prefers-reduced-motion)`. Per-component opt-outs are unnecessary.

---

## 6. Known concept-level drift to clean up post-hackathon

| ID | Where | What | Plan |
|---|---|---|---|
| C-01 | `/provider/case/[id]` | 3-rail uses `280 / 1fr / 320` instead of spec `320 / 1fr / 360`. AI co-pilot rail forced the trim. | Promote AI rail to its own collapsed disclosure on < 1440 px; restore canonical widths. |
| C-02 | `/front-desk/case/[id]` | Direct Supabase access from the page; bypasses BFF and won't get RLS protection if surface re-roles. | Move reads/writes through `/api/cases/[caseId]` like provider page. |
| C-03 | `/operations/audit` | Mock-only because `events` table not deployed. | Once `events` ships, swap `MOCK_AUDIT` for `/api/operations/audit`. Already specced. |
| C-04 | `/front-desk/appointments`, `/provider/daily` | Mock fallback + direct Supabase. | Wrap in `/api/appointments` once that surface is decided. |
| C-05 | Tailwind `md` 768 vs MUI `md` 900 (D-01) | Layout snap at 820–880 px on `/nurse` and `/front-desk/case/[id]`. | Align MUI `createTheme.breakpoints.md = 768`. |

Each item maps to an entry in `21-known-design-debt.md` so the spec
stays the single source of truth for "what we still owe."
