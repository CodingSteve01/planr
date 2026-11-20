import { isDropped } from '../utils/scheduler.js';

// "Hide done": the rows of `source` that still have open work below them.
export function withoutDone(source) {
  const byId = Object.fromEntries(source.map(r => [r.id, r]));
  const byParent = {};
  source.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(r);
  });
  const keep = new Set();
  const visit = id => {
    const node = byId[id];
    if (!node) return false;
    const children = byParent[id] || [];
    if (!children.length) {
      // Dropped counts as finished here. "Hide done" is a request to see
      // what is still to be done, and a task that was rejected has no work
      // left in it either — it stayed on screen alongside the open ones,
      // struck through, in a view whose whole point was that it is not.
      const shouldShow = node.status !== 'done' && !isDropped(node);
      if (shouldShow) keep.add(id);
      return shouldShow;
    }
    // For non-leaf structure, derived parent statuses can be stale or intentionally
    // aggregate child state. Hide/show should therefore be driven only by whether
    // there is any non-done leaf left below this branch.
    let hasVisibleChild = false;
    children.forEach(child => {
      if (visit(child.id)) hasVisibleChild = true;
    });
    if (hasVisibleChild) keep.add(id);
    return hasVisibleChild;
  };
  (byParent[''] || []).forEach(root => visit(root.id));
  return source.filter(r => keep.has(r.id));
}

// A row that passes a filter brings its ancestors with it, or it would hang
// in the tree with nothing above it.
function ancestorVisible(idSet, id) {
  idSet.add(id);
  const parts = id.split('.');
  for (let i = 1; i < parts.length; i++) idSet.add(parts.slice(0, i).join('.'));
}

// Scope (project / team / person) and "only unestimated": the filters that
// need nothing but the tree.
export function scopeFiltered(tree, { rootFilter, teamFilter, personFilter, onlyUnestimated }) {
  let items = tree;
  if (rootFilter) items = items.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
  if (teamFilter) {
    const visibleIds = new Set();
    items.forEach(r => {
      if ((r.team || '').includes(teamFilter)) ancestorVisible(visibleIds, r.id);
    });
    items = items.filter(r => visibleIds.has(r.id));
  }
  if (personFilter) {
    const visibleIds = new Set();
    items.forEach(r => {
      if ((r.assign || []).includes(personFilter)) ancestorVisible(visibleIds, r.id);
    });
    items = items.filter(r => visibleIds.has(r.id));
  }
  if (onlyUnestimated) {
    const visibleIds = new Set();
    items.forEach(r => {
      const isLeaf = !items.some(o => o.id !== r.id && o.id.startsWith(r.id + '.'));
      if (isLeaf && !r.best && !r.fixedDurationDays && r.status !== 'done') ancestorVisible(visibleIds, r.id);
    });
    items = items.filter(r => visibleIds.has(r.id));
  }
  return items;
}

// The tasks that run through a week in which somebody on them is booked
// beyond 110 %.
export function overbookedIds(scheduled, weeks, resourceLoadByWeek) {
  const out = new Set();
  if (!Object.keys(resourceLoadByWeek || {}).length) return out;
  (scheduled || []).forEach(s => {
    if (!s || !s.startD || !s.endD) return;
    const ids = [...new Set([s.personId, ...(s.assign || [])].filter(Boolean))];
    if (!ids.length) return;
    const start = s.startD instanceof Date ? s.startD : new Date(s.startD);
    const end = s.endD instanceof Date ? s.endD : new Date(s.endD);
    for (let wi = 0; wi < weeks.length; wi++) {
      const w = weeks[wi];
      if (!w?.mon) continue;
      const wkEnd = new Date(w.mon);
      wkEnd.setDate(wkEnd.getDate() + 6);
      if (wkEnd < start || w.mon > end) continue;
      if (ids.some(id => (resourceLoadByWeek[id]?.[wi]?.percent || 0) > 110)) {
        out.add(s.treeId || s.id);
        break;
      }
    }
  });
  return out;
}

// The quick filters that depend on the scheduler's output (auto-assigned,
// overdue, overbooked).
export function scheduleFiltered(netTree, scheduled, { onlyAutoAssigned, onlyOverdue, onlyOverbooked, overbookedTaskIds }) {
  if (!onlyAutoAssigned && !onlyOverdue && !onlyOverbooked) return netTree;
  let items = netTree;
  if (onlyAutoAssigned) {
    const autoIds = new Set((scheduled || []).filter(s => s.autoAssigned).map(s => s.treeId || s.id));
    const visibleIds = new Set();
    items.forEach(r => {
      if (autoIds.has(r.id)) ancestorVisible(visibleIds, r.id);
    });
    items = items.filter(r => visibleIds.has(r.id));
  }
  if (onlyOverdue) {
    const overdueIds = new Set(
      (scheduled || [])
        .filter(s => s.dueOverdue || (s.due && s.endD && new Date(s.endD) > new Date(s.due) && s.status !== 'done'))
        .map(s => s.treeId || s.id),
    );
    const visibleIds = new Set();
    items.forEach(r => {
      if (overdueIds.has(r.id)) ancestorVisible(visibleIds, r.id);
    });
    items = items.filter(r => visibleIds.has(r.id));
  }
  if (onlyOverbooked && overbookedTaskIds.size > 0) {
    const visibleIds = new Set();
    items.forEach(r => {
      if (overbookedTaskIds.has(r.id)) ancestorVisible(visibleIds, r.id);
    });
    items = items.filter(r => visibleIds.has(r.id));
  }
  return items;
}

export function withReviewedDone(quickFilteredNetTree, activeTree, diffChangedSet) {
  const keep = new Set(quickFilteredNetTree.map(r => r.id));
  // Re-add done items that moved inside the review window. Sourced from
  // activeTree, so a diff window can't drag an archived project back onto
  // the screen.
  const byId = Object.fromEntries(activeTree.map(r => [r.id, r]));
  diffChangedSet.forEach(id => {
    const node = byId[id];
    if (!node || node.status !== 'done') return;
    keep.add(id);
    const parts = id.split('.');
    for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('.'));
  });
  return activeTree.filter(r => keep.has(r.id));
}
