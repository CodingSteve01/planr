import { parentId, resolveToLeafIds } from './scheduler.js';

const EMPTY_ARR = [];

function ancestorsOf(id) {
  const ancestors = [];
  let aid = parentId(id);
  while (aid) {
    ancestors.push(aid);
    aid = parentId(aid);
  }
  return ancestors;
}

function dependencyIds(id, iMap, includeSoft) {
  const node = iMap[id];
  if (!node) return EMPTY_ARR;
  const own = includeSoft
    ? [...(node.deps || []), ...(node.softDeps || [])]
    : [...(node.deps || [])];
  const inherited = ancestorsOf(id).flatMap((ancestorId) => {
    const ancestor = iMap[ancestorId];
    if (!ancestor) return EMPTY_ARR;
    return includeSoft
      ? [...(ancestor.deps || []), ...(ancestor.softDeps || [])]
      : [...(ancestor.deps || [])];
  });
  return [...new Set([...own, ...inherited])];
}

function branchKey(id, depth = 2) {
  return String(id || '').split('.').slice(0, depth).join('.');
}

function ownSoftDependencyIds(id, iMap) {
  return [...(iMap[id]?.softDeps || [])];
}

function resolvedLeafDeps(tree, leafIds, id, rawDeps) {
  const resolved = new Set();
  for (const depId of rawDeps) {
    for (const leafId of resolveToLeafIds(tree || [], depId)) {
      if (leafIds.has(leafId) && leafId !== id) resolved.add(leafId);
    }
  }
  return resolved;
}

export function buildThreadStructure({ groupBy = 'thread', allItems = [], tree = [], iMap, scheduled = [] }) {
  if (groupBy !== 'thread') return EMPTY_ARR;

  const itemIds = new Set();
  for (const item of allItems || []) itemIds.add(item.treeId || item.id);
  const leafIds = new Set([...itemIds].filter(Boolean));
  const nodeMap = iMap || Object.fromEntries((tree || []).map((item) => [item.id, item]));

  const undirected = new Map();
  for (const id of leafIds) undirected.set(id, new Set());

  // Thread membership is intentionally based on hard deps only. Soft deps are
  // only allowed to join a thread inside the same coarse WBS branch (`P1.1.*`).
  // This keeps sibling chains together without one cross-root hint collapsing
  // the whole project into a single huge component.
  for (const id of leafIds) {
    const hardDeps = resolvedLeafDeps(tree, leafIds, id, dependencyIds(id, nodeMap, false));
    for (const depId of hardDeps) {
      undirected.get(id).add(depId);
      undirected.get(depId).add(id);
    }
    const localSoftDeps = resolvedLeafDeps(tree, leafIds, id, ownSoftDependencyIds(id, nodeMap));
    for (const depId of localSoftDeps) {
      if (branchKey(id) !== branchKey(depId)) continue;
      undirected.get(id).add(depId);
      undirected.get(depId).add(id);
    }
  }

  const compOf = new Map();
  let cid = 0;
  for (const id of leafIds) {
    if (compOf.has(id)) continue;
    cid += 1;
    const queue = [id];
    compOf.set(id, cid);
    while (queue.length) {
      const current = queue.shift();
      for (const next of undirected.get(current) || EMPTY_ARR) {
        if (compOf.has(next)) continue;
        compOf.set(next, cid);
        queue.push(next);
      }
    }
  }

  const succ = new Map();
  const indeg = new Map();
  for (const id of leafIds) {
    succ.set(id, []);
    indeg.set(id, 0);
  }

  const rankEdges = new Set();
  for (const id of leafIds) {
    const deps = resolvedLeafDeps(tree, leafIds, id, dependencyIds(id, nodeMap, true));
    for (const depId of deps) {
      if (compOf.get(depId) !== compOf.get(id)) continue;
      const edgeKey = `${depId}->${id}`;
      if (rankEdges.has(edgeKey)) continue;
      rankEdges.add(edgeKey);
      succ.get(depId).push(id);
      indeg.set(id, (indeg.get(id) || 0) + 1);
    }
  }

  const rank = new Map([...leafIds].map((id) => [id, 0]));
  const queue = [...leafIds].filter((id) => indeg.get(id) === 0);
  const indegMut = new Map(indeg);
  while (queue.length) {
    const current = queue.shift();
    for (const next of succ.get(current) || EMPTY_ARR) {
      rank.set(next, Math.max(rank.get(next) || 0, (rank.get(current) || 0) + 1));
      indegMut.set(next, indegMut.get(next) - 1);
      if (indegMut.get(next) === 0) queue.push(next);
    }
  }

  const startOf = new Map();
  for (const item of [...(scheduled || []), ...(allItems || [])]) {
    if (typeof item.startWi !== 'number' || item.startWi < 0) continue;
    const id = item.treeId || item.id;
    const current = startOf.get(id);
    if (current == null || item.startWi < current) startOf.set(id, item.startWi);
  }

  const byComp = new Map();
  for (const [id, componentId] of compOf) {
    if (!byComp.has(componentId)) byComp.set(componentId, []);
    byComp.get(componentId).push(id);
  }

  const threads = [];
  for (const [componentId, ids] of byComp) {
    ids.sort((a, b) => {
      const rankA = rank.get(a) ?? 0;
      const rankB = rank.get(b) ?? 0;
      if (rankA !== rankB) return rankA - rankB;
      const startA = startOf.get(a) ?? 1e9;
      const startB = startOf.get(b) ?? 1e9;
      if (startA !== startB) return startA - startB;
      return a.localeCompare(b);
    });
    const earliest = ids.reduce((min, id) => Math.min(min, startOf.get(id) ?? Infinity), Infinity);
    threads.push({ cid: componentId, ids, earliest, isSolo: ids.length === 1 });
  }

  threads.sort((a, b) => {
    if (a.isSolo !== b.isSolo) return a.isSolo ? 1 : -1;
    return (a.earliest === Infinity ? 1e9 : a.earliest) - (b.earliest === Infinity ? 1e9 : b.earliest);
  });

  return threads;
}
