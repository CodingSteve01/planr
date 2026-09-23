# Design tokens

Phase 2 of the Planr rebuild — see [principles.md](principles.md), "Design
language" and principle 7 "One source per truth". This makes
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
| `--surf0` | Surface: ground (page background) | `= var(--bg)` (`#141310`) | `= var(--bg)` (`#fafaf8`) |
| `--surf1` | Surface: card | `= var(--bg2)` (`#1c1b17`) | `= var(--bg2)` (`#ffffff`) |
| `--surf2` | Surface: raised | `= var(--bg3)` (`#21201b`) | `= var(--bg3)` (`#f1efea`) |
| `--ac` | **The** interaction colour — links, focus rings, selection, primary actions. Nothing else should introduce a second accent. | `#7eb3e0` | `#2b5c8a` |
| `--ac-soft` | Tinted ground for the accent: selected rows, `.chip.on`, selection counts | `#1b2a38` | `#eaf0f6` |
| `--st-done` | State: done (green) | `#6fbf8a` | `#357049` |
| `--st-wip` | State: work in progress (amber) | `#d9a050` | `#8a5a1a` |
| `--st-open` | State: open / not started (neutral grey) | `= var(--tx3)` (`#8f8c82`) | `= var(--tx3)` (`#6a6861`) |
| `--st-open-ring` | The ring of an **empty** status dot — one step stronger than `--b`, or "offen" is invisible in the dark | `= var(--b3)` (`#504e45`) | `= var(--b2)` (`#d5d2ca`) |
| `--st-risk` | State: at risk / overdue (red) | `#e08276` | `#a8443a` |
| `--st-archived` | State: archived (muted) | `= var(--b3)` (`#504e45`) | `= var(--b3)` (`#b5b2aa`) |
| `--st-done-soft` / `--st-wip-soft` / `--st-risk-soft` | Tinted badge grounds. Each carries its own state colour as the label, so the pair is held to the **text** bar, not the decoration bar | `#17281d` / `#2c2317` / `#2e1c19` | `#e8f1ea` / `#f7efe2` / `#f7eae8` |
| `--cf-hi` / `--cf-mid` / `--cf-lo` | Planning confidence: committed / estimated / exploratory. An **ordinal ramp in one hue**, not three states — see below | `#7eb3e0` / `#4d7ba3` / `#39434d` | `#1e4467` / `#5d87ad` / `#b6c9d9` |

### Confidence is a scale, not a status

Planning confidence — committed, estimated, exploratory — used to be drawn in
`--gr`, `--am` and `--tx3`: the three status colours, in four separate copies
of the same map. That is a category error. Nothing about "exploratory" is bad;
it is simply less settled than "committed". Spending green, amber and red on a
quantity that is never good or bad also leaves nothing to say *this is going
wrong* — everything on the page was already amber.

It has its own three-step ramp in one hue, more saturated meaning more certain.
One map, `CONF_COLOR` in [`constants.js`](../src/constants.js), used by the
Overview bar, Plan review, QuickEdit, the node editor and task insights.
[`printPalette.js`](../src/utils/printPalette.js) mirrors the same three
values, so the per-project bars in the Management-Summary PDF and the HTML
report are the same scale as the screen — held there by
[`printPalette.test.js`](../src/utils/__tests__/printPalette.test.js).

## Two rules the palette is held to

**Readability is arithmetic, not taste.** Every ink/surface pair above is
computed and asserted in
[`src/utils/__tests__/paletteContrast.test.js`](../src/utils/__tests__/paletteContrast.test.js):
`--tx`, `--tx2`, `--tx3`, `--ac` and the three state colours must clear WCAG AA
(4.5:1) on `--bg`, `--bg2` **and** `--bg3`, and each `*-soft` ground must carry
its own state colour at 4.5:1. That test is what settled the light values, and
they are darker than they look picked by eye — light amber especially: an amber
that reads right on white sits near 3.3:1 and fails as label text, which is why
`--st-wip` is `#8a5a1a` and not the `#d97706` it used to be. The pre-token
palette failed seven of these checks.

