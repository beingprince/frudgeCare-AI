# 92 — Component: DenseTable

Operational table primitive. Consumer surfaces: `/front-desk/queue`, `/operations/audit`, and any future table.

---

## Contract

1. Every DenseTable declares a **min-width** on the inner grid element. Below that width the wrapper horizontal-scrolls (`overflow-x: auto`).
2. `<thead>` is sticky (`position: sticky; top: 0; z-index: 2`) inside its scroll pane.
3. Row height is fixed per density tier.

| Density | Row height | Font role | Use |
|---|---|---|---|
| `dense` | 44 px | `dense-body` 12 / 400 | Audit, queue |
| `comfortable` | 56 px | `body-default` 14 / 400 | Settings lists, patient history |

---

## Column types

| Type | Alignment | Rules |
|---|---|---|
| `text` | left | Truncate with ellipsis + `title=`. Never wrap. |
| `numeric` | right | Tabular numerals. 1 space before unit. |
| `status` | left | Uses `93-component-status-chip.md`. |
| `timestamp` | left | Always ISO short or relative ("2 m ago"); tooltip shows absolute. |
| `actor` | left | Avatar (24) + name ellipsis; avatar hidden < md. |
| `actions` | right, fixed-width | 56 / 72 / 96 px; icon buttons; destructive last. |

---

## Header

- Background: `C.background` (slightly darker than surface).
- Text: role `meta` 11 / 600 UPPER, letter-spacing +0.04em.
- Sort indicators: neutral arrow by default; `primary` when active.
- Column resize: not supported in current version.

---

## Rows

- Background alternation: none (dense tables alternate with 1-px dividers only).
- Dividers: 1 px `C.border`.
- Hover: `C.surface-2` background on dense; no elevation change.
- Selected row: 1-px left border in `primary`, background `primary/8%`.

---

## Empty / filtered / error states

Row region renders one full-width cell with:

- `empty`: "No entries yet" + icon (24) + optional primary action.
- `filtered-empty`: "No results for current filters" + "Clear filters" button.
- `error`: "Couldn't load — retry" + retry button + timestamp.

All three maintain the table's minimum body height so the scroll pane doesn't collapse.

---

## Pagination

- Bottom-anchored inside the scroll pane for `dense`.
- Controls: prev / next + page size select (25 / 50 / 100).
- Total count optional but recommended.
- Pagination sits **outside** the horizontal scroll region (not part of the `min-width` block).

---

## Accessibility

- `<table role="table">` or native `<table>`; prefer native.
- Each column header: `scope="col"`; sort state via `aria-sort`.
- Sticky header announced via `aria-label="Table header, sticky"`.
- Action buttons in rows have unique `aria-label` that includes row identifier ("Approve row 24").

---

## Forbidden

- Wrapping text in dense rows.
- Variable row heights.
- Hover-elevation on rows.
- Inline styles overriding column widths (use a column config prop).
