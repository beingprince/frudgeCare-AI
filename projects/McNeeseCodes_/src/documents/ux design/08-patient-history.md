# 08 — `/patient/history` (Medical History List)

Source: `apps/web/src/app/patient/history/page.tsx`. AppShell-bypassed.

---

## 1. Viewport / Frame Size

- No explicit `min-h-screen`; relies on parent (since the route is under `/patient`, it is bypassed from shell — the page occupies natural document height).

## 2. Max Content Width

- Outer: `max-w-4xl mx-auto` → **56 rem / 896 px**.

## 3. Left / Right Margins

- Outer: `py-8` (32) vertical.
- No explicit horizontal padding — relies on the viewport default / caller.

## 4. Grid Columns

- Single column, vertical card stack.

## 5. Gutters

- Page stack: `space-y-8` (32) between header row and list.
- List stack: `space-y-4` (16).

## 6. Padding Inside Cards

- Header icon: `w-12 h-12 rounded-2xl` (48 × 48, radius 16), `bg-zinc-100` container.
- Each history card (`.glass-card`): `p-6` (24), `rounded-[2rem]` (32).
- Inside card left cluster: `gap-6` (24).
- Record icon block: `w-14 h-14 rounded-2xl` (56, radius 16).

## 7. Vertical Spacing Between Sections

- Header row (icon + text): flex `gap-4` (16).
- Between records: `space-y-4` (16).
- Footer hint `pt-8 text-center`.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| H1 `Medical History` | `text-3xl` (30) | 700 italic UPPER `tracking-tight` |
| Header paragraph | default (16) | muted |
| Record ID eyebrow | `text-xs` (12) | 900 UPPER `tracking-widest` primary-colored |
| Record status | `text-xs` (12) | 700 UPPER `tracking-widest` |
| Record title | `text-xl` (20) | 700 |
| Record date | `text-sm` (14) | 500 |
| "Note" micro-label | `text-[10px]` | 900 UPPER |
| Footer italic hint | `text-sm` (14) | italic muted |

## 9. Breakpoint Behavior

- Pure mobile-first single column; no `sm/md/lg` changes.

## 10. Hover

- Record card hover: background to `zinc-50`, border turns `[#0F4C81]/20`, chevron fades from muted to primary.

---

## 10. Route Classification

**mobile-supported.** Readable narrative archetype; 896-px container; single-column list on all widths.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell-bypassed. `min-h-screen` flex-col.
- **Scroll owner**: `<body>`.
- **Contract**: glass-cards flow top-to-bottom; natural document scroll.
- **Long content**: unbounded � scroll grows with record count.