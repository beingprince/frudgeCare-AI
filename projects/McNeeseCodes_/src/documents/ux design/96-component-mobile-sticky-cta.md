# 96 — Component: MobileStickyCTA

Fixed bottom action bar for patient-side mobile-first routes. Consumer surfaces: `/patient/intake`, `/patient/status`, `/auth/patient`.

---

## When to use

- Any route classified `mobile-first` that has a primary forward action.
- Never used on staff desktop-primary or workstation-only pages.

---

## Layout

```
bar (fixed, bottom 0, left 0, right 0)
├── safe-area bottom padding = env(safe-area-inset-bottom)
├── inner (flex-row, gap 12, padding 16)
│   ├── optional back button — 44 × 48, `r-control` 8
│   └── primary CTA — flex-1, height 48, `r-control` 8
```

- Height: **48 px** CTA + top padding 16 + safe-area.
- Total visible height: 48 + 16 + safe-area.
- Body must reserve this space: `pb-[80px]` at ≤ md (equivalent; adjust if safe-area ≥ 0).

---

## Visual

| Element | Token |
|---|---|
| Background | `bg-[var(--card)]` |
| Top border | 1 px `var(--border)` |
| Shadow | `0 -4px 16px rgba(15,23,42,0.06)` (upward) |
| CTA background | `primary` |
| CTA text | `primary-foreground`, role `button` 15 / 700 |
| CTA disabled | 50% opacity, no shadow |

---

## Behavior

- Visible only at `< md`; hide with `md:hidden`.
- At `md+`, the desktop equivalent lives in document flow (bottom-of-card action row).
- The CTA is always the primary action. A destructive / secondary is never primary here.
- The back button, when present, is to the **left**, icon-only (`ArrowLeft`), 44 × 48, `aria-label="Back"`.

---

## Interaction

- Disabled state persists when required form fields are incomplete; tapping the disabled CTA scrolls the first invalid field into view and focuses it.
- On submit: show inline spinner inside the CTA; do not swap to a new screen until the server confirms.

---

## Keyboard & iOS notes

- On iOS keyboard open, the fixed bar may be obscured by the keyboard. Accepted tradeoff; do not attempt to reposition (causes layout thrash).
- Focus ring on CTA: visible white inner ring when focused.
- Tab order: CTA comes **after** the form fields above it, never before.

---

## Accessibility

- Use `<nav role="region" aria-label="Primary actions">` wrapping the bar.
- Back button: `aria-label="Back"`.
- CTA: label is the verb (`"Continue"`, `"Submit intake"`), never just `"OK"`.

---

## Forbidden

- Two primary CTAs side-by-side.
- Secondary actions on the right (always left).
- Transparent or semi-transparent background — must be solid.
- Using on staff routes.
