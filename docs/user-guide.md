# User Guide

> **Planr is a desktop-first web application. It's optimized for large screens and keyboard/mouse interaction — it's not intended for mobile use.**

End-to-end walkthrough for planning a project in Planr. If you want the feature catalog, see [features.md](features.md). View-specific details live in [gantt.md](gantt.md) and [network-graph.md](network-graph.md).

Want to skip local setup? Open Planr directly: **https://codingsteve01.github.io/planr**

## The views

Planr is one flat row of views. Pick the one that answers the question you have:

| View | Answers |
|---|---|
| **Overview** | how far along is everything — the subway map, one line per project |
| **Work Tree** | the plan itself. The only place it is changed, and where the order of the work is set |
| **Work order** | in which order each person or team works through their items |
| **Schedule** | when each item happens, who is on it, where it is tight |
| **Roadmap** | one project as a calendar |
| **Network** | how the pieces depend on each other |
| **Planning** | what is committed, estimated or still exploratory |
| **Briefing** | the day — what is due, who is stuck, what Jira disagrees about |
| **Resources** | who there is, at what capacity, on and off boarding |
| **Holidays** | when nobody is there |
| **Report** | what leaves the building |

There are eleven views and no modes. Every view is always one click away.

The topbar has a **File** menu with Load file, Snapshots, Save as, Export…, an earlier-day entry, the Jira check and New project. The same actions are in the command palette (`/` or `⌘K`/`Ctrl+K`), which also jumps straight to any view — type a few letters and press Enter.

The **Work order** tab lists the leaf items per owner. The owner is the person on the item, or the team it sits with when nobody is. The rows use the tree's keys: `Space` cycles the status, `1`–`4` set the priority, `S`/`M`/`L`/`X` set the size, `E` opens the full editor and `⌥↑`/`⌥↓` move a row.

## 1. Start a project

Open the app. On first launch there is no project loaded.

Two ways to begin:

- **New Project Wizard** — guided steps: pick a template, fill in basics (name, dates, teams), add first goals/painpoints/deadlines.
- **Open File** — pick an existing `.json` or `.md` file via the file picker.

After either, the project is auto-saved to `localStorage` until you mount a file (see [import-export.md](import-export.md)).

### Picking a template

When starting a new project, pick a template that matches your use case:

| Template | Icon | Best for |
|---|---|---|
| Software Development | 💻 | Classic dev projects — RE, refinement, dev, testing |
| Generic / Empty | 📋 | Minimal starting point for any other project type |

The template seeds the project with matching **T-shirt sizes**, **risks**, and **task templates**. You can change all of these freely in Settings afterwards — the template is just a starting point.

## 2. Set up teams and members

Open the **Resources** tab.

- Teams live here (not in Settings). Each team has a name and a color — the color propagates into the tree, Gantt, and network graph.
- Members belong to exactly one team. A member has:
  - **name** (shown everywhere)
  - **role** (free-form text)
  - **cap** — capacity fraction (1.0 = full-time, 0.5 = half-time)
  - **vac** — total vacation days per year (used for blanket-reducing weekly capacity)
  - **start** — availability start date; capacity is zero before this
- Explicit vacation weeks go under **Vacations** — per-person, per-week entries with zero capacity.

> **Current limitation:** one member = one team. If someone works across teams with different capacities, the pragmatic workaround is multiple resource entries (e.g. "Alex — Backend 30%", "Alex — Frontend 20%"). A proper multi-team model is planned.

## 3. Build the work tree

Open the **Tree** tab.

The model is:

**Goal → Causes → Measures → Tasks**

Every root item (no dot in its ID) carries an optional `type`: **goal**, **painpoint**, or **deadline**. Set `severity`, target `date`, and a longer `description` on roots to drive the Summary view and deadline markers in the Gantt.

Children can be any depth. Leaves are detected structurally — there is no "level 3 = leaf" rule.

**Good practice:**

- Start top-down: one or two goals, one or two painpoints.
- Break each into 2–5 children. Don't force a balanced tree.
- Push estimates to **leaves only** — parents aggregate automatically.

### Typing a plan

The tree is built for bottom-up entry too — sketch structure on paper or a wireframe, then type it in without reaching for the mouse once:

