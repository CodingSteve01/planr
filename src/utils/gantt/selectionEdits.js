// Edits that act on the current selection: reorder, nudge the priority, link in
// order, clear links. Every edit goes out through the callbacks in the context.
import { EMPTY_ARR } from './helpers.js';

// Move the current selection earlier or later. One line of code now,
// because there is one order: the tree's.
//
// What stood here was a second ordering system — sort each team's leaves by
// `seq`, splice the selection in, rewrite `seq` in steps of five, and for
// The two order buttons also rewrite the selection's PRIORITY to match the destination
// neighbourhood, because (the comment said) "seq alone is only a tiebreak,
// prio dominates the sort". It did, and that was the bug: the plan you
// arranged in the tree and the plan the scheduler ran were two different
// plans. Changing importance to express order was the workaround for it.
//
// The cost, stated plainly: this moves an item among its siblings, so it
// cannot lift a task out of the middle of one project to the front of a
// team's queue while leaving it at the bottom of the tree. That was never a
// coherent thing to ask for — it is the disagreement itself.
export function reorderSelectionInTime(ctx, dir) {
  const { selectedTaskIds, leafIdSet, onReorderSibling } = ctx;
  if (!onReorderSibling || selectedTaskIds.length === 0) return;
  const ids = selectedTaskIds.filter(id => leafIdSet.has(id));
  // Down/last runs bottom-up so the selection does not step over itself.
  const ordered = dir === 'down' || dir === 'last' ? [...ids].reverse() : ids;
  ordered.forEach(id => onReorderSibling(id, dir));
}

// Bulk prio nudge for the current selection. step = -1 → more urgent
// (lower number), +1 → less urgent. Clamped to 1..4. This is the real
// lever when z-order alone is not enough to push a group past competing
// work — prio dominates the scheduler sort.
export function adjustSelectionPrio(ctx, step) {
  const { selectedTaskIds, iMap, onTaskUpdate } = ctx;
  if (!onTaskUpdate) return;
  selectedTaskIds.forEach(id => {
    const node = iMap[id];
    if (!node) return;
    const current = node.prio || 2;
    const next = Math.max(1, Math.min(4, current + step));
    if (next === current) return;
    onTaskUpdate({ ...node, prio: next });
  });
}

export function linkSelectedInOrder(ctx) {
  const { selectedTaskIds, onAddDep } = ctx;
  selectedTaskIds.forEach((id, index) => {
    const prev = selectedTaskIds[index - 1];
    if (prev && prev !== id) onAddDep?.(id, prev);
  });
}

export function clearSelectedLinks(ctx, kind = 'all') {
  const { selectedTaskIds, iMap, tree, onTaskUpdate, onRemoveDep } = ctx;
  const selected = new Set(selectedTaskIds);
  if (!onTaskUpdate && kind === 'all' && onRemoveDep) {
    const pairs = new Set();
    const scheduleRemove = (targetId, depId) => {
      if (!targetId || !depId) return;
      pairs.add(`${targetId}\u0000${depId}`);
    };
    selectedTaskIds.forEach(id => {
      const node = iMap[id];
      if (!node) return;
      [...(node.deps || EMPTY_ARR), ...(node.softDeps || EMPTY_ARR)].forEach(depId => scheduleRemove(id, depId));
    });
    (tree || EMPTY_ARR).forEach(node => {
      [...(node.deps || EMPTY_ARR), ...(node.softDeps || EMPTY_ARR)]
        .filter(depId => selected.has(depId))
        .forEach(depId => scheduleRemove(node.id, depId));
    });
    pairs.forEach(key => {
      const [targetId, depId] = key.split('\u0000');
      onRemoveDep(targetId, depId);
    });
    return;
  }
  const removeHard = kind === 'hard' || kind === 'all';
  const removeSoft = kind === 'soft' || kind === 'all';
  (tree || EMPTY_ARR).forEach(node => {
    const isSelectedTarget = selected.has(node.id);
    let deps = node.deps || EMPTY_ARR;
    let softDeps = node.softDeps || EMPTY_ARR;
    let changed = false;
    if (removeHard) {
      const next = deps.filter(depId => !(isSelectedTarget || selected.has(depId)));
      changed = changed || next.length !== deps.length;
      deps = next;
    }
    if (removeSoft) {
      const next = softDeps.filter(depId => !(isSelectedTarget || selected.has(depId)));
      changed = changed || next.length !== softDeps.length;
      softDeps = next;
    }
    if (changed) onTaskUpdate?.({ ...node, deps, softDeps });
  });
}
