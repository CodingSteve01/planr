# History Timeline + Stichtag Mode (Spec)

Status: **Draft for review** · Target: replace the current raw-text `HistoryModal`.

## Motivation

The current `HistoryModal` is a textarea over the fenced `planr-history` block. It is correct but not editable in any practical sense — the user has to know the line format, IDs, ISO timestamps, and key names. Backdating an edit ("I actually finished this last Friday") requires hand-editing the line.

The user wants a visual timeline:

- See *when* things happened on a horizontal line.
- Click on a date to set a **Stichtag** (effective date). Any subsequent state changes in the same session attach to that date instead of `now`.
- Drag a marker to move when an event happened.
- Right-click a marker to edit or delete it.

## Mental model

There are two clocks per event:

1. **Logical clock — `effectiveAt`** (or `completedAt` for done events). "On what calendar day did this thing actually happen?" Drives the diff window, the subway-train trail, and the past projection.
2. **Wall clock — `ts`** (ISO timestamp the event was *recorded*). Tamper-evident audit field.

The current `eventReplayTimestamp(ev)` helper already encodes this: prefer `completedAt` → `effectiveAt` → `ts`. We build the UI on top of that.

The Stichtag is the **default `effectiveAt` for new events** while the session is in Stichtag mode. Wall clock `ts` always reflects the moment the change was saved.

## UI layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  History                                       [Edit raw]  [Close]   │
│                                                                      │
│  Stichtag: ┃ today (live)                              ↺ Clear       │
│            ┃ ────────────────────●─────────────────────              │
│            ┃ Apr 2025   Aug 2025      Jan 2026   May 2026  Sep 2026  │
│                                                                      │
│  ─────────●─●─────────────●─●●────────────●─●●●─────●●●●─────────    │
│           │ │             │ │             │  │       │               │
│  Filter:  [ all roots ▼ ]  [ all items ▼ ]  [ done · wip · added ]   │
│                                                                      │
│  Events at Stichtag (May 25, 2026):                                  │
│    ▸ P1.1.1.3.1   KUD    status=done   progress=100   completedAt=…  │
│    ▸ D1.2.1.1     CP1.1  status=done   progress=100                  │
│                                                                      │
│  Adjacent activity:                                                  │
│    May 22 · 30 leaves marked done in one batch (import)              │
│    May 24 · 3 progress updates on D1.2.*                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Components

1. **Stichtag rail** (top, sticky).
   - Horizontal scrubber spanning the project's `done-min … today` range.
   - Default knob position = today (live mode).
   - Drag knob, or click a tick, to set Stichtag.
   - Visible badge in the app header when Stichtag is active so the user remembers.
   - **Clear** resets to live; new edits time-stamp `now` again.

2. **Event histogram** (middle).
   - Single SVG row.
   - One dot per event, colour by `kind`/`status`:
     - green = `status=done`
     - amber = `progress` change
     - blue = `added`
     - red = `removed`
   - Dot opacity = recency.
   - Hover: tooltip with id + name + payload.
   - Click: opens the **Events list** scrolled to that day.

3. **Filters** (above the list).
   - Root, item, kind. Persisted to localStorage.

4. **Events list** (below).
   - Grouped by day.
   - Each row: id · abbrev · diff line ("status open → done", "progress 40 → 75").
   - Per-row actions: **edit timestamp**, **edit payload**, **delete**.
   - Bulk select for "delete all on date X" or "shift these by N days".

5. **Stichtag-active footer banner** (replaces the modal footer when active).
   - Reads: "Edits will be recorded with effectiveAt = 2026-05-20."
   - Buttons: **Save & exit Stichtag** · **Exit without saving**.

## Interaction flows

### Backdate a single status flip

1. Open History.
2. Drag Stichtag knob to "2026-05-21". Banner reads "Stichtag: 2026-05-21".
3. Close modal.
4. In Tree/Gantt, mark P1.x as done. The flip records `effectiveAt=2026-05-21` instead of today.
5. Save file → history block contains the back-dated event.
6. (Optional) Open History → **Clear** Stichtag.

Implementation hook: `data.stichtag` lives in `data.meta` and is read by the function that builds events on save (`composeFileForSave` → `diffSnapshots`). The diff function gets a third arg `effectiveTs` that, when set, is added to each emitted event.

### Drag an existing event to a new date

1. Open History.
2. Drag the green dot from "2026-04-30" to "2026-04-25".
3. UI replaces `effectiveAt` (or `completedAt` if the event has one) on that event.
4. Optional dialog "Also update `completedAt` on the item itself?" — yes/no.
5. The original `ts` (wall clock) is preserved as an audit field; `effectiveAt` is the new date.

### Bulk-shift a sloppy import batch

1. Filter "added on 2026-05-22T15:37" (the import burst).
2. Bulk-select.
3. "Shift by …" → -30 days. Reasonable bounds enforced (cannot push past dependent events).

## Data-model changes

Minimal:

- `data.meta.stichtag: string | null` — current Stichtag in ISO date (no time). When set, save-time event creation passes it as `effectiveAt`.
- History event schema unchanged — already supports `effectiveAt` and `completedAt` per `eventReplayTimestamp`.
- Optional: history events gain an `origTs` field when their effective date is dragged in the UI, so audit shows "originally recorded 2026-05-22, effective 2026-04-25".

No migrations needed. Existing files load with no `stichtag` and no behaviour change.

## Replay & diff impact

`diff.js` and the subway map already read `eventReplayTimestamp`. They will pick up the new `effectiveAt` automatically. Verify:

- `pastProgressByRootId` (driver of the subway "past train" stripe) computes correctly when events are back-dated.
- `doneInWindowIds` / `changedInWindowIds` for the legend's diff pills shift the right items into the window.
- Add tests covering "event with effectiveAt earlier than ts" replay paths.

## File-format impact

Markdown round-trip via `formatHistoryBlock` / `parseHistoryBlock` already preserves arbitrary keys. `effectiveAt` round-trips. `stichtag` is stored in `meta` next to `viewStart`, so it ships in the JSON / Markdown header without touching the history block.

## Out of scope (v1)

- Multi-user history merging.
- Undo of history edits via Ctrl-Z (we already have file-level autosave; rely on git/manual revert).
- Visual indication of *future* planned events (Stichtag is past-or-now only).

## Build order

1. **Plumbing** — add `data.meta.stichtag`, thread it into `diffSnapshots`, write tests for back-dated event emission.
2. **Modal shell** — split current `HistoryModal` into `HistoryTimelineModal` + keep a "Raw edit" button that pops the existing textarea as fallback.
3. **Rail + histogram** — read-only scrubber, no editing yet. Stichtag knob writes to `data.meta.stichtag`.
4. **Events list** — grouped by day, per-row edit/delete via existing array mutations.
5. **Drag-to-shift markers** — extend to bulk shift.
6. **Stichtag banner in app header** — reminds the user a back-dating session is active.

Each step is independently shippable.
