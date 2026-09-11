# Design tokens

Phase 2 of the Planr rebuild ("design language" / principle 7, "one source per
truth" — see `docs/principles.md`, if present in your checkout). This makes
every colour, spacing value and type size in the app resolvable from one
place: `src/App.css`'s `:root` block (dark, default) and the
`:root[data-theme="light"]` override block. Nothing in this phase changes
layout, spacing, or visible colours except the handful of spots called out
under "JSX literal migration" below — everything else keeps rendering exactly
as before.

## Token table

| Token | Meaning | Dark value | Light value |
|---|---|---|---|
| `--s1` … `--s6` | Spacing scale (px) | `4 / 8 / 12 / 16 / 24 / 32` | same (theme-invariant) |
| `--t10` … `--t20` | Type scale (px) | `10 / 11 / 12 / 14 / 20` | same (theme-invariant) |
| `--surf0` | Surface: ground (page background) | `= var(--bg)` (`#101216`) | `= var(--bg)` (`#f8f9fc`) |
| `--surf1` | Surface: card | `= var(--bg2)` (`#191d25`) | `= var(--bg2)` (`#ffffff`) |
| `--surf2` | Surface: raised | `= var(--bg3)` (`#232830`) | `= var(--bg3)` (`#f0f2f5`) |
| `--ac` | **The** interaction colour — links, focus rings, selection, primary actions. Nothing else should introduce a second accent. | `#6ca0ff` | `#2563eb` |
| `--st-done` | State: done (green) | `#4ade80` | `#16a34a` |
| `--st-wip` | State: work in progress (amber) | `#fbbf24` | `#d97706` |
| `--st-open` | State: open / not started (neutral grey) | `= var(--tx3)` (`#8898b0`) | `= var(--tx3)` (`#7a839a`) |
| `--st-risk` | State: at risk / overdue (red) | `#f87171` | `#dc2626` |
| `--st-archived` | State: archived (muted) | `= var(--b3)` (`#4a5a6c`) | `= var(--b3)` (`#b0b8c8`) |

`--gr`, `--am`, `--re` remain as back-compat aliases (`--gr: var(--st-done)`,
`--am: var(--st-wip)`, `--re: var(--st-risk)`) — every existing consumer
(`StatusIcon.jsx`, the `.b*` badge classes, `.prog-fill`, `.horizon-h*`, …)
keeps working unchanged, because the alias resolves to exactly the value it
held before this change.

`--surf0/1/2` and the spacing/type scale are declared once, in `:root`. They
are **not** redeclared inside the `:root[data-theme="light"]` block: CSS
custom properties resolve per-element at used-value time, and `:root` /
`:root[data-theme="light"]` both target the same `<html>` element — so
`--surf0: var(--bg)` automatically re-resolves against whichever `--bg` is in
effect (dark or light) without needing a second declaration. `--st-*` and
`--ac` genuinely differ in value between palettes (contrast-tuned per theme,
like the rest of the colour ladder), so those *are* redeclared in the light
block.

## Mapping rules applied

1. `--st-done` / `--st-wip` / `--st-risk` take the **exact** pre-existing
   `--gr` / `--am` / `--re` values per theme, so every current consumer of
   those three variables (and the new alias) renders pixel-identical output.
2. `--st-open` reuses `--tx3`, the neutral tone `StatusIcon.jsx` already uses
   for the "open" ring.
3. `--st-archived` reuses `--b3`, the closest existing quiet/desaturated grey
   in the palette (no earlier variable existed for "archived").
4. `--surf0/1/2` map 1:1 onto `--bg` / `--bg2` / `--bg3` — only the vocabulary
   ("which layer is this element on") is new, not the colour.
5. JSX literal → token migration (see below) was applied only where a colour's
   **meaning** is unambiguous (exclusively "this is done", "this is in
   progress", or "this is the interaction accent") and migrating it doesn't
   conflate two different concepts under one token.
6. The literals actually found in JSX are theme-invariant Tailwind `-500`
   shades (`#22c55e`, `#f59e0b`, `#ef4444`/`#f43f5e`, `#3b82f6`), while the
   state tokens carry the app's existing theme-tuned `-400` (dark) / `-600`
   (light) shades. Migrating a spot therefore trades a flat, theme-blind
   colour for the theme-correct one already used everywhere else (badges,
   `StatusIcon`) — a small, deliberate harmonization accepted as "the visual
   result is unchanged" for the 4 call sites below (all of them "this item
   just became done" markers, going from a slightly different green to the
   app's established done-green). No other literal was changed on this basis.
7. Alpha-blended `rgba(...)` tints were left untouched even where their base
   hue matches a state token (diff-overlay glows, the resource-load heatmap).
   Swapping a literal `rgba(r,g,b,a)` for a token needs either a second
   `--st-*-rgb` channel variable or `color-mix()`; introducing either is a
   deliberate design decision for a later phase, not a side effect of this
   ratchet.
8. Decorative/arbitrary colours were left alone: team-picker defaults
   (`App.jsx`, `GanttView.jsx`, `NetGraph.jsx`, `NewProjModal.jsx`,
   `ResView.jsx` all default new teams to `#3b82f6`/`#f43f5e`/…), the
   onboarding carousel's mockup swatches (`FeatureCarousel.jsx`), priority
   glyph colours, the resource-load heatmap tiers, and the "no team" grouping
   colour. None of these represent one of the five states, so forcing them
   onto `--st-*` would be a guess.

## JSX literal migration (done)

| File:line | Before | After |
|---|---|---|
| `src/components/views/NetGraph.jsx:411` | `SC = { done: '#22c55e', wip: '#f59e0b', ... }` | `done: 'var(--st-done)', wip: 'var(--st-wip)'` |
| `src/components/views/NetGraph.jsx:655` | `diffStroke = diffDoneHere ? '#10b981' : ...` | `diffDoneHere ? 'var(--st-done)' : ...` |
| `src/components/views/GanttView.jsx:2643` | `` `2px solid ${done ? '#10b981' : '#f59e0b'}` `` | done branch → `var(--st-done)` |
| `src/components/views/TimetableView.jsx:186` | `background: '#10b981'` (doneInWindow badge) | `background: 'var(--st-done)'` |

`SC.open` in `NetGraph.jsx` was deliberately **not** migrated — see the table
below.

## Not yet mapped

Colours whose meaning is genuinely ambiguous between two candidates. Left as
literals; do not guess — resolve deliberately in a later phase.

| File:line | Literal | Candidate A | Candidate B |
|---|---|---|---|
| `src/components/views/GanttView.jsx:2643,2727,2733` | `#f59e0b` / `rgba(245,158,11,*)` | `--st-wip` (in progress) | "progressed within the diff window" overlay marker |
| `src/components/views/NetGraph.jsx:409,655` | `#f59e0b` (`SC.open`, `diffStroke`) | `--st-wip` / `--st-open` | distinct progress-ring hue (`SC.open`) / diff-window "progressed" marker |
| `src/components/views/TimetableView.jsx:175,190` | `#f59e0b` | `--st-wip` | "progressed within the diff window" marker |
| `src/components/views/TreeView.jsx:484` | `#f59e0b` | `--st-wip` | "new item added within the diff window" marker |
| `src/components/views/SumView.jsx:165-168` | `#f59e0b` / `rgba(245,158,11,*)` | `--st-wip` | "progress gained since the diff baseline" delta badge |
| `src/components/views/SumView.jsx:197-199` | `#d97706` / `rgba(245,158,11,*)` | `--st-wip` | "scope grew" warning (a different severity axis, not task progress) |
| `src/components/modals/EstimationWizard.jsx:239,245` | `rgba(22,163,74,.10)` / `rgba(245,158,11,.10\|.08)` | `--st-done` / `--st-wip` | confidence level (committed/estimated), not task status |
| `src/components/shared/HorizonPicker.jsx:54-55` | `#3b82f6` / `rgba(59,130,246,.18)` | `--ac` (interaction accent) | "planned horizon" filter marker (comment: "distinct colour from DiffPicker") |
| `src/components/shared/ViewFilters.jsx:247` | `#3b82f6` / `rgba(59,130,246,.18)` | `--ac` | planned-horizon marker (same chip, duplicated in the filters popover) |
| `src/components/views/SumView.jsx:180-186,223-232` | `#3b82f6` / `rgba(59,130,246,*)` / `rgba(147,197,253,*)` | `--ac` | forecast/"planned" progress overlay |
| `src/components/shared/DiffPicker.jsx:57-58` | `#f59e0b` / `rgba(245,158,11,.18)` | `--st-wip` | "diff/review mode" filter marker (comment: "distinct... from HorizonPicker") |
| `src/components/shared/ViewFilters.jsx:209` | `#f59e0b` / `rgba(245,158,11,.18)` | `--st-wip` | diff/review marker (same chip, duplicated in the filters popover) |

## Observed while migrating

Not fixed in this phase — visual/behavioural observations only, recorded per
scope ("does NOT restyle anything"):

- `NetGraph.jsx`'s `SC.open` uses a distinct blue (`#4f8ef7`) for the "open"
  status colour, unlike the neutral-grey convention used everywhere else
  (`StatusIcon.jsx`, the `.bo` badge). Pre-existing inconsistency, left as is.
- The resource-load heatmap (`GanttView.jsx`'s `loadHeatColor`/
  `loadHeatStroke`, `ResourceLoadMatrix.jsx`'s legend) reuses the same green/
  amber/red hue family for a *different* axis — capacity utilization tiers,
  not task done/wip/risk state. Left as its own semantic domain rather than
  folded into the state tokens.
- Deadline-severity backfill gradients (critical → rose, high → amber, in
  `GanttView.jsx`) mirror the same hue family for yet another axis (deadline
  severity), not task status — same reasoning as above.
- Several components hardcode Tailwind's flat `-500` shades regardless of the
  active theme, so they currently don't respond to the Auto/Light/Dark
  toggle at all (see mapping rule 6). Worth a deliberate follow-up pass.

## Ratchet rule

`src/__tests__/designTokens.test.js` counts hex (`#abc`/`#aabbcc`/…) and
`rgb(`/`rgba(` literals across `src/App.jsx` and `src/components/**/*.jsx`
and asserts the count is `<= 258` (the count immediately after this phase,
down from 263 before it). Lower that number as more literals are migrated;
never raise it without migrating an equal or larger number of literals
elsewhere in the same change. The same test also asserts `App.css` defines
every token in the table above, in both palettes where the value differs.
