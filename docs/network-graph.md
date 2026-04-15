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
- **Perceived 100 % = 150 % real zoom** — the zoom label divides by 1.5 so what looks like "100 %" is comfortable

This mapping matches what users actually want: "too small" at real 100 % vs. "right" at real 150 %.

## Fit-to-selection

The **Fit** button's behavior depends on what's selected:

- **Nothing selected** — fit the whole graph
- **One or more nodes highlighted** — zoom to the bounding box of the selection

Great for jumping back to a subtree after panning far away.

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
