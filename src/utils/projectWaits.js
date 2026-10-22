// ─── What is this project waiting on? ─────────────────────────────────────
// A project can be late because of work in ANOTHER project: the person who
// decides its end is busy with that first. Every view in Planr shows one
// project, so the late one only showed bars starting late, and the deadline
// check (timeline.js deadlineStatus) only says *that* it is late. On the
// venneker plan P8 was 91 days late while 42 PT of P10 sat ahead of it on the
// only Backend developer, and nothing on screen said so.
//
// The answer is measured, not guessed: schedule again without an earlier
// project and see what moves. Only projects that come BEFORE this one in the
// plan can hold it back; the scheduler places work in plan order, so anything
// after it never takes its people first. Taking a project out and moving it
// behind this one are the same thing for this project's end.
//
// Causes add up and can hide each other, so this is a chain, not a list:
// take out the one that gains most, schedule again, look for the next. Two
// causes that only help together (each alone leaves the other in the way)
// are caught by one pair check over what is left.
import { inTeam } from './memberTeams.js';
import { sortTree } from './treeEdit.js';

const DAY = 864e5;
const under = (id, rootId) => id === rootId || id.startsWith(rootId + '.');
const days = ms => Math.round(ms / DAY);

function endOf(rows, rootId) {
  let end = null;
  for (const r of rows) {
    if (!under(r.treeId || r.id, rootId) || r.unscheduled || !r.endD) continue;
    const e = new Date(r.endD);
    if (!end || e > end) end = e;
  }
  return end;
}

const without = (tree, rootIds) => tree.map(n =>
  (rootIds.some(rid => under(n.id, rid)) ? { ...n, dropped: true } : n));

// Open projects before `rootId` in the plan's own order.
function earlierProjects(tree, rootId) {
  const order = sortTree(tree).filter(n => !n.id.includes('.')).map(n => n.id);
  const at = order.indexOf(rootId);
  if (at <= 0) return [];
  return order.slice(0, at).filter(rid => tree.some(n => under(n.id, rid) && n.id !== rid
    && n.status !== 'done' && !n.dropped && (n.best > 0)));
}

// Who of the cause's work is in this project's way: the person with the most
// of it among those who also work here (else simply the most of it).
function causeDetail(rows, ids, rootId, nameOf) {
  const here = new Set(rows.filter(r => under(r.treeId || r.id, rootId) && r.personId).map(r => r.personId));
  const byPerson = new Map();
  for (const r of rows) {
    if (!r.personId || r.unscheduled || !ids.some(id => under(r.treeId || r.id, id))) continue;
    const p = byPerson.get(r.personId) || { pt: 0, from: null, to: null };
    p.pt += r.effort || 0;
    const s = new Date(r.startD), e = new Date(r.endD);
    if (!p.from || s < p.from) p.from = s;
    if (!p.to || e > p.to) p.to = e;
    byPerson.set(r.personId, p);
  }
  const ranked = [...byPerson.entries()].sort((a, b) =>
    (here.has(b[0]) - here.has(a[0])) || (b[1].pt - a[1].pt));
  if (!ranked.length) return { person: null, pt: 0, from: null, to: null };
  const [id, p] = ranked[0];
  return { person: { id, name: nameOf(id) }, ...p };
}

