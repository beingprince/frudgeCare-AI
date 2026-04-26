# 97 — Component: AuthShell

Full-screen frame for `/auth/*` and `/sign-in` and `/patient/intake` landing. AppShell-bypassed.

---

## Two variants

| Variant | Routes | Tone |
|---|---|---|
| `auth/dark` | `/auth/staff`, `/auth/staff/[panel]` | Brand — dark gradient + SVG grid overlay |
| `auth/light` | `/auth/patient`, `/patient/intake` entry screens, `/sign-in` | Patient — light background, brand strip top |

---

## Anatomy

```
shell (min-h-screen, flex-col)
├── optional brand strip (top, 8–12 px, patient blue, full-width)
├── optional top bar (logo + switch-role link)
├── centered column (max-w-md or archetype-bound width)
│   ├── (optional) header block — logo + title + subtitle
│   ├── content card (`card/glass`, `r-feature` 40)
│   │   └── form or identity grid
│   └── footer link row — "Switch role", "Need help?"
└── optional fixed notice (bottom, e.g. demo env banner)
```

---

## Tokens

| Element | Auth/dark | Auth/light |
|---|---|---|
| Background | Dark radial gradient + SVG grid overlay at 4% opacity | `var(--background)` `#F1F5F9` |
| Text primary | white / 95% | `var(--foreground)` |
| Content card | glass-card (12% white, backdrop-blur) | `bg-[var(--card)]` |
| Card padding | 32 px | 32 px |
| Card radius | `r-feature` 40 | `r-feature` 40 |
| Card shadow | `elevated` + color-bleed | `sh-2` |
| Brand strip | — | 8 px solid patient blue |

---

## Layout rules

- `min-h-screen` with `flex items-center justify-center` — the card centers both axes on tall screens.
- On short screens, the card sticks to the top of its column with 24-px top margin (do not collapse vertical centering into overflow).
- Width: `max-w-md` (448) for login; `max-w-4xl` (896) for panel selector; `max-w-6xl` for persona selector.

---

## Motion

- Variant `auth/dark`: hero block may use entrance fade + 4-px up-translate; persona cards may hover-lift.
- Variant `auth/light`: entrance fade only; no hover-lift.
- Step transitions in `/auth/staff/[panel]` MFA: `animate-in fade-in zoom-in-95` at 200 ms.
- Respect `prefers-reduced-motion` per `20 § 2.3`.

---

## Demo notice

When rendered in demo environments, a fixed bottom notice:

- Height: 48 px + safe-area.
- Background: `neutral-900` with `neutral-50` text.
- Content: "Demo environment — no real PHI" + link.
- Body must reserve `pb-[64px]` so card is not obscured on short screens.

---

## Accessibility

- The card is the main landmark: wrap in `<main id="auth-main">`.
- Logo has visible text ("FrudgeCare") — not an image-only logo.
- OTP inputs: `autocomplete="one-time-code"`, `inputMode="numeric"`, `pattern="[0-9]*"`.
- Role-switch link at bottom: `<a>` with `aria-label="Switch to patient login"` (or staff).

---

## Forbidden

- Mixing `auth/dark` and `auth/light` tone inside the same card.
- Using AppShell sidebar on any `/auth/*` route.
- Primary CTA outside the card (must be inside).
- Background images that compete with the glass card.
