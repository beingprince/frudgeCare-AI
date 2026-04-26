# 06 — `/patient/intake` (4-step Intake Wizard)

Source: `apps/web/src/app/patient/intake/page.tsx`. AppShell-bypassed.

---

## 1. Viewport / Frame Size

- `min-h-screen bg-[#F1F5F9] text-slate-900 flex flex-col relative pb-[80px] md:pb-0`.
- `pb-[80px]` reserves space for the fixed mobile CTA bar so the last card is never hidden.

## 2. Max Content Width

- Stepper row: `max-w-[760px] w-full`.
- Content column: `w-full max-w-[760px] mx-auto` → **760 px**.
- Bottom action bar (desktop): `max-w-[760px] mx-auto`.

## 3. Left / Right Margins

- Stepper: `px-4` (16).
- Content: `p-4 md:py-8` (16 mobile → 32 vertical on md).
- Desktop action bar: `p-4` (16).
- Mobile sticky CTA: `p-4` (16).

## 4. Grid Columns

- Content form: **single column** with stacked form-group cards.
- Severity selector: `flex gap-1.5 h-[44px]` with **10 equal-flex buttons** (1 → 10).
- Preferences (Step 3) urgency buttons: `grid-cols-1 md:grid-cols-3 gap-3`.
- Review (Step 4) summary rows: `grid-cols-2 gap-4` inside each card.

## 5. Gutters

- Column stack: `flex flex-col gap-6` (24 between form-group cards).
- Step 3 urgency grid: `gap-3` (12).
- Step 4 summary rows: `grid-cols-2 gap-4` (16).
- Severity buttons: `gap-1.5` (6).

## 6. Padding Inside Cards / Forms

- Form-group card: `bg-white border border-slate-300 rounded-[16px] p-5 shadow-resting` — radius 16 px, padding 20 px.
- Inputs: `w-full h-[44px] px-3 rounded-[12px] text-[15px]`.
- Textareas: `min-h-[120px] p-3 rounded-[12px]`.
- Review cards: `p-5` with inner header divider (`pb-2 border-b`).
- Teal confirmation strip: `p-4 rounded-[16px]`.

## 7. Vertical Spacing Between Sections

- Sticky stepper bar height: **48 px**.
- Content container top padding: `p-4 md:py-8`.
- Form-group cards: `gap-6` (24).
- Review cards: `gap-6` (24).
- Title block to first card: `mb-2` below text, relies on parent gap.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| Stepper text (md+) | `text-[13px]` (13) | 600 |
| Step circle text | `text-[12px]` (12) | 700 |
| Section H1 | `text-[24px]` (24) | 700 `mb-2` |
| Section sub-paragraph | `text-[14px]` (14) | muted |
| Form label | `text-[15px]` (15) | 600 primary-colored |
| Input text | `text-[15px]` (15) | — |
| Severity current reading | default | 700 primary |
| Severity scale helper | `text-[12px]` (12) | 500 muted |
| Card header in Review | `text-[13px]` (13) | 700 UPPER `tracking-widest` |
| Summary label | `text-[12px]` (12) | muted |
| Summary value | default (16) | 600 |
| Teal callout text | `text-[14px]` (14) | — |
| Desktop primary button | `text-[15px]` (15) | 700 |
| Mobile sticky button | `text-[15px]` / `text-[16px]` | 700 |

## 9. Breakpoint Behavior

- `md` (≥ 768):
  - Desktop bottom action bar shown (`hidden md:flex`).
  - Mobile sticky CTA hidden (`md:hidden`).
  - Content container gets vertical breathing room `md:py-8`.
  - Step labels visible; step connector lines show (`hidden md:block`).
  - Step 3 urgency buttons become 3 columns.
- `lg`:
  - Stepper connector line widens from `w-8` to `w-16`.

## 10. Motion

- Step content wrapper uses Tailwind utility `animate-in fade-in zoom-in-95 duration-200`.
- No `framer-motion` on this page.

## 11. Fixed Dimensions

- All text inputs: fixed `h-[44px]`.
- Severity chips: `h-[44px]`, `flex-1` each (10 chips across ~760 px).
- Mobile sticky CTA: primary `h-[48px]`, back `w-[44px] h-[48px]`.

---

## 12. Route Classification

**mobile-first.** 4-step wizard tuned for phones � 44-px inputs, 10-chip severity row, 48-px mobile CTA.

## 13. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell-bypassed. Custom `min-h-screen` + `flex-col`.
- **Scroll owner**: `<body>`.
- **Fixed top**: sticky stepper bar (48 px).
- **Fixed bottom**: mobile CTA bar (48 px) visible at `< md`; `pb-[80px]` reserves space so card 4 is never hidden.
- **At md+**: mobile CTA is hidden; desktop bottom action bar is in document flow.
- **Per-step transitions**: use `animate-in fade-in zoom-in-95` utility � no height animation, so scroll position is preserved across steps.