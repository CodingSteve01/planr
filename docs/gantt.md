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

Pixels-per-week (`WPX`) drives the horizontal density. The state and persistence are in place (`planr_gantt_zoom` in localStorage), but the zoom buttons are currently not wired into the toolbar. Planned: a `+` / `−` pair or a slider next to the group buttons.

Valid range: 8 px (very compact months) to 140 px (wide enough to read individual days within a week).

## Bars

- **Colored by team** — each team's color becomes the bar fill
- **Semi-transparent fill** with a thicker left border in the team's solid color
- **Critical-path bars** have a stronger opacity (60 vs 40) so they stand out
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

- **5 px stubs** horizontally out of the source end and into the target start
- **Cubic bezier** between the two stub endpoints

This makes forward links (target right of source) smooth, and backward links (target left of source) loop naturally without the earlier step-routing 6-shape.

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
- **Flag label** at the top with the deadline name, shaped with a small notch for a flag-like silhouette
- **At-risk marker** — an `!` prefix on the flag when any linked task ends after the date

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

## Keyboard-less conventions

- No double-click anywhere.
- Single click on a row label or on a bar opens the QuickEdit sidebar.
- Drag-the-bar = pin; drag-the-handle = link. The cursor tells you which mode you're in.
