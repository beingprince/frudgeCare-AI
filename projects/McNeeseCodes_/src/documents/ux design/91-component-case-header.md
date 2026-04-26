# 91 — Component: CaseHeader

Sticky top-of-page summary for any case-centric route (`/front-desk/case/[id]`, `/provider/case/[id]`, `/nurse`).

---

## Anatomy

```
header (sticky, height 72 px desktop / 96 px mobile)
├── left
│   ├── patient avatar (40 × 40, radius `r-control`)
│   ├── patient name — role `title-card` 17/600, ellipsis
│   └── meta row — role `meta` 11 px: MRN · age · sex · visit type
├── center (optional, lg+)
│   └── status chip cluster: case status + urgency + handoff-ready
└── right
    ├── breadcrumb back / previous case arrow
    └── primary case action (visible only on archetypes that have one)
```

- Sticky: `position: sticky; top: 0; z-index: 10` inside the shell `<main>`.
- Background must be solid (uses `bg-surface` token) — transparent header will bleed content.

---

## Tokens

| Element | Token |
|---|---|
| Height | 72 px desktop / 96 px mobile (stacks meta below name on mobile) |
| Background | `C.surface` |
| Divider below | 1 px `C.border` |
| Padding | `px-6 py-3` desktop, `px-4 py-3` mobile |

---

## Status chip cluster (center)

Renders status according to `18-workflow-ownership.md § 2`. Order: **state**, **urgency**, **flags** (handoff-ready / risk).

State mapping uses the vocabulary in `18 § 2` — no per-page renames. See `93-component-status-chip.md`.

---

## Per-route variations (strict)

| Route | Shows state chip | Shows urgency override | Shows handoff-ready | Primary action |
|---|---|---|---|---|
| `/front-desk/case/[id]` | yes | yes (editable) | read | "Mark reviewed" |
| `/nurse` | yes | read | controls "Send to provider" indirectly | "Send to provider" (in right rail, not header) |
| `/provider/case/[id]` | yes | read | read | "Finalize disposition" (in decision rail) |

> All primary actions live in **body** rails, not in the header. The header holds navigation and context only.

---

## Responsive behavior

- ≥ lg: single row layout as above.
- md–lg: center chip cluster moves to a secondary sub-row inside the header; header becomes 96 px tall.
- < md: collapses to two rows — name + back button up top, chips below; primary action moves to bottom pane.

---

## States

| State | Treatment |
|---|---|
| Loading | Skeleton: avatar + name + one chip, same 72-px height. |
| Error (case fetch failed) | Header renders "Case unavailable" + back button; body panes unmount. |
| Gate (provider-side, triage-not-cleared) | Header still renders fully; only body swaps to informational gate state (see `18 § 3.4`). |

---

## Accessibility

- Patient name is the page's `<h1>` equivalent — aria-level 1.
- Avatar is decorative (initials fallback labelled in `aria-label`).
- Back button has `aria-label="Back to <previous list>"`.

---

## Forbidden

- Different copy for the same state across routes.
- Animating status chip color on change — see `20 § 2.2`.
- Primary action buttons in the header (all primary actions are in body rails).
