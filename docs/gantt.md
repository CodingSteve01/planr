# Gantt Chart

Timeline view with dependency routing, drag-to-pin, and critical-path highlighting.

## Grouping

Top-left toolbar offers four modes:

- **Project** — grouped by tree root (each goal/painpoint/deadline gets a band)
- **Project › Team** — nested: project bands, then team sub-bands inside
- **Team** — grouped by team only
- **Person** — grouped by assignee (unassigned goes last)

The selection is persisted in `localStorage` (`planr_gantt_group`). Collapse individual groups via the caret or use the collapse/expand-all buttons.

## Rows: classic and compact

Beside the grouping pills sits a second choice, because it answers a related
question — the pills say what a row *is*, this says how many rows there are.

**Classic** (default, nothing changes for anyone who has not asked) gives every
task its own row, named in the left column. It is the honest shape and it is
what makes a real plan unreadable: on a 200-task plan it is two hundred rows,
each carrying one short bar a little further right than the one above — a
staircase down an otherwise empty canvas. The question a schedule exists to
answer, *what runs when and what runs at the same time*, is the one thing that
shape cannot show.

**Compact** lays each group's bars out the way a line of text lays out words:
left to right in plan order, into the first lane where the bar fits, opening a
new lane underneath only where two of them genuinely overlap. A group is then
exactly as tall as its busiest moment. Measured on a real 204-task plan: 52
lanes instead of 204 rows, and the chart 2286px tall instead of 7102.

**A row there is the grouping's own container** — the project, the team, the
person, the thread, whichever the pills chose — and nothing below it. The pills
already answer "per what"; compact takes them at their word. The first version
kept the work-package rows as well, each resetting the lanes, which is the
hierarchy back under another name: a package with two tasks still cost a header
row plus a lane, packages packed separately instead of together, and a group
whose work was filtered out kept a stack of empty headers. The staircase came
back as a terrace.

- A lane fits a bar when the bar does not **overlap** the last one in it — no
  clearance on top of that. Two tasks the scheduler ran back to back end and
  start at the same x, so any positive gutter pushed the second onto a lane of
  its own and re-drew the staircase inside the compact mode. The bars are
  already inset 2px each side, which is the gap the eye needs.
- A work package is not a row here. Its bar is the union of its children's and
  would overlap every one of them, so it would take a lane of its own in every
  group and say nothing the children do not.
- A task with no bar (unestimated, or finished without dates) takes no lane:
  there is nothing to pack and nothing to read.
- The **left column keeps only the container rows**, because a lane holds
  several tasks and one label per task would name rows that no longer
  correspond to them. The names live on the bars and in the tooltip; each
  container is as tall as the lanes beneath it, so the two columns line up.

All vertical positions — the dependency arrows, the bar rectangles, both
columns — go through one `rowLayout`, so the two modes cannot drift apart.
`rowLayout` measures from the **first row**, not from the top of the box, so an
absolutely placed compact row adds `FLAG_ROW_H` the way normal flow does: it
did not at first, and every bar sat 18px above where the arrows and the label
column agreed it was.
Persisted in `localStorage['planr_gantt_compact']`.

Dragging a bar sideways still pins it and the edge handles still resize it —
those are pointer deltas and care nothing about rows. **Dragging a bar up or
down to reorder is off in compact**: there the vertical axis says which *lane*
a bar is in, which is what else runs at the same time, not where it sits in the
order. The gesture would look like a reorder and mean something the lanes
cannot show, so it stays in the tree and the work order, where the order
lives.

## Zoom

Pixels-per-week (`WPX`) drives the horizontal density. Controls live in the **footer**, left side:

```
Zoom  [−]  [20]  [+]   [day grid]  …
```

- `−` / `+` multiply by 0.8 / 1.25
- The middle button shows the current WPX value and clicks-to-reset to the default
- A `day grid` badge appears once the zoom threshold (≥ 70 px / week) kicks in

Persisted in `localStorage` under `planr_gantt_zoom`. Valid range: 8 px (very compact months) to 140 px (wide days within a week).

## Day-level view

When zoom reaches 70 px / week or more:

- **Third header row** appears with day-of-month numbers (Mo–Fr per week). Today's number is green.
- **Faint vertical day separators** in the body make it easy to line up a bar with a specific date.
- **Per-day holiday tint** — only the actual holiday days are red-tinted (not the whole week as at coarser zoom). Derived from the `wds` working-days list: a weekday in plan range that's not in `wds` is a holiday.

## Bars

- **Colored by team** — solid team color as the bar fill (100 % opacity), matched to the network graph's root-node style
- **White bold text** with a subtle `0 1px 1.5px rgba(0,0,0,.3)` shadow for legibility on the lighter team palette entries
- **Confidence-based styling** — bar appearance reflects the item's confidence level:
  - **Committed** — solid fill (the default team-colored bar)
  - **Estimated** — striped/hatched pattern over the team color
  - **Exploratory** — dashed outline instead of a solid bar
