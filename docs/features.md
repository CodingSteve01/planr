# Features

> **Planr is a desktop-first web application. It's optimized for large screens and keyboard/mouse interaction — it's not intended for mobile use.**

Full catalog of what Planr does. Grouped by area. Links point to detail docs where the behavior has enough depth to warrant its own page.

## Access

- **Hosted app** — start directly at https://codingsteve01.github.io/planr (no local server setup needed)
- **Local dev app** — run via Vite (`npm run dev`) when contributing or debugging locally

## Work breakdown

- **N-level tree** — unlimited nesting (leaves are detected structurally, not by fixed depth)
- **Root item types** — every tree root can carry a `type` (goal, painpoint, deadline) with `severity`, target `date`, and long-form `description`; no separate deadlines list
- **Hierarchical sort** — children always follow parents; collapse/expand all
- **Keyboard tree editor** (Phase 4 — docs/principles.md principle 5, "Fast means reversible") — the tree is fully editable without the mouse: `↑`/`↓` move the cursor (the existing `selected` row) through the visible rows, `⇧↑`/`⇇↓` extend the multi-selection from it. `Enter` turns the active row's name into a real `<input>` seeded with the current name; committing it creates a new empty sibling row directly below and starts editing that one, so a rapid "type, Enter, type, Enter…" session builds a flat list without touching the mouse — this is the bottom-up entry point for planning straight from a wireframe. `⇧Enter` creates a child instead. `Esc` cancels without touching the row's name; committing an empty name on a row created this way removes it again, so an idle Enter-Enter never litters the tree. `Tab` / `⇧Tab` re-parent the active row under its previous sibling / to its parent's parent (through the same `moveNode` the Advanced-tab "Move" control uses — ids and dependency references are rewritten identically); indenting a first child or outdenting a root is a no-op. `⌥↑` / `⌥↓` move the row within its sibling order (same primitive as the ⤒▲▼⤓ toolbar below). `1`–`4` set priority, `S`/`M`/`L`/`X` apply a T-shirt size from the project's size catalogue (case-insensitive; a no-op if the project defines no matching size), `Space` cycles status open → wip → done — all three act on the whole multi-selection at once when there is one, in a single undo step. `⌫`/`Delete` removes the active row (or the whole selection) through the same confirm-free delete the toolbar button below uses. Pasting multi-line text (when no inline edit is focused) creates one new row per line under the active row's parent, honoring leading indentation as nesting and stripping `-`/`*`/`•` bullets — also one undo step. See [architecture.md](architecture.md#tree-editor-keyboard-model) for where this logic lives, and the [Keyboard shortcuts](#keyboard-shortcuts) table below for the exact key list. **Nothing below was removed to make room for this** — the Add modal, the reorder buttons, bulk edit and QuickEdit all still work exactly as before; teardown is phase 8, after the keyboard path is confirmed. The one exception is the per-row quick-add `+`, which was replaced rather than removed — see the mouse path below.
- **The same edits with the mouse** — every keyboard move above has a visible affordance, because a keyboard-only editor is an editor most people never find. Clicking a row selects it; clicking the name of the row that is *already* selected opens the same inline editor (Finder's rename gesture — no double-click, and click/⇧-click selection of other rows is untouched). Hovering a row reveals three buttons at its right edge: `✎` rename, `+` new row below, `↳` new child — the last two create an **empty** row and put the cursor in it, so you name it once instead of fixing a placeholder afterwards. This is what replaced the old per-row quick-add `+`, which wrote a row called "New child item" through the same `addNode` and then jumped you to the Overview side-tab; it is a duplicate of `↳` in every respect except ergonomics. The contextual toolbar that appears for a single selection carries the full vocabulary in words: **Rename**, **New row**, **New child**, `⇤`/`⇥` outdent/indent (the mouse twin of `⇧Tab`/`Tab`, disabled when the move would be a no-op), the `⤒▲▼⤓` reorder group, and Delete. The `⋮⋮` handle still drags a row within its siblings. - **`Space` walks the phases, when a task has them** — it used to do nothing visible there, and that was not a UI problem: a leaf with phases derives its progress *from* them (`leafProgress`: "phases are the single source of truth when present"), so cycling only the task's `status` wrote a number nothing reads back. The model is serial: the **current** phase is the first one that is not done, and each `Space` moves it one step along open → wip → done — finishing it makes the next phase current, and past the last one the list wraps back to open, exactly as the phase-less open → wip → done → open cycle does. `⇧Space` walks the same path backwards. The task's own status and progress are written to match, so nothing downstream can disagree with the phases.
  In the row editor the **Status** field becomes a **Phase** field for such a task: it names where the task stands and jumping to a phase finishes everything before it. A Status dropdown there would have written a value the next read overwrites.
- **The side panel follows edits made elsewhere** — QuickEdit keeps a local copy of the selected node and re-seeded it only when the *selected id* changed. So walking a task's phases with `Space` in the tree, or a bulk change, or an undo, left the Insights tab showing the values from whenever the panel was opened; you had to click away and back. It now re-seeds whenever the stored node changes, using object identity to tell its own write coming back (nothing to do) from one made somewhere else (re-seed).
- **Changing a status stamps the dates that go with it, everywhere** — `Space`, the bulk-status buttons and the row editor's Status dropdown all go through `statusChangePatch()`, the same helper QuickEdit's dropdown uses. They used to write a bare `{ status }`, so a task moved to *wip* or *done* from the keyboard silently skipped its actual start/end — and the Soll/Ist comparison had a hole in it exactly where someone had worked fastest.
- **Nothing sits in the tree unreachable** — five component files were removed because no module imported them: `DLModal` and `TemplatesModal` (goal metadata and task templates are edited in QuickEdit/NodeModal and SettingsModal), `DLView` (goals and deadlines are shown in SumView, BriefingView, the Gantt and the report), and `DiffPicker`/`HorizonPicker`, both superseded by `ViewFilters`, which absorbed the "since" and planning-horizon filters. The logo is no longer a button (it was "New project" — the same command the `/` palette carries, on a target nobody aims at deliberately, discarding the plan behind one confirm), and `NetGraph`'s `onAddDep` prop is gone: it was wired from `App.jsx` but the drag that would have called it was never built. [`src/__tests__/noOrphans.test.js`](../src/__tests__/noOrphans.test.js) now fails on any component with no importer, and on any import pointing at a file that is not there.
- **Shortcuts live on their control, not in a wall of text** — the tree used to print a dense line of glyphs above the table, teaching keys for controls you could not see yet. That line is gone. Every button that also has a key carries it in its own tooltip ("Rename P1.2 · ↵"), and the complete list is one keypress away: `?` anywhere opens the **keyboard map**, grouped by where each key is live (anywhere / cursor on a row / while naming a row / Gantt), with the symbol legend (status, priority, critical path, handoff, drag handle) in the same dialog — it used to be a separate hover-only `?` sitting an inch away, asking the reader to know which of two help affordances answered their question. One `?` button in the tree toolbar, one `?` key, one dialog; it is also in the `/` palette. The single source is [`src/utils/shortcuts.js`](../src/utils/shortcuts.js) — both the overlay and the tooltips read it, and `shortcuts.test.js` fails if a tooltip asks for an id the table does not define, or a label has no translation.
- **The row editor is a small form, not a name-only mode** — the row being named renders its name field plus four labelled dropdowns, in `Tab` order: **name → Priority → Size → Status → Team**. `Tab` walks them, because that is what `Tab` means inside a field everywhere else; `⇧Tab` off the name goes back to the row above, and `Tab` off the last dropdown finishes the row and opens the next one, so a whole item is one uninterrupted run of `Tab`s. The size dropdown offers the project's own catalogue (falling back to the shared default set) and says *"— own estimate"* when the row's numbers came from the wizard rather than a size, instead of silently showing the nearest one.
  Keyboard equivalents, all without leaving the field: `↑`/`↓` commit the name and carry the field to the row above or below (the spreadsheet gesture — editing follows the cursor instead of being a mode you leave and re-enter per row); `⌥↑`/`⌥↓` move the row itself among its siblings; `⌥←`/`⌥→` outdent/indent it and the field follows the row to its new id; `⌥1`–`⌥4` priority, `⌥S`/`⌥M`/`⌥L`/`⌥X` size, `⌥Space` status, `⌥T` jumps to the team dropdown. Every one of these writes the typed name and the field in a *single* update, so neither can overwrite the other.
  Re-parenting moved off `Tab` onto `⌥←`/`⌥→` when the dropdowns arrived — `⌥`+arrow already meant "move this row in the structure" (`⌥↑`/`⌥↓`), so the two now read as one gesture. Outside the editor, with the cursor on a row, `Tab`/`⇧Tab` still indent and outdent.
- **The dropdowns filter as you type** — each field is a `SearchSelect`, not a `<select>`: focus it, type `fro`, press `Enter`. With a dozen teams, hunting a native dropdown by eye is the slow path. Its popup renders into a portal to escape the table's overflow clipping, which is why the editor treats focus landing there as still being inside itself.
- **A new row has no priority** — it used to be created as *high*, which made every fresh plan look urgent while saying nothing: you could not tell what you had decided from what the editor guessed. Unset shows no glyph and reads *"— not prioritised"* in the dropdown. The **team** *is* inherited from the sibling or parent, because that is a fact about where you are rather than a guess about what you meant.
- **Leaving the editor** — `Escape` cancels, clicking another row ends edit mode and keeps what was typed, and either way focus returns to the grid so the arrow keys keep working. Backing out of a row you *just* created puts the cursor back on the row it came from, rather than leaving you with no cursor at all. (Both were bugs: the `<input>` unmounting dropped focus to the document body, and a `<tr>` is not focusable so the field never blurred.)
- **Moving a row moves it past what you can see** — `⌥↑`/`⌥↓` step to the next *visible* sibling, and `⌥⇧↑`/`⌥⇧↓` go all the way to the top or bottom of the sibling run in one press. The step used to be computed from the whole plan, so a press could swap the row with a sibling the current filters hide — a finished task, an archived project, a collapsed branch — and look like a dead key; you pressed again, once per hidden row. The `⤒ ▲ ▼ ⤓` buttons use the same rule and are disabled at the visible ends. A row still never leaves its branch this way — changing its parent is a re-parent, below.
  Three things had to agree for this to work. Root items are siblings of *every* other root (the reorder additionally required the same leading letters, so a root called `P4` could pass `P2` and `P3` but never `Pr1`). The undo snapshot is taken from the current state rather than the render closure's. And — the subtle one — **display order and reorder now use the same comparator** (`compareSiblings` in `utils/treeEdit.js`): `sortTree` compared `displayOrder` only when both rows had one, while the reorder put `displayOrder` and the number in the id on one scale, so on any sibling set where only some rows had been reordered before, the move computed its indices against an order that was never on screen and often landed on the index the row already had. In every one of these the button was enabled, the press did nothing, and there was nothing to see.
- **Subordinating a task** — move it behind the one it belongs under, then `⌥→`. `Tab` does the same on the grid, and `⌥←`/`⇧Tab` take it back out; inside the row editor only `⌥←`/`⌥→` apply, because `Tab` there walks the form. One gesture works in both places, so there is no "which mode am I in" to remember. The new parent is the row **above it on screen** — this too used to be computed from the whole plan, which meant a task could be subordinated under a finished or archived one you could not see.
- **Reaching the tree without the mouse** — the grid takes focus on mount (only from the document body, never from a field someone is typing in), so the first arrow press on a freshly opened plan lands. Pressing `Enter` in the search box hands the keyboard over and puts the cursor on the first match, instead of leaving you in the input where the arrows move a text caret; `⇧Enter` there still steps through matches.
- **Hierarchical navigation** — `→` opens a closed branch and then steps into it, `←` closes an open one and then steps out to the parent: the idiom every file browser and outliner shares. `⇧←`/`⇧→` are the big version — collapse or expand everything, or just the selection when there is one, exactly what the two toolbar buttons do.
- **A delete lands somewhere** — the cursor moves to the row above (else the row below), instead of clearing the selection and costing a mouse trip back into the tree. With `⌫` one keystroke away, that trip was most of the work.
- **Sibling reorder** — move a selected item up / down / to first / to last within its sibling group; all IDs (including descendants) and dep references auto-renumber
- **Contextual action toolbar** — a sticky row above the tree surfaces reorder + delete for the currently selected item; per-row actions collapse to just `+` (add child)
- **Multi-select bulk editing** — Ctrl+Click toggles, Shift+Click selects a range; bulk edit team, priority, status, assignee, confidence
- **Multi-assignee tasks** — a leaf can have more than one assignee; each shows up in person-grouped views (Gantt, Planning Review)
- **Status derivation** — parent status is computed from children (done / wip / open)
- **Progress tracking** — 0–100 % slider on leaves; weighted (by realistic effort) cascade to parents; circular indicator in the network graph

## Scheduling

See [scheduler.md](scheduler.md) for semantics.

- **Auto-scheduler** — leaf-only, capacity-aware, vacation-aware, holiday-aware
- **Topological ordering** by dependency; deps inherited from ancestors
- **Per-person capacity** — `pF[person]` tracker sequentializes assigned work
- **Team slots for unassigned tasks** — team-sized slot array prevents infinite parallelism
- **Single-member team fast-path** — an unassigned task on a 1-person team is routed through the per-person scheduler (identical behavior to assigning that person directly)
- **Pinned start** — hard floor on the start week; deps and capacity can still push later. Settable in QuickEdit with a one-click "Start today" shortcut, or via Gantt bar-drag / right-click.
- **Legacy `parallel` flag** — bypasses person capacity (kept for MD round-trip only; not in UI)
- **NRW public holidays** — built-in via Easter algorithm; custom holidays supported
- **Explicit vacation weeks** — per person, zero-capacity weeks
- **Blanket vacation deduction** — remaining unplanned vacation days reduce weekly capacity proportionally

## Planning Confidence Model

- **Three levels** — committed (person + estimate + low risk), estimated (estimate but no person), exploratory (scope unclear)
- **Auto-derived** — `computeConfidence()` in `scheduler.js` determines confidence from task state (assignment, estimate, risk factors)
- **Manual override** — set `confidence` field on any item to override the auto-derived value
- **Parent inheritance** — parents inherit the worst confidence from their children (exploratory > estimated > committed)

## Critical path

- **Global CPM** — classic forward/backward pass, slack per item
- **Per-goal CPM** — each tree root has its own critical path restricted to its subtree
- **Highlighting** — critical chain is rendered red in the Gantt and the network graph
- **"Show critical only" toggle** — dims everything else in the Gantt

## Gantt chart

See [gantt.md](gantt.md).

- **Grouping** — project, project › team, team, or person
- **Zoom** — `− [value] +` buttons in the Gantt footer; value doubles as a "reset to default" click. Persisted in localStorage.
- **Day-level view** — at zoom ≥ 70 px/week a third header row shows day-of-month numbers and the body gets faint vertical day separators; today's number is green
- **Per-day holiday tint** — at day-level zoom, only the actual holiday days are red-tinted (not the whole week)
- **Drag to pin** — drag a bar horizontally to set `pinnedStart`
- **Link handles** — drag from a bar's right edge onto another bar to add a dependency
- **Bezier dependency arrows** — 10 px straight stubs + cubic bezier between (forward and backward); the straight runway in/out of the arrowhead stays readable at large vertical gaps
- **Click an arrow to remove it** — "×" badge at the arrow origin
- **Right-click context menu** — open editor, add predecessor/successor, pin/unpin, remove dep
- **Solid team-colored bars** — white bold text with subtle shadow for legibility across the team palette
- **Confidence-based bar styling** — committed = solid fill, estimated = striped, exploratory = dashed outline
- **Horizon lines** — H1 (committed boundary, ~8 weeks) and H2 (estimated boundary, ~18 weeks) vertical markers in the Gantt body
- **Confidence legend** — footer section explaining bar styling for each confidence level
- **Hover tooltips on left panel** — same tooltip style as the Network Graph, shown on row hover
- **CP marker** — 1.5 px red inset ring on the bar (doesn't fight the link-mode outline)
- **Deadline flags with backfill** — flag-shaped pennant at the deadline week plus a gradient backfill stretching up to 8 weeks left; at-risk flags show an `!`
- **Today marker** — green vertical line
- **Decide-by diamond** — amber/red 45°-rotated marker per task

## Network graph

See [network-graph.md](network-graph.md).

- **Recursive N-level layout** — 2-column for leaves, grid for many children
- **Bin-packing** — root trees packed with TD/BU flip for compactness
- **Bounding-box compaction** — whitespace between trees minimized
- **Obstacle-aware edge routing**
- **Root + team filters** — isolate one top-level focus item or view the graph like the Tree filtered by team
- **Fit-to-selection** — highlights zoom the viewport to the selected subset
- **Pinch to zoom, scroll to pan** — trackpad-native (wheel is NOT zoom)
- **Perceived 100 % = 150 % real** — zoom label divides by 1.5

## Views and navigation

- **Modes** — a segmented control in the topbar (`src/utils/modes.js`) switches the whole surface between five modes that follow the moments of a week rather than the app's features: **Build** (Work Tree + Network — capture and structure), **Plan** (Schedule + Planning + Resources + Holidays — who/when/capacity; the Gantt carries the project roadmap lens beside it), **Run** (Briefing + Overview — the daily stand-up), **Review** (Overview — retro / status meeting; Overview's map is the portfolio roadmap lens), **Report** (a new screen with the same export cards the Export dialog has, framed as "a document that works without its author"). Switching mode selects that mode's default tab; the tab bar then shows only that mode's tabs plus whichever tab is currently open, so a view reached from elsewhere (the `/` palette, a direct link) is never a dead end. Persisted in `localStorage['planr_mode']`.
- **`/` command palette** (`src/components/shared/CommandPalette.jsx`) — opens with `/` (when focus isn't already in a field) or `⌘K`/`Ctrl+K`; fuzzy-filters a flat command list (`src/utils/palette.js`), `↑↓` + `Enter` to run, `Esc` to close. Holds everything moved out of the topbar's old button row — Load file, Snapshots, Save as, Export… (jumps to Report mode) / Export… (dialog) (still opens the old modal), New project, Help/Tour — plus a jump to every mode and every view.
- **Tree view** — classic hierarchical editor with indentation, priority, status, progress. Inline metadata is kept terse: dates render without leading icons (color carries overdue/warn semantics), team labels inherit down a subtree (only shown when they differ from the parent), and rows on the critical path are flagged via a small ⚡ glyph in the ID column with the CP labels surfaced in its tooltip. Zebra banding spans every depth so deep leaves remain visually grouped — the same banding is also applied to the Gantt label pane.
- **Soll/Ist comparison** — every done leaf gets a workday-adjusted estimate-vs-actual breakdown in QuickEdit (Soll = `best × factor`, Ist = workdays between `completedStart` and `completedEnd` with weekends + holidays subtracted, Δ shown as percent with green/amber/red zones at ±20 %). The **actual start** (`completedStart`) is stamped automatically the moment a leaf goes open → wip (status dropdown or progress slider; seeded from `plannedStart` if it's already past, else today) and stays editable while in progress — so the actual start is captured when work begins, not back-guessed at completion. Actual end / completed-on stay locked until the item is `done`. When the Δ Review filter is on, an additional **Retro · Soll/Ist** band aggregates over every leaf completed in the window: totals + ratio + hit rate + Top overruns/underruns lists for one-click drill-in. Lives in [`src/utils/sollIst.js`](../src/utils/sollIst.js) — `computeSollIst(node, ctx)` for the per-task case, `aggregateSollIst(nodes, ctx)` for the retro panel.
- **Team-lock task** — declarative `teamLock:true` on a tree node makes the scheduler treat it as multi-assigned to **every current member of the task's team** at run time. Replaces the manual workaround of assigning every team member by hand; team membership changes (onboard / offboard) flow through automatically. Markdown tag: `team-lock:true`.
- **Hard- vs Soft-deps** — `deps` model genuine "A needs B" predecessors; `softDeps` model "I want to run A before B" sequencing/parallelism intent. Both block the scheduler identically (a soft predecessor IS waited for), they only differ visually (dashed thin edge in Gantt + grey dashed edge in NetGraph). Markdown writes soft-deps with a `~` prefix in the `*Requires:*` line (`~P1.2`). New drag-links default to soft so users can sketch flow without committing to a semantic dep. QuickEdit lists both buckets with `H`/`S` chips, an inline **→S** / **→H** toggle on each row to convert in place, an H/S picker on the add-bar, and a read-only **Successors** card listing direct dependants — so add / change / delete works in one surface and the N×M graph stays inspectable.
- **Reorganize layout** — manual button (top toolbar, Tree + Gantt) that runs a per-parent topological sort of children by `deps ∪ softDeps` (Kahn's algorithm, id-numeric stable tiebreak) and writes the result to `displayOrder` on each node. TreeView and Gantt use `displayOrder` as the primary sort key; unset nodes fall back to id-numeric. Lives in [`src/utils/displayOrder.js`](../src/utils/displayOrder.js). Not run during editing — the user invokes it to clean up the layout after sketching deps. Markdown tag: `ord:N`.
- **Time-shifted member profile** — `capChanges` + `meetingChanges` arrays let the planner schedule capacity / meeting changes that take effect on a future date (e.g. parental leave at 50 %, new standup from project kickoff). `memberAtDate(member, date)` returns the effective profile at any point. Scheduler calls it at each task start so a 2027 task sees the 2027 profile, not the import-time one. Inline editor in the Member modal; markdown sub-bullets `*Capacity plan:*` and `*Meeting plan:*`.
- **Multi-assign queue fan-out** — tasks assigned to multiple people (incl. team-lock fan-out) now appear in every involved person's lane. The picked-by-scheduler lane stays the "primary" with full drag-reorder; mirror entries in the other lanes get a ⇋ icon, are muted to 65 % opacity, and have their drag affordance disabled so all ordering changes happen in the owning lane.
- **Subway-Map time-proportional spacing** — stations are now placed along the route by their actual end-date within the project's [earliest, latest] window rather than evenly spaced. Two stations one week apart sit close together, stations months apart drift apart, and an anti-collision pass (`MIN_T = 0.035`) prevents same-week milestones from rendering on top of each other. Train still rides at the effort-weighted progress, so train-vs-station-cluster gaps reveal real progress dynamics.
- **Unified view-filter popup** (⚙ Filter chip in the sub-toolbar) — single trigger that exposes the two global "review/planning" filters:
  - **Δ Review (Diff)** — pick a cutoff (presets `7 / 14 / 30 d` or custom date). Past-progress is reconstructed from the per-leaf `## History` event log embedded in the markdown; views render an amber trail / ghost-train at the past position, badges for done-in-window and progress-only changes, plus an "Only changed" filter for tree/gantt to drop everything that didn't move.
  - **▶ Plan (Horizon)** — forward window (`+7 / +14 / +30 / +60 d` or until-date). Highlights tasks scheduled to fall inside it. Tree/Gantt hide non-matching rows (via "Only planned" toggle, default on), NetGraph dims them, Roadmap fades the out-of-window stations. The Roadmap additionally renders a blue dashed segment + ghost-train ahead of the live one, plus a `+ΔN%` pill, so the map reads Diff/Ist/Plan in one glance.
  - **📦 Archive** — hide long-finished projects and long-offboarded people (see the Archive filter bullet below), with the day threshold and the list of what is currently archived right in the popup.
  Filter state lives at the App level (`planr_diff_since`, `planr_diff_only_changed`, `planr_horizon`, `planr_horizon_only`, `planr_show_archived`, `planr_archive_days`) and is shared across Roadmap, Tree, Gantt, Network and Timetable.
- **Gantt view** — timeline with grouping
- **Network view** — subway-style graph
- **Roadmap lenses** — one renderer family (`src/utils/roadmap.js` for the portfolio map, [`src/utils/projectRoadmap.js`](../src/utils/projectRoadmap.js) for the per-project calendar, both drawn through `src/components/shared/Roadmap.jsx`), two lenses, each living in the mode it actually serves instead of behind a switcher:
  - **Portfolio lens** (Review mode, Overview tab) — the metro-style SVG map. Each project is a colored subway line on one of 8 pre-computed fixed routes (assigned by project duration, longest project → longest route; assignment is stable across plan edits). Stations represent clusters of leaf tasks whose end dates fall within 14 days of each other — close-deadline tasks are grouped into one station to keep the map readable. Station positions are proportional to their date within the project span. A pulsing train marker sits at the effort-weighted progress point along the line. Hover any station or train for a tooltip; click a legend item to open that task in QuickEdit. The legend below the map lists all stations with their full names and expands clusters. It is always every project — a portfolio review is exactly the moment you do *not* want to narrow to one line — and the Δ Review filter (below) overlays what moved since the chosen cutoff directly on the map: an amber trail / ghost-train at the past position plus the diff banner (tasks done, effort, capacity, utilisation) above it.
  - **Project lens** (Plan mode, the **Roadmap** tab beside Schedule) — drawn by [`src/components/views/PlanRoadmap.jsx`](../src/components/views/PlanRoadmap.jsx), a **DOM** renderer built the way the Gantt is built: a fixed 28px row (the Gantt's own `RH`), a sticky label column, month ticks, horizontal scroll, and figures at the right edge. It first used the SVG renderer, and that was wrong here: an SVG with a fixed 1400px viewBox at `width:100%` *scales*, so on a wide window every row, label and dot grew by the same factor and the view looked oversized next to the chart it is supposed to match. Pixels have to mean pixels in a view you work in. The SVG renderer keeps the Subway map and the PDF, where one scalable image is exactly right — **one model (`computeProjectRoadmap`), two renderers**. Zoom is a factor on the fit, not absolute pixels-per-day: `fit` shows the whole project edge to edge, above that it magnifies and scrolls (persisted in `planr_plan_roadmap_zoom`). An absolute step would be meaningless — a six-month project and a three-year one need wildly different scales to fill the same pane. Clicking a row or a stop opens that item through the same `onSumOpenItem` the portfolio map uses. The model is unchanged and still carries: a project picker up top, then one row per work package, positioned and sized by its real dates, its leaves as stops on that row, a month (or quarter) axis, today as a green line through every row and the root's deadline as a red one. Rows carry the shared `progressPctLabel` figure and `done/total`, and every row and stop keeps the same `data-tip` / `data-item-id` contract as the portfolio map, so hover and click-to-open work unchanged. A subway line for a single project answers no question you would actually ask about a project; a calendar does — and planning is where you'd actually ask it. It is a **tab of its own**, directly after Schedule in Plan mode's tab bar. It first shipped as a chip in the filter row that opened a 380px sidebar, and nobody found it — a view is not a filter, and it does not belong in the row next to *Overdue* and *Unestimated*. The focused project persists in `planr_gantt_roadmap_focus` and falls back to the first project if the remembered one is gone. Uses the same filtered tree/schedule the Gantt shows (root/team/person + archive; not hide-done, which is a Gantt row filter).
  - **Removed**: Overview's old line picker (pick one project, the portfolio map collapses to that line's own calendar) is gone from the **map** — it was a straight duplicate of the project lens above, and a worse fit for a portfolio review besides. The map/Fahrplan toggle and the Δ/Plan/Archive filter popup stay; only the single-line detour on the map is gone.
  - **Kept, deliberately**: the **Timetable** (Fahrplan) under the same switcher still has a project picker (`planr_timetable_root`), shown only on that view. Narrowing a schedule to one project is not a duplicate of anything — no other surface lists one project's dates as a schedule — so removing it would have taken a capability away rather than a path, which is the one thing a removal may never do. A stored project that no longer exists is ignored rather than blanking the schedule.
  - **Report** — both lenses reach the **Management Summary PDF**: the portfolio map (`buildRoadmapSvgForPdf`) always, and one calendar page per project (checkbox `+ Projekt-Roadmaps`, on by default) for *every* root regardless of what the screen is filtering. [`src/utils/pdfGlyphs.js`](../src/utils/pdfGlyphs.js) sanitizes both SVGs the same way exports sanitize everything else, so neither prints a missing-glyph box.
- **Zoom + pan on the subway map** — it is a fixed-width SVG scaled to the container, which on a dense plan means squinting. (The project lens is a separate, DOM-based view — see "Project lens" above — and has its own zoom that is not this.) The `−` / `+` / `Fit` controls in the map's top-right corner (and Ctrl/Cmd + mouse wheel, anchored on the cursor) widen the drawing past its container and let it scroll in both axes; plain wheel still scrolls the page. Page-zoom semantics on purpose — re-laying out at every zoom step would move stations around while the user is trying to read one. A zoomed map can be dragged with the mouse (pointer events, so touch works too) or scrolled; a drag is told apart from a click by a 3 px threshold, so panning never opens an item. Persisted in `planr_roadmap_zoom`; at 100 % the container behaves exactly as before (no scrollbars, no max height, no drag handler).
- **No two stations, and no two labels, on the same spot** — the map runs three separation passes: routes are pushed apart where they run parallel (`MIN_DIST = 50`), stations of *different* lines that land within 21 px of each other are nudged **along their own route** (never in free 2D, so a station always stays on its line, keeps its place in the line's chronological order, and stays on its own side of the train), and station abbreviations are placed globally — six candidate offsets per label, first one that hits neither another label nor another line's dot wins, and a label that fits nowhere is dropped in favour of its tooltip. Guarded by [`src/utils/__tests__/roadmapCollisions.test.js`](../src/utils/__tests__/roadmapCollisions.test.js), which asserts the invariants (no reordering, still on the route, done stations behind the train) and not just the absence of overlaps.
- **Archive filter** — projects whose every leaf has been done for longer than N days (default 90; presets 30/60/90/180/365) and members whose `end` date is that far in the past are dropped from the roadmap, tree, Gantt, network, goal cards and the person dropdown. **On by default.** It is a display filter only: `tree`, `stats` and `scheduled` keep every archived item, so the headline percentage, PT totals and leaf counts do not move when the filter is toggled — hiding a completed project must never make the project look less complete. Exports (PDF/DOCX/HTML report) stay complete for the same reason. A root with no recorded completion date anywhere below it is never archived — the age is unknown, and guessing could hide work finished yesterday. The count is always visible (`📦 N archived` chip next to the filters, one click to show), so a shorter map is never a silent omission. Lives in [`src/utils/archive.js`](../src/utils/archive.js); state in `planr_show_archived` + `planr_archive_days`.
- **Summary view** — per-goal progress, deadlines, risks
- **Deadline states, one definition** — `deadlineStatus()` in [`src/utils/timeline.js`](../src/utils/timeline.js) returns `unscheduled | onTrack | atRisk | done | doneLate` for every typed root and is used by Overview, Deadlines, Gantt, Subway-Map, the pulse check, the HTML report and all PDFs. "At risk" is a **forecast**: once every deadline-relevant leaf is done, nothing can be missed any more, so finished work reports `done` (or `doneLate` when the recorded completion landed after the date — a retro fact, not an open risk) instead of a red alarm. The flag `isLate` is forecast-only; `missed` carries the historical fact.
- **One progress formula everywhere** — **every** aggregate percentage in the app comes from `aggregateProgressPct()` in [`src/utils/progress.js`](../src/utils/progress.js): the Overview headline and goal cards, the "Top items" table, the tree grid `%` column, the task detail panel, the Subway-Map train and line pills, the Deadlines cards, the HTML report, the Word report and all four PDFs. It is effort-weighted (`scheduleEffort` per leaf, unestimated leaves weigh 1) and phase-aware (`leafProgress`), and it never reads 100 % while a leaf is still open.
  - `done / total` leaf counting is a **different metric** — it answers "how many tasks", not "how much work", and weighs a 45 PT rebuild the same as a 1 PT typo fix. It is still shown, but always as a count next to the percentage (`44.5 % · 21/51 Aufgaben`), never *as* the percentage.
  - `treeStats()._progress` stores the unrounded figure; display sites format it with `progressPctLabel` (one decimal), so no surface can round differently from another. `_leafCount` / `_doneCount` carry the **unfiltered** subtree counts, so a view rendering a filtered tree (hide-done) can label the full scope instead of the visible remainder.
  - Guardrails: [`src/utils/__tests__/progressParity.test.js`](../src/utils/__tests__/progressParity.test.js) pins tree grid, Subway-Map, report model and PDF to the shared helper on a fixture where counting and weighing disagree hard; [`src/__tests__/exportParity.test.jsx`](../src/__tests__/exportParity.test.jsx) compares the rendered screen strings against the generated PDF/HTML.
- **Horizon guidance in Summary** — H1 / H2 / H3 are explained as near-term planning states, not as internal product terminology
- **Planning Review** — Decisions, open phase TODOs, Team Capacity, Load, Blocked work and Critical Paths in one review surface (`src/components/views/PlanReview.jsx`). Quick-assign inline. Lives inside **Plan mode**'s tab bar next to Schedule/Resources/Holidays rather than as a standalone tab of its own — the plan-review moment and the scheduling moment are the same session.
- **Run mode / Briefing** — the "what do I need to deal with today" screen (`src/components/views/BriefingView.jsx`), Run mode's only tab besides a borrowed Overview:
  - **Attention list** — one ranked feed instead of five chips to click through: overdue (a decide-by date has passed), Jira drift, at-risk (a deadline root's projected end has slipped, or an exploratory item's decision window closes within a week), blocked (an estimated leaf whose dependencies aren't all done), and unestimated (nothing to schedule yet). Built by [`src/utils/attention.js`](../src/utils/attention.js) `computeAttention()` off the same memoised tree index (`treeIndex`/`leafNodes`/`isDepsReady` in `scheduler.js`) the rest of the app uses, so it's one linear pass, not a fresh `tree.filter()` per row. Each row opens the item; a leaf row also carries a status-cycle button.
  - **Per-person queues** — what each person is on **now** (wip, or already running) and **next** (scheduled to start within the horizon), straight off the scheduler's own assignments. A handoff chain renders as one row with the `⇄ AB→CD` badge (`utils/handoff.js` `hasChain`/`chainShorts`/`chainTooltip`, the same one PlanReview uses) instead of two.
  - **Status change as a tree row** — every status control in Run mode (attention rows, queue rows) writes through the same `updateNode()` → `mutate()` path every other status control in the app uses (TreeView's Space key, the bulk-status buttons, QuickEdit's status dropdown) — one undo step, no second write path. `utils/completion.js` `statusChangePatch()` centralises what a manual status change also touches (progress, `completedAt`/`-Start`/`-End` stamping), shared by QuickEdit and Run mode so there's one definition of what "mark as wip/done" means, not two slightly different ones.
  - **Jira drift inline** — the reconcile result (see the Jira reconcile bullet below) rendered as rows you act on directly: a collapsible paste box, link-health counts, and status-drift rows with a per-row checkbox and an Apply button, all on the Run screen. Replaces the former "Jira-Abgleich" dialog — Phase 7 will make Jira a real connected source, but the import path (`utils/jiraSync.js`) and its parsing are unchanged; only where the result is shown moved.
- **Resources view** — teams + members (teams live here, not in Settings)
- **Holidays view** — edit holidays directly

## QuickEdit sidebar + NodeModal

QuickEdit and NodeModal share the same data model; QuickEdit now exposes the most important actions in tabs so the sidebar stays easier to scan:

- **Overview** — name, notes, status/progress + **phases** (when phases exist they define status and progress; manual editing is disabled). PhaseList component with progress bar, compact one-liner rows, and popout editor for details. Parent nodes show aggregate stats.
- **Workflow** — team and assignees; only for non-root items
- **Effort** — quick estimate buttons (XS–XXL) + best/factor/priority + confidence + prominent "Estimate now" CTA with pulse animation when unestimated; only for leaf nodes
- **Timing** — decide by, pinned start, parallel, queue + predecessors and inherited dependencies; available for all nodes (schedule controls only visible on leaves)

Tabs persist when switching between nodes — the active tab stays selected as long as it exists for the new node type. The same tab state is shared with batch editing so switching between single/multi selection feels seamless.

Shared phase components (`PhaseList`, `PhaseEditPopout` in `src/components/shared/Phases.jsx`) are reused identically across QuickEdit, NodeModal, batch editing, and Settings template editor — ensuring a single design language for phase management everywhere.

QuickEdit-specific:

- **Primary interaction** — single click on a node opens the sidebar
- **Tabbed layout** — reduces cognitive load for long task forms without hiding the most common actions
- **Searchable dropdowns** (`SearchSelect`) for any list with more than 5 items; popup renders via React Portal so it escapes modal overflow clipping and auto-flips upward when there's no room below
- **Predecessors and inherited deps** — add/remove dependencies in the Timing tab; inherited ancestor deps shown read-only
- **Pinned start** — date picker in Timing tab; shows "📌" when active, `×` to clear
- **Decide by** — date field for decision-gate items; overdue dates render red
- **Escape or click-outside** deselects
- **Commit strategy** — text/number inputs (name, notes, description, best days, factor, dep label) use a local-buffer pattern: keystrokes update local state only, and the upstream `onUpdate` fires on blur. Discrete controls (status, progress slider, date pickers, selects, buttons) commit immediately since each interaction is a single intentional action.

## Global search

- **Single input** in the sub-toolbar (top right), shared across Work Tree, Schedule, and Network tabs
- **Ctrl/Cmd+F** focuses and selects the field; **Esc** clears
- **Live highlight** — matches get an amber outline; non-matches dim
- **Auto-scroll to first match** — Tree scrolls the row into view, Gantt scrolls both axes to land on the first matching bar, Network pans/fits to the match set
- **Match count** — shown inline in the Gantt footer / Network toolbar

## Project Templates

- **Template picker in New Project wizard** — two built-in templates: Software Development (💻, default) and Generic / Empty (📋).
- **Seeds risks, sizes, and task templates** — the selected template populates `data.risks`, `data.sizes`, and `data.taskTemplates` at creation time; everything is editable in Settings afterwards
- **One-time seed** — `projectTemplateId` is not stored; the template is purely a creation-time convenience, not an ongoing link
- **Backwards compatible** — existing saved plans without template-seeded data continue to work unchanged; they fall back to built-in defaults as before

## Estimation

- **Inline** — `best` (optimistic days) and `factor` (complexity multiplier, default 1.5) directly on leaves
- **Estimation Wizard** — 7-step PERT wizard: workflow template selection, optimistic, likely, pessimistic inputs, dependencies, plus a Confidence step that suggests confidence based on risk factors. Risks are configurable in Settings (default catalogue provided as multi-lingual fallback)
- **Configurable T-shirt sizes** — the size catalogue (label, day count, uncertainty factor, optional description) is editable in **Settings → T-Shirt Sizes**; used in the wizard's Size step and in all quick-estimate pickers. Defaults to XS/S/M/L/XL/XXL; existing plans without `data.sizes` fall back to the built-in defaults automatically. Descriptions appear as tooltips on size buttons and as sublabels in the Estimation Wizard.

## Phases and templates

- **Phase effort percentages** — each phase can carry an optional effort share; if the sum is below 100%, the remaining share is distributed evenly across the unspecified phases
- **Multi-team phases** — a phase can be assigned to more than one team
- **Phase owners** — a phase can be assigned to more than one person
- **Weighted phase overlays** — the Gantt bar overlay respects phase effort percentages instead of splitting phases into equal-width segments
- **Template support** — task templates support multiple teams per phase and optional effort percentages

## Persistence

See [import-export.md](import-export.md).

- **localStorage** as fallback when no file is mounted (`planr_v2` key)
- **File System Access API** for native `.json` / `.md` mounts
- **Debounced auto-save** — writes the file 5 s after your last edit; rapid edits coalesce into one write
- **Save status pill** — one consolidated indicator with semantic color: `all saved · 14:32` (green) / `unsaved · saving in 4s` (amber, live countdown) / `saving…` (blue)
- **Re-mount on permission loss** — when the browser drops the file handle (typically after a reload) the status becomes `⚠ click to re-mount`; clicking opens a Save-As dialog pre-filled with the original filename, reliably re-creating the handle with a fresh permission grant
- **External change polling** — 5 s interval; picks up edits made outside the app
- **Ctrl+S / Cmd+S** — save now (bypasses the debounce)
- **Save as** — choose JSON or Markdown

## Import / Export

- **JSON** — full-fidelity round-trip
- **Markdown** — functional round-trip (all semantic fields; team/member IDs are regenerated). Supports confidence tags: `{conf:committed}`, `{conf:estimated}`, `{conf:exploratory}`.
- **CSV** — tabular export
- **Sprint Markdown / TODO lists** — horizon-filtered task list grouped by person; exportable directly from the Summary view
- **Mermaid** — dependency graph
- **SVG** — network graph and Gantt chart
- **PNG** — rasterized SVG (both)
- **HTML Report** — comprehensive bilingual HTML report via Export menu. Opens in a new tab and auto-triggers print. Sections: KPIs, Risks, Confidence, Roadmap, Goals/Deadlines, Team Capacity, Critical Path, Detailed Schedule.
- **Print / PDF** — browser-native
- **No missing-glyph boxes in exports** — pdfmake ships exactly one font (Roboto) and draws a rectangle for anything outside it, with no warning. The app's own vocabulary is full of characters that font lacks: `✓` for done work, `→` in date ranges, `◐` for half progress, `⚠` on warnings. They look right on screen and break only in the PDF. [`src/utils/pdfGlyphs.js`](../src/utils/pdfGlyphs.js) carries the **actual cmap of the bundled Roboto-Regular** (927 code points as 82 ranges) plus a substitution table verified against it (`✓`→`√`, `→`→`»`, `◐`→`●`, `⚠`→`!`, decorative emoji dropped), and every docDefinition passes through `sanitizePdfDoc` on its way to `createPdf`; the two roadmap SVG preparers apply the same table because embedded SVG bypasses the doc pass. [`src/__tests__/pdfGlyphs.test.jsx`](../src/__tests__/pdfGlyphs.test.jsx) walks the real docDefinition of all four PDFs and fails on any character the font does not have — so a new symbol is caught in CI rather than in a printed management summary.
- **Exports always cover the whole plan** — the views render filtered copies of the tree (hide-done, root/team/person, archive, single-project roadmap). Exports must ignore every one of them: a PDF reader cannot tell that a project is missing or that a percentage was taken over a subset. [`src/utils/exportCtx.js`](../src/utils/exportCtx.js) makes that structural rather than a rule to remember — `buildExportCtx` reads `tree` / `members` / `teams` / `meta` / `roadmapAssignment` off `data` (so App cannot pass a filtered tree even by accident), and `projectScopedCtx` re-derives them at the entry of every PDF, the HTML report and the Word export, logging loudly if it had to. [`src/__tests__/exportScope.test.jsx`](../src/__tests__/exportScope.test.jsx) proves it: with the archive filter active it asserts every surface still reports the full-plan figure, and that each PDF's output is byte-identical when handed a filtered context.
- **Jira reconcile** (Run mode → Jira drift section) — the return path of the Jira export, live inline on the Run screen rather than a dialog you open (Phase 7 will make Jira a real connected source; until then this is the import path). Matches plan items to tickets via the Jira-key custom field and reports the drift: status differences (Jira wins, per-row opt-out, one click writes them into the plan), renamed tickets, tickets with no plan item, linked items missing from the export, plus a paste-free link check for open work without a ticket and for one key used twice. Accepts Jira's CSV download, a clipboard TSV or a bare `KEY<tab>Status` paste, in English or German column names. See [import-export.md](import-export.md#jira-reconcile-srcutilsjirasyncjs).

## Internationalization (i18n)

- **Lightweight system** — `src/i18n.jsx`, ~900 keys, React context + `useT()` hook
- **Language selector** — Settings modal: Auto / English / Deutsch
- **No external library** — all translations inline
- **Tooltips covered, not just labels** — `data-htip` / `title` / `placeholder` route through `t()` the same as visible text; `i18n.test.js` guards a per-file allowlist (`TOOLTIP_TRANSLATED_FILES`) against hardcoded tooltip prose creeping back in

## Theme switching

- **Manual toggle** — Dark / Light / Auto in Settings
- **CSS via `data-theme`** — `data-theme="light"` or `data-theme="dark"` on `<html>`
- **Persisted** in `localStorage`

## Interaction rules

- **No double-click** anywhere — sidebar is primary, ⊞ button opens the full modal
- **Save button is a disk icon** next to the filename (not a big topbar button)
- **Names everywhere** — internal IDs are never shown to the user
- **Dark / Light / Auto mode** — manual toggle in Settings; defaults to system preference
- **Undo/redo instead of "are you sure?"** — every user-initiated edit (status/field changes, add, delete, duplicate, split, reorder, team/member edits, roadmap reorganize…) is one `⌘Z` away from reverting. Because the confirm dialog and the undo stack solve the same problem — "don't let me lose work by accident" — undo wins and the confirm is gone: deleting or duplicating a node, and splitting a handoff, no longer ask. `↶` / `↷` buttons sit in the topbar next to the save-state pill; both are disabled when there's nothing to step through. A slider drag or a burst of quick clicks coalesces into one undo step, not one per pixel. Confirms stay where undo can't help — discarding an in-progress edit that was never applied (`Unsaved changes will be lost`, "Discard this new item?"), and swapping the whole document (New project, restoring a snapshot, clearing snapshots), which also resets the undo stack since it no longer describes the document on screen. See [`src/utils/undo.js`](../src/utils/undo.js) and architecture.md § State flow.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save to the mounted file now (bypass debounce) |
| `Ctrl+F` / `Cmd+F` | Focus the global search field |
| `Ctrl+Z` / `Cmd+Z` | Undo the last edit (not while a text field has focus) |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo (not while a text field has focus) |
| `Esc` | Clear search / deselect / close modal |
| `Delete` | Remove selected node |
| `Ctrl+Click` | Toggle item in multi-selection |
| `Shift+Click` | Select range in tree |

### Tree editor (focus inside the Work Tree)

The keys below are scoped to the tree's own container (`tabIndex` + `onKeyDown`, not `window`) so the Gantt and the `/` palette keep their own key handling untouched. A hint line under the tree toolbar repeats this table. See [architecture.md](architecture.md#tree-editor-keyboard-model).

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Move the cursor to the previous/next visible row |
| `⇧↑` / `⇇↓` | Extend the multi-selection from the cursor |
| `Enter` | Edit the active row's name; committing creates a new sibling below and edits it |
| `⇧Enter` | Create a child row and edit it immediately |
| `Esc` (while editing) | Cancel — leaves an existing row's name untouched; removes a still-empty new row |
| `Tab` / `⇧Tab` | Indent (re-parent under the previous sibling) / outdent (re-parent to the grandparent) |
| `⌥↑` / `⌥↓` | Move the active row within its sibling order |
| `1`–`4` | Set priority (active row, or the whole multi-selection) |
| `S` / `M` / `L` / `X` | Apply a T-shirt size from the project's size catalogue |
| `Space` | Cycle status open → wip → done |
| `⌫` / `Delete` | Delete the active row, or the whole multi-selection, via the same confirm-free delete the toolbar uses |
| Paste (multi-line text) | Create one new row per line under the active row's parent, in one undo step |
