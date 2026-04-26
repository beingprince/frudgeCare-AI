# 90 — Component: Card

The most-reused surface in the app. Three variants, one contract.

---

## Variants

| Variant | Use | Padding | Radius | Shadow |
|---|---|---|---|---|
| `card/compact` | KPI cells, micro summary | 16 (`p-4` / `p: 2`) | `r-card` 12 | `resting` |
| `card/default` | Standard content card | 20 (`p-5`) | `r-card` 12 | `sh-1` |
| `card/feature` | Persona, landing, auth | 24 (`p-6`) | `r-feature` 40 (`[2.5rem]`) | `elevated` |
| `card/glass` | Auth/patient emotional framing | 32 (`p-8`) | `r-feature` 40 | `elevated` + subtle blur |

---

## Structure

```
card
├── (optional) eyebrow — role `eyebrow`, UPPER, 10 px
├── header row
│   ├── title — role `title-card`, 17 px, 600
│   └── optional action (icon button, right-aligned)
├── body
│   └── content
└── (optional) footer — divider above; buttons right-aligned, `gap: 1`
```

Rules:

- Eyebrow is optional but, if present, sits 8 px above the title.
- Header → body spacing is `mb-4` (16) when there is a title.
- Footer uses a 1-px top divider (`border-t`) with `pt-3`.
- Never nest `card/default` inside `card/default`. Use a flat inner region with `bg-surface-2` if sectioning is needed.

---

## Tokens

| Token | Value |
|---|---|
| Background | `bg-[var(--card)]` (patient scope) / `C.surface` (staff scope) |
| Border | `border border-[var(--border)]` / `C.border` |
| Radius | tier from § 00.11 |
| Padding | per variant |

---

## States

| State | Treatment |
|---|---|
| `hover` | Only on **interactive** cards (persona, navigable list items). Lift via `sh-2` + translate-y-0.5. Functional data cards **do not** hover. |
| `focus-visible` | 2-px ring inside the border. |
| `selected` | 1-px inner border at `primary`; background shift to surface-2. |
| `disabled` | Opacity 0.5; `cursor-not-allowed`. |
| `loading` | Skeleton replaces body region; header remains. |
| `error` | Red left border (3 px); inline error block inside body. |

---

## Accessibility

- If entire card is clickable, wrap in an `<a>` or `<button>`; do not set `onClick` on a `<div>`.
- Title is `<h3>` or `<h4>` semantically (pick per heading outline).
- Decorative icons: `aria-hidden`. Functional icons: labelled.

---

## Forbidden

- Inline `rounded-[16px]` — use `r-card` (12) or `r-feature` (40).
- Inline hex colors for background or border — use tokens.
- Mixing patient and staff tokens in one card.
- Hover lift on data/KPI cards (see `20-motion-and-tone.md § 2.2`).

---

## Consumer list

Used by: every staff page, `/patient/history` (glass variant), `/patient/status`, `/` landing (feature), `/auth/*` (glass).
