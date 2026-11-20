import { leafNodes, parentId, resolveToLeafIds } from './scheduler.js';

function asId(nodeOrId) {
  return typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
}

function buildNodeMap(tree) {
  return new Map((tree || []).map(node => [node.id, node]));
}

export function deadlineRootIdForNode(tree, nodeOrId) {
  const id = asId(nodeOrId);
  if (!id) return '';
  const nodeMap = buildNodeMap(tree);
  let current = id;
  while (current) {
    const node = nodeMap.get(current);
    if (node?.type === 'deadline') return current;
    current = parentId(current);
  }
  return '';
}

export function isDeadlineRelevantForRoot(tree, rootId, nodeOrId) {
  const id = asId(nodeOrId);
  if (!id || !rootId) return false;
  if (id !== rootId && !id.startsWith(rootId + '.')) return false;
  const nodeMap = buildNodeMap(tree);
  let current = id;
  while (current && current !== rootId) {
    if (nodeMap.get(current)?.deadlineRelevant === false) return false;
    current = parentId(current);
  }
  return true;
}

export function isDeadlineRelevantNode(tree, nodeOrId) {
  const rootId = deadlineRootIdForNode(tree, nodeOrId);
  if (!rootId) return true;
  return isDeadlineRelevantForRoot(tree, rootId, nodeOrId);
}

export function deadlineScopedLeafIds(tree, rootId) {
  if (!rootId) return [];
  return resolveToLeafIds(tree, rootId)
    .filter(id => isDeadlineRelevantForRoot(tree, rootId, id));
}

export function deadlineScopedScheduledItems(tree, scheduled, rootId) {
  const ids = new Set(deadlineScopedLeafIds(tree, rootId));
  return (scheduled || []).filter(item => ids.has(item.id));
}
