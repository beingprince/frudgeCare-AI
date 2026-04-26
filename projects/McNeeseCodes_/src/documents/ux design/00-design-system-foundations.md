# 00 — Design System Foundations

Global design tokens, theme, CSS baseline, system rules, and shared primitives.
Source: `apps/web/src/app/globals.css`, `apps/web/src/lib/theme.ts`, `apps/web/src/app/layout.tsx`.

This document defines the **ground truth** that all per-page files must conform to.

---

## 0. System Rules (authoritative)

Every convention in this pack carries one of four labels:

- **M — Mandatory**: violation = bug.
- **T — Transitional**: allowed now, must be retired per `21-known-design-debt.md`.
- **A — Archetype-bound**: allowed only for a specific route archetype (see §2.1).
- **D — Discouraged**: allowed only with a debt entry.

| Rule | Class | Notes |
|---|---|---|
| Inter variable font everywhere | **M** | Loaded in `app/layout.tsx` via `next/font` |
| 8 px base spacing grid | **M** | Every gap / padding resolves to 4/8 multiple |
| `html, body { overflow: hidden }` at root | **M** | Internal panels own scroll (`19-implementation-safety.md`) |
| AppShell wraps all staff routes | **M** | Bypass only via `BYPASS_PREFIXES` in `AppShell.tsx` |
| AppShell is bypassed for `/auth/*` and `/patient/*` | **M** | These routes are mobile-first full-screen |
| Two primary blues (`#0F4C81` patient, `#1565C0` staff) | **T** | See § Visual Scope Rules |
| Two token systems (CSS vars + MUI `C`) | **T** | Role-scoped; must not cross-leak |
| Tailwind grid mixed with MUI grid on same page | **T** | Until breakpoints are unified, disallow on new pages |
| Tailwind `md` 768 vs MUI `md` 900 | **T → must-resolve** | See `21-known-design-debt.md § Breakpoint Drift` |
| Full-width layout | **A** | Workspace / analytics / dense-table archetypes only |
| `max-w-md` (448 px) | **A** | Auth / single-form archetype only |
| `max-w-[760px]` / `[720px]` | **A** | Patient readable-content archetype only |
| Component-level literal radii (`rounded-[16px]` etc.) | **D** | Use named radius tier (§11) |
| Ad-hoc `bg-white shadow` card without using token | **D** | Use `components/Card` (see `90-component-card.md`) |
| Adding a new primary color | **D** | Requires Visual Scope Rules update |

---

## 1. Viewport / Frame Size

| Aspect | Value | Source |
|---|---|---|
| `html, body` | `height: 100%; overflow: hidden; margin: 0; padding: 0` | `globals.css` L133-139 |
| Root `<body>` class | `min-h-full` | `layout.tsx` L28 |
| App shell container | `height: 100vh`, flex-row | `AppShell.tsx` L295 |
| Main content area | `flex: 1; overflow: hidden; minWidth: 0; minHeight: 0` | `AppShell.tsx` L475-483 |

The shell is a **fixed-viewport application**, not a scroll-page. Horizontal scroll is suppressed; vertical scroll is **delegated** to inner panels (see `19-implementation-safety.md § Scroll Contracts`).

## 2. Max Content Width

### 2.1 Route archetypes (canonical width mapping)

Widths are not arbitrary — each route maps to one of six archetypes. Adding a new route **must** pick one of these:

| Archetype | Width | Example routes | Why |
|---|---|---|---|
| **Readable narrative** | `max-w-4xl` (896 px) | `/patient/history`, `/settings` | Human reading comfort (~75ch) |
| **Focused form** | `max-w-md`–`max-w-[760px]` | `/sign-in`, `/auth/*`, `/patient/intake`, `/patient/status` | Single-column form / dashboard on mobile-first |
| **Persona / landing** | `max-w-6xl` (1152 px) | `/` | Hero + grid |
| **Operational queue** | `1280 px` | `/front-desk/case/[id]`, `/front-desk/appointments` | Bounded dense workspace |
| **Decision workspace (full-width)** | none | `/front-desk/queue`, `/nurse`, `/provider/case/[id]` | 3-rail or 12-col clinical work |
| **Analytics / raw table** | none | `/operations/dashboard`, `/operations/audit` | Maximum data surface |

