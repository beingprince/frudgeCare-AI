# 02 — `/` Landing (Persona Selector)

Source: `apps/web/src/app/page.tsx`. Rendered **inside** `AppShell` (but the shell content is non-scrolling, so the page provides its own `min-h-screen`).

---

## 1. Viewport / Frame Size

- Outer: `min-h-screen` (takes whole viewport height inside the flex-1 content box).
- `flex flex-col items-center justify-center` → centers content both axes.

## 2. Max Content Width

- Inner wrapper: `max-w-6xl w-full` → **72 rem / 1152 px**.

## 3. Left / Right Margins

- Outer page padding: `p-6 lg:p-12` → **24 px mobile, 48 px at lg**.
- Persona cards: each card has `p-8` (32 px) padding.

## 4. Grid Columns

Persona grid (L83):

```css
grid-cols-1  md:grid-cols-2  lg:grid-cols-4
```

| Breakpoint | Columns |
|---|---|
| `< md` (< 768) | 1 |
| `md` (≥ 768) | 2 |
| `lg` (≥ 1024) | 4 |

## 5. Gutters

- Persona grid gap: `gap-6` = **24 px**.
- Top banner → title → subtitle: `space-y-4` = **16 px**.
- Sections stack: `space-y-12` = **48 px** (hero → grid → footer).

## 6. Padding Inside Cards / Forms

- Persona card (`Link.glass-card`): `p-8` (32 px), rounded `[2.5rem]` (40 px).
- Inside card: `space-y-6` (24 px) between icon block, label block, arrow row.
- Icon block: `w-14 h-14` (56 × 56) with `rounded-2xl` (16 px).
- Decorative bottom-right circle: `w-24 h-24` (96 × 96), offset `-bottom-4 -right-4`.

## 7. Vertical Spacing Between Sections

- Hero header internal: `space-y-4` (16 px).
- Hero → card grid: `space-y-12` (48 px via parent).
- Card → footer: `pt-8` (32 px).
- Button cluster inside card: empty — the whole card is a single link.

## 8. Font Sizes / Line Heights

| Element | Size | Weight / Style |
|---|---|---|
| Badge pill `FrudgeCare AI Platform…` | `text-xs` (12) | 900 (`font-black`), UPPER, `tracking-widest` |
| Main H1 `Select your Persona` | `text-5xl` → `lg:text-7xl` (48 → 72) | 900 italic UPPER, `tracking-tighter` |
| Hero paragraph | default (`text-base` / 16) | 500 (`font-medium`), muted |
| Card role eyebrow | `text-xs` (12) | 900 UPPER, `tracking-widest`, zinc-400 |
| Card name (`John Miller`) | `text-xl` (20) | 700 |
| Card description | `text-xs` (12) | 500, `leading-relaxed`, muted |
| Footer strip | `text-[10px]` | 900 UPPER, `tracking-[0.3em]` |

## 9. Breakpoint Behavior

- `md`: persona grid splits from 1 → 2 columns.
- `lg`: persona grid → 4 columns, outer padding grows to 48 px, H1 to 7xl.
- No sidebar interaction on this route (it's inside shell, but shell is auto-collapsed on mobile via the `md` media query).

## 10. Motion

- Each element uses `framer-motion`: staggered `initial / animate` with `delay: 0.1 * i`.
- Card hover: `whileHover={{ y: -5 }}` + `group-hover:scale-110` on icon, `group-hover:translate-x-1` on arrow.

---

## 10. Route Classification

**desktop-primary.** Landing page is designed for 1024+ px; persona grid collapses cleanly to 1-col on mobile but hero dramatization targets desktop.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: inherits AppShell (`overflow: hidden` on root). 
- **Scroll owner**: the main content area (AppShell `<main>` with `overflowY: auto`).
- **Contract**: natural document scroll inside the shell's main pane. No nested scroll regions.
- **Long-content behavior**: persona grid wraps, page grows vertically, scrollbar appears in `<main>`, not on `<body>`.
- **< md**: same owner; sticky hero header is not used here.