// Project-wide diff computation: replay the history event stream up to a
// chosen cutoff and compare against the current tree. Produces a single bag
// of ids/maps the various views (Roadmap, TreeView, Timetable, Gantt, Network)
// consume to highlight what changed in the window.
//
// Keep this pure so it composes cleanly into useMemo. Views are expected to
// pre-filter their tree (e.g. NetGraph already drops descendants of collapsed
// nodes) and look up ids in the returned sets.
import { stateAsOf } from './history.js';
import { re } from './scheduler.js';

// Build a Set of day-of-week numbers that count as workdays. Defaults to
// Mon–Fri (1..5). Helper kept local so callers don't have to pre-shape it.
function _wdSet(workDays) {
  if (workDays instanceof Set) return workDays;
  if (Array.isArray(workDays) && workDays.length) return new Set(workDays);
  return new Set([1, 2, 3, 4, 5]);
}

// Stringify a Date as YYYY-MM-DD without touching the timezone-y bits.
function _isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Iterate every calendar day in [from, to] inclusive.
function _eachDay(from, to, fn) {
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(to);
  stop.setHours(23, 59, 59, 999);
  while (cur <= stop) {
    fn(cur);
    cur.setDate(cur.getDate() + 1);
  }
}

// Sum sprint-window capacity stats: gross working days (Mon–Fri minus
// holidays), then per-member effective capacity considering vacations and
// individual fractional caps. Vacations stay separate so we can also surface
// "X vacation days lost in window".
function _capacityStats({ from, to, members = [], vacations = [], holidays = {}, workDays }) {
  const wd = _wdSet(workDays);
  const holIso = new Set();
  if (holidays && typeof holidays === 'object') {
    Object.keys(holidays).forEach(k => holIso.add(k));
  }
  let grossWorkdays = 0;
  let holidayCount = 0;
  _eachDay(from, to, d => {
    const dow = d.getDay();
    const iso = _isoDay(d);
    if (holIso.has(iso)) { holidayCount++; return; }
    if (wd.has(dow)) grossWorkdays++;
  });
  // Per-member: only count days while the member is on the team
  // (member.start <= day < member.end), then subtract vacation overlaps.
  const memberById = Object.fromEntries((members || []).map(m => [m.id, m]));
  let availablePersonDays = 0;
  let vacationDaysInWindow = 0;
  for (const m of members || []) {
    const cap = typeof m.cap === 'number' ? m.cap : 1;
    const startBound = m.start ? new Date(m.start) : null;
    const endBound = m.end ? new Date(m.end) : null;
    _eachDay(from, to, d => {
      const dow = d.getDay();
      if (!wd.has(dow)) return;
      if (holIso.has(_isoDay(d))) return;
      if (startBound && d < startBound) return;
      if (endBound && d > endBound) return;
      availablePersonDays += cap;
    });
  }
  for (const v of vacations || []) {
    if (!v?.from || !v?.to) continue;
    const m = memberById[v.person];
    if (!m) continue;
    const cap = typeof m.cap === 'number' ? m.cap : 1;
    const vf = new Date(v.from), vt = new Date(v.to);
    const lo = vf > from ? vf : from;
    const hi = vt < to ? vt : to;
    if (lo > hi) continue;
    _eachDay(lo, hi, d => {
      const dow = d.getDay();
      if (!wd.has(dow)) return;
      if (holIso.has(_isoDay(d))) return;
      vacationDaysInWindow += cap;
    });
  }
  return { grossWorkdays, holidayCount, availablePersonDays, vacationDaysInWindow };
}