// The tasks that set the end, walked back from the last one: a binding
// dependency if there is one, otherwise the same person's task right before.
// Foreign tasks (other projects) stay in, because they are the point.
function drivingPath(rows, rootId, today, nameOf) {
  const live = rows.filter(r => r.startD && r.endD && !r.unscheduled);
  const own = live.filter(r => under(r.treeId || r.id, rootId));
  if (!own.length) return [];
  let cur = own.reduce((a, b) => (new Date(b.endD) > new Date(a.endD) ? b : a));
  const path = [];
  const seen = new Set();
  while (cur && !seen.has(cur.id) && path.length < 200) {
    seen.add(cur.id);
    path.push(cur);
    if (new Date(cur.startD) <= today) break;
    const start = new Date(cur.startD);
    const dep = cur.blockedBy?.id && live.find(r => r.id === cur.blockedBy.id);
    cur = dep || live
      .filter(r => r.personId && r.personId === cur.personId && r.id !== cur.id
        && new Date(r.endD) <= start && start - new Date(r.endD) <= 7 * DAY)
      .sort((a, b) => new Date(b.endD) - new Date(a.endD))[0] || null;
  }
  // One line per work package and person: ten of one developer's tasks in a
  // row say "Jonas, P8.16, May to July" and push the part that matters (the
  // other project before them) off the list.
  const steps = [];
  for (const r of path.reverse()) {
    const id = r.treeId || r.id;
    const pkg = id.split('.').slice(0, 2).join('.');
    const prev = steps[steps.length - 1];
    if (prev && prev.pkg === pkg && prev.personId === r.personId) {
      prev.count++; prev.endD = new Date(r.endD); prev.id = pkg;
      continue;
    }
    steps.push({ id, pkg, personId: r.personId, count: 1, name: r.name, personName: nameOf(r.personId),
      startD: new Date(r.startD), endD: new Date(r.endD), foreign: !under(id, rootId) });
  }
  return steps.slice(-8).map(({ pkg, personId, ...step }) => step);
}

export function projectWaits({ tree, scheduled, rootId, reschedule, members = [], today = new Date() }) {
  const root = (tree || []).find(n => n.id === rootId);
  if (!root) return null;
  const nameOf = id => members.find(m => m.id === id)?.name || id || '';
  const end = endOf(scheduled, rootId);
  const deadline = root.date ? new Date(root.date) : null;
  const lateDays = end && deadline ? Math.max(0, days(end - deadline)) : null;

  const own = scheduled.filter(r => under(r.treeId || r.id, rootId) && r.personId && !r.unscheduled && r.endD);
  const last = own.length ? own.reduce((a, b) => (new Date(b.endD) > new Date(a.endD) ? b : a)) : null;
  const bottleneck = last && {
    personId: last.personId,
    name: nameOf(last.personId),
    lastTaskId: last.treeId || last.id,
    openPt: own.filter(r => r.personId === last.personId && new Date(r.endD) >= today)
      .reduce((sum, r) => sum + (r.effort || 0), 0),
    alone: members.filter(m => inTeam(m, last.team || '')
      && !(m.end && new Date(m.end) < today) && !(m.start && new Date(m.start) > (end || today))).length <= 1,
  };

  const chain = [];
  if (end && typeof reschedule === 'function') {
    let removed = [];
    let rows = scheduled;
    let currentEnd = end;
    let candidates = earlierProjects(tree, rootId);
    const endWithout = ids => endOf(reschedule(without(tree, ids)), rootId);
    const push = (ids, endAfter) => {
      const prev = currentEnd;
      chain.push({
        ids,
        names: ids.map(id => tree.find(n => n.id === id)?.name || id),
        ...causeDetail(rows, ids, rootId, nameOf),
        endAfter,
        gainDays: days(prev - endAfter),
        totalGainDays: days(end - endAfter),
      });
      removed = [...removed, ...ids];
      rows = reschedule(without(tree, removed));
      currentEnd = endAfter;
      candidates = candidates.filter(c => !ids.includes(c));
    };
    for (;;) {
      const trials = candidates.map(c => ({ c, e: endWithout([...removed, c]) }))
        .filter(x => x.e && days(currentEnd - x.e) > 0)
        .sort((a, b) => a.e - b.e);
      if (trials.length) { push([trials[0].c], trials[0].e); continue; }
      let best = null;
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const e = endWithout([...removed, candidates[i], candidates[j]]);
          if (e && days(currentEnd - e) > 0 && (!best || e < best.e)) best = { ids: [candidates[i], candidates[j]], e };
        }
      }
      if (best) { push(best.ids, best.e); continue; }
      break;
    }
  }

  return {
    rootId, end, deadline, lateDays, bottleneck, chain,
    path: drivingPath(scheduled, rootId, today, nameOf),
  };
}

