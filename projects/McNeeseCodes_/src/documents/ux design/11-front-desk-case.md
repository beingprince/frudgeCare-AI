# 11 — `/front-desk/case/[id]` (Case Triage & Urgency Override)

Source: `apps/web/src/app/front-desk/case/[id]/page.tsx`. MUI-first.

---

## 1. Viewport / Frame Size

- Outer Box: `height: "100%"; display: flex; flexDirection: column; bgcolor: C.background`.
- Header (non-scrolling) + scrollable body (`overflowY: auto`).

## 2. Max Content Width

- Body rail: `maxWidth: 1280; mx: "auto"; width: "100%"` → **1280 px**.

## 3. Left / Right Margins

- Header: `px: { xs: 2, sm: 3 }` (16/24), `py: 2` (16).
- Body: `p: { xs: 2, sm: 3 }` (16/24).

## 4. Grid Columns

Main body grid:

```
gridTemplateColumns: { xs: "1fr", lg: "1fr 360px" }
```
- Mobile / tablet: single column (cards stack).
- `lg` (≥ 1200 MUI): main content + **360 px** fixed sidebar.

Inside main/left column cards, inner grids:
- Patient card contact row: `{ xs: "1fr", sm: "1fr 1fr 1fr" }` (3 metadata cells from `sm`).
- Intake card foot row: `"1fr 1fr 1fr"` always (Duration / Severity / AI-Urgency).

Loading skeleton variant: `gridTemplateColumns: "1fr 360px"` (skipping the breakpoint for speed).

## 5. Gutters

- Body grid gap: `gap: 3` (24).
- Left column inner stack: `gap: 3` (24).
- Right sidebar stack: `gap: 3` (24).
- Card row gaps (contact grid): `gap: 2` (16).
- Chip rows: `gap: 0.75` (6) or `gap: 1` (8).

## 6. Padding Inside Cards / Forms

- Each `<Card>` uses `<CardContent sx={{ p: 2.5 }}>` — **20 px**.
- Intake highlighted box (AI Structured Summary): `px: 2, py: 1.5` (16 / 12) with `borderLeft: 3 solid primary`.
- Urgency choice rows: `px: 2, py: 1.5` (16 / 12), `borderRadius: "10px"`.
- Provider assignment rows: `px: 1.5, py: 1.25` (12 / 10), `borderRadius: "8px"`.
- Finalize button: `py: 1.5` (12).
- Header back-button icon: `p: 0.75` (6).

## 7. Vertical Spacing Between Sections

- Card heading (eyebrow) ↔ body: `mb: 1.5` (12) or `mb: 2` (16).
- Allergies / Risk flags panels use `mt: 2; pt: 2; borderTop` separators.
- Patient-card avatar row ↔ metadata grid: `mb: 2; pt: 1.5; borderTop`.
- Urgency sub-paragraph ↔ button list: `mb: 2` (16).

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| Breadcrumb link | 0.75 rem / 12 px | 500 |
| Page title | 1.1 rem / 17.6 px | 700 |
| Status chip | 0.625 rem / 10 px | 700 |
| Avatar initials | 1 rem / 16 px | 700 |
| Patient name | 1.05 rem / 17 px | 700 |
| Patient meta line | 0.688 rem / 11 px | — muted |
| LabelValue label | 0.563 rem / 9 px | 700 UPPER `+0.08em` |
| LabelValue value | 0.813 rem / 13 px | 500 |
| Card eyebrow | 0.625 rem / 10 px | 700 UPPER `+0.1em` |
| Intake main text | 0.938 rem / 15 px | 600 `lh 1.6` |
| AI summary box text | 0.813 rem / 13 px | `lh 1.6` |
| Urgency option title | 0.813 rem / 13 px | 700 |
| Urgency option desc | 0.625 rem / 10 px | `lh 1.4` |
| Provider name | 0.813 rem / 13 px | 600 |
| Provider dept | 0.563 rem / 9 px | — muted |
| Button (finalize) | theme default | 700 |
| Risk flag chip | 0.688 rem / 11 px | 600 |
| Allergy chip | 0.625 rem / 10 px | 600 |

## 9. Breakpoint Behavior

- `xs`: single column everywhere; contact meta row is a single column too.
- `sm`: contact meta becomes 3-col; body grid still single column.
- `lg` (MUI `lg` ≥ 1200): body grid becomes `1fr + 360px`.
- `xl` (≥ 1536): no further change.

## 10. Loading State

- On `loading`, shows a 1fr + 360px skeleton grid with 2 cards on each side of `Skeleton height={140}` / `180`.
- Skeleton inherits the card default 12 radius.

## 11. Interaction

- Urgency option: click → triggers audit log, optimistic state update, 2.5 s success chip animation.
- Saved banner appears inline in the header right-cluster.

---

## 10. Route Classification

**desktop-primary.** 1280-px bounded workspace; `1fr + 360 px` sidebar activates at MUI `lg` (1200 px). Below that, sidebar drops beneath main column.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell `<main>`.
- **Scroll owner**: **header-fixed + body-scroll** � case header is sticky, body column scrolls.
- **Two-column mode (lg+)**: main column and 360-px sidebar are **independent scroll panes** (each has its own `overflowY: auto`, `minHeight: 0`).
- **Urgency override**: opening the override panel must not jump body scroll; panel appears inline within its pane.
- **Long intake summary**: scrolls inside main column only; sidebar remains anchored.
- **Below lg**: sidebar appends to the main column flow; single scroll pane.