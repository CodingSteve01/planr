import { treeIndex } from './scheduler.js';

// Entries whose state contradicts itself or the tree around them.
//
// Each one is a place where two surfaces disagree about the same item, which
// is how they surfaced: a task under a finished project, collapsed out of
// sight in the tree, still sat in somebody's queue; a dropped task kept its
// 63% and its "in progress". None of them is wrong enough to refuse the
// plan, so none is corrected silently either — a guess at which half is the
// truth would be a decision taken for the owner. They are listed, and each
// opens the item so the owner can say.
//
//   orphan       — the parent id is not in the plan. sortTree shows it as a
//                  root so it does not vanish, but nobody meant it there.
//   droppedLive  — dropped, yet marked in progress or with progress on it.
//   doneOverOpen — a parent marked done with live work still open below it.
const parentOf = id => String(id).split('.').slice(0, -1).join('.');

export function planInconsistencies(tree) {
  const rows = tree || [];
  if (!rows.length) return [];
  const { byId, childIds, droppedIds } = treeIndex(rows);
  const out = [];
  for (const node of rows) {
    if (!node?.id) continue;
    const pid = parentOf(node.id);
    if (pid && !byId.has(pid)) out.push({ kind: 'orphan', id: node.id, parentId: pid });
    if (node.dropped && node.status !== 'done' && (node.status === 'wip' || (node.progress || 0) > 0)) {
      out.push({ kind: 'droppedLive', id: node.id, progress: node.progress || 0 });
    }
    if (node.status === 'done' && childIds.has(node.id) && !droppedIds.has(node.id)) {
      const open = [];
      const walk = id => (childIds.get(id) || []).forEach(cid => {
        if (droppedIds.has(cid)) return;
        if (childIds.has(cid)) walk(cid);
        else if (byId.get(cid)?.status !== 'done') open.push(cid);
      });
      walk(node.id);
      if (open.length) out.push({ kind: 'doneOverOpen', id: node.id, openIds: open });
    }
  }
  return out;
}
