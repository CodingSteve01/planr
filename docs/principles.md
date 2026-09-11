# Principles

This document is the contract every proposal is read against — including the
ones in this file. It does not answer "what do we build" but "how do we tell
that something belongs here". When an idea fails a check, the idea is not
finished; the rule is not too strict.

Written in September 2026, at the point where Planr had some 70 controls across
eight tabs, could do everything, showed everything — and therefore felt neither
light nor powerful. The as-is picture is in [ui-inventory.md](ui-inventory.md);
the order of the rebuild is the [last section](#the-rebuild) here.

---

## The eight principles

### 1. Mode before feature

Planr has five modes. A mode is the state of the **whole** surface: which views
exist, which toolbar, which columns, which exports come first. The user picks
what they are doing; the app decides what it shows.

Modes follow the moments of a week, not the features of the app:

| Mode | Moment | Intent | Core surface |
|---|---|---|---|
| **Build** | at the desk, wireframes alongside | capture work packages, build structure, set order and priorities — bottom-up *and* top-down | tree editor, project roadmap beside it |
| **Plan** | planning session | who, when, how much capacity, which deadline holds | Gantt, capacity, assignment |
| **Run** | daily / stand-up | what is due today, who is stuck, set status, Jira drift | briefing, per-person queues, Jira reconcile |
| **Review** | retro / status meeting | what happened since X, estimate vs. actual, what we learn | Overview with Δ window, estimate vs. actual |
| **Report** | before the steering committee | a document that works without its author | management summary, roadmaps, Word |

Capture and structure are **one** mode: whoever types bottom-up re-parents in
the next breath. Two modes for that would be a switch you press constantly.

No mode is maintenance: resources, holidays, templates, sizes, risks, custom
fields, file. Those are settings (tier 3).

Two roles besides the planner: the **team** reads Run ("what is mine?");
**management** receives Report. Neither ever needs the tree editor.

> **Check:** every feature belongs to exactly one mode. If none can be named,
> the feature is not finished.

### 2. One surface for changing, all others for seeing

The tree is the only place where the plan is **changed**. Roadmap, Gantt,
network, Overview, Briefing show it and lead, on click, to the row in the tree.
One editor you know beats six you have to find.

Today there are six write paths (Add modal, QuickEdit, NodeModal, Gantt drag,
bulk edit, Jira apply). That is the source of the "overwhelmed" feeling.

> **Check:** does this view change data? Then it is the tree — or it may not.

What this does *not* mean: the Gantt may select a bar and "open in tree"; it
may not drag it. A status change in Run is a tree row in different clothes
(same component, same path), not a second editor.

### 3. A view is never the truth

Filters, archive, modes, zoom, single-line all change only what is visible.
Numbers, exports and the file always describe the whole plan. A hidden project
stays 100 % finished; a filtered tree changes no percentage; a PDF cannot leave
out anything the plan contains.

Anchored in code by `utils/exportCtx.js` (exports read the plan from the store,
never from the view) and the parity tests. Made a rule here so it does not
erode.

> **Check:** would the export look different depending on what is currently
> filtered? Then it is wrong.

### 4. Three tiers of visibility

| Tier | where | example |
|---|---|---|
| **1 — immediate** | on the surface | the tree, the Gantt, the mode's three chips |
| **2 — one reach away** | `/` palette, "More", context menu, popup | set a dependency, pick the Δ window, export options |
| **3 — settings** | the gear | size catalogue, custom fields, language |

Every control sits on exactly one tier. Tier 1 has a **budget per mode**: one
toolbar row, one core view, at most one side view. When it is full, something
moves down a tier before anything new arrives.

> **Check:** new element on tier 1? What moves to tier 2 for it?

### 5. Fast means reversible

Everything by keyboard, everything with multi-select, everything with ⌘Z. Speed
does not come from more buttons; it comes from a mistake costing nothing.
Confirmation prompts ("Really delete?") only where undo is not enough — i.e.
discarding unsaved work and overwriting a file.

The lever is **multi-select × shortcut**: select twelve rows, press `2`, twelve
priorities. That is "just quickly".

| Key | does |
|---|---|
| `↑ ↓` · `⇧↑ ⇧↓` | select · extend selection |
| `Enter` | edit name / done — at end of row: new row below |
| `⇧Enter` | new child |
| `Tab` · `⇧Tab` | indent · outdent (re-parent; dependencies follow) |
| `⌥↑ ⌥↓` | move within the order |
| `1–4` | priority · `S M L X` size · `Space` cycle status |
| `⌫` | on an empty new row: gone — on an existing one: confirm |
| `/` | palette for everything else |
| `⌘Z` · `⇧⌘Z` | undo · redo |

> **Check:** does it work without the mouse? For ten rows at once? Backwards?

### 6. Build subtractively

A new feature pays with removal or consolidation. Reorder buttons go when ⌥↑↓
arrives. The Add modal goes when Enter creates a row. A PR after which the app
has *more* controls needs one sentence of justification in its description.

**Subtractive means fewer paths, never fewer capabilities.** Nothing the app
can do today is dropped. A control may be *removed* only when its inventory
row proves one of two things: it is dead code (no caller anywhere), or it is
a duplicate — and then the row names the path that stays (`↔ duplicate of …`).
Everything else keeps its capability and moves to the tier and mode where it
belongs. A "remove" without that proof is a mistake in the inventory, not a
decision.

> **Check:** what is less afterwards? And for every removal: dead, or duplicate
> of what?

### 7. One source per truth

Percentages from `progress.js`. Text from `i18n.jsx`. Export context from
`exportCtx.js`. Tree structure from `treeIndex`. PDF glyphs from `pdfGlyphs.js`.
Deadline state from `timeline.js`. No place computes privately, no place
formats privately.

Its counterpart on the surface: **one state has one colour and one glyph**,
everywhere. Done is the same green in the tree as on the roadmap as in the
Gantt as in the PDF.

> **Check:** does this number / text / colour already exist somewhere? Then
> take it from there.

### 8. Names, not mechanics

The surface speaks the user's words: work package, milestone, priority, order,
project, person. IDs, `seq`, `displayOrder`, `routeIdx`, `WPX`, `t` are
implementation and stay invisible or on tier 3.

> **Check:** would the user say this word in a meeting?

---

## Design language

Five modes and a single editor need a surface that *steps back*. Not less
information — less decoration. The reference is deliberately "Apple": clarity,
deference, hierarchy through typography rather than through borders.

What stays: **density.** Planr is a data tool; the dense row of the Planning
tab (11–12 px, 4–5 px spacing, one line) remains canon. Density is not noise.
Noise comes from borders, pills, badges and colours competing for attention.

What changes:

- **One accent.** Blue for interaction. Every other colour means a *state*
  (done / in progress / open / at risk / archived) or a *project line* — and
  nothing else. Team colours, priority colours, confidence colours, diff amber
  and plan blue compete today; in future, at most one of these dimensions
  carries colour per mode, the others carry shape or text.
- **Hierarchy through type.** Three sizes, two weights, monospace only for
  numbers and abbreviations. Headings without pill backgrounds.
- **Surfaces instead of borders.** Three surface levels (ground, card, raised)
  with minimal contrast replace `1px solid var(--b)` as the default separator.
  Rules only where columns really end.
- **Calm chrome.** Top bar: file name, save state, mode switch, gear. No more
  "Load / Snapshots / Save as / Export… / New" as a button row — that is a
  palette.
- **Motion only as a response.** No pulsing train, no permanent animation.
  Something moves because the user did something.
- **Empty states teach.** An empty mode explains in one sentence what it is for
  and offers the one sensible action.

To consolidate before building: a spacing grid (4 px), a type scale
(10 / 11 / 12 / 14 / 20), three surface tokens, one accent, five state colours
with fixed glyphs — as CSS variables in `App.css`, and every inline colour in
JSX moves there.

> **Check:** does this element have a colour that means no state? A border
> that separates no column?

---

## Roadmaps: one view, three lenses

Today the subway map is the container for everything called "roadmap":
portfolio lines, timetable, single line, project calendar, diff overlay,
horizon overlay, legend — in one tab, behind one toolbar. That is the roadmap
as a feature. It should be a **view** that has a role in each mode.

One model, three lenses:

| Lens | shows | question |
|---|---|---|
| **Portfolio** (subway) | every project as a line, the train = progress | how far is each, where are we jammed |
| **Project** (calendar) | one project: packages as rows, tasks as stops, today and deadline | what happens in this project when |
| **Timetable** (table) | stations chronologically per line | which milestones fall in which week |

And per mode, the right lens in its place:

- **Build:** project lens *beside* the tree. Re-parent a package and watch
  its row move in the calendar. The roadmap is feedback here, not the goal.
- **Plan:** the Gantt is the time axis; the roadmap steps back.
- **Run:** no roadmap. The day has no lines.
- **Review:** portfolio lens with the Δ window — the train then, the train now.
- **Report:** portfolio and every project calendar, complete, without
  controls.

What disappears: the roadmap switcher as its own toolbar, the "All lines /
Project X" choice as state that sticks across modes, and three overlays
stacked on one map. Overlays belong to modes: Δ in Review, horizon in Plan,
never both.

Technically this is prepared: `roadmap.js` (portfolio, timetable model) and
`projectRoadmap.js` (project) share `treeIndex`, `progress.js` and the
tooltip/click contracts. What is missing is decoupling from the SumView
container.

---

## Jira is a source, not an input

Today's reconcile (paste a table, look at the drift, press "apply") is the
makeshift of an application without a backend. The principle: Jira is a **data
source**. Connect once, pull the state automatically, show drift in Run,
and accepting it is a row in the tree — not a dialog.

The honest constraint: Jira Cloud does not allow direct browser calls (CORS),
and a token never belongs in a browser. "Connect" needs a small intermediary —
a Cloudflare Worker (~50 lines, holds the token, answers JQL) or a local script
next to the plan file. That decision is for when we get there; for the
principles it suffices that the app *reads* Jira rather than having it pasted
in.

The existing parser and drift logic (`utils/jiraSync.js`) stay — they are the
comparison layer, whatever the data's origin.

---

## The rebuild

Ordered by leverage and dependency. Each phase is its own PR, and each PR
answers the three questions from principles 1, 4 and 6 in its description.

| # | Phase | creates | removes |
|---|---|---|---|
| 0 | **Principles + inventory** (this document) | the contract | nothing — docs |
| 1 | **Undo/redo** | in-memory stack over `data`, ⌘Z / ⇧⌘Z, indicator in the chrome | most "Really?" prompts |
| 2 | **Design tokens** | grid, type scale, surfaces, accent, state colours in `App.css`; inline colours move there | colour and border noise; no layout change yet |
| 3 | **Mode shell** | mode switch in the top bar; modes as presets over the existing views (which tabs/chips/columns); `/` palette for file, export, search | the eight-tab bar; the Load/Snapshots/Save as/Export/New button row |
| 4 | **Tree editor** | inline editing, the keyboard model from principle 5, Tab re-parenting, ⌥ moving, multi-select operations, paste-to-rows | Add modal, reorder buttons, bulk-edit modal (becomes multi-select), Gantt drag as a write path |
| 5 | **Roadmap lenses** | project lens beside the tree in Build; portfolio with Δ in Review; Report complete | roadmap switcher toolbar, overlay combinations |
| 6 | **Run mode** | briefing + queues + drift as one day screen; status change as a tree row | Jira apply dialog; PlanReview as its own tab (becomes part of Plan) |
| 7 | **Jira as a source** | connection + intermediary, automatic state, drift count in the chrome | the paste-a-table path |
| 8 | **Teardown** | — | NodeModal (QuickEdit is the editor), DLView, everything marked "remove" in the inventory |

Not in this order but when the pain is concrete: a stable `uid` per node, so
that re-parenting no longer rewrites IDs. Phase 4 will show whether and where
that is needed.

## How we read proposals

Every feature request — including a good one — answers before the first
commit:

1. **Which mode?** (principle 1)
2. **Does it change data, and if so, in the tree?** (principle 2)
3. **Which tier, and what moves down for it?** (principle 4)
4. **What is less afterwards?** (principle 6)

Four questions, four sentences in the PR description. Whoever cannot answer
them does not have a feature yet but an idea — and that belongs in this
document, not in the code.
