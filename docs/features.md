# Features

Full catalog of what Planr does. Grouped by area. Links point to detail docs where the behavior has enough depth to warrant its own page.

## Work breakdown

- **N-level tree** — unlimited nesting (leaves are detected structurally, not by fixed depth)
- **Root item types** — every tree root can carry a `type` (goal, painpoint, deadline) with `severity`, target `date`, and long-form `description`; no separate deadlines list
- **Hierarchical sort** — children always follow parents; collapse/expand all
- **Multi-select bulk editing** — Ctrl+Click toggles, Shift+Click selects a range; bulk edit team, priority, status, assignee
- **Status derivation** — parent status is computed from children (done / wip / open)
- **Progress tracking** — 0–100 % slider on leaves; weighted (by realistic effort) cascade to parents; circular indicator in the network graph

## Scheduling

See [scheduler.md](scheduler.md) for semantics.

- **Auto-scheduler** — leaf-only, capacity-aware, vacation-aware, holiday-aware
- **Topological ordering** by dependency; deps inherited from ancestors
- **Per-person capacity** — `pF[person]` tracker sequentializes assigned work
- **Team slots for unassigned tasks** — team-sized slot array prevents infinite parallelism
- **Pinned start** — hard floor on the start week; deps and capacity can still push later
- **Legacy `parallel` flag** — bypasses person capacity (kept for MD round-trip only; not in UI)
- **NRW public holidays** — built-in via Easter algorithm; custom holidays supported
- **Explicit vacation weeks** — per person, zero-capacity weeks
- **Blanket vacation deduction** — remaining unplanned vacation days reduce weekly capacity proportionally

## Critical path

- **Global CPM** — classic forward/backward pass, slack per item
- **Per-goal CPM** — each tree root has its own critical path restricted to its subtree
- **Highlighting** — critical chain is rendered red in the Gantt and the network graph
- **"Show critical only" toggle** — dims everything else in the Gantt

## Gantt chart

See [gantt.md](gantt.md).

- **Grouping** — project, project › team, team, or person
- **Zoom** — pixels per week, persisted in localStorage
- **Drag to pin** — drag a bar horizontally to set `pinnedStart`
- **Link handles** — drag from a bar's right edge onto another bar to add a dependency
- **Bezier dependency arrows** — 5 px stubs + cubic bezier between (forward and backward)
- **Click an arrow to remove it** — "×" badge at the arrow origin
- **Right-click context menu** — open editor, add predecessor/successor, pin/unpin, remove dep
- **Deadline markers** — vertical lines with labels; "at risk" badge when linked work overruns
- **Today marker** — green vertical line
- **Decide-by diamond** — amber/red 45°-rotated marker per task

## Network graph

See [network-graph.md](network-graph.md).

- **Recursive N-level layout** — 2-column for leaves, grid for many children
- **Bin-packing** — root trees packed with TD/BU flip for compactness
- **Bounding-box compaction** — whitespace between trees minimized
- **Obstacle-aware edge routing**
- **Fit-to-selection** — highlights zoom the viewport to the selected subset
- **Pinch to zoom, scroll to pan** — trackpad-native (wheel is NOT zoom)
- **Perceived 100 % = 150 % real** — zoom label divides by 1.5

## Views and navigation

- **Tree view** — classic hierarchical editor with indentation, priority, status, progress
- **Gantt view** — timeline with grouping
- **Network view** — subway-style graph
- **Summary view** — per-goal progress, deadlines, risks
- **Resources view** — teams + members (teams live here, not in Settings)
- **Holidays view** — edit holidays directly

## QuickEdit sidebar

- **Primary interaction** — single click on a node opens the sidebar
- **Searchable dropdowns** (`SearchSelect`) for any list with more than 5 items
- **Predecessors and successors** — add/remove both directions without leaving the sidebar
- **Escape or click-outside** deselects

## Estimation

- **Inline** — `best` (optimistic days) and `factor` (complexity multiplier, default 1.5) directly on leaves
- **Estimation Wizard** — PERT 3-point (optimistic, likely, pessimistic) → expected days + factor

## Persistence

See [import-export.md](import-export.md).

- **localStorage** as fallback when no file is mounted (`planr_v2` key)
- **File System Access API** for native `.json` / `.md` mounts
- **Auto-save** — debounced write to the mounted file
- **External change polling** — 5 s interval; picks up edits made outside the app
- **Ctrl+S / Cmd+S** — save now
- **Save as** — choose JSON or Markdown

## Import / Export

- **JSON** — full-fidelity round-trip
- **Markdown** — functional round-trip (all semantic fields; team/member IDs are regenerated)
- **CSV** — tabular export
- **Sprint Markdown** — horizon-filtered task list grouped by person
- **Mermaid** — dependency graph
- **SVG** — network graph and Gantt chart
- **PNG** — rasterized SVG (both)
- **Print / PDF** — browser-native

## Interaction rules

- **No double-click** anywhere — sidebar is primary, ⊞ button opens the full modal
- **Save button is a disk icon** next to the filename (not a big topbar button)
- **Names everywhere** — internal IDs are never shown to the user
- **Dark / Light mode** — system preference by default

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save to the mounted file |
| `Esc` | Deselect / close modal |
| `Delete` | Remove selected node |
| `Ctrl+Click` | Toggle item in multi-selection |
| `Shift+Click` | Select range in tree |
