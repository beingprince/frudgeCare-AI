# 15 — `/operations/dashboard` (KPI Analytics)

Source: `apps/web/src/app/operations/dashboard/page.tsx`.

---

## 1. Viewport / Frame Size

- `flex flex-col h-full bg-[#F1F5F9] pb-8 overflow-y-auto` — **this is one of the few pages that scrolls at the page level** (not pane-based).

## 2. Max Content Width

- **None** — full-width analytics grid.

## 3. Left / Right Margins

- Header: `px-4 md:px-6 py-4 md:py-5`.
- Main grid: `px-4 md:px-6 mt-4 md:mt-6`.

## 4. Grid Columns

Main grid: `flex flex-col md:grid md:grid-cols-12 gap-4 md:gap-6 min-h-0`.

Row breakdown:

| Block | Mobile | `md` | `lg` |
|---|---|---|---|
| KPI row | 1/2/4 (grid-cols-1 sm:2 lg:4) | col-span-12 | col-span-12 (inner 4-col) |
| Patient Throughput Funnel | full | `md:col-span-6` | 6 |
| Active Bottlenecks | full | `md:col-span-6` | 6 |
| Response Time Trend | full | `md:col-span-12` | `lg:col-span-8` |
| Provider Load (pie) | full | `md:col-span-12` | `lg:col-span-4` |
| Scheduling Quality | full | `md:col-span-6` | 6 |
| AI Audit Highlights | full | `md:col-span-6` | 6 |

KPI row inner grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6`.

Audit highlights table row: `grid-cols-12 gap-2` with 8/2/2 layout.

## 5. Gutters

- Main grid gap: `gap-4 md:gap-6` (16 → 24).
- KPI row: same.
- Internal card sections: `gap-3` (12) between bottleneck rows, `gap-6` (24) between progress bar blocks.

## 6. Padding Inside Cards

- KPI card: component-driven via `<KPICard>`.
- Chart cards: `p-5` (20) or `p-4 md:p-5` for the response time trend.
- Card radius: `rounded-[16px]` (16).
- Card border: `border-slate-300`, `shadow-resting`.
- Bottleneck row: `p-3` (12) with rounded-lg (8) and hover tint.
- Audit row: `p-3` (12), grid 12 cols.
- Audit header row: `p-2` (8) with slate-50 bg.

## 7. Vertical Spacing Between Sections

- Header ↔ grid: `mt-4 md:mt-6` (16 → 24).
- Grid gaps: 16 / 24.
- Card internal `mb-4` (16) between H2 and body chart.
- Progress bar block internal `mb-1` (4) label → bar.
- `pb-8` (32) page bottom safe area.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| H1 | `text-[20px] md:text-[22px]` | 700 |
| Header sub | `text-[12px] md:text-[13px]` | muted |
| Filter chip | `text-[13px]` | 500 |
| Card H2 | `text-[15px]` | 600 |
| Funnel axis ticks | 12–13 | — |
| Bottleneck count pill | — | 700 primary |
| Bottleneck stage | default | 500 |
| Trend indicator | `text-[13px]` | 600 |
| "View full report" CTA | `text-sm` | 600 |
| Chart legend labels | `text-[12px]` | — |
| Pie center number | `text-[24px]` (24) | 700 |
| Pie center label | `text-[11px]` | 600 UPPER tracked |
| Scheduling progress label | `text-[13px]` | 500 |
| Scheduling %  | default | 700 |
| Audit table header | `text-[12px]` | 700 UPPER |
| Audit rule text | `text-[13px]` | 500 |
| Audit count value | default | 700 |
| Audit risk chip | `text-[11px]` | 700 |

## 9. Breakpoint Behavior

- `< sm`: all widgets single-col; KPI cards stack 1-per-row.
- `sm`: KPI cards become 2-col.
- `md` (≥ 768):
  - Main grid activates at 12-col.
  - Funnel/Bottlenecks become 6/6.
  - Scheduling/Audit become 6/6.
  - Response trend takes col-span-12.
- `lg` (≥ 1024):
  - KPI → 4-col.
  - Response trend / Pie become 8/4.

## 10. Fixed Heights

- KPI row: no fixed height (content-driven).
- Chart cards: `min-h-[300px] md:h-[320px]` (ensures consistent chart area).
- Response trend / Pie: `h-[300px] md:h-[320px]`.
- Scheduling / Audit: `h-auto md:h-[280px]`.

## 11. Colors in Data-Viz

`METRICS_COLORS = ['#0F4C81', '#0F766E', '#64748B', '#F59E0B']` — reused for pie + KPI accents.

- Funnel bars: primary `#0F4C81`.
- Trend area (provider): primary `#0F4C81` with gradient 0.2 → 0.
- Trend area (triage): teal `#0F766E`.
- Scheduling bars: `bg-emerald-500`, `bg-amber-500`, `bg-red-500`.

---

## 10. Route Classification

**desktop-primary.** Analytics archetype; 12-col grid with KPI + charts. Collapses to 1-col on mobile (readable but information-dense).

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell `<main>`.
- **Scroll owner**: **whole-page scroll** � `<main>` scrolls; nothing inside is independently scrollable.
- **Rationale**: dashboards are report-style; independent pane scroll breaks chart legibility when users scroll to compare widgets.
- **Chart containers**: each chart uses `ResponsiveContainer` and must have a fixed height (300�340 px). Do not set `h-full` on chart cards or they will collapse.
- **Filter scope**: (see `19-implementation-safety.md � Dashboard governance`) � any filter control in the header must clearly indicate whether it scopes the whole dashboard or a single widget.
- **Empty-data state**: every chart card must render a placeholder (not a collapsed `0 px` box).