**One source, no twins.** A literal colour anywhere in `App.css` outside the two
palette blocks is a value nobody can retheme, and that is exactly how light mode
drifted: every badge, row tint, deadline bar and Gantt band carried its own pair
of hexes plus a `[data-theme="light"]` rule to correct it — forty places to
find when the palette changed. They are all `var(--token)` or a `color-mix()`
over one now, so the base rule serves both themes and twenty-two light-mode
overrides went away. Both are guarded by the same test file; `#fff` / `#000` on
a coloured fill (a button's own label, a toggle knob) is the one exemption,
because that is the fill's contrast pair in either theme rather than a palette
decision.

### Dark is its own palette, not the light one inverted

The ground is **warm** (`#141310`), not black and not blue-grey, so it sits
beside the warm light mode and beside Obsidian's own themes without arguing
with either. Surfaces **lift** (`--bg2`, `--bg3`) rather than relying on a 1px
border, because in the dark a hairline is not what separates layers. The line
and accent colours are *different colours*, not lightened ones — `#2b5c8a`
goes muddy on a dark ground, so its dark twin is `#7eb3e0`. And selection is an
accent tint (`--ac-soft`), never a grey: grey on dark reads as "disabled".

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


## Icons are drawn, not typed

[`src/components/shared/Icon.jsx`](../src/components/shared/Icon.jsx) holds one
set of stroke icons on a 24-unit grid, rendered in `currentColor` at the weight
of the UI text. It replaced emoji and stray typographic marks (🗺 for the
roadmap, 💾 for save, ✧ beside a menu entry, ◎ ☰ ▭ ⁂ for tabs). Three things
were wrong with those and only the third is taste:

- an emoji comes from a different font on every machine, so it never matches
  the weight of the text beside it;
- it carries its own colour and ignores the one the row is painted in, so it
  cannot go quiet in a disabled control or bright in a selected one;
- its size comes from the font rather than the layout, so it never lines up
  twice.

The stylesheet draws too, and was missed. `.tr.cp-row td:first-child::before`
carried `content: '⚡'` — an emoji used as an icon, in the one file the sweep
never read, because it reads JS and JSX. It is the same bolt as `Icon.jsx` now,
as a `mask-image` from `--cp-bolt`, so it takes a token colour through
`background-color` and a size from the layout rather than from whatever emoji
font the machine has. `icons.test.jsx` reads App.css as well now.

Two things are deliberately **not** icons:

- **Typographic arrows and key symbols** — `→` in a date range, `⇧ ⌥ ↵ ⇥` in a
  shortcut hint. Those are text, and a drawn arrow in a line of type would be
  worse.
- **The phase and pin markers `✅ 🟡 📌` in [`constants.js`](../src/constants.js)**
  — these are the **markdown file format**: a plan note on disk writes
  `📌2026-01-05` and `*Phases: ✅RE, 🟡Development*`, and the PDF layer
  substitutes them through `pdfGlyphs.js`. Replacing them would not change an
  icon, it would stop every saved plan from parsing.

  `GT` (the root's focus type) used to belong in this list and no longer does:
  it writes `[goal]`, `[painpoint]`, `[deadline]`. The emoji form leaked out
  of the file and into project names whenever writer and reader disagreed
  about which marker to use, and a bracketed word is greppable and identical
  in every editor. `GT_MARKS` keeps the old forms readable. The screen draws
  these three from `GT_ICON`.

[`src/__tests__/icons.test.jsx`](../src/__tests__/icons.test.jsx) holds the set
to `currentColor` and one viewBox, requires `aria-hidden` unless an icon is
given a name of its own, and fails on a pictograph reappearing in the chrome
(`App.jsx`, `FileMenu.jsx`) — with the five format tokens excluded by name.

### The arrow exemption, and what it let through

Saying "arrows are text" was right about arrows *in* text and wrong about the
same marks standing alone. A second pass found them doing an icon's whole job
in 40-odd places: `↶` and `↷` were the undo and redo buttons, `⊞` opened the
editor, `⇤`/`⇥` moved a row a level, `⤒ ▲ ▼ ⤓` reordered it, `⧉` duplicated it,
`▶`/`▼` folded a branch, `⎘` sat on the bulk-edit trigger, and `×` closed
every dialog in the app. The tree's row actions had it both ways in a single
button group: a drawn pencil between three typed marks.

So the rule is about **position, not character**. A mark that is a control's
entire visible face is an icon and is drawn; the same mark leading a phrase, a
count, a shortcut hint or a date range is text and stays. The app's own state
notation — `●` done, `◐` in progress, `○` open — is a vocabulary the shortcut
dialog's legend teaches, so it stays too.

The same rule covers the dictionary: a label must not carry its own glyph.
`'× Löschen'`, `'↳ Split'`, `'⊕ NEU'`, `'← Zurück'` put the mark somewhere the
component cannot size, colour or align it, so the label is now just the word
and the component draws the icon beside it.

[`src/__tests__/drawnControls.test.jsx`](../src/__tests__/drawnControls.test.jsx)
holds both halves, and also checks that every `var(--token)` the app asks for
is actually defined — `var(--gn)` had been colouring the one signal in the
bulk editor's phase list since it was written, and there is no such token, so
the "done" dot simply inherited the colour around it.


## Priority is chevrons

`prioCritical` / `prioHigh` / `prioMedium` / `prioLow` in
[`Icon.jsx`](../src/components/shared/Icon.jsx) draw priority the way every
issue tracker does: chevrons up for "ahead of the rest", a level bar for the
middle, down for "can wait". The direction carries the meaning on its own, so
it survives the colour being taken away — which is why this is not four
coloured dots. They replaced `▲▲ / ▲ / ▬ / ▼`, a text approximation of exactly
this shape, whose priority-1 mark was a media-control glyph that macOS and
Windows render from the emoji font.

Two places keep a text stand-in on purpose: the network graph draws its labels
in SVG `<text>`, where a component cannot go, and the markdown format is the
markdown format.


## One look for a person

[`PersonChip.jsx`](../src/components/shared/PersonChip.jsx) draws *who is doing
this*, everywhere. There were four vocabularies for that one fact: the tree
wrote plain mono initials and an italic `~XX` for a suggestion; the Gantt used
a grey filled box; the Planning tab used a `btn btn-pri` — the app's loudest
control, on every row, for a person's initials; and a handoff chain had its own
bordered amber variant in two places, with different padding in each.

The tree's won, because it is the quietest, and initials are an identifier
rather than a call to action:

| | |
|---|---|
| `Anna` | assigned, by you |
| `~Anna` | the schedule's answer, not yours — muted, italic |
| `⇄ A→B` | a handoff chain, in `--st-wip`, because that one is worth noticing |

The Jira export dialog was the last holdout: its preview printed a bare first
name, the one place in the app that did. It shows the same chip now.

Where an action belonged next to it (accepting the schedule's suggestion on the
Planning tab), the action is its own small button and only the button looks
like one. [`personChip.test.jsx`](../src/__tests__/personChip.test.jsx) holds
the three states and fails if any view under `views/` dresses a person as a
primary button again.


## `--diff`: what changed since the date you are comparing against

The diff marker — the stripe on the summary bar, the badge in the tree, the
ring in the network graph, the border in the timetable and on a Gantt bar —
was the literal `#f59e0b` written out at eight separate places. A raw Tailwind
amber sits a shade off every other warm thing in this palette and does not
follow the theme, so it is `--diff` now, aliased to `--st-wip` in both blocks
next to `--gr` / `--am` / `--re`.

Team colours stay literal on purpose: a team's colour is **data**, stored in
the plan file and picked by the user, so `#3b82f6` as the default for a new
team is a value, not a token.
