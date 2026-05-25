// History log: append-only event stream of leaf state changes (status, progress,
// completedAt) plus add/remove markers. Lives in the markdown file under
// `## History` as a fenced `planr-history` block. Each line:
//
//   <ISO_TS> <ID> key=value [key=value ...]
//
// Recognised keys: status, progress, completedAt, effectiveAt,
// kind (added|removed).
// Lines outside that shape are ignored on parse so future schema extensions
// stay forward-compatible.
//
// The log lets the UI compute "what changed since <date>" — train positions,
// new lines, progress jumps — without keeping the full project state for each
// historical timestamp.

export const HISTORY_VERSION = 'v1';

// ── Parse a fenced planr-history block out of full markdown text ─────────────
export function parseHistoryFromMarkdown(md) {
  if (!md) return [];
  const m = md.match(/```planr-history\s*\n([\s\S]*?)```/);
  if (!m) return [];
  return parseHistoryBlock(m[1]);
}

export function parseHistoryBlock(blockText) {
  const out = [];
  const lines = blockText.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === HISTORY_VERSION) continue;          // version header
    if (line.startsWith('#') || line.startsWith('//')) continue; // comments
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [ts, id, ...kvs] = parts;
    // Reject lines whose first token is not an ISO timestamp — keeps malformed
    // input from masquerading as events with random words for ts/id.
    if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) continue;
    const ev = { ts, id };
    for (const kv of kvs) {
      const eq = kv.indexOf('=');
      if (eq < 0) continue;
      const k = kv.slice(0, eq);
      let v = kv.slice(eq + 1);
      if (k === 'progress') v = parseInt(v, 10);
      ev[k] = v;
    }
    out.push(ev);
  }
  return out;
}

// ── Format event list as the fenced markdown block body ──────────────────────
export function formatHistoryBlock(events) {
  const lines = [HISTORY_VERSION, ...events.map(formatEvent)];
  return lines.join('\n');
}

export function formatEvent(ev) {
  const order = ['kind', 'status', 'progress', 'completedAt'];
  const kvs = order
    .filter(k => ev[k] !== undefined && ev[k] !== null && ev[k] !== '')
    .map(k => `${k}=${ev[k]}`);
  for (const k of Object.keys(ev)) {
    if (k === 'ts' || k === 'id' || order.includes(k)) continue;
    if (ev[k] === undefined || ev[k] === null || ev[k] === '') continue;
    kvs.push(`${k}=${ev[k]}`);
  }
  return [ev.ts, ev.id, ...kvs].join(' ');
}

export function eventReplayTimestamp(ev) {
  const day = ev?.completedAt || ev?.effectiveAt || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return `${day}T12:00:00.000Z`;
  return ev?.ts || '';
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────
// Build a leaf-state map from a tree array. Stores only the fields the diff
// machinery looks at (status, progress, completedAt). Used both pre- and
// post-save to compute the diff.
export function leafSnapshot(tree) {
  const m = new Map();
  if (!Array.isArray(tree)) return m;
  for (const r of tree) {
    if (!r?.id) continue;
    const status = r.status || 'open';
    const rawProgress = typeof r.progress === 'number'
      ? r.progress
      : status === 'done' ? 100 : status === 'wip' ? 50 : 0;
    m.set(r.id, {
      status,
      progress: status === 'done' ? 100 : Math.max(0, Math.min(99, rawProgress)),
      completedAt: r.completedAt || null,
    });
  }
  return m;
}

// Compute the diff between two snapshots and emit events. All events share
// the same timestamp so a single save shows up as one coherent batch.
export function diffSnapshots(prev, curr, ts) {
  const events = [];
  const seen = new Set();
  for (const [id, c] of curr) {
    seen.add(id);
    const p = prev.get(id);
    if (!p) {
      events.push({ ts, id, kind: 'added', status: c.status, progress: c.progress, ...(c.completedAt ? { completedAt: c.completedAt } : {}) });
      continue;
    }
    const delta = {};
    if (p.status !== c.status) delta.status = c.status;
    if (p.progress !== c.progress) delta.progress = c.progress;
    if ((p.completedAt || '') !== (c.completedAt || '') && c.completedAt) delta.completedAt = c.completedAt;
    if (Object.keys(delta).length) events.push({ ts, id, ...delta });
  }
  for (const [id] of prev) {
    if (!seen.has(id)) events.push({ ts, id, kind: 'removed' });
  }
  return events;
}

// ── Replay: state at a given point in time ──────────────────────────────────
// Walks events chronologically, applies each, returns the resulting leaf
// state. `asOfDate` is an ISO date or Date — events strictly after it are
// skipped. Removed leaves drop out of the map.
export function stateAsOf(events, asOfDate) {
  const cutoff = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  const m = new Map();
  if (!Array.isArray(events)) return m;
  const sorted = [...events].sort((a, b) => {
    const at = eventReplayTimestamp(a);
    const bt = eventReplayTimestamp(b);
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
  for (const ev of sorted) {
    if (new Date(eventReplayTimestamp(ev)) > cutoff) break;
    if (ev.kind === 'removed') { m.delete(ev.id); continue; }
    const prev = m.get(ev.id) || { status: 'open', progress: 0, completedAt: null };
    const next = { ...prev };
    if (ev.status != null) next.status = ev.status;
    if (ev.progress != null) next.progress = ev.progress;
    if (ev.completedAt != null) next.completedAt = ev.completedAt;
    if (ev.kind === 'added' && !m.has(ev.id)) {
      // First appearance — keep the captured state.
    }
    m.set(ev.id, next);
  }
  return m;
}

// ── Convenience: diff between two snapshots, returning a per-id summary ──────
// Used by UI to label "what changed". Returns Map<id, {wasStatus, nowStatus,
// wasProgress, nowProgress, isNew, isGone}>.
export function diffForUi(prev, curr) {
  const out = new Map();
  const seen = new Set();
  for (const [id, c] of curr) {
    seen.add(id);
    const p = prev.get(id);
    if (!p) { out.set(id, { isNew: true, nowStatus: c.status, nowProgress: c.progress }); continue; }
    if (p.status !== c.status || p.progress !== c.progress) {
      out.set(id, {
        wasStatus: p.status, nowStatus: c.status,
        wasProgress: p.progress, nowProgress: c.progress,
      });
    }
  }
  for (const [id, p] of prev) {
    if (!seen.has(id)) out.set(id, { isGone: true, wasStatus: p.status, wasProgress: p.progress });
  }
  return out;
}