> Choose archetype first, then width. Deviation requires a debt entry.

### 2.2 Observed max-widths (as-built)

| Route | `maxWidth` | Archetype |
|---|---|---|
| `/` | `max-w-6xl` (1152 px) | Persona |
| `/sign-in` | `max-w-md` (448 px) | Focused form |
| `/auth/staff` | `max-w-4xl` (896 px) | Readable narrative |
| `/auth/staff/[panel]` | `max-w-md` (448 px) | Focused form |
| `/auth/patient` | `max-w-md` (448 px) | Focused form |
| `/patient/intake` | `760 px` | Focused form |
| `/patient/status` | `720 px` | Focused form |
| `/patient/history` | `max-w-4xl` (896 px) | Readable narrative |
| `/front-desk/queue` | full width | Decision workspace |
| `/front-desk/appointments` | `1280 px` | Operational queue |
| `/front-desk/case/[id]` | `1280 px` | Operational queue |
| `/provider/daily` | `900 px` | Readable narrative |
| `/provider/case/[id]` | full width | Decision workspace |
| `/nurse` | full width | Decision workspace |
| `/operations/dashboard` | full width | Analytics |
| `/operations/audit` | no explicit max | Raw table |
| `/settings` | `max-w-4xl` (896 px) | Readable narrative |

## 3. Left / Right Margins (Outer Gutters)

Outer gutter is not global — each page uses either:
- MUI: `px: { xs: 2, sm: 3 }` (16 / 24)
- Tailwind: `px-4 md:px-6` (16 / 24)

| Breakpoint | Outer gutter | Tailwind | MUI |
|---|---|---|---|
| xs (< 640 px) | 16 | `px-4` | `px: 2` |
| sm / md+ | 24 | `md:px-6` | `px: 3` |
| auth glass panels | 24–32 | `p-6`, `p-8` | — |

For centered columns: `mx-auto` + `maxWidth` provides margin.

## 4. Grid Columns

Two grid systems coexist (**T** in § 0). Rule: new pages should pick one and stay in it.

### Tailwind `grid-cols-*`
Used for: workspace pages (`queue`, `nurse`, `dashboard`), auth, patient.

| Count | Use |
|---|---|
| 1 | Mobile default |
| 2 | KPI strips (sm) |
| 3 | Persona / audit bottom |
| 4 | KPI strips (lg) |
| **12** | Main workspaces (split rails) |

### MUI `gridTemplateColumns`
Used for: `appointments` (provider-per-column), `front-desk/case/[id]` (1fr + 360 px), inline grids inside cards.

Common patterns:
- `"1fr"` mobile
- `"1fr 1fr"` / `"1fr 1fr 1fr"` inner card grids
- `"1fr 360px"` main + sidebar (lg)
- `"320px minmax(600px,1fr) 360px"` 3-rail (provider case)
- `"80px repeat(N, 1fr)"` appointment time-row + N providers

## 5. Gutters

| Context | Gap | Token |
|---|---|---|
| Card KPI strips | `gap-4 md:gap-6` | 16 → 24 |
| Main 12-col grid | `gap-6` | 24 |
| 3-rail workspace | `gap-6` | 24 |
| Card-internal 2-col | `gap-4` | 16 |
| Form field stack | MUI `gap: 2/3` | 16 / 24 |
| Chip rows | `gap-1`, `gap-0.75` | 4 / 6 |
| Button groups | MUI `gap: 1` | 8 |

## 6. Padding Inside Cards / Forms

| Card style | Padding | Tailwind / MUI |
|---|---|---|
| Compact card (KPI) | 16 | `p-4` / `p: 2` |
| **Default card** | **20** | MUI `<CardContent>` default / `p-5` |
| Feature card | 24 | `p-6` / `p: 3` |
| Landing / glass card | 32 | `p-8` / `p: 4` |
| Modal / auth panel | 32–40 | `p-8` / `p-10` |

