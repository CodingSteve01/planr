// Pure history model for App.jsx's undo/redo (Phase 1 of the rebuild — see
// docs/principles.md, "Fast means reversible"). Every user-initiated edit is
// reversible with one keystroke; that's what pays for cutting the confirm()
// prompts this phase also removes.
//
// Design notes:
// - `push(history, snapshot, opts)` records the data that was CURRENT the
//   moment before a mutation is applied — App.jsx's `mutate()` helper calls
//   `push(history, data, ...)` and then applies the update. Snapshots are
//   plain `data` object references, never deep-cloned: React's "spread the
//   parts that changed" update style means most of the tree is shared
//   structurally between snapshots, so keeping 100 of them is cheap.
// - History intentionally carries only `past` and `future` arrays, not a
//   "present" pointer — the present lives in App's own `data` state. That
//   means `undo`/`redo` need the CURRENT data passed in to know what to move
//   onto the opposite stack (so a redo after an undo restores exactly what
//   you undid). This is the one place this module's signature grows beyond
//   the one-liner in the spec (`undo(history) → { history, snapshot }`) —
//   calling `undo(history)` with no second argument still works, it just
//   won't populate `future` for redo.
// - Coalescing: several `push` calls that land within `coalesceMs` of the
//   previous push collapse into ONE entry — the entry that was already on
//   top before the burst started. A dragged progress slider firing dozens of
//   onChange events, or a run of quick status-button clicks, should cost the
//   user exactly one ⌘Z, not dozens.
// - `future` is cleared on every non-coalesced push: once you make a new
//   edit, the "redo" branch you left behind is gone (same as every other
//   editor's undo stack).
// - Capped at `limit` entries (default 100) — oldest pushes fall off first.

export function createHistory({ limit = 100 } = {}) {
  return { past: [], future: [], limit, lastPushAt: null };
}

export function push(history, snapshot, { coalesceMs = 0 } = {}) {
  const now = Date.now();
  const coalescing = coalesceMs > 0 && history.lastPushAt != null && (now - history.lastPushAt) < coalesceMs;
  if (coalescing) {
    // Part of an in-flight burst — the state before the burst is already the
    // top of `past` from the first push. Just extend the coalescing window
    // and drop any redo branch (this IS a new edit, even if merged).
    return history.future.length ? { ...history, future: [], lastPushAt: now } : { ...history, lastPushAt: now };
  }
  let past = history.past.concat([snapshot]);
  if (past.length > history.limit) past = past.slice(past.length - history.limit);
  return { ...history, past, future: [], lastPushAt: now };
}

export function undo(history, current) {
  if (!history.past.length) return { history, snapshot: undefined };
  const snapshot = history.past[history.past.length - 1];
  const past = history.past.slice(0, -1);
  const future = current === undefined ? history.future : [current, ...history.future];
  return { history: { ...history, past, future, lastPushAt: null }, snapshot };
}

export function redo(history, current) {
  if (!history.future.length) return { history, snapshot: undefined };
  const [snapshot, ...restFuture] = history.future;
  const past = current === undefined ? history.past : history.past.concat([current]);
  return { history: { ...history, past, future: restFuture, lastPushAt: null }, snapshot };
}

export function canUndo(history) { return !!history?.past?.length; }
export function canRedo(history) { return !!history?.future?.length; }
