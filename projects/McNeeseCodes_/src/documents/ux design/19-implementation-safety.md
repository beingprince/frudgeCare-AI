# 19 — Implementation Safety

Cross-cutting rules for empty states, loading skeletons, error handling, overflow, tables, scroll contracts, and accessibility. These rules are **mandatory** for all pages unless a debt entry explicitly exempts a route.

---

## 1. Scroll Contracts (canonical reference)

Every page's § 11 Scroll Owner / Overflow Contract must declare one of the four patterns below. No page may omit the declaration.

### 1.1 Whole-page scroll
- **Owner:** AppShell `<main>` pane.
- **Use for:** `/operations/dashboard`, settings, readable narrative pages.
- **Rules:** no nested `overflow: auto` containers. Chart / long-card heights must be fixed or `min-h-[…]`, not `h-full`.

### 1.2 Pane-based (independent rails)
- **Owner:** each rail has its own `overflowY: auto`.
- **Use for:** `/front-desk/queue`, `/nurse`, `/provider/case/[id]`.
- **Rules:**
  - Every ancestor flex/grid container on the chain from `<main>` to the scrolling child must set `minHeight: 0` (or Tailwind `min-h-0`). Missing this is the #1 clipping bug.
  - No rail may "leak" its content into the outer shell's scroll.
  - Sticky elements inside a rail (e.g. handoff CTA) stick to that rail, never to `<main>`.

### 1.3 Header-fixed + body-scroll
- **Owner:** body region inside page; page header is sticky.
- **Use for:** `/front-desk/appointments`, `/front-desk/case/[id]`, `/provider/daily`.
- **Rules:** header z-index must be above body content; header must have a solid background (avoid `transparent` — content will bleed through).

### 1.4 Natural document scroll
- **Owner:** `<body>` (AppShell-bypassed routes) or `<main>` (in-shell).
- **Use for:** patient/auth routes, landing.
- **Rules:** fixed bottom elements (sticky CTA) must reserve `padding-bottom` on the body equal to their height so last content is not occluded.

### 1.5 Two-axis scroll
- **Use for:** `/operations/audit`, `/front-desk/appointments`.
- **Rules:** horizontal scroll is owned by a table wrapper (`overflow-x: auto`, `min-width` on the inner grid). Vertical scroll is owned by the pane above.

---

## 2. Empty states (required on every data surface)

Every data-bearing component must render **three** states, not just "data present":

| State | Trigger | Minimum render |
|---|---|---|
| `loading` | Initial fetch or filter change | Skeleton sized to ~60% of typical content (see § 3) |
| `empty` | API returns 0 rows | Centered illustration OR text + reason + primary action |
| `filtered-empty` | Filter produces 0 rows | Text + "clear filter" action; do not reuse `empty` copy |
| `error` | Fetch failed | Error icon + retry button + support link; height must equal `loading` skeleton |
| `partial` (optional) | Some widgets loaded, some failed | Per-widget error chips — never fail the whole page |

### Surface checklist
- `/front-desk/queue` — per-pane empty + filtered-empty.
- `/nurse` — findings column empty; questionnaire-required errors.
- `/provider/daily` — "no appointments today" empty.
- `/operations/dashboard` — every chart card; include `error` with retry.
- `/operations/audit` — filtered-empty (search + role filters).
- `/patient/history` — "no records yet" empty.

Height contract: `empty` / `error` states must render at the **same minimum height** as the loaded state, or containing panels (especially in pane-based scroll) will collapse.

---

## 3. Loading skeletons

Every page family needs a skeleton recipe (not just case pages):

| Family | Skeleton |
|---|---|
| Card list | 3–5 card-shaped rectangles at default card height |
| Table | Header + 6 row placeholders at row height |
| KPI strip | N boxes matching `kpi` height (≈ 96 px) |
| Timeline | 4 vertical blocks (time-dot + content) |
| Form | 3 label-input pairs with matching input height |

Skeletons must:
- Use the token `animate-pulse` (Tailwind) or the MUI `<Skeleton>` equivalent — do **not** use custom shimmer per page.
- Respect the final layout's padding and gaps exactly (a skeleton that is 10 px shorter than the loaded state causes visible jump).

---

## 4. Error-state layout rules

- Long inline alerts (e.g., validation errors, API failures) **must not** expand the panel height in a pane-based layout — they scroll within the pane or collapse into a toast.
- Form error messages sit **below** the input, 12 px height, never to the side (would break grid columns).
- Server errors at page level render in a full-width banner above the primary scroll pane, `max-h-[56px]` with truncation + "View details".
- Retry actions must be idempotent; show last-retry timestamp if ≥ 3 retries.

