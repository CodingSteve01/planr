// ─── Work out the order of projects ───────────────────────────────────────
// The tree's order is the order of the work (scheduler.js), and Planr only
// ever drew that one order. On the venneker plan P10 sat ahead of P8 and took
// the only Backend developer for three months; moving it behind P8 held P8's
// date far better, and nothing suggested it. This tries other orders and
// hands back the best few with everything each one costs.
//
// Only the order of top-level projects changes. Dependencies, pinned dates,
// person queues and the order inside a project are facts and stay; the
// scheduler honours them in every run, so an order a dependency makes
// pointless simply scores the same and is not proposed.
//
// Better means, in this order: more deadlines held, less lateness, earlier
// ends, fewer moves. Lateness and ends are weighted by the project's place in
// the CURRENT order (higher up weighs more), so the search does not shuffle
// the plan for a few days on something nobody ranked first.
//
// The search is a hill climb over "move one project to another place", each
// candidate a full schedule run. Trying every order is out of reach (six open
// projects are 720 orders at ~100 ms each); a few dozen runs find what the
// plan's own order leaves on the table. It is an async generator that yields
// after every run, so a view can show progress, stay responsive and stop it.
import { sortTree } from './treeEdit.js';

const DAY = 864e5;
const under = (id, rootId) => id === rootId || id.startsWith(rootId + '.');

function rootsInOrder(tree) {
  return sortTree(tree).filter(n => !n.id.includes('.'));
}

function openRoots(tree) {
  return rootsInOrder(tree).filter(root => root.status !== 'done' && !root.dropped
    && tree.some(n => n.id !== root.id && under(n.id, root.id) && n.status !== 'done' && !n.dropped && n.best > 0))
    .map(root => root.id);
}

// Writes `order` (open projects) into the tree as displayOrder. Projects not
// in it (finished, dropped) keep their relative order in front.
export function applyRootOrder(tree, order) {
  const rest = rootsInOrder(tree).map(r => r.id).filter(id => !order.includes(id));
  const rank = new Map([...rest, ...order].map((id, i) => [id, i + 1]));
  return tree.map(n => (rank.has(n.id) && n.displayOrder !== rank.get(n.id) ? { ...n, displayOrder: rank.get(n.id) } : n));
}

// The fewest "move X before Y" that turn `from` into `to`: everything on a
// longest common run stays, the rest is named where it lands.
export function movesBetween(from, to) {
  const pos = to.map(id => from.indexOf(id));
  const tails = [], tailIdx = [], prev = new Array(pos.length).fill(-1);
  pos.forEach((p, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < p) lo = mid + 1; else hi = mid; }
    tails[lo] = p; tailIdx[lo] = i; prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const keep = new Set();
  for (let i = tailIdx[tails.length - 1]; i >= 0; i = prev[i]) keep.add(to[i]);
  // Named against a project that stays put, so two moves never describe each
  // other ("P5 before P3, P3 after P5").
  return to.flatMap((id, i) => {
    if (keep.has(id)) return [];
    const next = to.slice(i + 1).find(x => keep.has(x));
    if (next) return [{ id, before: next }];
    const prevKept = to.slice(0, i).reverse().find(x => keep.has(x));
    return [{ id, after: prevKept }];
  });
}

function compare(a, b) {
  return (a.missed - b.missed) || (a.lateness - b.lateness) || (a.ends - b.ends) || (a.moves - b.moves);
}

export async function* searchOrders({ tree, reschedule, maxRuns = 60, today = new Date() }) {
  const base = openRoots(tree);
  const weight = new Map(base.map((id, i) => [id, base.length - i]));
  const deadlineOf = new Map(tree.filter(n => base.includes(n.id) && n.date).map(n => [n.id, new Date(n.date)]));
  let runs = 0;
  const seen = new Map();

  const evaluate = order => {
    const key = order.join('|');
    if (seen.has(key)) return seen.get(key);
    runs++;
    const rows = reschedule(applyRootOrder(tree, order));
    const ends = {};
    for (const r of rows) {
      if (r.unscheduled || !r.endD) continue;
      const root = (r.treeId || r.id).split('.')[0];
      if (!weight.has(root)) continue;
      const e = new Date(r.endD);
      if (!ends[root] || e > ends[root]) ends[root] = e;
    }
    let missed = 0, lateness = 0, endSum = 0;
    for (const id of base) {
      const end = ends[id];
      if (!end) continue;
      const dl = deadlineOf.get(id);
      const late = dl ? Math.max(0, Math.round((end - dl) / DAY)) : 0;
      if (late > 0) missed++;
      lateness += late * weight.get(id);
      endSum += Math.round((end - today) / DAY) * weight.get(id);
    }
    const moves = movesBetween(base, order).length;
    const result = { order, ends, missed, score: { missed, lateness, ends: endSum, moves } };
    seen.set(key, result);
    return result;
  };

  const baseline = evaluate(base);
  // Ends alone move only for a real gain: a week per unit of weight, so the
  // search does not reorder the plan for a few days of rounding.
  const better = (a, b) => {
    const c = compare(a.score, b.score);
    if (c >= 0) return false;
    if (a.score.missed !== b.score.missed || a.score.lateness !== b.score.lateness) return true;
    return b.score.ends - a.score.ends >= 7 * Math.max(1, base.length);
  };

  const outcome = r => base.map(id => +(r.ends[id] || 0)).join('|');
  const snapshot = done => ({
    done, runs, maxRuns,
    alternatives: [...seen.values()]
      .filter(r => r !== baseline && better(r, baseline))
      .sort((a, b) => compare(a.score, b.score))
      // Orders that differ only in moves that change nothing end the same; the
      // one with the fewest moves (sorted first) stands for all of them.
      .filter((r, i, all) => all.findIndex(o => outcome(o) === outcome(r)) === i)
      .slice(0, 3)
      .map(r => ({
        order: r.order,
        moves: movesBetween(base, r.order),
        missedBefore: baseline.missed,
        missedAfter: r.missed,
        ends: Object.fromEntries(base.map(id => [id, {
          before: baseline.ends[id] || null,
          after: r.ends[id] || null,
          deltaDays: baseline.ends[id] && r.ends[id] ? Math.round((r.ends[id] - baseline.ends[id]) / DAY) : 0,
        }])),
      })),
  });

  let current = baseline;
  if (base.length < 2) { yield snapshot(true); return; }
  for (;;) {
    let bestNext = null;
    for (let i = 0; i < base.length && runs < maxRuns; i++) {
      // j is the place it lands before; base.length means at the very end.
      for (let j = 0; j <= base.length && runs < maxRuns; j++) {
        if (i === j || j === i + 1) continue;
        const order = current.order.slice();
        const [moved] = order.splice(i, 1);
        order.splice(j > i ? j - 1 : j, 0, moved);
        const before = runs;
        const cand = evaluate(order);
        if (runs > before) {
          yield snapshot(false);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (better(cand, current) && (!bestNext || compare(cand.score, bestNext.score) < 0)) bestNext = cand;
      }
    }
    if (!bestNext || runs >= maxRuns) { if (bestNext) current = bestNext; break; }
    current = bestNext;
  }
  yield snapshot(true);
}