1. Click a row (or use `↑`/`↓` to get there) so it's the active row — this is the same "selected" row the sidebar and the contextual toolbar already use, just with keyboard focus.
2. Press **⌘↵** (Ctrl+Enter off the Mac). A new, empty row appears directly below, already in edit mode. (Plain **Enter** or **F2** edits the row you are on in place instead — name, team, priority, size and status right in their columns — and **Enter** again saves it.)
3. Type the name, press **Enter**. It commits — and because this row is new, the next empty sibling opens right below it. Type the next name, `Enter`, next name, `Enter`… a whole list goes in without ever touching the mouse. An `Enter` on an empty field (nothing typed) just removes that empty row instead of leaving it behind — pressing `Enter` one time too many never litters the tree with nameless items.
4. Need a child instead of the next sibling? **⇧Enter** instead of `Enter` — same idea, one level deeper.
5. Typed something you didn't mean? **Esc** backs out without touching the row's name (or, on a row you just created, removes it).
6. Got the nesting wrong? Select the row and press **⌘⇧→** (or **Tab**) to indent it — it becomes the last child of the row above — and **⌘⇧←** (or **⇧Tab**) to outdent it, which puts it right after its old parent. Ids and dependency references follow. **⌘⇧↑**/**⌘⇧↓** re-order it among its siblings and never change its parent. The same four commands are buttons in the bar above the tree.
7. Select several rows (`⇧↑`/`⇧↓`, or the usual Ctrl/Shift-click) and press `1`–`4` for priority, `S`/`M`/`L`/`X` for a T-shirt size, or `Space` to step through open → wip → done — every row in the selection changes at once, as one `⌘Z`.
8. Already have a list somewhere else — a text file, an email, a wireframe's annotation? Select the row that should be the parent and paste. Every line becomes a row; leading tabs or a couple of spaces become nesting, and a leading `-`/`*`/`•` bullet is stripped automatically.

None of this replaces the Add-item dialog, the reorder buttons, or QuickEdit — they still do exactly what they did before. It's a second, faster way in for exactly the moment this section is about: getting a plan out of your head (or off a wireframe) and into the tree as fast as you can type. The full key list is in [features.md](features.md#keyboard-shortcuts); how it's built is in [architecture.md](architecture.md#tree-editor-keyboard-model).

## 4. Estimate leaf tasks

Two paths:

**Inline** — set `best` (optimistic days) and `factor` (complexity multiplier, default 1.5) directly. Realistic effort = `best × factor`.

**Estimation Wizard** — PERT 3-point. Enter **optimistic**, **most likely**, and **pessimistic**. The wizard now also lets you pick the workflow template directly, so a fresh branch can be classified and estimated in one pass.

T-shirt sizes (XS/S/M/L/XL/XXL by default) are configurable under **Settings → T-Shirt Sizes** — you can rename, reorder, add, or remove sizes and change the day counts. The selected size pre-fills the three-point estimate inputs and sets the default uncertainty factor.

**Confidence** is auto-derived per leaf based on assignment, estimate, and risk factors. You can override it manually or via the Estimation Wizard (which now includes a dedicated Confidence step suggesting a level based on the risks you entered). Three levels:

- **Committed** — person assigned, estimate in place, low risk
- **Estimated** — estimate exists but no person assigned yet
- **Exploratory** — scope unclear, no estimate, or high risk

Parents inherit the worst confidence from their children. Confidence drives bar styling in the Gantt (solid/striped/dashed) and feeds into the Planning Review tab.

If you use **phases**, you can now:

- assign a phase to multiple teams
- assign a phase to multiple people
- add an optional effort percentage per phase

Those percentages are used for weighted progress and weighted phase overlays in the Gantt.

## 5. Assign people

On each leaf:

- **team** — usually auto-synced with the assignee's team
- **assign** — one or more member IDs (but always shown by name)

If no one is assigned, the scheduler uses team-wide slots (see [scheduler.md](scheduler.md)) — the task still runs, but it shares time with other unassigned tasks on the same team.

**Teams of one:** If a team has exactly one member, picking just the team is equivalent to assigning that member directly. The scheduler routes through the per-person path so vacation weeks and the person-capacity counter apply precisely — no accuracy loss compared to an explicit assign.

## 6. Declare dependencies

A dependency means: this task can only start after its predecessor finishes.

Three ways to add one:

- **In QuickEdit or NodeModal** — the "Predecessors" / "Successors" section with a searchable dropdown.
- **In the Gantt** — drag from a bar's right-edge handle onto the target bar. See [gantt.md](gantt.md#creating-a-dependency).

Deps are inherited from ancestors: if a parent depends on X, all its leaves inherit that dependency. This is intentional — it lets you gate a whole sub-project on a single prerequisite.

The **Network** tab draws these dependencies. When the plan has more than 140 items and no project or scope filter is set, it does not draw the graph at once. It shows a short note with a project picker instead. **Draw all of it anyway** draws the whole plan.

## 7. Schedule

The scheduler runs automatically on every tree change — there is no "run schedule" button.

What it respects:

- Topological order of dependencies
- Per-person capacity (one assignee's tasks run sequentially)
- Team slots for unassigned tasks (prevents infinite parallelism)
- Pinned start dates (hard floor, but deps can still delay)
- Vacations (explicit weeks zero out; remaining days reduce capacity proportionally)
- Holidays (shorter weeks)

If an assignment is impossible inside the planning window, the task is dropped to the last week and flagged.

See [scheduler.md](scheduler.md) for the algorithm.

## 8. Review the result

Six views, each with a different lens:

- **Tree** — structure and progress
- **Gantt** — timeline, conflicts, critical path, confidence bar styling — see [gantt.md](gantt.md)
- **Network** — dependency topology and critical path — see [network-graph.md](network-graph.md)
- In **Network**, you can also narrow the graph via the sub-toolbar:
  - **Root filter** — inspect just one top-level branch
  - **Team filter** — inspect only one team's slice, while keeping ancestors visible for context
- **Roadmap** — metro-style map showing all projects as colored subway lines. Each station represents a cluster of tasks with similar end dates. A pulsing train marker shows progress along the line (effort-weighted). Hover stations or legend items for tooltips; click a legend item to open that task directly. Projects are assigned to fixed routes by duration — the map is stable as the plan evolves.
- **Summary** — per-goal progress, deadline risk, team load
- **Planning** — the Planning Review tab with four sections:
  - **Decisions** — items that are ready (no blocking deps) but need a person assigned. Quick-assign inline.
  - **Phase todos** — open phases grouped by person or fallback team, including inline phase-owner assignment.
  - **Team Capacity** — per-team member load overview
  - **Blocked** — items waiting on unfinished dependencies
  - Shows breadcrumbs for easy navigation to any item.

Toggle **Critical Path Only** in the Gantt to dim everything non-critical.

The app also communicates the **three planning horizons** more explicitly now, but in user language instead of product wording:

- **H1** — near-term work that should already be **verbindlich / committed**
- **H2** — work coming after that, which should be **grob geplant / at least estimated**
- **H3** — further-out work that may stay **offen / exploratory**

You see this in the Gantt footer and in the Summary view, so the application teaches the rule while you plan instead of expecting you to remember it.

### Two roadmap lenses, one for each moment

Same renderer family, two homes — pick the one that matches what you're doing
rather than switching a dropdown on one screen:

- **Portfolio lens (Overview)** — the Subway map, always every
  project. Use this to compare eight lines at a glance and to see the Δ
  banner (what moved since your review cutoff) sitting right above the
  map. There is no per-project picker here; narrowing to one line happens in
  the Roadmap tab.
  - **Zoom** — `−` / `+` / `Fit` in the map's top-right corner, or Ctrl/Cmd +
    mouse wheel over the map. Above 100 % you can drag the map with the mouse
    or scroll it in both directions, so a crowded plan is readable instead of
    tiny. Plain scrolling still moves the page.

- **Project lens (the Roadmap tab)** — a tab of its own, directly
  after Schedule. It renders a **real roadmap for one project**: one row per work package on
  a month axis, sized by its actual dates, with its tasks as stops, today as
  a green line and the deadline (if there is one) in red. Hover a row or a
  stop and you get the **same item card the network graph shows** — status,
  dates, effort, dependencies, phases; click it and the item opens in its
  **normal edit dialog**, right where you are.
  Pick the project from the searchable field at the top; your choice is
  remembered. It is drawn as real DOM (the same fixed row height as the
  Gantt), not the Subway map's scaled SVG, so it never grows oversized on a
  wide window; **Zoom** here is a factor on how much fits the pane — `Fit`
  shows the whole project edge to edge, `−` / `+` step it up to 8× and
  scroll. Use this when you want to talk about one project rather than
  compare eight — you're already in the tool where you'd act on what you
  see. The same underlying data goes into the Management Summary PDF as its
  own page per project, drawn by the Subway map's SVG renderer there.

- **Archive** (⚙ Filter popup, and a chip in the sub-toolbar) — hides
  projects whose work has been finished for longer than N days (default 90) and
  people who offboarded that long ago. **On by default**, because a plan that
  has been running for a year should open on the work that is still live. The
  threshold is right there in the popup: 30 days catches last quarter's
  projects, 180 keeps almost everything.

  What archiving does **not** do: change any number. The headline percentage,
  the PT total and the leaf counts keep counting the archived work — a finished
  project stays finished. Exports (PDF, Word) also stay complete;
  they are documents of record. Only the map, tree, Gantt, network, goal cards
  and the person dropdown get shorter, and the `N archived` chip always
  says how much, one click away from showing it again.

  A finished project with no recorded completion date anywhere below it is never
  archived — Planr cannot tell whether that was last week or in 2019.

  **Exports ignore all of this.** The PDFs (including the per-project roadmap
  pages) and the Word export always cover the whole plan,
  whatever the screen is currently filtering —
  including the archived projects, and including projects hidden because you
  are looking at a single-project roadmap. Someone reading a PDF cannot tell
  that a project is missing, so the export is never allowed to leave one out.

### Review and presentation filters (⚙ Filter)

The sub-toolbar carries a single **⚙ Filter** chip that opens a popup with two sections; both are global, persisted in localStorage, and affect every view at once:

- **Δ Review (Diff)** — pick a past cutoff (presets 7 / 14 / 30 days or a custom date). Planr replays the per-leaf history log embedded in the markdown (`## History` block, auto-maintained on save) up to that date and compares to the current tree. Result:
  - Roadmap: amber trail + ghost-train at past position, "+ΔN%" pill on the live train, station/legend pills counting completions (`✓ N`) and progress-only edits (`▲ N`), pulsing halos on reached stations.
  - Tree: per-leaf badge (`⊕ NEU` / `✓ erledigt` / `+N%`), optional **"Only changed"** filter that hides untouched leaves.
  - Gantt: bars completed in window glow green, progress-changed bars glow amber, the progress band splits past/now with an amber tick.
  - Network: nodes that moved get a pulsing green/amber ring; "Only changed" dims everything else to 18 %.
  - Summary banner: tasks done, tasks started (`open → wip/done`), effort burnt, available person-days, vacation/holiday loss, utilisation, new lines.

- **▶ Plan (Horizon)** — pick a forward window (presets +7 / +14 / +30 / +60 days or an until-date). Planr keeps tasks scheduled to fall inside the window and:
  - Tree/Gantt hide non-matching rows (toggle **"Only planned in window"**, default on). NetGraph dims out-of-horizon nodes instead of dropping them.
  - Roadmap fades out-of-window stations to ~22 % and draws a **blue dashed forward trail** + **planning ghost-train** ahead of the live train, plus a blue `+ΔN%` pill — Diff/Ist/Plan reads as one coherent palette (amber = past, white = now, blue = planned).

Use the diff filter to drive a sprint review ("Stand 2026-04-28 → heute"); use the horizon filter to point at "everything we have scheduled for the next 6 months" during planning meetings. The two filters are mutually exclusive — review tells a past story, plan tells a future story; the popup auto-clears the other section when one is set.

### Soll/Ist comparison (estimate vs reality)

Every done leaf carries `best` + `factor` (the estimate) plus `completedStart` + `completedEnd` (the actual run). Wherever both are present, the app computes a workday-adjusted actual duration (weekends and holidays subtracted) and compares it to the realistic estimate (`best × factor`).

- **Per task** — open a done item in QuickEdit (or the side panel) to see a Planned / Actual line: `Planned: 7d · Actual: 9d (2026-05-04 → 2026-05-13) · Δ +2d (+29%)`. (The labels read `Soll:` / `Ist:` in both languages.) The Δ pill is amber when the task came in within ±20% of the estimate, red when it overran by more than 20%, green when it came in more than 20% under. Hover the actual value to see the confounders that were excluded (`Calendar days: 10 · Weekends: 2 · Holidays: 1`).

- **Per window (Retro panel)** — when the Δ Review filter is on, the Overview map has a **Review · Estimate vs actual** band above it. It aggregates over every leaf completed in the window:
  - The estimated and actual workdays in total, and their ratio (green below 0.80, amber between, red above 1.20).
  - The share of tasks landing within ±20% of their estimate, with the counts.
  - **Largest estimate overruns** / **Largest underruns** — three each, clickable to open the task.

Treat the ratio as a learning signal, not as a target. The same retro panel surfaces both the systemic over/underrun and the individual outliers so you can decide whether to revise the size catalogue's factor, re-estimate certain task types, or just accept that one outlier and move on.

### Keeping Jira and Planr in sync

The Jira export creates tickets; **Jira drift section** (below the
milestones on the Briefing screen) is how you find out what drifted
afterwards — inline, not a dialog you have to open. It matches plan items to
tickets through the Jira-key custom field (`{cv.jira:PRJ-385}` in the
markdown), so make sure your work packages carry that field.

1. **Link health** answers, with no input at all: which open work packages have
   no ticket (they will never show up in Jira — use the Jira export to create
   them), and which Jira key is sitting on two plan items.

2. The collapsible paste box takes a pasted Jira table: the CSV from Jira's
   *Export*, a copied search result, or just `PRJ-385⇥Done` lines. English and
   German column names both work. You get four lists:
   - **Status drift** — Jira says done, the plan says in progress. Jira counts
     as the truth here; untick any row you disagree with, then **Apply**
     writes the rest into the plan (progress moves with the status, and the
     done-date is stamped as usual). The same drift rows also surface in the
     ranked **attention list** at the top of the screen, each with its own
     one-click apply.
   - **Renamed** — the titles diverged. Reported only, never auto-applied;
     you decide which name is right.
   - **Only in Jira** — tickets nobody planned. Either plan them or close them.
   - **Only in the plan** — linked items missing from the export: deleted in
     Jira, or simply outside the query you pasted.

An unrecognised Jira workflow status is always read as *open*, never as done —
so a custom status can never silently mark work finished.

## 9. Adjust

Common moves:

- **"This is my next task"** — select it in the Work Tree, open QuickEdit, click **Start today**. Pins `pinnedStart` to today so the scheduler won't place it any earlier.
- **Push a task later** — drag its Gantt bar horizontally, or set a future Pinned start date in QuickEdit. A pin is a **hard floor** only (capacity/deps can still push it rightward — that shows as `⚠📌`).
- **Reorder siblings** — select an item in the Work Tree, then use the contextual toolbar: `⤒ First`, `▲ Up`, `▼ Down`, `⤓ Last`. Reordering writes a `displayOrder` on the siblings. IDs and dependency references stay as they are. Only moving an item under a different parent renumbers IDs, and the dependency references follow.
- **Move work earlier** — reduce the estimate, remove a blocking dep, or bump `prio` (lower number = higher priority, breaks ties).
- **Split a task** — add children under it via the child button (`↳`) on its row, `⇧Enter`, or the Add modal. The `+` button adds a new row below instead. The leaf check flips: the former leaf becomes a parent and is no longer scheduled; its children are.
- **Mark done** — set status to `done` or slide progress to 100 %. The bar stays on the timeline, drawn as done, and you can still edit it.
- **Find a specific item fast** — `Ctrl/Cmd+F` focuses the global search (top right). The tree filters to the matching rows. The Gantt keeps only the matching tasks. The Network keeps every node in place, outlines the matches in amber, dims the rest and pans to them. In the Work order the search narrows the queues to matching rows; `Enter` jumps to the first one. In the Gantt and the Network, `▲`/`▼` or `Ctrl/Cmd+↑`/`↓` step from match to match.
- **Pull TODO lists per person** — use **Export TODO** in the Briefing. You get Markdown grouped by person for the selected horizon.

### From a date on

"From March, Noah works three days a week." Open the switch in the top bar
that reads **Today**, pick the day (or "Next month", "Next quarter"), and edit
Noah the way you always do. A bar says which day you are working on. His
capacity, weekly hours, meetings and meeting plans change on that day; the plan
before it is untouched. The same works for a team's meeting plans and for what
is in a meeting plan.

Each dialog lists its **Planned changes**; click a date to work on it, or the ×
to take the change away. **Back to today** leaves the date.

### Trying something first: scenarios

"What if Noah is out for four weeks?" is not a question to answer by editing
the plan and undoing it afterwards. Open the switch in the top bar (it reads
**Plan**), choose **New scenario…**, give it a name. From then on a bar in the
scenario's colour sits under the top bar: everything you see and change is the
scenario, and the plan is untouched.

Change it the way you change the plan — the tree, Resources, absences, the work
order. The bar counts what you changed and says what it comes to. **Compare**
opens the full picture: which projects end later or earlier and by how much,
whose load shifts, which tasks move, and the list of your changes, each with a
button to take it back. In the schedule, a dashed outline shows where a bar sits
in the plan.

- **PDF** in the comparison gives you the same picture as a document to pass on.
  It says on every page that it is a scenario.
- **Back to plan** leaves the scenario; it stays saved in the file and you can
  return to it from the switch at any time.
- **Apply to plan** makes the scenario the plan. ⌘Z takes it back.
- **Delete scenario** (under "more" at the end of the bar) removes it. ⌘Z brings
  it back.

Work on the plan in the meantime as usual. A scenario only stores what it
changes, so progress you record in the plan is in every scenario as well. If the
plan drops something a scenario had changed, the scenario says how many of its
changes no longer fit.

## 10. Save

- **Ctrl+S / Cmd+S** — save now (bypasses the 5 s debounce).
- **Save as** — choose `.json` or `.md` format; this is also the reliable way to re-mount a file after the browser drops permission (page reload).
- If a file is mounted, changes auto-save **5 s after your last edit**. Rapid edits coalesce into one write.
- The **status pill** in the topbar tells you exactly where you stand:
  - `all saved · 14:32` (green) — disk and app are in sync
  - `unsaved · saving in 4s` (amber) — debounce countdown ticking down
  - `saving…` (blue) — write in flight
  - `⚠ click to re-mount` (amber, clickable) — permission lost; click triggers Save-As with the original filename
- **External change polling** runs every 5 s; edits you make in another app are picked up automatically.

See [import-export.md](import-export.md) for format details and round-trip caveats.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save to the mounted file now (bypasses the 5 s debounce) |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Save as |
| `Ctrl+O` / `Cmd+O` | Open a file |
| `Ctrl+E` / `Cmd+E` | Open the Report tab (the export cards) |
| `Ctrl+,` / `Cmd+,` | Open the settings |
| `Ctrl+K` / `Cmd+K` or `/` | Command palette |
| `?` | Keyboard map |
| `Ctrl+F` / `Cmd+F` | Focus the global search field |
| `Ctrl+Z` / `Cmd+Z` | Undo the last edit |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo |
| `Esc` | Clear search / deselect / close modal |
| `Delete` | Remove selected node |
| `Ctrl+Click` | Toggle multi-selection |
| `Shift+Click` | Range-select in tree |

In the tree, `0` marks the active row as dropped (and takes it back). The other tree keys are in [features.md](features.md#keyboard-shortcuts).

Undo/redo work anywhere in the app except while a text field has focus — there, `Ctrl/Cmd+Z` is left to the browser's native text-editing undo. `↶` / `↷` buttons next to the save-state pill do the same thing for click users; both grey out when there's nothing to step through.

## Language and theme settings

Open **Settings** (gear icon in the topbar) to configure:

- **Language** — Auto / English / Deutsch. "Auto" follows `navigator.language`. All UI labels, tooltips and the exports are bilingual.
- **Item editor** — Auto / Side panel / Dialog. Auto keeps the editor panel beside the tree while there is room for both, and switches to a dialog when there is not. Side panel and Dialog fix the choice.
- **Theme** — Dark / Light / Auto. "Auto" follows your OS preference (`prefers-color-scheme`). The choice is persisted in `localStorage`.

## Interaction conventions (important)

These are deliberate — don't fight them:

- **Single click, not double click.** One click opens the QuickEdit sidebar. The `⊞` button opens the full modal.
- **Scroll = pan, pinch = zoom** (network graph). Wheel does NOT zoom.
- **Names, never IDs.** The app always shows `Frontend` and `Alex Noor`, never `FE` and `alex`.
- **Perceived 100 % = 150 % real zoom** in the graph. The zoom label divides by 1.5 so "100 %" looks natural.
- **Searchable dropdowns** whenever a list has more than about 5 items. Type to filter.