Form fields inside cards: `gap-3` (12) vertical; label → input spacing `mb-2` (8).

Input heights:
- Desktop / staff: `h-[40px]`
- Patient mobile tappable: `h-[44px]`, `min-h-[56px]` for primary CTAs

## 7. Vertical Spacing Between Sections

| Level | Spacing |
|---|---|
| Page header → body | `py-4` (16) or `py-6` (24) |
| Card → card | `gap-4 md:gap-6` |
| Card → card (dense workspace) | `gap-3` |
| Section inside card | `mb-4` header → content |
| Paragraph → paragraph | `mt-1–2` |
| CTA block → surrounding | `mt-4–6` |
| Ops dashboard row → row | `gap-6` |

Base grid = **8 px** (MUI `theme.spacing(1) = 8`). All spacing must resolve to a 4/8 multiple.

## 8. Typography

### 8.1 Numeric scale (MUI theme, Major Third 1.25x)

| Token | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| `h1` | 2.25 rem / 36 | 800 | 1.15 | -0.03em |
| `h2` | 1.8 rem / 28.8 | 700 | 1.2 | -0.025em |
| `h3` | 1.44 rem / 23 | 600 | 1.3 | -0.02em |
| `h4` | 1.15 rem / 18.4 | 600 | 1.4 | -0.015em |
| `h5` | 0.938 rem / 15 | 600 | 1.5 | -0.01em |
| `h6` | 0.813 rem / 13 | 600 | 1.5 | +0.005em |
| `subtitle1` | 14 | 500 | — | — |
| `subtitle2` | 12 | 500 | — | — |
| `body1` | 14 | 400 | 1.6 | — |
| `body2` | 12 | 400 | 1.6 | — |
| `caption` | 11 | 400 | — | +0.025em |
| `overline` | 10 | 700 | — | +0.12em UPPER |
| `button` | 13 | 600 | — | +0.01em |

### 8.2 Semantic type roles (canonical)

Per reviewer feedback, page docs must use **semantic role names**, not raw pixel values:

| Role | Size | Weight | Typical use |
|---|---|---|---|
| `micro` | 9 | 600 | Chip badges, sub-micro labels |
| `eyebrow` | 10 | 700 UPPER | Card eyebrows, section pre-titles |
| `meta` | 11 | 400 | Breadcrumbs, table heads, helper |
| `dense-body` | 12 | 400 | Operational tables, chips |
| `body` | 13 | 400 | Dense menu / card cells |
| `body-default` | 14 | 400 | Standard body copy |
| `body-emph` | 15 | 500 | Emphasized body, mobile inputs |
| `title-card` | 17 | 600 | Patient name, card titles |
| `title-page` | 17–21 resp. | 700 | Page headings |
| `kpi-numeral` | 28 | 700 | KPI numbers |
| `hero` | 36 | 800 | Landing hero only |

> New pages should reference these roles (e.g. "Uses `title-card` at 17/600") instead of restating raw px.

Font stack:
- `--font-inter` (via `next/font`) mapped to `--font-sans`, `--font-heading`.
- Fallback: `"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`.

## 9. Breakpoint Behavior

| Name | Tailwind | MUI | Typical role |
|---|---|---|---|
| xs | < 640 | < 600 | Mobile |
| sm | ≥ 640 | ≥ 600 | Large mobile / small tablet |
| md | ≥ **768** | ≥ **900** | **Drift point — see `21-known-design-debt.md`** |
| lg | ≥ 1024 | ≥ 1200 | Desktop / 3-rail activates |
| xl | ≥ 1280 | ≥ 1536 | Widescreen |

> **Must-resolve**: pages that mix Tailwind layout with MUI layout (currently `/front-desk/case/[id]` and `/nurse`) will click-in their two halves at different widths. Single source of truth is required before new mixed pages are added.

Behavior per breakpoint:

