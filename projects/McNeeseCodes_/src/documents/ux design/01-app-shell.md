# 01 — App Shell (Sidebar + Top Header)

Source: `apps/web/src/components/common/AppShell.tsx`, `apps/web/src/app/layout.tsx`.

The shell wraps every route **except** `/auth/*` and `/patient/*` (see `BYPASS_PREFIXES`, L57).

---

## 1. Viewport / Frame Size

- Root: `<Box>` — `display: flex; height: 100vh; overflow: hidden; bgcolor: C.background` (L295).
- Two rigid columns: **Sidebar** (variable width) and **Main area** (`flex: 1; minWidth: 0; minHeight: 0`, L475-483). This pattern guarantees the inner content can safely use `overflow: auto` without collapsing.

## 2. Max Content Width

- **Shell itself has no max-width** — it fills the viewport 1:1.
- Inner page routes apply their own `maxWidth` inside the flex:1 content area.

## 3. Left / Right Margins

The shell does not inject horizontal margin. It only controls:

- Sidebar inner padding (icon items): `mx: 1` (8), `px: collapsed ? 0 : 1.5` (0 or 12) (L155-157).
- Header outer padding: `px: { xs: 2, sm: 3 }` → **16 px mobile, 24 px tablet+** (L493).
- Header internal gaps: `gap: 2` (16) (L494).

## 4. Grid Columns

The shell is **flex-based**, not grid-based. Only four structural elements:

1. Sidebar — fixed width (72 / 240) with `flexShrink: 0` (L310).
2. Main content wrapper — `flex: 1`.
3. Inside main: stacked flex (`flexDirection: column`): header row + page box.
4. Header is itself a flex row with `flex: 1` search + spacer + right-side utility cluster.

## 5. Gutters

- Header → content: no gap (they share borders).
- Header right-cluster: `gap: 1.5` (12) between icon buttons (L185-188).
- Avatar block: `gap: 1.25` (10) between avatar + name.
- Sidebar nav items: `Stack spacing={0.5}` = 4 px vertical between items.

## 6. Padding Inside Header / Sidebar

| Region | Padding | Height |
|---|---|---|
| Top header | `px: { xs: 2, sm: 3 }` | `HEADER_HEIGHT = 64 px` |
| Logo row | `px: 2.5` if expanded, `0` if collapsed; `pr: 4` extra right | `64 px` |
| Nav area | `py: 1.5` (12 top/bottom) | flex-grows |
| Bottom nav block | `borderTop`, `py: 1.5` | auto |
| Search bar | `px: 1.5; py: 0.75` (12 / 6) | auto (inputBase) |
| Icon button wraps | `p: 1` (8) | 36–40 px |
| User avatar block | `p: 0.75` (6); `gap: 1.25` | 48 px container |
| User-card (expanded) | `mx: 1; p: 1.5` | auto |

## 7. Vertical Spacing Between Sections

The shell is a **non-scrolling frame**; internal vertical stacking uses `flex` rather than margin.

- Logo block sits directly above the nav list with only a `1px` border divider.
- Bottom block is pinned (`flex: 1` on the middle list pushes it).
- Collapse toggle button is absolutely positioned: `right: -12; top: HEADER_HEIGHT/2 - 12` (L451-452).

## 8. Font Sizes / Line Heights

| Element | Size | Weight |
|---|---|---|
| Logo wordmark `FrudgeCare` | 0.938 rem / 15 px | 800 |
| Logo sub-label `Clinical AI Platform` | 0.563 rem / 9 px | 600, +0.08em upper |
| Nav item label | 0.813 rem / 13 px | 500 (600 active) |
| Nav badge | 0.563 rem / 9 px | 700 |
| Search placeholder | 0.813 rem / 13 px | — |
| `⌘K` chip | 0.625 rem / 10 px | 600 |
| Demo pill (top-right) | 0.75 rem / 12 px | 600 |
| User name (header) | 0.813 rem / 13 px | 600, lh 1.2 |
| User subtitle (header) | 0.625 rem / 10 px | 400 |
| Menu list name | 0.813 rem / 13 px | 600 |
| Menu list subtitle | 0.625 rem / 10 px | 400 |

## 9. Breakpoint Behavior

Shell-specific constants (L50-52):
- `SIDEBAR_COLLAPSED = 72`
- `SIDEBAR_EXPANDED  = 240`
- `HEADER_HEIGHT     = 64`

Responsive rules:

- **`< md` (MUI `md`, < 900 px)** — detected via `useMediaQuery(muiTheme.breakpoints.down("md"))`.
  - `sidebarCollapsed` is forced true (`useEffect`, L261-263).
  - Sidebar width animates to **0** (see `animate={{ width: isMobile ? 0 : sideWidth }}` L301).
  - Hamburger button shown in header (L500-508).
  - Avatar label cluster hidden: `display: { xs: "none", sm: "block" }` (L686, L694).
  - Header outer gutter collapses from 24 → 16 px.

- **`md+`**
  - Sidebar visible, collapsed by default (72 px).
  - Collapse toggle button shown (L445).
  - User label visible beside avatar.
  - Search bar capped to `maxWidth: 320`.

- **`/auth/*` or `/patient/*`**
  - Entire shell is bypassed; the page renders `<>{children}</>` (L286-287).

## 10. Animation & Micro-interactions

- Sidebar width: `framer-motion` tween, `duration: 0.22, ease: "easeInOut"` (L302).
- Nav label in/out: `framer-motion` opacity + x slide, `duration: 0.15` (L213-216).
- Nav hover: background tint via `alpha(C.primary, 0.06)`, `transition: all 0.18s ease`.
- Demo pill: pulsing dot `@keyframes pulse` 2 s ease-in-out infinite (L577-581).
- Active nav item stripe: 3 × 20 px pill on the left edge (L174-185).

## 11. Z-index Layering

- Sidebar: `zIndex: 100`
- Header: `zIndex: 50`
- Collapse toggle button: `zIndex: 10` (inside sidebar)
- Sticky page footers (queue/case): `z-50`
