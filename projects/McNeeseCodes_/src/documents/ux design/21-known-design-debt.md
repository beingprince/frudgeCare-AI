# 21 — Known Design Debt & Transitional Exceptions

This file tracks everything in the product that is **intentionally temporary** or **explicitly not yet unified**. Every "transitional" rule in the foundations carries an entry here. New debt must be added with owner + target resolution.

---

## 1. Must-resolve-before-production

These are blockers for production-scale UI extension. Do not ship major new features that depend on them.

### D-01 · Breakpoint drift between Tailwind and MUI
- **Problem:** Tailwind `md` = 768 px, MUI `md` = 900 px. Pages mixing the two reflow at different widths (`/front-desk/case/[id]`, `/nurse`).
- **Impact:** At viewport 820–880 px, layout is visually incoherent.
- **Required fix:** One source of truth. Recommended: customize MUI `createTheme({ breakpoints: { values: { md: 768, ... } } })` to match Tailwind.
- **Owner:** Front-end platform.
- **Until resolved:** New pages **must not** mix Tailwind `grid-cols-*` with MUI `gridTemplateColumns` on the same layout shell. Pick one.

### D-02 · Nurse → Provider handoff is a gate, not a workflow
- **Problem:** `/provider/case/[id]` shows an amber full-page placeholder when triage is not cleared. This blocks the user but does not communicate ownership, missing fields, or recourse.
- **Required fix:** Implement `18-workflow-ownership.md § 3.4` (informational state with owner, missing-field checklist, read-only context, "Request escalation" action).
- **Owner:** Clinical UX.

### D-03 · Validation checkpoint fields on `/nurse` don't enforce the § 3.2 list
- **Problem:** The nurse handoff CTA can become enabled while some required fields (vitals captured-or-marked, AI brief confirmed) are not explicitly satisfied.
- **Required fix:** Map every field in `18 § 3.2` to a checkpoint item with enforced validation.
- **Owner:** Clinical UX.

---

## 2. Transitional rules (allowed, but scheduled)

### T-01 · Two primary blues (patient `#0F4C81`, staff `#1565C0`)
- **Status:** Intentional dual-brand per `00-foundations § 10.1 Visual Scope Rules`.
- **Exit criterion:** Product leadership either (a) confirms dual-brand permanently and promotes D-01 to finished, or (b) picks one primary.
- **Don't:** silently consolidate in a component PR.

### T-02 · Two token systems (CSS vars + MUI `C`)
- **Status:** Role-scoped. Acceptable while dual-brand stands.
- **Rule while transitional:** Components must inherit from the local scope, never hard-code a hex that originated in the other scope.

### T-03 · Tailwind + MUI grid coexist on the same page
- **Status:** Allowed on `/front-desk/case/[id]` and `/nurse` only. These are existing pages; debt is documented.
- **Rule while transitional:** No new page may add this pattern. See D-01.

### T-04 · Literal radii in some pages (e.g. `rounded-[16px]`)
- **Status:** Pre-existing. New components must use named radius tiers from `00 § 11`.
- **Exit criterion:** Retrofit all page-level literals to tier tokens.

### T-05 · Status chip vocabulary inconsistent across surfaces
- **Problem:** `/front-desk/queue` displays human-readable labels that are not 1:1 mapped to the state-machine names in `18 § 2`.
- **Exit criterion:** Single mapping table; chip component reads status from case model.

### T-06 · Audit events not emitted consistently
- **Problem:** Some transitions (front-desk urgency override, nurse reopen) write events; others don't. `/operations/audit` is therefore not a reliable single source.
- **Exit criterion:** Every transition in `18 § 2`, `18 § 4` emits an event; audit page becomes source-of-truth.

---

## 3. Archetype-bound exceptions (permanent but scoped)

| Exception | Where | Why |
|---|---|---|
| Full-width layout | Decision workspace + analytics archetypes only | Dense clinical review and dashboards need edge-to-edge space |
| 448-px `max-w-md` | Auth / single-form archetype | Focus; mobile-first |
| `minWidth: 800` on `/front-desk/appointments` | This route only | Intentional workstation-only; horizontal scroll acceptable |
| No max-width on `/operations/audit` | Raw-table archetype | Audit readability needs column space |

These are not debt. They are design rules and should remain as-is unless the archetype itself changes.

---

## 4. Component debt

Until components are built per `90–97-component-*.md`, pages inline their own variants. This accelerates drift.

| Component | Status | Pages relying on inline variants |
|---|---|---|
| Card | Spec in `90-component-card.md`; not yet extracted as `<Card />` wrapper | All staff pages |
| CaseHeader | Spec in `91-component-case-header.md`; inline in 3 pages | `/front-desk/case/[id]`, `/provider/case/[id]`, `/nurse` |
| DenseTable | Spec in `92-component-dense-table.md`; duplicated | `/front-desk/queue`, `/operations/audit` |
| StatusChip | Spec in `93-component-status-chip.md`; partially extracted | Everywhere |
| CaseTimeline | Spec in `94-component-case-timeline.md` | `/patient/status`, provider case |
| FormField | Spec in `95-component-form-field.md` | Patient intake, settings, nurse |
| MobileStickyCTA | Spec in `96-component-mobile-sticky-cta.md` | Patient intake, patient status |
| AuthShell | Spec in `97-component-auth-shell.md` | All `/auth/*` |

Exit criterion: each component is extracted as a shared primitive; page docs reference it by name instead of restating its internals.

---

## 5. Implementation safety gaps (tracked)

From `19-implementation-safety.md`, items not yet implemented everywhere:

- Empty / loading / error states are present on some surfaces but not required by test. Add to PR checklist.
- Table `min-width` declared only on `/front-desk/queue`. Add to `/operations/audit`, `/front-desk/appointments`.
- Sticky `<thead>` not implemented on `/operations/audit`.
- `prefers-reduced-motion` not audited per surface.
- Mobile safe-area `env(safe-area-inset-bottom)` only applied on `/patient/intake`.

---

## 6. How to add a new debt entry

1. Pick an ID: `D-##` for must-resolve, `T-##` for transitional.
2. Write a one-paragraph problem statement, required fix, owner.
3. Link from the relevant foundations / page / component doc.
4. Note an exit criterion (what "resolved" looks like).
5. Review quarterly; close or escalate.

---

## 7. Phase-1 holdovers (descriptive, to be removed)

The page files (02–17) started as a descriptive scan. Where descriptive wording remains instead of prescriptive rules, flag a follow-up. Known areas:

- Some page files still report raw pixel sizes for typography instead of semantic role names from `00 § 8.2`.
- Some page files say "something to watch" for breakpoint drift; all such wording should now say "see `21-design-debt § D-01`".
- Some page files list radii as literals instead of tier names (`00 § 11`).

These do not block any page from shipping; they reduce long-term drift when fixed.
