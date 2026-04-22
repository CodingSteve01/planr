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

- **Tree view** — classic hierarchical editor with indentation, priority, status, progress
- **Gantt view** — timeline with grouping
- **Network view** — subway-style graph
- **Roadmap view** — metro-style SVG map. Each project is a colored subway line on one of 8 pre-computed fixed routes (assigned by project duration, longest project → longest route; assignment is stable across plan edits). Stations represent clusters of leaf tasks whose end dates fall within 14 days of each other — close-deadline tasks are grouped into one station to keep the map readable. Station positions are proportional to their date within the project span. A pulsing train marker sits at the effort-weighted progress point along the line. Hover any station or train for a tooltip; click a legend item to open that task in QuickEdit. The legend below the map lists all stations with their full names and expands clusters.
- **Summary view** — per-goal progress, deadlines, risks
- **Horizon guidance in Summary** — H1 / H2 / H3 are explained as near-term planning states, not as internal product terminology
- **Planning Review tab** — Decisions, open phase TODOs, Team Capacity, and Blocked work in one review surface. Quick-assign inline. Shows breadcrumbs.
- **Resources view** — teams + members (teams live here, not in Settings)
- **Holidays view** — edit holidays directly

## QuickEdit sidebar + NodeModal

QuickEdit and NodeModal share the same data model; QuickEdit now exposes the most important actions in tabs so the sidebar stays easier to scan:

- **Overview** (Überblick) — name, notes, status/progress + **phases** (when phases exist they define status and progress; manual editing is disabled). PhaseList component with progress bar, compact one-liner rows, and popout editor for details. Parent nodes show aggregate stats.
- **Workflow** — team and assignees; only for non-root items
- **Effort** (Aufwand) — quick estimate buttons (XS–XXL) + best/factor/priority + confidence + prominent "Estimate now" CTA with pulse animation when unestimated; only for leaf nodes
- **Timing** (Zeitplan) — decide by, pinned start, parallel, queue + predecessors and inherited dependencies; available for all nodes (schedule controls only visible on leaves)

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

## Internationalization (i18n)

- **Lightweight system** — `src/i18n.jsx`, ~350 keys, React context + `useT()` hook
- **Language selector** — Settings modal: Auto / English / Deutsch
- **No external library** — all translations inline

## Theme switching

- **Manual toggle** — Dark / Light / Auto in Settings
- **CSS via `data-theme`** — `data-theme="light"` or `data-theme="dark"` on `<html>`
- **Persisted** in `localStorage`

## Interaction rules

- **No double-click** anywhere — sidebar is primary, ⊞ button opens the full modal
- **Save button is a disk icon** next to the filename (not a big topbar button)
- **Names everywhere** — internal IDs are never shown to the user
- **Dark / Light / Auto mode** — manual toggle in Settings; defaults to system preference

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save to the mounted file now (bypass debounce) |
| `Ctrl+F` / `Cmd+F` | Focus the global search field |
| `Esc` | Clear search / deselect / close modal |
| `Delete` | Remove selected node |
| `Ctrl+Click` | Toggle item in multi-selection |
| `Shift+Click` | Select range in tree |
