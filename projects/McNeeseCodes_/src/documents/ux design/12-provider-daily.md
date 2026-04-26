# 12 — `/provider/daily` (Today's Encounter List)

Source: `apps/web/src/app/provider/daily/page.tsx`. MUI-first.

---

## 1. Viewport / Frame Size

- Outer Box: `height: "100%"; display: flex; flexDirection: column`.
- Header (fixed) + scrollable body (`overflowY: auto`).

## 2. Max Content Width

- Body rail: `maxWidth: 900; mx: "auto"` → **900 px** (narrower than 1280 — intentional single-column read).

## 3. Left / Right Margins

- Header: `px: { xs: 2, sm: 3 }`, `py: 2`.
- Body: `p: { xs: 2, sm: 3 }`.

## 4. Grid Columns

- Summary strip: `{ xs: "1fr", sm: "1fr 1fr 1fr" }` — 1 col mobile, 3 col `sm+`.
- Main appointment list: single column `display: flex; flexDirection: column`.

Inside each appointment card:
- Time column: fixed `width: 72`, `flexShrink: 0`.
- Content column: `flex: 1; minWidth: 0`.
- Chevron: auto width (24).

## 5. Gutters

- Body outer gap: `gap: 3` (24).
- Appointment list gap: `gap: 2` (16).
- Within appointment card: internal `gap: 2` (16) between time / content / chevron; `gap: 1.5` (12) within content; `gap: 1.25` (10) avatar-to-name.
- Summary strip gap: `gap: 2` (16).

## 6. Padding Inside Cards

- `<Card>` default radius 12 with override; `<CardContent>` = 20 px (`p: 2.5` on the summary cards set `py: "12px !important"`, `pl: 2.5` = 20).
- Appointment card content: default 20 px from theme.
- Chief-complaint box inside card: `px: 1.5; py: 1` (12 / 8) with `rounded-[8px]`.
- Time-column padding: `pr: 2` (16); border-right separation.

## 7. Vertical Spacing Between Sections

- Header ↔ body: 1 px border.
- Body gap: 24 between summary and list.
- Appointment cards: 16 between.
- Card internal: 1.5 (12) between header row, chief-complaint row, metadata row.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| Breadcrumb | 0.75 rem / 12 px | 500/600 |
| Page title | `{ xs: 1.1rem, sm: 1.3rem }` | 700 |
| Today chip | 0.688 rem / 11 px | 600 |
| Urgent chip | 0.688 rem / 11 px | 700 |
| Summary label | 0.563 rem / 9 px | 700 UPPER `+0.1em` |
| Summary value | 1.75 rem / 28 px | 800 `-0.03em` |
| Time (start) | 1 rem / 16 px | 800 `-0.02em` |
| Time (end) | 0.625 rem / 10 px | 600 muted |
| Patient name | 0.938 rem / 15 px | 700 `lh 1.3` |
| Patient meta | 0.625 rem / 10 px | 500 muted |
| Urgency pill | 0.563 rem / 9 px | 700 UPPER `+0.06em` |
| Chief-complaint label | 0.625 rem / 10 px | 700 UPPER `+0.08em` |
| Chief-complaint text | 0.813 rem / 13 px | clamped 2 lines |
| Location / case code | 0.688 rem / 11 px | — muted |
| Chronic chip | 0.563 rem / 9 px | 600 |

## 9. Breakpoint Behavior

- `xs`: summary 1 col; header padding 16.
- `sm`: summary 3 col; header padding 24.
- `md+`: same layout, body max-width 900 clamps content.

## 10. Interaction / Motion

- Cards are links (`component={Link}`) — hover raises `translateY(-1px)` + primary-tinted shadow.
- Cards fade-in with staggered `delay: index * 0.07`.
- Urgent cards: 3 px top border in `C.urgencyHigh` and pulsing 8 px red dot in time column.

---

## 10. Route Classification

**tablet-primary.** 900-px narrow list; usable on phone and desktop but optimized for tablet rounding review.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell `<main>`.
- **Scroll owner**: **header-fixed + body-scroll** � KPI summary row sits at top, card list scrolls beneath it.
- **Motion budget**: per-card motion fade-in only on mount; no layout animation on scroll.
- **Empty day state**: centered empty illustration inside body scroll pane; do not collapse pane height.