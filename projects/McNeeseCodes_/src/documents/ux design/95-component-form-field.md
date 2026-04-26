# 95 — Component: FormField

Label + input + helper + error, governed. Consumer surfaces: `/patient/intake`, `/settings`, `/nurse`, `/auth/*`.

---

## Anatomy

```
field (flex-col, gap 8)
├── label — role `body-emph` 15 / 600, color `primary-*`
│   └── optional required-mark "*" at end, color `destructive`
├── control (input / select / textarea / custom)
├── helper (optional) — role `meta` 12, color `muted-foreground`
└── error (slot, replaces helper) — role `meta` 12, color `destructive`
```

Label → control: 8 px. Control → helper/error: 6 px.

---

## Control heights

| Family | Height | Padding-x | Radius | Role |
|---|---|---|---|---|
| Staff desktop input | 40 | `px-3` (12) | `r-control` 8 | `body-default` 14 |
| Staff desktop select | 40 | `px-3` | `r-control` 8 | — |
| Patient mobile input | **44** | `px-3` | `r-control` 12 | `body-emph` 15 |
| Textarea (any) | min 96 | `p-3` | `r-control` 12 | `body-default` 14 |
| Primary CTA | 48 | `px-4` | `r-control` 8 | `button` 13 / 700 |

Never use heights outside this table on inputs (inputs of 36 px, 42 px, etc. — forbidden).

---

## States

| State | Border | Background | Notes |
|---|---|---|---|
| `default` | `C.border` | `C.surface` | — |
| `hover` | `C.border-strong` | — | Only on interactive (not read-only) |
| `focus-visible` | 2-px `primary` ring (outside border) | — | Ring must be visible, never `outline: none` only |
| `filled` | `C.border` | — | Same as default; value just present |
| `invalid` | `destructive` 1 px | tinted destructive at 4% | Pair with error slot |
| `disabled` | `C.border` | `C.surface-2` | Opacity 0.6; `cursor-not-allowed` |
| `read-only` | `C.border` | `C.surface-2` | No focus ring; selectable text |

---

## Labels

- Labels always sit **above** the control (never floating-inside).
- Label copy uses sentence case, no trailing colon.
- Required fields: label ends with `*` in destructive color; also `aria-required="true"`.
- Optional hint in parentheses: `(optional)` at label end, muted.

---

## Helper & error

- Helper text sits below. It is replaced (not appended) by error when invalid.
- Error text is 12 px, destructive color, starts with a concrete action ("Enter a valid MRN", not "Invalid").
- Error slot renders at the same height whether present or not (reserve 16 px) to prevent layout jump.

---

## Special fields

| Variant | Rule |
|---|---|
| **Severity slider (1–10)** | 10 equal-flex chips, 44 px tall, `r-control` 12, active chip uses `primary` fill. See `/patient/intake` step 1. |
| **Numeric** | `inputMode="numeric"` on mobile; desktop accepts arrows. |
| **Date** | Native `<input type="date">` on mobile; desktop may use styled picker. |
| **Phone** | `inputMode="tel"`; format on blur, not while typing. |
| **Password / OTP** | Monospace font variant; each OTP cell is a 48 × 48 square, `r-control` 8. |
| **Toggle** | 40 × 24 pill; label to the left; helper below as normal. |

---

## Accessibility

- Every field has a `<label htmlFor>` or wraps the control in `<label>`.
- Errors use `aria-describedby` pointing to the error id.
- `aria-invalid="true"` when invalid.
- Read-only fields use `readOnly` attribute + aria role unchanged.
- Focus ring must be visible — do not remove `outline` without a replacement ring.

---

## Forbidden

- Floating labels (not used in this product).
- Placeholder-as-label (placeholder is a hint, never a replacement).
- Error message to the right of the control.
- Input heights outside the tier table.
- Error color used only with no icon or text (must have text).
