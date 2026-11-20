import { isLeafNode } from '../utils/scheduler.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from '../utils/deadlines.js';

// What the selected items have in common, for the bulk editor: the shared value
// of a field (null when they differ) and the facts that decide which tabs and
// fields are offered.

// The value every item agrees on, or null when they differ.
export function commonOf(items, getter) {
  const vals = items.map(getter);
  const first = vals[0];
  return vals.every(v => v === first) ? first : null;
}

const COMMON_FIELDS = {
  team: r => r.team,
  status: r => r.status,
  prio: r => r.prio,
  best: r => r.best,
  factor: r => r.factor,
  pinnedStart: r => r.pinnedStart || '',
  completedStart: r => r.completedStart || '',
  completedEnd: r => r.completedEnd || '',
  completedAt: r => r.completedAt || '',
  confidence: r => r.confidence || '',
  note: r => r.note,
  parallel: r => !!r.parallel,
  teamLock: r => !!r.teamLock,
};

function deadlineFacts(tree, selItems) {
  const allDeadlineScoped =
    selItems.length > 0 &&
    selItems.every(item => {
      const rootId = deadlineRootIdForNode(tree, item.id);
      return !!rootId && item.id !== rootId;
    });
  const deadlineParentExcluded =
    allDeadlineScoped &&
    selItems.some(item => {
      const rootId = deadlineRootIdForNode(tree, item.id);
      const pid = item.id.split('.').slice(0, -1).join('.');
      return !!pid && !isDeadlineRelevantForRoot(tree, rootId, pid);
    });
  const commonDeadlineRelevant = allDeadlineScoped ? commonOf(selItems, item => item.deadlineRelevant !== false) : null;
  return { allDeadlineScoped, deadlineParentExcluded, commonDeadlineRelevant };
}

export function bulkFacts(tree, multiSel) {
  const selItems = tree.filter(r => multiSel.has(r.id));
  const common = {};
  for (const [key, getter] of Object.entries(COMMON_FIELDS)) common[key] = commonOf(selItems, getter);
  return {
    selItems,
    common,
    allLeaf: selItems.every(r => isLeafNode(tree, r.id)),
    anyNonRoot: selItems.some(r => r.id.includes('.')),
    ...deadlineFacts(tree, selItems),
  };
}
