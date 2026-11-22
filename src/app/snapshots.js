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
// Per document source (one App instance): the newest pushed data waiting for
// its window to end, the timer that writes it, and the time of its last write.
// The window is per source, not global: with a global one, plan B's first push
// would wait for plan A's window and a window end would have to write several
// states at once. Per source, each open plan writes at most once per window,
// so the ring sees at most (open plans) writes a minute: no lost last state,
// no write storm.
const _sources = new Map(); // sourceKey -> { data, timer, lastWriteAt }
// Sources whose App is gone. A save still running at unmount pushes after the
// release: that state is written at once and no entry is made again, so the
// map never holds a plan nobody will release.
const _released = new WeakSet();
function _source(key) {
  let s = _sources.get(key);
  if (!s) {
    s = { data: null, timer: null, lastWriteAt: -Infinity };
    _sources.set(key, s);
  }
  return s;
}
function _flushSource(key) {
  const s = _sources.get(key);
  if (!s) return;
  clearTimeout(s.timer);
  s.timer = null;
  const data = s.data;
  s.data = null;
  _unhookIfIdle();
  if (!data) return;
  s.lastWriteAt = Date.now();
  _writeSlot(data, false);
}
function _flushAll() {
  for (const key of [..._sources.keys()]) _flushSource(key);
}
// One pagehide listener for the module, present only while a push is pending
// (a hidden page has nothing else to lose), so no listener outlives the data
// it protects and module instances do not pile listeners up.
let _hooked = false;
function _hookPageHide() {
  if (_hooked || typeof window === 'undefined' || !window.addEventListener) return;
  _hooked = true;
  window.addEventListener('pagehide', _flushAll);
}
function _unhookIfIdle() {
  if (!_hooked) return;
  for (const s of _sources.values()) if (s.data) return;
  _hooked = false;
  window.removeEventListener('pagehide', _flushAll);
}
// Autosave entry: trailing throttle per source. Only the newest pushed data of
// a source is kept. `sourceKey` is any stable object or id owned by the App
// instance whose document this is.
export function pushSnapshot(data, sourceKey) {
  if (!data || !Array.isArray(data.tree)) return;
  if (sourceKey && typeof sourceKey === 'object' && _released.has(sourceKey)) {
    _writeSlot(data, false);
    return;
  }
  _hookPageHide();
  const s = _source(sourceKey);
  s.data = data;
  if (s.timer != null) return;
  const wait = s.lastWriteAt + SNAPSHOT_MIN_INTERVAL_MS - Date.now();
  if (wait <= 0) _flushSource(sourceKey);
  else s.timer = setTimeout(() => _flushSource(sourceKey), wait);
}
// The document of this source is about to be replaced (resetHistory is the one
// place every load path passes): write its pending state now, so the next
// document's first push cannot take its place.
export function flushSnapshot(sourceKey) {
  _flushSource(sourceKey);
}
// The source is (again) in use: a remount with the same key throttles again.
export function claimSnapshotSource(sourceKey) {
  if (sourceKey && typeof sourceKey === 'object') _released.delete(sourceKey);
}
// The source is gone (its App unmounted): flush, then forget it.
export function releaseSnapshotSource(sourceKey) {
  _flushSource(sourceKey);
  _sources.delete(sourceKey);
  if (sourceKey && typeof sourceKey === 'object') _released.add(sourceKey);
}
// Defensive snapshot (before a restore): written at once as its own slot,
// ignoring the throttle, and always the newest. The source's pending autosave
// is older than `data`, so it is written first (below), or dropped when it is
// identical to `data`.
export function takeSnapshotNow(data, sourceKey) {
  const s = _sources.get(sourceKey);
  if (s?.data && _hash(s.data) === _hash(data)) s.data = null;
  _flushSource(sourceKey);
  _writeSlot(data, true);
}
