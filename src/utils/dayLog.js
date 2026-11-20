// The plan on an earlier day.
//
// `data.dayLog` holds one entry per day on which the plan changed:
//
//   { day: 'YYYY-MM-DD', back: patch }
//
// `back` turns the plan as it stood at the END of that day into the plan as
// it stood at its START (a patch in utils/scenario.js's sense: what differs,
// field by field). The plan at the end of any day is therefore today's plan
// with the `back` of every later entry applied, newest first. Nothing else is
// stored: no copies, and a day on which nothing changed costs nothing.
//
// Status, progress and completion have had a log of their own for longer
// (utils/history.js), and that one knows the day an entry COUNTS for, not
// only the day it was typed. So they are read from there and laid over the
// tree; for days before the first entry here they are all there is.
//
// An edit made while looking at an earlier day counts from that day on: it is
// applied to every later day and to today, and the entries are rebuilt from
// the resulting states (`applyPastEdit`). Rebuilding from states instead of
// editing patches is what keeps the log consistent by construction.
import { diffPlan, applyPatch, isEmptyPatch, toPortablePatch, fromPortablePatch } from './scenario.js';
import { stateAsOf, pendingDate, leafSnapshot } from './history.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const endOf = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); };

// The plan without its own log: what patches are measured on.
const plain = data => { if (!data || !('dayLog' in data)) return data; const { dayLog, ...rest } = data; return rest; };
const sorted = log => [...(log || [])].filter(e => e && DAY.test(e.day || '')).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
const back = (state, patch) => applyPatch(state, patch).data;

// Everything except status, at the end of `day`.
export function planAtEndOf(real, day) {
  let state = plain(real);
  const log = sorted(real?.dayLog);
  for (let i = log.length - 1; i >= 0 && log[i].day > day; i--) state = back(state, log[i].back);
  return state;
}

// Status, progress and completion as the history log has them for `day`.
// An item the log knows, but not yet on that day, had not been started.
export function statusAsOf(tree, events, day) {
  if (!Array.isArray(tree) || !Array.isArray(events) || !events.length) return tree;
  const known = new Set(events.map(e => e?.id));
  const state = stateAsOf(events, endOf(day));
  let changed = false;
  const out = tree.map(node => {
    if (!node?.id || !known.has(node.id)) return node;
    const s = state.get(node.id) || { status: 'open', progress: 0, completedAt: null };
    const progress = s.status === 'done' ? 100 : (s.progress ?? 0);
    const completedAt = s.status === 'done' ? (s.completedAt || node.completedAt) : undefined;
    const same = (node.status || 'open') === s.status && (node.progress ?? (node.status === 'done' ? 100 : 0)) === progress
      && (node.completedAt || undefined) === (completedAt || undefined);
    if (same) return node;
    changed = true;
    const next = { ...node, status: s.status, progress };
    if (completedAt) next.completedAt = completedAt; else { delete next.completedAt; delete next.completedEnd; }
    return next;
  });
  return changed ? out : tree;
}

// What is on screen while an earlier day is chosen.
export function planOn(real, day) {
  const state = planAtEndOf(real, day);
  const tree = statusAsOf(state.tree, real?.historyEvents, day);
  return tree === state.tree ? state : { ...state, tree };
}

// `prev` in the ids of `loaded`. A Markdown plan hands out new ids for people,
// teams and meeting plans on every load, so two loads of the same plan cannot
// be compared as they are. The whole of `prev` is written as a patch against
// nothing, by name, and read back against `loaded` (the way a scenario
// survives a reload).
const NOTHING = { tree: [], members: [], teams: [], meetingPlans: [], vacations: [] };
export function inIdsOf(prev, loaded) {
  if (!prev || !loaded) return prev;
  const { patch } = fromPortablePatch(toPortablePatch(diffPlan(NOTHING, plain(prev)), prev), loaded);
  const out = isEmptyPatch(patch) ? NOTHING : back(NOTHING, patch);
  // The log comes from `loaded`: it is the same log, already in these ids.
  return loaded.dayLog ? { ...out, dayLog: loaded.dayLog } : out;
}

// The first day the full log reaches back to; before it only status is known.
export const logStart = data => sorted(data?.dayLog)[0]?.day || null;

// Today's entry, measured against the plan as it was last saved.
// `prev` is that plan (with the log it had), `current` the plan now.
export function recordToday(prev, current, today = localDay()) {
  if (!current) return current;
  const rest = sorted(current.dayLog).filter(e => e.day !== today);
  if (!prev) return rest.length === (current.dayLog || []).length ? current : { ...current, dayLog: rest };
  const mine = sorted(prev.dayLog).find(e => e.day === today);
  const start = mine ? back(plain(prev), mine.back) : plain(prev);
  const patch = diffPlan(plain(current), start);
  const log = isEmptyPatch(patch) ? rest : [...rest, { day: today, back: patch }];
  if (!log.length && !(current.dayLog || []).length) return plain(current);
  return { ...plain(current), dayLog: log };
}

