# 94 — Component: CaseTimeline

Vertical activity feed for case history and patient status. Consumer surfaces: `/patient/status`, `/provider/case/[id]`, `/operations/audit` (detail view).

---

## Anatomy

```
timeline (flex-col, gap 0)
└── entry (flex-row, 16 px gap)
    ├── rail (24 px wide)
    │   ├── dot (10 × 10, circular, color per entry kind)
    │   └── vertical line (1 px, `C.border`, fills remaining height)
    └── content
        ├── meta row — role `meta` 11 px: timestamp · actor · action
        ├── title — role `body-emph` 15 / 600
        └── body — role `body-default`, truncated at `line-clamp-3`
            └── "Read more" (inline expander)
```

---

## Entry kinds

| Kind | Dot color | Icon in dot |
|---|---|---|
| `system` | `neutral-500` | cog |
| `patient` | `primary` | user |
| `front-desk` | `blue-600` | clipboard |
| `nurse` | `amber-600` | stethoscope |
| `provider` | `emerald-700` | user-md |
| `operations` | `purple-600` | shield |
| `ai` | `indigo-600` | sparkles |

Kinds map to the role palette from `20 § 3` where applicable.

---

## Spacing

| Element | Size |
|---|---|
| Entry → entry | 16 px padding (no gap; visual gap is inside the entry) |
| Dot → line offset | Dot vertical-centered on first line of content |
| Content left offset | 40 px (24 rail + 16 gap) |

---

## Expansion

- Long entries clamp at 3 lines; "Read more" expands **inline** (no modal).
- Expand state is per-entry; persisted only within page session.
- Expanded entry auto-scrolls the entry into view within its scroll pane.

---

## Filtering

When consumer provides a filter (e.g. "nurse only"):

- Non-matching entries do not render at all (do not grey out — would break the vertical line).
- Filter chip row sits above the timeline; see `93-component-status-chip.md` interactive variant.
- Filtered-empty state: "No <filter> entries yet" + clear-filter action.

---

## States

| State | Treatment |
|---|---|
| Loading | 4 skeleton entries (rail + 3 body lines). |
| Empty | Centered small illustration + "No activity yet". |
| Error | "Couldn't load activity — retry". |

---

## Accessibility

- Each entry is an `<article>` (not `<li>`, unless inside an `<ol>`); timestamp is a `<time datetime=…>`.
- Expand toggle is a `<button aria-expanded>`.
- Rail (dot + line) is decorative; `aria-hidden`.

---

## Forbidden

- Horizontal timeline variant (out of scope in current product).
- Animating entry insertion beyond 160 ms fade.
- Icons mixing filled and outline in the same timeline (pick per consumer page; see `20 § 3`).
