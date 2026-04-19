# User Guide

> **Planr is a desktop-first web application. It's optimized for large screens and keyboard/mouse interaction — it's not intended for mobile use.**

End-to-end walkthrough for planning a project in Planr. If you want the feature catalog, see [features.md](features.md). View-specific details live in [gantt.md](gantt.md) and [network-graph.md](network-graph.md).

Want to skip local setup? Open Planr directly: **https://codingsteve01.github.io/planr**

## 1. Start a project

Open the app. On first launch there is no project loaded.

Two ways to begin:

- **New Project Wizard** — guided steps: pick a template, fill in basics (name, dates, teams), add first goals/painpoints/deadlines.
- **Open File** — pick an existing `.json` or `.md` file via the file picker.

After either, the project is auto-saved to `localStorage` until you mount a file (see [import-export.md](import-export.md)).

### Picking a template

When starting a new project, pick a template that matches your use case. Five templates are available:

| Template | Icon | Best for |
|---|---|---|
| Software Development | 💻 | Classic dev projects — RE, refinement, dev, testing |
| Event Planning | 🎉 | Venue-based or logistics-heavy events |
| Marketing Campaign | 📣 | Brief → creative → approval → launch flows |
| Research / Study | 🔬 | Experiments, long-horizon studies, write-ups |
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
- **Right-click menu in the Gantt** — "Add a predecessor…" or "Add a successor…" then click the other bar.

Deps are inherited from ancestors: if a parent depends on X, all its leaves inherit that dependency. This is intentional — it lets you gate a whole sub-project on a single prerequisite.

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

## 9. Adjust

Common moves:

- **"This is my next task"** — select it in the Work Tree, open QuickEdit, click **Start today**. Pins `pinnedStart` to today so the scheduler won't place it any earlier.
- **Push a task later** — drag its Gantt bar horizontally, or set a future Pinned start date in QuickEdit. A pin is a **hard floor** only (capacity/deps can still push it rightward — that shows as `⚠📌`).
- **Reorder siblings** — select an item in the Work Tree, then use the contextual toolbar: `⤒ First`, `▲ Up`, `▼ Down`, `⤓ Last`. All IDs in the sibling group renumber sequentially, dep references update everywhere.
- **Move work earlier** — reduce the estimate, remove a blocking dep, or bump `prio` (lower number = higher priority, breaks ties).
- **Split a task** — add children under it via the `+` row button or the Add modal. The leaf check flips: the former leaf becomes a parent and is no longer scheduled; its children are.
- **Mark done** — set status to `done` or slide progress to 100 %. The bar disappears from the timeline.
- **Find a specific item fast** — `Ctrl/Cmd+F` focuses the global search (top right). Matches highlight amber across Tree, Gantt, and Network tabs, and each view auto-scrolls/pans to the first match.
- **Pull TODO lists per person** — use **Summary → Up next → Export TODO list** or the topbar export entry. You get Markdown grouped by person for the selected horizon.

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
| `Ctrl+F` / `Cmd+F` | Focus the global search field |
| `Esc` | Clear search / deselect / close modal |
| `Delete` | Remove selected node |
| `Ctrl+Click` | Toggle multi-selection |
| `Shift+Click` | Range-select in tree |

## Language and theme settings

Open **Settings** (gear icon in the topbar) to configure:

- **Language** — Auto / English / Deutsch. "Auto" follows `navigator.language`. The app uses ~350 translated keys; all UI labels, tooltips, and the HTML report are bilingual.
- **Theme** — Dark / Light / Auto. "Auto" follows your OS preference (`prefers-color-scheme`). The choice is persisted in `localStorage`.

## Interaction conventions (important)

These are deliberate — don't fight them:

- **Single click, not double click.** One click opens the QuickEdit sidebar. The `⊞` button opens the full modal.
- **Scroll = pan, pinch = zoom** (network graph). Wheel does NOT zoom.
- **Names, never IDs.** The app always shows `Frontend` and `Alex Kim`, never `FE` and `alex`.
- **Perceived 100 % = 150 % real zoom** in the graph. The zoom label divides by 1.5 so "100 %" looks natural.
- **Searchable dropdowns** whenever a list has more than about 5 items. Type to filter.
