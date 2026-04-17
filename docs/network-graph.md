# Network Graph

Dependency-topology view with bin-packed, compact layout. Not a timeline — the horizontal axis has no time meaning. The graph answers "what blocks what" at a glance.

## Layout

Rendered in [NetGraph.jsx](../src/components/views/NetGraph.jsx). The algorithm is recursive and has been iterated on many times — the current version produces compact, readable graphs across a range of tree shapes.

**Per-subtree layout:**
- **2-column grid** for items with few leaves — minimizes width
- **Multi-row grid** for parents with many children — keeps aspect ratio reasonable
- **Recursive** — a parent's layout call delegates to each child's subtree; sizes bubble up

**Root-level packing:**
- **Bin-packing with TD / BU flip** — each root tree is treated as a rectangle; the packer orients them top-down or bottom-up to fit the available width
- **Bounding-box compaction** — after packing, whitespace between trees is squeezed out

> Further optimization idea: lasso bounds (actual silhouette) instead of bounding box would squeeze even more whitespace out. Not currently implemented.

## Nodes

Each node shows:

- The name (never the internal ID)
- The team color as a left border
- A **circular progress indicator** derived from the leaf's `progress` (or status)
- **Critical-path highlight** — red outline if the node is on the global critical path

Leaves and parents render the same way. Only the layout differs.

## Edges

Dependency arrows between nodes, routed with obstacle-awareness so they don't cut through unrelated node rectangles. The critical path is red; everything else is muted.

## Zoom and pan

- **Pinch to zoom** (trackpad) — wheel is deliberately **not** zoom
- **Scroll to pan** — two-finger scroll moves the viewport
- **Cursor-anchored zoom** — the point under the cursor stays fixed while zooming in/out. Implemented with refs for pan/zoom so rapid wheel events read the freshest values (the prior closure-captured-state approach caused the viewport to jump erratically during fast scrolls).
- **Perceived 100 % = 150 % real zoom** — the zoom label divides by 1.5 so what looks like "100 %" is comfortable

This mapping matches what users actually want: "too small" at real 100 % vs. "right" at real 150 %.

## Fit-to-selection

The **Fit** button's behavior depends on what's selected:

- **Search active** — fit to the search match set (takes priority)
- **Nothing selected, no search** — fit the whole graph
- **One or more nodes highlighted** — zoom to the bounding box of the selection

Great for jumping back to a subtree after panning far away.

## Search and highlight

The search field lives in the shared sub-toolbar (top right, driven by App's global `search` state). When you type:

- Matching nodes keep full opacity with a 2.5 px amber outline
- Non-matches dim to 25 %
- On every query change, the viewport auto-pans/zooms to fit the match set via `fitToNodes(searchMatches)`
- Match count shows next to the Fit / zoom controls

`Ctrl/Cmd+F` focuses the input. `Esc` clears it.

## Filters

The Network tab now uses the shared sub-toolbar for focused graph slices:

- **Root filter** — keep only one top-level focus item and its descendants. Useful when you want to inspect one initiative without the rest of the graph competing for space.
- **Team filter** — works like the Tree filter: matching items stay visible, and their ancestors stay visible for context.
- **Combinable** — root + team can be combined, so you can inspect one root from the perspective of one team.

If a filter combination removes everything, the empty state tells you to widen the filter again.

## Interaction

- **Single click a node** — opens QuickEdit sidebar. No double-click.
- **Escape** — deselect, collapses the sidebar
- **Click outside any node** — also deselect
- **Save button** — disk icon next to the filename, not a big top-bar button

## Focus items

Focus items = tree roots. There is no separate data structure. A goal, painpoint, or deadline IS a tree root; it shows up in the graph as the root of its own subtree.

## When to use the graph vs the Gantt

- **Graph** — "which task unblocks which, and what's on the critical path right now"
- **Gantt** — "when does it actually happen, and does it fit before the deadline"

Both are driven by the same scheduler output, so switching between them gives two lenses on the same plan.