---

## 5. Long-content overflow

| Where | Rule |
|---|---|
| Case notes / summaries | Multi-line truncation at `line-clamp-3` with "Read more" → opens inline expansion, not a modal |
| Patient name / titles | Single-line truncation with `text-ellipsis`; full value in `title=` + tooltip on hover |
| Chip rows | Wrap with `flex-wrap gap-*`; never horizontal-scroll |
| Timeline entries | Each entry `max-h-[240px]` with gradient fade + expand toggle |
| Nurse questionnaire | No truncation — full-text; scroll lives in the pane |

---

## 6. Tables — min-width and truncation

Applies to `/operations/audit`, `/front-desk/queue`, `/front-desk/appointments`.

- Every table **must** declare a `min-width` on the inner grid element, which together with the wrapper's `overflow-x: auto` produces horizontal scroll below that width.
- `<thead>` must be sticky inside its scroll pane; `position: sticky; top: 0; z-index: 2`.
- Column cells with dynamic text use `text-ellipsis` + `title=`. Numeric columns are right-aligned. Action columns are fixed-width (typically 56 / 72 / 96 px).
- Row height is fixed (typically 44 px dense, 56 px comfortable). Wrapping text is forbidden in dense rows — use a details panel if needed.
- Empty state row spans all columns; background matches tbody background.

---

## 7. Accessibility

### 7.1 Focus order
- Every route's primary CTA must be reachable in ≤ 6 Tab presses from page load.
- Sticky CTAs (mobile bottom bar, nurse handoff) must appear in focus order **after** the form they commit, not before.

### 7.2 Sticky elements
- Any `position: fixed` or `sticky` element must not trap Tab — a keyboard user must be able to Tab past it.
- Bottom sticky bars: on mobile, respect the iOS safe area with `padding-bottom: env(safe-area-inset-bottom)`.

### 7.3 Scrollable rails
- Each independent scroll pane must be focusable (`tabindex="0"` on the scrollable container) when it can receive keyboard arrow-key scroll.
- Announce pane purpose via `aria-label` ("Queue list", "Case details", "Decision rail").

### 7.4 Color contrast
- Body text ≥ 4.5:1 against background. Dense table text at 12 px ≥ 7:1 (stricter for density).
- Urgency colors (`high`, `medium`, `low`) **must** also encode an icon or text — never color-only.
- Focus ring: 2 px solid `var(--ring)` / MUI `primary.main` at 40% opacity; never remove.

### 7.5 Motion-reduced
- `prefers-reduced-motion: reduce` disables: step-transition zoom (`/patient/intake`), motion-fade on provider/daily cards, persona card lift, and any decorative framer-motion.
- Critical feedback motion (toast, skeleton pulse) may remain but at 0.1s.

---

## 8. Dashboard governance (for `/operations/dashboard` + future reports)

- Every chart / KPI must declare: data source, refresh cadence, whether counts are live-source-of-truth or mock.
- Filter controls at the top of the dashboard must explicitly indicate their scope:
  - Global filter: dashboard-wide, labelled "Applies to all widgets".
  - Widget filter: inline inside the widget card, labelled with the widget name.
- No mixed-scope filters.
- Risk chips on the dashboard link to the corresponding `/operations/audit` filtered view.

---

## 9. Mobile input states (patient routes)

- Numeric fields use `inputMode="numeric"` / `decimal` as appropriate.
- Date fields use native `<input type="date">` on mobile; do not custom-pick on phone.
- Tap targets ≥ 44 × 44 px.
- Fixed bottom CTA: body must reserve `pb-[80px]` at ≤ `md` so last control is never under the CTA.
- On keyboard open (iOS), sticky bottom elements may overlap keyboard — document the tradeoff in the page's §11.

---

## 10. Pre-ship checklist (per page)

Before a page merges, confirm:

- [ ] § 11 Scroll Contract is declared and matches one of § 1.1–1.5.
- [ ] Empty / loading / error states render without height collapse.
- [ ] Tables (if any) have `min-width` + sticky `<thead>` + ellipsis rules.
- [ ] Focus order reaches primary CTA in ≤ 6 Tabs.
- [ ] `prefers-reduced-motion` respected.
- [ ] Mobile safe-area respected (bottom CTA).
- [ ] Every component used exists in `90-component-*.md` or the PR adds a new one.
