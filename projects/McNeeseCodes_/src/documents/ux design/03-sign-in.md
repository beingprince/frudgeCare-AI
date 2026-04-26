# 03 — `/sign-in` (Demo Identity Selector)

Source: `apps/web/src/app/sign-in/page.tsx`. Not AppShell-bypassed explicitly, but the route starts with `/sign-in` which is NOT in `BYPASS_PREFIXES`; however this route is written with its own full-height background, so when shown inside the shell it will sit inside the flex-1 content box.

---

## 1. Viewport / Frame Size

- Outer: `min-h-screen`, `flex items-center justify-center`.
- Background: `bg-zinc-50` light / `bg-black` dark.

## 2. Max Content Width

- Inner column: `max-w-md w-full` → **28 rem / 448 px**.

## 3. Left / Right Margins

- Outer padding: `p-6` (24 px all sides).
- Card inner: `p-10` (40 px).

## 4. Grid Columns

- Demo-user list: `grid grid-cols-1 gap-3` — single column, 12 px row gap.

## 5. Gutters

- Column stack spacing: `space-y-10` (40 px) between title block and card.
- Card interior: `space-y-8` (32 px) between identity list, divider, and HHS footer.
- Inside identity-list group: `space-y-4` (16 px) title → list.

## 6. Padding Inside Cards / Forms

- Card (`glass-card`) rounded `[2.5rem]` (40 px), `p-10` (40 px).
- Each user button: `p-4` (16 px), rounded `2xl` (16 px).
- Icon square: `w-10 h-10` (40 × 40), `rounded-xl` (12).
- Dividing line uses two absolute spans (border + floating tag).

## 7. Vertical Spacing Between Sections

- Title ↔ card: `space-y-10` (40 px).
- Inside card, major sections: `space-y-8` (32 px).
- Name ↔ label inside each user row: `leading-tight` close pack.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| Wordmark `Frudge/Care` | `text-4xl` (36) | 900 italic UPPER, `tracking-tighter`, `leading-none` |
| Tagline | default | 500 italic, muted |
| Identity eyebrow | `text-[10px]` | 900 UPPER, `tracking-[0.3em]` |
| User name | `text-sm` (14) | 700, `leading-tight` |
| User label (pill text) | `text-[9px]` | 900 UPPER, `tracking-widest` |
| Divider label `ADMIN` | `text-[10px]` | 900 UPPER, `tracking-[0.3em]` |
| HHS notice | `text-[10px]` | 700 UPPER, `tracking-widest` |

## 9. Breakpoint Behavior

- The page is responsive mainly via `max-w-md` clamp — no explicit breakpoint rules.
- Works identically across all viewports ≥ ~360 px.

---

## 10. Route Classification

**mobile-supported.** 448 px centered column, works on phone but presented inside the staff shell.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell (`overflow: hidden`).
- **Scroll owner**: AppShell `<main>` pane.
- **Contract**: single-column `max-w-md` content; scrolls inside `<main>` when viewport is shorter than content.
- **Focus / sticky**: none. Identity cards are in document flow.