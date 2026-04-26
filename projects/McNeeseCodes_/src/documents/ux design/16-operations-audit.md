# 16 — `/operations/audit` (Audit Log)

Source: `apps/web/src/app/operations/audit/page.tsx`.

---

## 1. Viewport / Frame Size

- No explicit `min-h-screen` or `h-full` — inherits from AppShell content flex-1. Uses natural document flow with `space-y-8 py-4`.

## 2. Max Content Width

- **None** set explicitly. The page relies on caller/inner containers. Visually, the `.glass-card` table will stretch to the AppShell's content width.

## 3. Left / Right Margins

- Outer page: `py-4` (16 vertical) and `space-y-8` (32) between direct children.
- Table row internal: `px-8` (32) / `py-5` / `py-6`.

## 4. Grid Columns

- Header row: `flex flex-col md:flex-row md:items-end justify-between gap-6` — search input moves under title on mobile.
- Table: CSS grid **7 columns**:
  ```
  grid-cols-7
  ```
  Column-spans inside each row:
  - Timestamp: 1
  - Actor: 1
  - Table: 1
  - Field: 1
  - Transition: 2
  - Reference: 1 (right-aligned)

## 5. Gutters

- Header row gap: `gap-6` (24).
- Table header row `px-8 py-5`; data rows `px-8 py-6`; divided with `divide-y`.
- No internal gap on the 7-col grid — columns are evenly distributed; text cells have internal `gap-3` (12) for transition arrows.

## 6. Padding Inside Cards / Rows

- Filter input holder: `px-4 py-2` + `rounded-2xl` + `shadow-sm`.
- Table wrapper: `.glass-card rounded-[2.5rem] overflow-hidden`.
- Table header: `px-8 py-5` (32 / 20).
- Row body: `px-8 py-6` (32 / 24).
- Reference pill: `px-3 py-1 rounded-full border`.
- Transition arrow cell: inline chip layout — old value line-through, arrow icon, new value amber bold.

## 7. Vertical Spacing Between Sections

- `space-y-8` (32) between header, table, footer notice.
- Row spacing handled by `divide-y divide-zinc-50`.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| H1 `System Audit` | `text-4xl` (36) | 900 italic UPPER `tracking-tighter` |
| Header sub | default (16) | 500 muted |
| Search input | `text-sm` (14) | — |
| Table header labels | `text-[10px]` | 900 UPPER `tracking-[0.2em]` |
| Timestamp cell | `text-[11px]` | 700 muted |
| Actor name | `text-xs` (12) | 700 |
| Actor role | `text-[9px]` | 900 UPPER `tracking-widest` primary |
| Table name | `text-xs` (12) | 900 UPPER `tracking-widest` muted |
| Field name | `text-xs` (12) | 700 |
| Transition old | `text-xs` (12) | 500 muted line-through |
| Transition new | `text-xs` (12) | 900 UPPER amber |
| Reference pill | `text-[10px]` | 900 UPPER `tracking-widest` |
| Footer hint | `text-xs` (12) | 700 italic muted |

## 9. Breakpoint Behavior

- `md`: header row flips from stacked (`flex-col`) to side-by-side (`md:flex-row`) with title on the left and search on the right.
- No grid-column changes — the table keeps 7 columns at all widths (this can be cramped on `xs`; horizontal scroll is not provided).

## 10. Styling Nuances

- `.glass-card` styling comes from project-wide utility (see `shadcn/tailwind.css`). It gives a frosted white panel with soft border.
- Hover on data rows: `hover:bg-zinc-50 dark:hover:bg-zinc-900/30` with smooth color transition.

---

## 10. Route Classification

**workstation-only.** 7-column CSS grid table; intentional horizontal density. Not suited to phone; on tablet the last two columns may truncate.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell `<main>`.
- **Scroll owner**: two-axis � `<main>` scrolls vertically; the table region scrolls horizontally when the 7 columns overflow viewport width (`overflow-x: auto` on the table wrapper).
- **Sticky table header**: `<thead>` sticky to top of `<main>` pane so column labels stay visible while scrolling rows.
- **Long-text cells**: must truncate with ellipsis + tooltip; do not wrap (would break row height contract). See `19-implementation-safety.md � Tables`.
- **Empty / filtered-empty state**: row region renders single-row "no matching audit entries" message; header remains.