- **Weighted phase overlay** — if a task has phases, the subtle phase segmentation inside the bar uses phase effort percentages instead of equal-width slices
- **Critical-path bars** get a 1.5 px red inset ring (via `.cp-bar`). A link-mode blue outline takes precedence when the user is actively creating a dependency.
- **Row hover** is a neutral rgba tint (`rgba(127,127,127,.10)` for direct, `.05` for connected rows) so the bar color stays untouched
- **Dragging cursor** appears on hover; link-mode switches to a crosshair
- **Done tasks** are not drawn
- **Unestimated leaves** show an empty row with a `no estimate` badge on the left — a reminder, not hidden

### Drag a bar to pin it

Click and drag a bar horizontally. On release, the start week becomes `pinnedStart` on the underlying task. A `📌` icon appears on the bar. The scheduler treats `pinnedStart` as a **hard floor** — it can't move the task earlier, but capacity and deps can still push it later. If that happens, the icon becomes `⚠📌` and the tooltip explains which constraint pushed it.

### Drag-to-edit-reality (done bars)

Done bars represent **reality**, not plan. A done bar therefore reacts differently:

- **Drag the bar body** — shifts both `completedStart` and `completedEnd` as a block (duration preserved). `completedEnd` is clamped to today so reality cannot leak into the future.
- **Drag the left edge** — moves `completedStart`, extending or compressing the recorded window backward. Clamped at `completedEnd` so start cannot pass end.
- **Drag the right edge** — moves `completedEnd` (and mirrors into `completedAt`), extending or compressing forward. Clamped at today and at `completedStart`.

Pinning is disabled for done bars — `pinnedStart` is a plan-side hint that has no meaning once a task is in the past.

To **unpin**, right-click the bar → `📌 Unpin (currently YYYY-MM-DD)`.

### Right-click context menu

- **📝 Open / edit…** — opens the QuickEdit side panel
- **⬇ Add a successor…** — puts you in click-link mode; click another bar to add it as a successor
- **⬆ Add a predecessor…** — same, but the other direction
- **📌 Pin to current start week** — pins the bar to where it currently sits
- **📌 Unpin** — drops the pin
- **× predecessor ID** — remove one specific predecessor directly

## Dependencies

A line is an arrow between two **bars**, so a row that draws nothing cannot be
one of its ends. The row renderer bails out on two cases — an unestimated task,
and a finished one with no dates — and the index the lines were built from
excluded only the first. A line then ran to a blank row in the middle of a
group and looked like it had come adrift; in compact, where a bar-less row
takes no lane at all, it landed on a lane holding other work entirely.

Arrows are drawn in the Gantt background with SVG. Shape:

- **10 px straight stubs** horizontally out of the source end and into the target start — the "runway" keeps the line readable at large vertical gaps
- **Cubic bezier** between the two stub endpoints with control-point offsets that scale with the horizontal distance (minimum 30 px) so backward links get a visible loop

This makes forward links (target right of source) smooth, and backward links (target left of source) loop naturally without the earlier step-routing 6-shape.

Default default opacity is 0.55 (CP: 0.7); hover bumps to 0.95 with a thicker stroke so the arrow stays visible against solid-fill bars.

### Creating a dependency

Two ways:

1. **Drag from the bar's right-edge handle** (the small circle sitting just outside the bar) onto another bar. A live preview line follows the cursor. Drop on the target to link.
2. **Right-click → Add a successor/predecessor** — then click the other bar.

All link mutations use a **targeted update path** in `App.jsx` (`addDep(fromId, depId)`) that reads the latest tree state — no stale-closure overwrites even when multiple mutations happen in the same tick.

**Multi-select fan-in:** when the dragged bar is part of the current rectangle selection, dropping it on a target X creates a `selected → X` link for every selected item. Drag from an unselected bar keeps the legacy 1→1 behaviour.

### Removing a dependency