- **< md (mobile)** — sidebar width 0 (hamburger), grids collapse to 1-col, patient sticky 48-px CTA visible.
- **md – lg** — 2-col splits (Tailwind `md:grid-cols-12` 6/6 or 7/5), KPIs 2-col, sidebar collapsed.
- **lg+** — 3-rail activates (`320 / 1fr / 360`), KPIs 4-col, chart areas grow to 8/4.

## 10. Color Tokens

### 10.1 Visual Scope Rules (role-based palette)

The dual-brand split is **intentional** and codified here:

| Scope | Primary | Background | Tone |
|---|---|---|---|
| **Patient / auth** (CSS vars) | `--primary #0F4C81` | `--background #F1F5F9` | Warm, reassuring, human |
| **Staff / operations** (MUI `C`) | `C.primary #1565C0` | `C.background #F4F6F8` | Cooler, operational, task-driven |
| **Brand / landing** (CSS vars + motion) | `--primary #0F4C81` | gradient | Expressive, high-contrast |

Rules:

1. Patient-facing surfaces **must** use CSS vars (Tailwind layer).
2. Staff-facing surfaces **must** use MUI `C` constants.
3. A component shared by both scopes **must** inherit its tokens from its local scope, not hard-code hex.
4. Role-crossing chrome (notifications, dialogs that show in both) **must** pick neutral tokens, never a scope-specific primary.
5. New primaries require an update to this section.

### 10.2 CSS vars (auth / patient)
- `--primary #0F4C81` / `--secondary #0F766E` (teal)
- `--success #2E7D32` · `--warning #B45309` · `--info #0369A1` · `--destructive #B91C1C`
- `--background #F1F5F9` · `--card #FFFFFF` · `--border #CBD5E1`

### 10.3 MUI theme (workspace)
- `C.primary #1565C0`, `C.background #F4F6F8`, `C.surface #FFFFFF`, `C.border #E0E5EC`
- Text ladder: `text1 #0D1117` → `text2 #374151` → `text3 #6B7280` → `text4 #9CA3AF`
- Urgency: `high #C62828` · `medium #E65100` · `low #2E7D32`

### 10.4 Chart color semantics

See `20-motion-and-tone.md § Chart palette` for the full table. Summary:
- **Risk/urgency channels** are reserved for `high/medium/low` — charts **must not** reuse `#C62828` for a decorative series.
- Trend / neutral series use cool blues + grays from MUI palette.

## 11. Radius Tiers (named)

Radii are now tiered by component role, not literal:

| Tier | Radius | Applies to |
|---|---|---|
| `r-chip` | 6 | Chips, small pills |
| `r-control` | 8 | Inputs, buttons, small cards |
| `r-nav` | 10 | Menu paper, sidebar nav item |
| `r-card` | 12 | Default card (theme.shape.borderRadius) |
| `r-dialog` | 16 | Dialog, full form-group card |
| `r-feature` | 40 (`[2.5rem]`) | Auth glass-card, persona card, feature panels |

> Page docs should reference these tier names. New components **must** pick a tier.

## 12. Elevation Scale

| Tier | Shadow |
|---|---|
| `resting` | `0 1px 2px rgba(0,0,0,0.05)` |
| `sh-1` | `0 1px 2px rgba(0,0,0,0.05)` |
| `sh-2` | `0 1px 3px + 0 1px 2px` |
| `sh-4` | `0 4px 8px + 0 2px 4px` |
| `elevated` | `0 8px 24px rgba(15,23,42,0.08)` |
| `dialog` | `0 24px 48px rgba(0,0,0,0.16)` |

## 13. Route Classification Legend

Every page file carries a **route classification** label in §10 of the page file:

| Label | Meaning |
|---|---|
| **mobile-first** | Designed primarily for phone; desktop merely scales up. 44 px tap targets mandatory. |
| **mobile-supported** | Works on phone but is not the primary form factor. |
| **tablet-primary** | Optimized for tablet; usable on phone and desktop. |
| **desktop-primary** | Designed for 1024+ px; phone is degraded. |
| **workstation-only** | Designed for ≥ 1280 px, horizontal-scrolls or breaks below that. Explicit decision, not a bug. |
