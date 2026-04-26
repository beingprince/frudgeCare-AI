# 09 — `/front-desk/queue` (Queue Workspace)

Source: `apps/web/src/app/front-desk/queue/page.tsx`. Rendered inside AppShell.

---

## 1. Viewport / Frame Size

- Page box: `flex flex-col h-full bg-[#F1F5F9] pb-6 relative`.
- Works inside AppShell's flex-1 content area, so effectively `viewport_h - 64 header - any parent chrome`.

## 2. Max Content Width

- **None** — fluid full-width workspace.

## 3. Left / Right Margins

- KPI strip: `px-4 md:px-6 py-4`.
- Main workspace row: `px-4 md:px-6`.
- Same horizontal gutters as shell-native pages: **16 → 24 px**.

## 4. Grid Columns

Two grid tiers:

### KPI strip
`grid-cols-2 md:grid-cols-4 gap-4` — 2 columns mobile → 4 at `md`.

### Main workspace
`flex flex-col md:grid md:grid-cols-12 gap-6 min-h-0`.
- Queue panel: `md:col-span-7` (7 of 12).
- Detail panel: `md:col-span-5` (5 of 12).
- On mobile: stacks vertically with fixed heights `h-[500px]` and `min-h-[500px]`.

### Detail panel internals
- Patient basics + Scheduling preferences: `grid-cols-2 gap-4`.

## 5. Gutters

- KPI strip: `gap-4` (16) — no md-up bump.
- Workspace row: `gap-6` (24).
- Detail panel sub-grid: `gap-4` (16).
- Sticky filter row (`48 px`): horizontal internal `gap-4` (16) / `gap-3` (12).

## 6. Padding Inside Cards / Forms

- Queue panel container: `rounded-[16px] shadow-resting overflow-hidden`. No inner padding — children manage own spacing.
- Sticky filter bar: `h-[48px] bg-slate-50 border-b px-4`.
- Detail panel inner blocks (`ActionPanel` etc.): `p-4` (16) typically.
- AI brief inner: `p-4` (16) with `rounded-[12px]` (12).
- Sticky footer action bar: `p-4` (16) with `border-t` at top.

## 7. Vertical Spacing Between Sections

- KPI → workspace: `py-4` after KPI gives 16 px, then `gap-6` inside workspace is implicit once both lanes render.
- Inside detail panel: `mt-4 flex flex-col gap-4` below `CaseHeader` → (16 then 16 between panels).
- Detail-panel footer pinned with `pb-[80px]` reserve to prevent overlap.

## 8. Font Sizes / Line Heights

| Element | Size | Notes |
|---|---|---|
| KPI title | component-driven | see Cards component — typically `text-xs` UPPER |
| KPI value | 24–32 px | 800 |
| Table row | `text-[13px]` / dense-table default | — |
| Search input | `text-[13px]` | — |
| Filters link | `text-[13px]` | 500 |
| Status chip (compact) | `text-[11px]` | 700 UPPER |
| AI brief paragraph | `text-[14px]` | `leading-relaxed` |
| Patient basics label | `text-[13px]` | — muted |
| Patient basics value | `text-[13px]` | 500 |
| Footer action buttons | `text-[14px]` | 600 |

## 9. Breakpoint Behavior

- `< md`:
  - KPI becomes 2 cols.
  - Workspace stacks vertically (queue first, detail second) with fixed heights 500 px each.
  - Detail panel sticky action footer fixed to viewport (`fixed bottom-0`).
- `md+`:
  - KPI → 4 cols.
  - Workspace becomes 12-col with 7/5 split.
  - Sticky footer absolutely positioned within detail panel (`md:absolute`), not fixed.

## 10. Overflow & Scrolling

- Queue container has `overflow-hidden` plus inner `flex-1 overflow-auto` for scrollable table.
- Detail panel: `flex-1 overflow-auto pb-[80px]` so the sticky action bar never hides content.
- `min-h-0` is crucial on the grid to let inner scroll take over (fixes flex children blow-out).

## 11. Key Fixed Heights

- KPI row: implicit (based on KPICard).
- Sticky filter bar: **48 px**.
- Sticky action bar footer: 64–72 px (padding-based).
- Detail panel minimum: **500 px** mobile.

---

## 10. Route Classification

**desktop-primary.** Designed for = 1024 px; below `md` the 7/5 split collapses to stacked rails.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell `<main>` is `flex: 1; overflow: hidden; minHeight: 0`.
- **Scroll owner**: **pane-based** � queue table has its own scroll container; details rail has its own.
- **Required**: every child in the 12-col grid must set `minHeight: 0` (otherwise flex children refuse to shrink and the table clips).
- **Sticky header inside queue**: table `<thead>` is sticky at the top of its scroll pane.
- **At `< md`**: rails stack; scroll owner becomes `<main>` (single-column long page).
- **Empty state**: queue shows centered empty message inside its scroll pane; height does not collapse (fixed `min-h`).
- **Keyboard traversal**: focus order is queue ? row actions ? details rail; sticky thead must not trap Tab.