Hover an arrow. A red `×` badge appears right at the source end of the arrow (close to the hover path so the cursor doesn't leave the hoverable area on its way to the badge). Click the badge → confirm.

Removal also uses a targeted path (`removeDep(fromId, depId)`) — it only touches the `deps` field on the source task. No other fields get clobbered by a stale snapshot. When removal leaves a leaf without any remaining links, the task is automatically marked `parallel: true` so the scheduler stops queuing it on the assignee's `pF` cursor (see `docs/scheduler.md` § Parallel flag).

### Hover behavior

Hovering a **bar** highlights all of its incoming and outgoing arrows (they become bolder and accent-colored). Hovering an **arrow** highlights just that arrow and enables its `×` badge.

## Deadline markers

Each tree root with a `date` becomes a deadline marker.

- **Vertical mast** at the week containing the date (amber for normal severity, red for critical)
- **Backfill** — a subtle gradient fades from transparent to the severity color, reaching back up to 8 weeks, so the eye traces a "runway" toward the date
- **Flag pennant** at the top with the deadline name — polygonal `clipPath` gives the flag a leading notch for the silhouette
- **At-risk marker** — an `!` prefix on the flag when any linked task ends after the date

## Search and highlight

The search field in the sub-toolbar (top right, shared across Tree / Gantt / Network) drives a match set. In the Gantt:

- Matching bars get a 2.5 px amber outline on top of their team color
- Non-matches dim to 25 % opacity
- The left row label dims to 35 %
- On query change, the body auto-scrolls both axes so the first match lands near the middle of the viewport
- The footer shows `🔍 N matches` so you can see at a glance whether the query hit anything

`Ctrl/Cmd+F` focuses the input. `Esc` clears it.

## Vacation overlays

Every task row marks any vacation period of its assignees — regardless of the active grouping mode (Project, Team, Person, or Project › Team).

**One line under the work package, and nowhere else.** Two earlier shapes were wrong in the same direction. It began as an amber block at the full row height drawn on every task row of the person away — one week off across a hundred rows painted a hundred blocks, and the chart read as if somebody had gone over it with a highlighter. Making it a strip along the whole ROW fixed the wash and left the other half: a week the task has nothing to do with became a loose line floating in the row's empty half, and in compact, where several tasks share a lane, those lines piled onto each other.

So both absence and load are drawn **inside the bar**, clipped to it, 3px on its foot: load at the very bottom, absence stacked directly above when both are on. Load follows the Load toggle; **absence is always drawn**, because "somebody was away in the middle of this" is a fact about the work rather than a reading you switch on — it is what explains a five-day task spanning three weeks. It is **hatched** where load is solid, which is the part that was missing at first: a thin solid amber line appearing under a bar with the load reading switched off was unexplainable, and it looked exactly like the load line it was not. That answers the question they are there for — what the load was while the work was happening, and why five days of work span three weeks — and nothing else competes for the row.

- Two people away on the same task get two lines, one above the other.
- Hover for the person and the dates; the line is too small to label.
- The row-wide reading still exists where a row genuinely **is** a person: the resource group header keeps its own week-by-week strip.
- Tooltip (`data-htip`): `PersonName · Vacation: YYYY-MM-DD → YYYY-MM-DD [· note]`
- `vacByPerson` is built once per render via `useMemo` — each row only looks up the IDs of its own assignees, so performance does not degrade with many rows.

## Hover tooltips (left panel)

Hovering a row label in the left panel shows a tooltip with task details (same style as the Network Graph tooltips). Includes name, team, assignee, estimate, confidence, dates, and status.

For items that have both an estimate and scheduling data, the tooltip shows a **duration breakdown** section:

```
Duration breakdown
  Best: 5d × 1.4 = 7.0d
  Calendar: 12d
  Vacation: +2d        (only shown when vacDed > 0)
  Capacity: 80%        (only shown when capPct < 100)
  Starts: 2026-01-12
```

This uses the fields already present on every scheduled item: `best`, `effort`, `calDays`, `vacDed`, `capPct`, `startD`.

## Horizon lines

Two vertical reference lines help visualize planning confidence boundaries:

- **H1 (committed boundary)** — approximately 8 weeks out. Items before this line should ideally be at "committed" confidence.
- **H2 (estimated boundary)** — approximately 18 weeks out. Items before this line should be at least "estimated".
- **H3 (exploratory zone)** — everything after H2. Work this far out may still be exploratory, but the app now calls that out explicitly in the footer and Summary view.

These are visual guides, not hard constraints. They help reviewers quickly spot items that are too far in the future to still lack assignment or estimates.

## Today marker

A solid green vertical line at the current week. No badge in the header — the line is enough.

## Decide-by marker

If a task has `decideBy`, a 45°-rotated diamond appears on its row at that week:

- **Amber** normally
- **Red** when the date is in the past

## Footer badges

Below the bar area:

- **Deadline badges** per goal — green "on track" / "done", amber "done · late", red "at risk", or yellow plain. States come from `deadlineStatus()` in [`src/utils/timeline.js`](../src/utils/timeline.js); "at risk" is a *forecast*, so a deadline whose scoped work is finished never shows red (see [features.md](features.md))
- **Critical path: N** — click to toggle dim-non-critical mode
- **N no estimate** — count of unestimated leaves (they're listed but uncheduled)
- **Planning horizon legend** — explicit H1 / H2 / H3 reminder so the confidence model is visible without prior training
- **Link-mode hint** — shown while a link-mode or link-drag is active
- **Confidence legend** — visual key explaining bar styling for each confidence level (solid = committed, striped = estimated, dashed = exploratory)

## Row order

The rows follow the tree, at every level. The bars say *when*; the list says
what the plan is.

They did not, until September 2026: a node's children were sorted by earliest
scheduled start with `displayOrder` only as a fallback, and the items inside a
group by priority. Both predate the tree becoming the order of the work, and
both are the pattern the scheduler carried until then — a second ranking that
quietly disagrees with the plan you arranged. A project whose first task waits
on another project sank to the bottom of a list somebody had deliberately
ordered.

One axis is still the view's own: grouped by resource, the people are listed
alphabetically. That is a property of the people, not of the plan.

## Keyboard-less conventions

- No double-click anywhere.
- Single click on a row label or on a bar opens the QuickEdit sidebar.
- Drag-the-bar = pin; drag-the-handle = link. The cursor tells you which mode you're in.