const leafState = node => leafSnapshot([node]).get(node?.id);
const sameState = (a, b) => !!a && !!b && a.status === b.status && a.progress === b.progress;

// The real plan after an edit made while `day` was on screen.
//   base        the real plan the visit started from
//   baseScreen  what was on screen then (planOn(base, day))
//   screen      what is on screen now
export function applyPastEdit(base, baseScreen, screen, day) {
  if (!base || !screen || screen === baseScreen) return base;
  const edit = diffPlan(baseScreen, screen);
  const apply = state => (isEmptyPatch(edit) ? state : back(state, edit));

  // Today, and every logged day after `day`, with the edit applied.
  const log = sorted(base.dayLog);
  const later = log.filter(e => e.day > day);
  const ends = []; // old end states, aligned with `later`
  let state = plain(base);
  for (let i = later.length - 1; i >= 0; i--) { ends[i] = state; state = back(state, later[i].back); }
  const endOfDay = state; // old plan at the end of `day`
  const own = log.find(e => e.day === day);
  const startOfDay = own ? back(endOfDay, own.back) : endOfDay;

  let real = apply(plain(base));
  const newEnds = later.map((_, i) => (i === later.length - 1 ? real : apply(ends[i])));
  const rebuilt = log.filter(e => e.day < day);
  const dayPatch = diffPlan(apply(endOfDay), startOfDay);
  if (!isEmptyPatch(dayPatch)) rebuilt.push({ day, back: dayPatch });
  later.forEach((e, i) => {
    const patch = diffPlan(newEnds[i], i === 0 ? apply(endOfDay) : newEnds[i - 1]);
    if (!isEmptyPatch(patch)) rebuilt.push({ day: e.day, back: patch });
  });

  // Status is carried by the history log. An item whose status or progress
  // was changed on screen takes that state now, and the day goes along for
  // the next save to write the entry (utils/history.js `stampPendingDates`).
  const before = new Map((baseScreen.tree || []).map(n => [n.id, n]));
  const pending = { ...(base.asOfPending || {}) };
  const forced = new Map();
  for (const node of screen.tree || []) {
    const was = before.get(node.id);
    const now = leafState(node);
    if (!now || (was && sameState(leafState(was), now))) continue;
    if (!was && now.status === 'open' && now.progress === 0) continue;
    const done = now.status === 'done';
    forced.set(node.id, done
      ? { status: 'done', progress: 100, completedAt: day, completedEnd: day }
      : { status: now.status, progress: now.progress, completedAt: undefined, completedEnd: undefined });
    const p = pendingDate(day, { id: node.id, status: now.status, progress: now.progress });
    if (p) pending[node.id] = p;
  }
  if (forced.size) {
    real = { ...real, tree: (real.tree || []).map(n => {
      const f = forced.get(n.id);
      if (!f) return n;
      const next = { ...n, ...f };
      if (!f.completedAt) { delete next.completedAt; delete next.completedEnd; }
      else if (!next.completedStart || next.completedStart > day) next.completedStart = day;
      return next;
    }) };
  }

  // Keys a patch does not carry (the history log, the scenario list) are
  // taken over as they are when the edit replaced them.
  for (const key of ['historyEvents', 'scenarios', 'roadmapAssignment']) {
    if (screen[key] !== baseScreen[key]) real = { ...real, [key]: screen[key] };
  }
  if (Object.keys(pending).length) real = { ...real, asOfPending: pending };
  return rebuilt.length ? { ...real, dayLog: rebuilt } : real;
}

// ── in the file ─────────────────────────────────────────────────────────────
// One JSON line per day. People, teams and meeting plans are named, not
// numbered, because a Markdown plan hands out new ids on every load.
export function formatDayLogBlock(log, base) {
  return sorted(log).map(e => JSON.stringify({ day: e.day, back: toPortablePatch(e.back, base) })).join('\n');
}
export function parseDayLogBlock(text, base) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'v1') continue;
    let raw;
    try { raw = JSON.parse(trimmed); } catch { continue; }
    if (!raw || !DAY.test(raw.day || '')) continue;
    const { patch } = fromPortablePatch(raw.back, base);
    if (!isEmptyPatch(patch)) out.push({ day: raw.day, back: patch });
  }
  return sorted(out);
}