export function computeDiff({ tree, historyEvents, sinceDate, members, vacations, holidays, workDays }) {
  if (!sinceDate || !Array.isArray(historyEvents) || !historyEvents.length || !Array.isArray(tree)) {
    return null;
  }
  const pastLeafState = stateAsOf(historyEvents, sinceDate);
  const cutoffIso = sinceDate instanceof Date ? sinceDate.toISOString() : new Date(sinceDate).toISOString();

  const doneInWindowIds = new Set();
  const progressedInWindowIds = new Set();
  // Themen "angegangen": leaf went from open → wip (or open → done) in the
  // window OR was added with a non-open status inside the window. Captures
  // the "we started work on these N topics" review story.
  const startedInWindowIds = new Set();

  // Pass 1: walk events strictly after the cutoff. A status=done event is
  // counted only when the prior state was NOT done (real transition). A
  // progress event counts when it's an increase and the task wasn't already
  // done. `kind=added` after the cutoff marks an actual new leaf.
  for (const ev of historyEvents) {
    if (ev.ts <= cutoffIso) continue;
    const past = pastLeafState.get(ev.id);
    if (ev.status === 'done' && past?.status !== 'done') {
      doneInWindowIds.add(ev.id);
      if (past?.status === 'open' || !past) startedInWindowIds.add(ev.id);
    } else if (typeof ev.progress === 'number' && past && ev.progress > (past.progress || 0) && past.status !== 'done') {
      progressedInWindowIds.add(ev.id);
      if (past.status === 'open') startedInWindowIds.add(ev.id);
    } else if (ev.kind === 'added' && !past) {
      progressedInWindowIds.add(ev.id);
      if (ev.status && ev.status !== 'open') startedInWindowIds.add(ev.id);
    } else if (ev.status === 'wip' && (past?.status === 'open' || !past)) {
      // Explicit open → wip transition without a progress field
      startedInWindowIds.add(ev.id);
    }
  }

  // Pass 2: catch unsaved current-tree edits. If the live tree shows a leaf
  // as done/progressed but no post-cutoff event has been written yet, still
  // count it. Restricted to leaves so parent rows don't get false hits.
  for (const r of tree) {
    const isLeaf = !tree.some(o => o.id !== r.id && o.id.startsWith(r.id + '.'));
    if (!isLeaf) continue;
    const past = pastLeafState.get(r.id);
    const nowStatus = r.status || 'open';
    const nowProg = typeof r.progress === 'number' ? r.progress : (nowStatus === 'done' ? 100 : nowStatus === 'wip' ? 50 : 0);
    if (nowStatus === 'done' && past?.status !== 'done') {
      doneInWindowIds.add(r.id);
    } else if (past && nowStatus !== 'done' && nowProg > (past.progress || 0)) {
      progressedInWindowIds.add(r.id);
    } else if (!past) {
      progressedInWindowIds.add(r.id);
    }
  }

  // Anything that progressed AND is now done already sits in doneInWindowIds.
  for (const id of doneInWindowIds) progressedInWindowIds.delete(id);
  const changedInWindowIds = new Set([...doneInWindowIds, ...progressedInWindowIds]);

  // Per-root past progress (effort-weighted). Used by the Roadmap to render
  // the ghost-train marker. Roots are top-level rows (no dot in the id).
  const roots = tree.filter(r => !r.id.includes('.'));
  const pastProgressByRootId = {};
  const newRootIds = [];
  for (const root of roots) {
    const subtreeLeaves = tree
      .filter(n => n.id === root.id || n.id.startsWith(root.id + '.'))
      .filter(n => !tree.some(other => other.id !== n.id && other.id.startsWith(n.id + '.')));
    let totalEff = 0, doneEff = 0;
    let anyPastLeaf = false;
    for (const lf of subtreeLeaves) {
      const eff = re(lf.best || 0, lf.factor || 1.5) || 1;
      totalEff += eff;
      const past = pastLeafState.get(lf.id);
      if (past) anyPastLeaf = true;
      const pastDone = past?.status === 'done';
      const pastProg = past ? (past.progress || 0) / 100 : 0;
      doneEff += eff * (pastDone ? 1 : pastProg);
    }
    pastProgressByRootId[root.id] = totalEff > 0 ? doneEff / totalEff : 0;
    if (!anyPastLeaf && subtreeLeaves.length > 0) newRootIds.push(root.id);
  }

  // Banner counts: tasks (leaves) newly done and total effort burnt.
  let doneCount = 0, effortInWindow = 0;
  for (const id of doneInWindowIds) {
    const node = tree.find(r => r.id === id);
    if (!node) continue;
    doneCount++;
    effortInWindow += re(node.best || 0, node.factor || 1.5) || 0;
  }

  // Sprint-window capacity: gross calendar workdays, holidays, available
  // person-days and vacation days lost. Always computed when members are
  // available — caller can decide what to show.
  const capStats = (members && members.length)
    ? _capacityStats({ from: sinceDate instanceof Date ? sinceDate : new Date(sinceDate),
        to: new Date(), members, vacations, holidays, workDays })
    : { grossWorkdays: 0, holidayCount: 0, availablePersonDays: 0, vacationDaysInWindow: 0 };

  return {
    sinceDate,
    pastLeafState,
    pastProgressByRootId,
    newRootIds,
    doneInWindowIds: [...doneInWindowIds],
    progressedInWindowIds: [...progressedInWindowIds],
    changedInWindowIds: [...changedInWindowIds],
    startedInWindowIds: [...startedInWindowIds],
    doneCount,
    effortInWindow,
    grossWorkdays: capStats.grossWorkdays,
    holidayCount: capStats.holidayCount,
    availablePersonDays: capStats.availablePersonDays,
    vacationDaysInWindow: capStats.vacationDaysInWindow,
    // Utilisation: effort burnt vs effective capacity. Bounded [0, 999] so a
    // pure-progress sprint with no completions doesn't crash on divide-by-zero.
    utilisation: capStats.availablePersonDays > 0
      ? Math.min(999, Math.round((effortInWindow / Math.max(1, capStats.availablePersonDays - capStats.vacationDaysInWindow)) * 100))
      : null,
  };
}

// Convenience: parse a localStorage-style "since" string ("", "7", "14", "30",
// or "YYYY-MM-DD") into a JS Date. Shared by every view so they interpret the
// global picker value the same way.
export function parseSinceValue(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(val + 'T23:59:59');
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d;
}
