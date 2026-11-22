// ── Rolling JSON snapshot ring ────────────────────────────────────────────
// Survives the markdown writer touching the on-disk file: every successful
// save also drops the current data into a 20-slot ring in localStorage,
// keyed by timestamp. If the .md file ever gets corrupted by an external
// editor (Obsidian rendering, iCloud merge), the user can restore from the
// last known-good JSON snapshot via Help → "Restore snapshot…".
const SNAPSHOT_KEY = 'planr_v2_snapshots';
const SNAPSHOT_MAX = 20;
// Autosave pushes are throttled: at most one ring write per window. A push
// inside the window is held and written when the window ends, so the ring
// always ends on the latest state. The localStorage value can grow to ~2MB
// (20 × ~100KB project); stringifying it on every autosave would cause jank.
// Every write adds a slot, an existing slot is never overwritten.
const SNAPSHOT_MIN_INTERVAL_MS = 60_000;
// Module-scoped cache + dedup hash: a write is skipped when its content
// equals the newest slot.
let _snapCache = null; // [{ ts, data }, …] | null = not yet loaded
let _lastSnapHash = null; // hash (= JSON.stringify) of the newest slot
let _pendingData = null; // newest pushed data waiting for the window to end
let _pendingTimer = null; // timeout that writes the pending data
let _lastWriteAt = -Infinity; // time of the last throttled write
let _hooked = false; // pagehide listener registered

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
function _hash(data) {
  if (!data || !Array.isArray(data.tree)) return null;
  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}
function _persist(arr) {
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
// Adds one slot (newest first) and persists the ring. `force` skips the
// content dedup against the newest slot.
function _writeSlot(data, force) {
  const hash = _hash(data);
  if (hash == null) return;
  const arr = loadSnapshots();
  if (!force && _lastSnapHash === hash) return;
  arr.unshift({ ts: Date.now(), data });
  if (arr.length > SNAPSHOT_MAX) arr.length = SNAPSHOT_MAX;
  _snapCache = arr;
  _lastSnapHash = hash;
  _persist(arr);
}
function _flushPending() {
  clearTimeout(_pendingTimer);
  _pendingTimer = null;
  const data = _pendingData;
  _pendingData = null;
  if (!data) return;
  _lastWriteAt = Date.now();
  _writeSlot(data, false);
}
function _hookPageHide() {
  if (_hooked || typeof window === 'undefined' || !window.addEventListener) return;
  _hooked = true;
  window.addEventListener('pagehide', _flushPending);
}
// Autosave entry: trailing throttle. Only the newest pushed data is kept.
export function pushSnapshot(data) {
  if (!data || !Array.isArray(data.tree)) return;
  _hookPageHide();
  _pendingData = data;
  if (_pendingTimer != null) return;
  const wait = _lastWriteAt + SNAPSHOT_MIN_INTERVAL_MS - Date.now();
  if (wait <= 0) _flushPending();
  else _pendingTimer = setTimeout(_flushPending, wait);
}
// Defensive snapshot (before a restore): written at once as its own slot,
// ignoring the throttle. A pending autosave write stays pending and lands
// later as a further slot.
export function takeSnapshotNow(data) {
  _writeSlot(data, true);
}
