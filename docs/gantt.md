# Gantt Chart

Timeline view with dependency routing, drag-to-pin, and critical-path highlighting.

## Grouping

Top-left toolbar offers four modes:

- **Project** — grouped by tree root (each goal/painpoint/deadline gets a band)
- **Project › Team** — nested: project bands, then team sub-bands inside
- **Team** — grouped by team only
- **Person** — grouped by assignee (unassigned goes last)

The selection is persisted in `localStorage` (`planr_gantt_group`). Collapse individual groups via the `▼` caret or use the `▶`/`▼` buttons to collapse/expand all.

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
- **Critical-path bars** get a 1.5 px red inset ring (via `.cp-bar`). A link-mode blue outline takes precedence when the user is actively creating a dependency.
- **Row hover** is a neutral rgba tint (`rgba(127,127,127,.10)` for direct, `.05` for connected rows) so the bar color stays untouched
- **Dragging cursor** appears on hover; link-mode switches to a crosshair
- **Done tasks** are not drawn
- **Unestimated leaves** show an empty row with a `no estimate` badge on the left — a reminder, not hidden

### Drag a bar to pin it

Click and drag a bar horizontally. On release, the start week becomes `pinnedStart` on the underlying task. A `📌` icon appears on the bar. The scheduler treats `pinnedStart` as a **hard floor** — it can't move the task earlier, but capacity and deps can still push it later. If that happens, the icon becomes `⚠📌` and the tooltip explains which constraint pushed it.

To **unpin**, right-click the bar → `📌 Unpin (currently YYYY-MM-DD)`.

### Right-click context menu

- **📝 Open / edit…** — opens the QuickEdit side panel
- **⬇ Add a successor…** — puts you in click-link mode; click another bar to add it as a successor
- **⬆ Add a predecessor…** — same, but the other direction
- **📌 Pin to current start week** — pins the bar to where it currently sits
- **📌 Unpin** — drops the pin
- **× predecessor ID** — remove one specific predecessor directly

## Dependencies

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

### Removing a dependency

Hover an arrow. A red `×` badge appears right at the source end of the arrow (close to the hover path so the cursor doesn't leave the hoverable area on its way to the badge). Click the badge → confirm.

Removal also uses a targeted path (`removeDep(fromId, depId)`) — it only touches the `deps` field on the source task. No other fields get clobbered by a stale snapshot.

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

## Hover tooltips (left panel)

Hovering a row label in the left panel shows a tooltip with task details (same style as the Network Graph tooltips). Includes name, team, assignee, estimate, confidence, dates, and status.

## Horizon lines

Two vertical reference lines help visualize planning confidence boundaries:

- **H1 (committed boundary)** — approximately 8 weeks out. Items before this line should ideally be at "committed" confidence.
- **H2 (estimated boundary)** — approximately 18 weeks out. Items before this line should be at least "estimated".

These are visual guides, not hard constraints. They help reviewers quickly spot items that are too far in the future to still lack assignment or estimates.

## Today marker

A solid green vertical line at the current week. No badge in the header — the line is enough.

## Decide-by marker

If a task has `decideBy`, a 45°-rotated diamond appears on its row at that week:

- **Amber** normally
- **Red** when the date is in the past

## Footer badges

Below the bar area:

- **Deadline badges** per goal — green "on track", red "at risk", or yellow plain
- **Critical path: N** — click to toggle dim-non-critical mode
- **N no estimate** — count of unestimated leaves (they're listed but uncheduled)
- **Link-mode hint** — shown while a link-mode or link-drag is active
- **Confidence legend** — visual key explaining bar styling for each confidence level (solid = committed, striped = estimated, dashed = exploratory)

## Keyboard-less conventions

- No double-click anywhere.
- Single click on a row label or on a bar opens the QuickEdit sidebar.
- Drag-the-bar = pin; drag-the-handle = link. The cursor tells you which mode you're in.
