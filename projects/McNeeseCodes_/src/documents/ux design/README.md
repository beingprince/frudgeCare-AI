# FrudgeCareAI — UX / Layout Design Governance

> **Status:** Phase 2 — descriptive scan **+** prescriptive governance.
> Phase 1 was a layout scan. This folder now combines page scans, component specs, workflow specs, and system rules.

Every rendered page in `apps/web/src/app/**` has a per-page file covering, in order:

1. Viewport / frame size
2. Max content width
3. Left / right margins (outer gutters)
4. Grid columns
5. Gutters (gaps between columns / rows)
6. Padding inside cards / forms
7. Vertical spacing between sections
8. Font sizes / line heights
9. Breakpoint behavior
10. **Route classification** *(new — mobile-first, mobile-supported, tablet-primary, desktop-primary, workstation-only)*
11. **Scroll owner / overflow contract** *(new — required for all staff-facing pages)*

Two "layer-0" files cover system-level primitives every page inherits.

---

## Index

### Foundations
| # | File | Scope |
|---|---|---|
| 00 | `00-design-system-foundations.md` | Global tokens, system rules, visual scope, typography roles, radius tiers, width archetypes |
| 01 | `01-app-shell.md` | Sidebar + top header |

### Page specs (by route)
| # | File | Route | Shell | Class |
|---|---|---|---|---|
| 02 | `02-landing-root.md` | `/` | yes | desktop-primary |
| 03 | `03-sign-in.md` | `/sign-in` | yes | mobile-supported |
| 04 | `04-auth-staff.md` | `/auth/staff` + `/auth/staff/[panel]` | **bypassed** | desktop-primary |
| 05 | `05-auth-patient.md` | `/auth/patient` | **bypassed** | **mobile-first** |
| 06 | `06-patient-intake.md` | `/patient/intake` | **bypassed** | **mobile-first** |
| 07 | `07-patient-status.md` | `/patient/status` | **bypassed** | **mobile-first** |
| 08 | `08-patient-history.md` | `/patient/history` | **bypassed** | mobile-supported |
| 09 | `09-front-desk-queue.md` | `/front-desk/queue` | yes | desktop-primary |
| 10 | `10-front-desk-appointments.md` | `/front-desk/appointments` | yes | **workstation-only** |
| 11 | `11-front-desk-case.md` | `/front-desk/case/[id]` | yes | desktop-primary |
| 12 | `12-provider-daily.md` | `/provider/daily` | yes | tablet-primary |
| 13 | `13-provider-case.md` | `/provider/case/[id]` | yes | **workstation-only** |
| 14 | `14-nurse.md` | `/nurse` | yes | desktop-primary |
| 15 | `15-operations-dashboard.md` | `/operations/dashboard` | yes | desktop-primary |
| 16 | `16-operations-audit.md` | `/operations/audit` | yes | **workstation-only** |
| 17 | `17-settings.md` | `/settings` | yes | tablet-primary |

### Workflow & system specs
| # | File | Scope |
|---|---|---|
| 18 | `18-workflow-ownership.md` | Role-responsibility matrix + case state machine + handoff contracts |
| 19 | `19-implementation-safety.md` | Empty / loading / error / overflow / table min-width / a11y |
| 20 | `20-motion-and-tone.md` | Motion budget, tone layers, icon rules, chart color semantics |
| 21 | `21-known-design-debt.md` | Transitional exceptions, phase-1 holdovers, must-resolve items |

### Component specs
| # | File | Scope |
|---|---|---|
| 90 | `90-component-card.md` | Card / feature card / glass-card |
| 91 | `91-component-case-header.md` | Case header (front-desk / provider / nurse) |
| 92 | `92-component-dense-table.md` | Operational table primitive |
| 93 | `93-component-status-chip.md` | Urgency / status / role chips |
| 94 | `94-component-case-timeline.md` | Case timeline / activity feed |
| 95 | `95-component-form-field.md` | Label + input + helper + error |
| 96 | `96-component-mobile-sticky-cta.md` | Mobile sticky CTA bar |
| 97 | `97-component-auth-shell.md` | Full-screen auth frame |

> Routes excluded: API handlers under `/api/*` and empty `provider/follow-up/[id]` (stub directory, no `page.tsx` yet).

---

## Reading order

1. **00 — Foundations** first. Tokens, rules, archetypes. Everything else cites this file.
2. **01 — AppShell.** Every staff route inherits it. Patient/auth bypass it.
3. **Page files** in any order (02–17). Each one answers the same 11 questions.
4. **18 — Workflow Ownership.** Read before touching nurse, front-desk, provider, or operations pages.
5. **19-21** as reference.
6. **90+ — Components.** Read before building a new page — reuse before you restyle.

---

## Headline observations (stack-wide)

### Strengths
- Every route has an explicit max-width, spacing family, and breakpoint plan.
- 8 px base grid and Inter typography are honored on 100% of pages.
- Patient / auth flows are genuinely mobile-first (44 px inputs, sticky 48 px CTA, bottom safe area).
- AppShell cleanly separates staff and patient surfaces.

### Must-resolve before production scaling *(see `21-known-design-debt.md`)*
1. **Breakpoint drift between Tailwind and MUI.** Tailwind `md` = 768 px, MUI `md` = 900 px. Mixed-layout pages (`/front-desk/case/[id]`, `/nurse`) reflow at different widths for different subsystems. **Must be unified** — either (a) customize MUI breakpoints to match Tailwind, or (b) forbid mixing Tailwind-grid and MUI-grid on the same page.
2. **Two primary blues** (`#0F4C81` patient, `#1565C0` staff) — currently "intentional dual brand" but rationale is not yet binding. See `00-foundations § Visual Scope Rules`.
3. **Two token systems** (CSS vars vs MUI `C`) — keep only if role-scoped; otherwise consolidate.
4. **Nurse → provider handoff** is currently a gate (`provider/case` shows amber placeholder if triage not cleared). This must be elevated to a true state-machine transition — see `18-workflow-ownership.md`.
5. **Scroll contracts** differ per page (whole-page / pane-based / header-fixed-body-scroll). Each staff page must now declare its scroll owner — see §11 on each page file and `19-implementation-safety.md`.
6. **Component-level rules** are the single biggest source of latent drift. Pages are described in detail but shared components (Card, CaseHeader, DenseTable, StatusChip, Timeline, FormField) had no specs until this revision.

---

## Governance model

This doc pack distinguishes four rule classes. Any new convention must declare which class it belongs to:

- **Mandatory** — violating it is a bug (e.g. 8 px grid, Inter, AppShell for staff routes).
- **Transitional** — allowed for now, scheduled for consolidation (e.g. dual blue, dual tokens).
- **Archetype-bound** — allowed only for the route archetype specified (e.g. full-width is only for dense workspaces).
- **Discouraged** — permitted only with an explicit exception note in `21-known-design-debt.md`.

See `00-design-system-foundations.md § 0. System Rules` for the current canonical list.

---

## How to extend this scan

- **New page?** Copy `17-settings.md` as a skeleton, fill 11 sections, add a row to the Index, tag it with a route classification, and declare its scroll owner.
- **New shared component?** Add a `9X-component-<name>.md` file following the pattern in `90-component-card.md`. Component files come **before** new feature pages that would consume them.
- **New workflow transition?** Update the state machine in `18-workflow-ownership.md` first; implement second.
- **New debt item?** Append it to `21-known-design-debt.md` with owner + target resolution date.
