# 20 — Motion, Tone, Iconography, Chart Color Semantics

Governance for expressive layers. The product has three visual tones today; this file codifies them so future contributors don't flatten the difference.

---

## 1. Tone layers

| Tone | Used on | Visual language | Motion budget |
|---|---|---|---|
| **Brand / entry** | `/`, `/auth/staff` | Dark gradient, SVG grid overlay, generous type, persona dramatization | High — hover lift, orchestrated enter, parallax allowed |
| **Patient / care** | `/auth/patient`, `/patient/*` | Warm blue brand strip, light background, 44-px inputs, reassuring copy | Medium — fade / zoom on step change, no parallax, never surprise-pop |
| **Staff / operations** | All staff routes | Cool neutral background, dense cards, chips, tables | Low — mount fade-in only, no hover lift on functional cards, no motion on data change |

Rules:

1. A component that exists in multiple tones must **not** impose the brand tone globally. Local tone tokens (CSS vars for patient, MUI `C` for staff) apply.
2. Trust-heavy surfaces (`/operations/audit`, `/provider/case/[id]` decision rail, nurse validation checkpoint) use the Staff tone **only** — never brand motion.
3. The landing page and staff operations **must** feel distinguishable at a glance; if they ever look the same, one of them has drifted.

---

## 2. Motion budget

### 2.1 Allowed motions

| Motion | Duration | Easing | Scope |
|---|---|---|---|
| Mount fade | 180–220 ms | `ease-out` | Cards and lists |
| Step transition zoom (0.95 → 1) + fade | 200 ms | `ease-out` | Multi-step wizards (intake, MFA) |
| Persona card lift on hover | 150 ms | `ease-out` | `/` only |
| Sidebar collapse | 180 ms | `ease-in-out` | AppShell only |
| Toast enter | 160 ms | `ease-out` | Shell-level portal |
| Skeleton pulse | 1.2 s | `ease-in-out` | Loading only |

### 2.2 Forbidden motions

- Hover lift on data cards in staff workspaces.
- Pop-in on chart updates (data change must feel immediate).
- Full-page route transitions (we do not cover).
- Decorative framer-motion on `/nurse`, `/provider/case/[id]`, `/operations/audit`.

### 2.3 Reduced motion

All motions must gate on `@media (prefers-reduced-motion: reduce)` → replace with instant state or 0.1 s fade. See `19-implementation-safety.md § 7.5`.

---

## 3. Iconography

| Route family | Icon set | Stroke |
|---|---|---|
| Patient / auth | `lucide-react` (outline) | 1.5 px |
| Staff / workspace | MUI icons (filled) for functional, lucide (outline) for decorative | MUI default |
| Landing | either, but consistent per persona |

Rules:

1. Do not mix filled and outline icons **in the same row** — pick one per surface type.
2. Urgency / risk indicators use filled icons + semantic color from § 4.
3. Icon size tiers:
   - `icon-sm` 14 px — inside chips.
   - `icon-md` 18 px — inside buttons and dense rows.
   - `icon-lg` 22 px — card titles, primary actions.
   - `icon-hero` 32 px — landing persona cards.

---

## 4. Chart color semantics

Per reviewer: decorative series must not collide with risk/urgency semantics.

### 4.1 Reserved (do NOT use for decorative series)

| Semantic | Hex |
|---|---|
| Urgency high | `#C62828` |
| Urgency medium | `#E65100` |
| Urgency low | `#2E7D32` |
| Error / destructive | `#B91C1C` |
| Warning | `#B45309` |
| Success | `#2E7D32` |

### 4.2 Chart palette (ordered)

For neutral / trend series (use in this order):

1. `#1565C0` — primary blue
2. `#2E7D32` — only if no urgency-low coexists on the chart; otherwise skip to 3
3. `#0369A1` — secondary blue
4. `#6B7280` — neutral gray (always-safe)
5. `#9333EA` — accent purple
6. `#0F766E` — teal
7. `#374151` — deep neutral

### 4.3 Rules

- Pie / donut with risk breakdown: **must** use the reserved urgency colors in § 4.1.
- Line/area trend: **must not** use urgency colors unless it is literally the urgency metric.
- Categorical dimension (e.g. provider, channel): use § 4.2 in order.
- Every chart legend must be text + color; color-only legends are forbidden.
- Hover/focus: increase opacity; do not change hue.

---

## 5. Typography (semantic roles in use here)

See `00-design-system-foundations.md § 8.2` for the full role list. Summary roles used by surfaces in this file:

| Role | Where |
|---|---|
| `eyebrow` | Card eyebrows on all staff cards |
| `title-card` | Patient name, case title |
| `title-page` | Page titles (17–21 px responsive) |
| `kpi-numeral` | KPI numbers on dashboards |
| `micro` | Chip-sub-labels |

New pages **must** cite the role name, not the raw px.

---

## 6. Trust-heavy surfaces (calmer treatment)

These surfaces are "trust-heavy" — users rely on them for decisions. Visual treatment is deliberately calmer:

- `/operations/audit` — no decorative motion, no hover lift, monospace for IDs.
- `/provider/case/[id]` decision rail — buttons are rectangular (`r-control`), no gradient fills.
- `/nurse` validation checkpoint — single color per state, no animation on state change except a 120 ms fade.
- Patient consent in `/patient/intake` step 4 — no motion, larger type, no decorative iconography.

---

## 7. Surface role summary

| Surface | Tone | Motion budget | Icons | Chart palette |
|---|---|---|---|---|
| `/` landing | Brand | High | Mixed | n/a |
| `/auth/staff` | Brand | High | MUI | n/a |
| `/auth/patient`, `/patient/*` | Patient | Medium | Lucide | n/a |
| `/front-desk/*`, `/nurse`, `/provider/*` | Staff | Low | MUI | n/a (except KPIs) |
| `/operations/dashboard` | Staff | Low | MUI | § 4 |
| `/operations/audit` | Staff (trust-heavy) | Minimal | MUI | — |
