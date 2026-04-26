# 93 — Component: StatusChip

Single chip primitive for **state**, **urgency**, **role**, and **flags**. Vocabulary aligns with `18-workflow-ownership.md § 2`.

---

## Kinds

| Kind | Examples |
|---|---|
| `state` | submitted, front_desk_reviewed, nurse_in_progress, nurse_validated, provider_pending, provider_reviewed, disposition_finalized, voided, reopened |
| `urgency` | low, medium, high |
| `role` | patient, front_desk, nurse, provider, operations |
| `flag` | handoff-ready, escalated, allergy, consent-missing, note-present |

---

## Visual

| Property | Dense | Comfortable |
|---|---|---|
| Height | 20 px | 24 px |
| Radius | `r-chip` 6 | `r-chip` 6 |
| Padding | `px-2` (8) | `px-2.5` (10) |
| Typography | role `micro` 10 / 600 UPPER +0.04em | role `meta` 11 / 600 |
| Icon (optional) | 12 px, `mr-1` | 14 px, `mr-1.5` |
| Border | 1 px at `-border` token OR transparent if filled |

---

## Semantic colors

Chips must **always** encode via color + icon (or letter) — never color-only.

### State chips (from `18 § 2`)

| State | Background | Foreground | Icon |
|---|---|---|---|
| `submitted` | `neutral-100` | `neutral-700` | inbox |
| `front_desk_reviewed` | `blue-50` | `blue-700` | clipboard-check |
| `nurse_in_progress` | `amber-50` | `amber-800` | stethoscope |
| `nurse_validated` | `emerald-50` | `emerald-700` | check-double |
| `provider_pending` | `indigo-50` | `indigo-700` | user-md (clock) |
| `provider_reviewed` | `blue-50` | `blue-800` | user-md |
| `disposition_finalized` | `emerald-100` | `emerald-800` | lock |
| `voided` | `neutral-100` | `neutral-500` | circle-slash |
| `reopened` | `purple-50` | `purple-700` | rotate |

### Urgency (reserved semantic)

| Urgency | Background | Foreground | Icon |
|---|---|---|---|
| `high` | `red-50` | `#C62828` | alert-triangle |
| `medium` | `orange-50` | `#E65100` | alert-circle |
| `low` | `green-50` | `#2E7D32` | check-circle |

> These colors are **reserved** — do not reuse for decorative chart series (see `20 § 4.1`).

### Flag chips

| Flag | Background | Icon |
|---|---|---|
| `handoff-ready` | emerald | arrow-right-circle |
| `escalated` | red | flame |
| `allergy` | rose | alert-triangle |
| `consent-missing` | amber | file-x |
| `note-present` | slate | sticky-note |

---

## Variants

- `filled` — solid background (default).
- `outlined` — transparent background, 1 px border at chip color. Use in dense rows where filled color would dominate.
- `dot` — 8-px dot + text only. Use when ≥ 3 chips sit in a row.

---

## States

| State | Treatment |
|---|---|
| Interactive (filter chip) | `cursor: pointer`; hover: darken 4%; `aria-pressed` when selected. |
| Read-only (status display) | Not focusable. |
| Disabled | Opacity 0.5; no hover. |

---

## Accessibility

- Text + icon: both must be present for state and urgency chips.
- If interactive: `<button>` with `aria-pressed`; if read-only: `<span>`.
- Color is supplementary, not primary signal (icon or letter must also differentiate).

---

## Forbidden

- Per-page status vocabulary ("Triaging" vs "nurse_in_progress" — pick one).
- Color-only chips.
- Animating color transitions beyond 120 ms fade.
- Chip heights outside 20 / 24 px.
