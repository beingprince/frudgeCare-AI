# 14 — `/nurse` (Nurse Triage Workspace)

Source: `apps/web/src/app/nurse/page.tsx`.

---

## 1. Viewport / Frame Size

- `flex flex-col h-full bg-[#F1F5F9] pb-6`.
- Fits AppShell's content flex-1 area.

## 2. Max Content Width

- **None** — full-width 12-col workspace.

## 3. Left / Right Margins

- Page header row: `px-4 md:px-6 py-4`.
- Main grid: `px-4 md:px-6`.
- Matches the shell's `16 → 24 px` gutter convention.

## 4. Grid Columns

Main workspace: `flex flex-col md:grid md:grid-cols-12 gap-6`:

- Left rail (patient snapshot): `md:col-span-3` (3 / 12).
- Center (questionnaire + validation): `md:col-span-6` (6 / 12).
- Right rail (active findings / actions): `md:col-span-3` (3 / 12).

Inside questionnaire card, multiple 2-col rows:
- `grid-cols-1 md:grid-cols-2 gap-4` for field pairs.

## 5. Gutters

- Main 12-col: `gap-6` (24).
- Questionnaire sub-grid: `gap-4` (16).
- Center column vertical stack: `gap-4` (16).
- Validation panel chip group: `space-y-4` (16) between field rows.

## 6. Padding Inside Cards

- AI Draft Intake Brief (amber): `p-5` (20), `rounded-[16px]` (16), left-accent 4 px bar via absolute overlay.
- Questionnaire card: `p-5` (20), `rounded-[16px]`, left-accent 4 px teal.
- Inner inner-content box: white/60 `p-4 rounded-lg`.
- Input fields: `h-[40px] px-3 rounded-[8px]`.
- Textarea: `min-h-[100px] p-3 rounded-[8px]`.
- Validation checkpoint: `p-5 rounded-[16px]` with left-aligned icon (`w-6 h-6`).
- Right-rail panel uses shared `<ActionPanel title isSticky>` — typically `p-4`.

## 7. Vertical Spacing Between Sections

- Questionnaire rows: `space-y-4` (16) implicit via flex gap.
- Between cards in center column: `gap-4` (16).
- Validation button cluster: `mt-2` (8) between primary and secondary.

## 8. Font Sizes / Line Heights

| Element | Size | Style |
|---|---|---|
| AI brief title | `text-[18px]` (18) | 600 amber-900 |
| AI brief chip | `text-[11px]` (11) | 700 UPPER |
| AI brief body | `text-[14px]` (14) | `leading-relaxed` |
| Questionnaire H2 | `text-[18px]` (18) | 600 |
| Draft chip | `text-[12px]` (12) | 500 amber |
| Field label | `text-[13px]` (13) | 700 |
| Input text | `text-[14px]` (14) | (base size via `text-[14px]`) |
| Red-flag checkbox row | `text-[13px]` | — |
| Validation H3 | `text-[16px]` (16) | 600 |
| Validation body | `text-[13px]` (13) | — |
| Validation success chip | `text-[14px]` | 700 |
| Validation button | `text-[14px]` | 600 |
| Findings error pill | `text-[13px]` | 600 |
| Findings body text | `text-[12px]` | — |
| Handoff status label | `text-[12px]` | 600 UPPER tracked |
| Handoff status value | `text-[13px]` | 700 |
| Primary send button | `text-[14px]` | 600, `h-[44px]` |

## 9. Breakpoint Behavior

- `< md`:
  - Whole workspace collapses to single column with `overflow-y-auto` on the page, rails stack top-to-bottom.
  - Each rail has `h-auto`.
- `md+`:
  - 12-column grid activates (3 / 6 / 3).
  - Each column uses `md:overflow-y-auto` independently so the page frame doesn't scroll.
  - `md:overflow-hidden` is implied by the parent flex with `min-h-0`.
- Questionnaire 2-col activation also at `md`.

## 10. Depth

- Both AI brief and questionnaire cards: `shadow-resting`.
- Primary send button: `shadow-md` when active.

---

## 10. Route Classification

**desktop-primary.** 12-col workspace (3/6/3) at Tailwind `md` (768 px). Stacks below that.

## 11. Scroll Owner / Overflow Contract

- **Outer frame**: AppShell `<main>`.
- **Scroll owner**: **pane-based** � patient summary (left), questionnaire (center), findings/actions (right) each own `overflowY: auto` with `minHeight: 0`.
- **Required**: validation-checkpoint banner and primary handoff CTA live in the right rail; both must remain visible when the right pane scrolls (CTA is sticky inside the right rail, not inside `<main>`).
- **Long questionnaire**: center pane scrolls; left/right rails remain in place.
- **Breakpoint caveat**: Tailwind `md:grid-cols-12` activates at 768 px but any MUI-styled chip rows inside still respect MUI `md` at 900 px � known drift, see `21-known-design-debt.md`.
- **Empty findings state**: right rail shows empty message with fixed height; does not collapse.