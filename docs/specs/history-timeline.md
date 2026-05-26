# Time-Travel Mode (Spec)

Status: **Draft for review** · Target: replace the current per-item `History` tab as the primary historical-state UI.

## Core mental model

The app has a single global **operating date** knob. Default: today (live mode). The user can drag it backward to view and edit the project as it was at that point in time. Edits made while back-dated are recorded as history events with `effectiveAt = operatingDate` and ripple forward into the live state.

It is *not* a session-default for new events (that was my earlier mis-spec). It is a real time-travel mode that changes what the user sees.

```
┌─ App header ────────────────────────────────────────────────────────┐
│ planr venneker.planr.md │ 🕒 Operating date: 26.05.2026   ↺ live    │
└─────────────────────────────────────────────────────────────────────┘
                          ──── drag scrubber ────
                          past ────────●──────── today
```

- **Live mode** (default): `operatingDate = today`. Identical to current behaviour. No banner.
- **Time-travel mode**: `operatingDate < today`. A banner/strip across the whole app reminds the user. Background of the app gets a subtle amber tint so the mode is unmissable. Sidebar shows a date badge next to every view.

## What changes when scrubbing

When `operatingDate != today`, the entire app reads from a *replayed* snapshot:

1. **Tree state** — `replayToDate(tree, historyEvents, operatingDate)` produces the tree as it was. Every leaf's `status`, `progress`, `completedAt` is reset to its state at `operatingDate`. Items added *after* `operatingDate` disappear (`kind=added` events filter them).
2. **Scheduler input** — runs on the replayed tree, with `now = operatingDate`. Forward projection is "what would the schedule have looked like from that day on".
3. **Subway / Gantt / NetGraph / ResView** — all consume the replayed tree + replayed scheduler output. They render the snapshot.
4. **Diff overlay** — defaults to comparing `operatingDate` vs `today` ("what changed since this point") instead of a fixed sinceDate.

## What edits do while back-dated

Edits made in time-travel mode are **retroactive**: the change is recorded as having happened *at the operating date*.

Concrete behaviours:

| Edit | Effect |
|---|---|
| Mark P1.x as done | History event `{ id: P1.x, ts: now, effectiveAt: operatingDate, status: done, progress: 100, completedAt: operatingDate }` |
| Bump progress 30 → 60 | History event `{ id: …, ts: now, effectiveAt: operatingDate, progress: 60 }` |
| Change estimate / team / assignee | Same field-edit, but the history event stamps `effectiveAt`. (Field edits are not currently in the history schema — extend.) |
| Add new item | Tree gains the item, history event `kind=added effectiveAt=operatingDate`. The item is therefore invisible if you scroll the scrubber before that date. |
| Delete item | History event `kind=removed effectiveAt=operatingDate`. Symmetrically invisible after that date. |

`ts` (wall-clock) always reflects when the user actually clicked. `effectiveAt` (logical clock) reflects when in the project's timeline it counts. Already supported by [`eventReplayTimestamp`](src/utils/history.js).

After applying the edit, the app re-replays the history up to `today` and renders the new live state. If the user moves the scrubber back to today, the change is visible because forward-replay already includes it.

## Forward propagation

The whole reason for the feature: a back-dated edit changes the future.

Examples:

- Mark a leaf as done at 2026-04-15 retroactively. The subway map's past-progress stripe extends; the train was further along than the live data suggested. Future projection assumes the leaf is already done → other things ride on top of it.
- Bump a leaf to 70% at 2026-03-01. Diff window since 2026-03-01 now starts from 70 instead of 30; weekly velocity statistics recalibrate.
- Add a milestone that "actually existed" since 2026-02-01. CPM, deadlines, and tree-stats integrate it as if it had been there all along.

Implementation pivot: nothing recomputes from the history alone; the **tree is the source of truth**, history is the changelog. So a retroactive edit is just (a) update the tree as it is now, (b) write a history event that says "this state went into effect on date X". Replay then rebuilds any earlier date by undoing later events.

## Data-model changes

- `data.meta.operatingDate: string | null` (ISO date). Null/missing → live mode. Set → time-travel.
- History events gain optional `effectiveAt` (already supported on parse).
- Extend history schema to cover field edits, not just status/progress/completedAt:
  - `assign`, `team`, `best`, `factor`, `prio`, `deps`, `softDeps`, `parallel`, `decideBy`, `due`, `name`, `note`.
  - Generic shape: `{ ts, id, effectiveAt, field, prev, next }`.
- Existing files load unchanged. New schema is forward-compatible.

## Functions needed

- `replayToDate(tree, events, date) → tree'` — undo all events with `effectiveAt > date`. Done by walking events in reverse and applying inverse mutations.
- `applyRetroactiveEdit(tree, events, id, patch, operatingDate)` — write the event with `effectiveAt=operatingDate`, mutate the tree to its current state, return new (tree, events).
- `replayedSnapshot` — memoised at the App level; recomputed when `operatingDate` or `events` change.
- `isLiveMode = !operatingDate || operatingDate === today`.

## UI surface

1. **Header date control**.
   - Read-only input + dropdown calendar + "↺ live" button.
   - Keyboard: `]` / `[` jumps forward / backward one day, `Shift+]` / `Shift+[` one week, `T` returns to today.

2. **Time-travel banner**.
   - Sticky strip below header. "Time-travel mode — viewing 2026-04-15. Edits will be recorded as effective on this date."
   - Right side: button "Apply & exit" (saves current snapshot's changes and returns to live), button "Discard & exit" (rolls back retroactive edits made in this session, returns to live).

3. **Subway / Gantt / etc** — no UI change, they just receive a different tree. The amber background and banner are the global signal.

4. **Per-item History tab (existing)**.
   - Stays as a power-user fallback for fine-grained edits to a single item.
   - Re-styled to fit the new mental model: emphasise `effectiveAt` over `ts`, show the timeline of just this item.

## Out of scope (v1)

- Comparing two arbitrary past dates side-by-side.
- Branching timelines.
- Per-user attribution / multi-author.

## Build order (each step shippable)

1. **`replayToDate` + tests** — pure function, no UI, easy to verify on the venneker plan.
2. **`data.meta.operatingDate` plumbing** — context provider, default today, persisted.
3. **Header date control** — read-only first, just sets the date.
4. **Memoised replayed snapshot** — App wraps `tree` consumers so views can transparently read either live tree or snapshot.
5. **Banner + amber tint** — make the mode unmissable.
6. **Retroactive edits** — wire status/progress/completedAt toggles to write `effectiveAt`.
7. **Extended history schema** for field edits.
8. **Keyboard shortcuts + persistence**.

After step 5 the feature is already usable as a read-only time-travel. Edits land in steps 6–7.
