import { localDate } from './date.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from './deadlines.js';
import { isLeafNode, resolveToLeafIds } from './scheduler.js';

function asNode(tree, nodeOrId) {
  if (!nodeOrId) return null;
  return typeof nodeOrId === 'string'
    ? (tree || []).find(node => node.id === nodeOrId) || null
    : nodeOrId;
}

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : localDate(value);
}

function aggregateWindows(windows) {
  const valid = windows.filter(window => window?.start && window?.end);
  if (!valid.length) return null;
  return {
    start: new Date(Math.min(...valid.map(window => window.start.getTime()))),
    end: new Date(Math.max(...valid.map(window => window.end.getTime()))),
    count: valid.length,
  };
}

function leafWindows(node, scheduledMap) {
  const scheduled = scheduledMap.get(node.id);
  const plannedStart = toDate(
    node.plannedStart
    || scheduled?.startD
    || node.pinnedStart
    || node.completedStart
    || node.completedAt
  );
  const plannedEnd = toDate(
    node.plannedEnd
    || scheduled?.endD
    || node.completedEnd
    || node.completedAt
  );
  const actualStart = node.status === 'done'
    ? toDate(node.completedStart || node.completedAt)
    : null;
  const actualEnd = node.status === 'done'
    ? toDate(node.completedAt || node.completedEnd || node.completedStart)
    : null;
  return {
    planned: plannedStart && plannedEnd ? { start: plannedStart, end: plannedEnd } : null,
    actual: actualStart && actualEnd ? { start: actualStart, end: actualEnd } : null,
  };
}

export function summarizeNodeTimeline(tree, scheduled, nodeOrId) {
  const node = asNode(tree, nodeOrId);
  if (!node) return null;

  const scheduledMap = new Map((scheduled || []).map(item => [item.id, item]));
  const leafIds = isLeafNode(tree, node.id) ? [node.id] : resolveToLeafIds(tree, node.id);
  const leaves = leafIds
    .map(id => (tree || []).find(item => item.id === id))
    .filter(Boolean);
  const windows = leaves.map(leaf => ({ leaf, ...leafWindows(leaf, scheduledMap) }));

  const planned = aggregateWindows(windows.map(entry => entry.planned));
  const actualLeaves = windows.filter(entry => entry.actual);
  const actual = aggregateWindows(actualLeaves.map(entry => entry.actual));

  const deadlineRootId = deadlineRootIdForNode(tree, node.id);
  const deadlineScopedLeaves = deadlineRootId
    ? leaves.filter(leaf => isDeadlineRelevantForRoot(tree, deadlineRootId, leaf.id))
    : [];
  const deadlineWindows = deadlineScopedLeaves.map(leaf => leafWindows(leaf, scheduledMap).planned);
  const deadline = deadlineScopedLeaves.length > 0
    ? aggregateWindows(deadlineWindows)
    : null;
  const hasDeadlineSubset = !!deadline
    && deadlineScopedLeaves.length > 0
    && deadlineScopedLeaves.length < leaves.length;

  return {
    node,
    isLeaf: leafIds.length === 1 && leafIds[0] === node.id,
    leafCount: leafIds.length,
    doneLeafCount: leaves.filter(leaf => leaf.status === 'done').length,
    planned,
    actual,
    deadline: hasDeadlineSubset ? {
      ...deadline,
      leafCount: deadlineScopedLeaves.length,
      excludedLeafCount: Math.max(0, leafIds.length - deadlineScopedLeaves.length),
      rootId: deadlineRootId,
    } : null,
  };
}
