// ── Rolling JSON snapshot ring ────────────────────────────────────────────
// Survives the markdown writer touching the on-disk file: every successful
// save also drops the current data into a 20-slot ring in localStorage,
// keyed by timestamp. If the .md file ever gets corrupted by an external
// editor (Obsidian rendering, iCloud merge), the user can restore from the
// last known-good JSON snapshot via Help → "Restore snapshot…".
const SNAPSHOT_KEY = 'planr_v2_snapshots';
const SNAPSHOT_MAX = 20;
// Edits within this window share one slot: a save replaces the newest slot
// instead of adding one. The localStorage value can grow to ~2MB (20 × ~100KB
// project), so the ring catches edits at human cadence, not every auto-save.
const SNAPSHOT_MIN_INTERVAL_MS = 60_000;
// Module-scoped cache + dedup hash. Drops the per-keystroke
// double-parse/double-stringify that used to dominate during typing.
// Pushes are coalesced into a single idle task so a burst of edits
// becomes one stringify-and-compare instead of one per change.
let _snapCache = null; // [{ ts, data }, …] | null = not yet loaded
let _lastSnapHash = null; // hash (= JSON.stringify) of the most recent push
let _pendingData = null; // data scheduled for next idle snapshot
let _pendingHandle = null; // outstanding requestIdleCallback id
function loadSnapshots() {
  if (_snapCache) return _snapCache;
  try {
    const arr = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]');
    _snapCache = Array.isArray(arr) ? arr : [];
  } catch {
    _snapCache = [];
  }
  if (_snapCache.length) {
    // Seed hash from the most-recent stored snapshot so a fresh page load
    // doesn't push a duplicate as the first snapshot.
    try {
      _lastSnapHash = JSON.stringify(_snapCache[0].data);
    } catch {
      /* ignore */
    }
  }
  return _snapCache;
}
function _runSnapshot() {
  _pendingHandle = null;
  const data = _pendingData;
  _pendingData = null;
  if (!data || !Array.isArray(data.tree)) return;
  let hash;
  try {
    hash = JSON.stringify(data);
  } catch {
    return;
  }
  // Dedup by content. Skip when nothing actually changed since the last
  // snapshot — that gives us a long, sparse history dominated by real
  // edits instead of one entry per auto-save.
  if (_lastSnapHash === hash) return;
  const arr = loadSnapshots();
  const now = Date.now();
  // Inside the window of the newest slot the burst is still going: the slot
  // takes the latest state (keeping its time), so the ring ends on the final
  // state instead of dropping it.
  if (arr.length && now - arr[0].ts < SNAPSHOT_MIN_INTERVAL_MS) arr[0] = { ts: arr[0].ts, data };
  else arr.unshift({ ts: now, data });
  if (arr.length > SNAPSHOT_MAX) arr.length = SNAPSHOT_MAX;
  _snapCache = arr;
  _lastSnapHash = hash;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr));
  } catch {
    // Quota fallback: halve the ring, retry once, wipe as last resort.
    try {
      const half = arr.slice(0, Math.max(1, Math.floor(SNAPSHOT_MAX / 2)));
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(half));
      _snapCache = half;
    } catch {
      try {
        localStorage.removeItem(SNAPSHOT_KEY);
      } catch {
        /* ignore */
      }
      _snapCache = [];
      _lastSnapHash = null;
    }
  }
}
export function pushSnapshot(data) {
  if (!data || !Array.isArray(data.tree)) return;
  // Coalesce rapid pushes: keep only the latest pending data, run once
  // when the browser goes idle. Avoids stringifying on every keystroke.
  _pendingData = data;
  if (_pendingHandle != null) return;
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    _pendingHandle = window.requestIdleCallback(_runSnapshot, { timeout: 3000 });
  } else {
    _pendingHandle = setTimeout(_runSnapshot, 0);
  }
}
