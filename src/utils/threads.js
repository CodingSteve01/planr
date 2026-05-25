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

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function threadClusterKey(id) {
  return parentId(id) || id;
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
  const incident = new Map();
  const predecessors = new Map();
  for (const id of leafIds) {
    undirected.set(id, new Set());
    incident.set(id, new Set());
    predecessors.set(id, new Set());
  }

  // Thread membership is intentionally based on hard deps only. Soft deps are
  // only allowed to join a thread inside the same coarse WBS branch (`P1.1.*`).
  // This keeps sibling chains together without one cross-root hint collapsing
  // the whole project into a single huge component.
  for (const id of leafIds) {
    const hardDeps = resolvedLeafDeps(tree, leafIds, id, dependencyIds(id, nodeMap, false));
    for (const depId of hardDeps) {
      undirected.get(id).add(depId);
      undirected.get(depId).add(id);
      incident.get(id).add(depId);
      incident.get(depId).add(id);
      predecessors.get(id).add(depId);
    }
    const ownSoftDeps = resolvedLeafDeps(tree, leafIds, id, ownSoftDependencyIds(id, nodeMap));
    for (const depId of ownSoftDeps) {
      incident.get(id).add(depId);
      incident.get(depId).add(id);
      if (branchKey(id) === branchKey(depId)) {
        undirected.get(id).add(depId);
        undirected.get(depId).add(id);
      }
      predecessors.get(id).add(depId);
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

  // Parallel start lanes: if several sibling leaves in the same coarse WBS
  // branch have no predecessors and no explicit route yet, they are alternative
  // starts of that branch's workstream, not separate "one-row threads".
  const compSize = () => {
    const sizes = new Map();
    for (const c of compOf.values()) sizes.set(c, (sizes.get(c) || 0) + 1);
    return sizes;
  };
  let sizes = compSize();
  const byBranch = new Map();
  for (const id of leafIds) {
    const branch = branchKey(id);
    if (!byBranch.has(branch)) byBranch.set(branch, []);
    byBranch.get(branch).push(id);
  }
  for (const ids of byBranch.values()) {
    const startSingles = ids
      .filter(id => (sizes.get(compOf.get(id)) || 0) === 1)
      .filter(id => (predecessors.get(id)?.size || 0) === 0)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (startSingles.length < 2) continue;
    const target = compOf.get(startSingles[0]);
    startSingles.slice(1).forEach(id => compOf.set(id, target));
    sizes = compSize();
  }

  // Cross-branch soft links should not collapse two real workstreams into one
  // huge component, but a single-task component with a real incoming/outgoing
  // edge is not a useful "Solo" thread. Attach those singleton edge-nodes to
  // their largest neighbouring component so the row appears where its arrow
  // already says it belongs.
  let mergedSingleton = true;
  while (mergedSingleton) {
    mergedSingleton = false;
    sizes = compSize();
    const ids = [...leafIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const id of ids) {
      const currentComp = compOf.get(id);
      if ((sizes.get(currentComp) || 0) !== 1) continue;
      const candidates = [...(incident.get(id) || EMPTY_ARR)]
        .filter(otherId => leafIds.has(otherId) && compOf.get(otherId) !== currentComp)
        .sort((a, b) => {
          const sizeA = sizes.get(compOf.get(a)) || 0;
          const sizeB = sizes.get(compOf.get(b)) || 0;
          if (sizeA !== sizeB) return sizeB - sizeA;
          return a.localeCompare(b, undefined, { numeric: true });
        });
      if (!candidates.length) continue;
      compOf.set(id, compOf.get(candidates[0]));
      mergedSingleton = true;
      break;
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

  const compareItems = (a, b) => {
    const rankA = rank.get(a) ?? 0;
    const rankB = rank.get(b) ?? 0;
    if (rankA !== rankB) return rankA - rankB;
    const startA = startOf.get(a) ?? 1e9;
    const startB = startOf.get(b) ?? 1e9;
    if (startA !== startB) return startA - startB;
    return naturalCompare(a, b);
  };

  const compareClusters = (a, b, clusters) => {
    const aIds = clusters.get(a) || EMPTY_ARR;
    const bIds = clusters.get(b) || EMPTY_ARR;
    const minRankA = aIds.reduce((min, id) => Math.min(min, rank.get(id) ?? 0), Infinity);
    const minRankB = bIds.reduce((min, id) => Math.min(min, rank.get(id) ?? 0), Infinity);
    if (minRankA !== minRankB) return minRankA - minRankB;
    const minStartA = aIds.reduce((min, id) => Math.min(min, startOf.get(id) ?? Infinity), Infinity);
    const minStartB = bIds.reduce((min, id) => Math.min(min, startOf.get(id) ?? Infinity), Infinity);
    if (minStartA !== minStartB) return minStartA - minStartB;
    return naturalCompare(a, b);
  };

  const sortThreadIds = (ids) => {
    const idSet = new Set(ids);
    const clusters = new Map();
    const clusterOf = new Map();
    for (const id of ids) {
      const key = threadClusterKey(id);
      clusterOf.set(id, key);
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(id);
    }
    for (const clusterIds of clusters.values()) clusterIds.sort(compareItems);

    const clusterSucc = new Map([...clusters.keys()].map(key => [key, new Set()]));
    const clusterIndeg = new Map([...clusters.keys()].map(key => [key, 0]));
    for (const edgeKey of rankEdges) {
      const [from, to] = edgeKey.split('->');
      if (!idSet.has(from) || !idSet.has(to)) continue;
      const fromCluster = clusterOf.get(from);
      const toCluster = clusterOf.get(to);
      if (!fromCluster || !toCluster || fromCluster === toCluster) continue;
      const next = clusterSucc.get(fromCluster);
      if (next.has(toCluster)) continue;
      next.add(toCluster);
      clusterIndeg.set(toCluster, (clusterIndeg.get(toCluster) || 0) + 1);
    }

    const orderedClusters = [];
    const queue = [...clusters.keys()]
      .filter(key => (clusterIndeg.get(key) || 0) === 0)
      .sort((a, b) => compareClusters(a, b, clusters));
    while (queue.length) {
      const current = queue.shift();
      orderedClusters.push(current);
      for (const next of clusterSucc.get(current) || EMPTY_ARR) {
        clusterIndeg.set(next, (clusterIndeg.get(next) || 0) - 1);
        if (clusterIndeg.get(next) === 0) {
          queue.push(next);
          queue.sort((a, b) => compareClusters(a, b, clusters));
        }
      }
    }

    const orderedSet = new Set(orderedClusters);
    const remaining = [...clusters.keys()]
      .filter(key => !orderedSet.has(key))
      .sort((a, b) => compareClusters(a, b, clusters));
    return [...orderedClusters, ...remaining].flatMap(key => clusters.get(key) || EMPTY_ARR);
  };

  const threads = [];
  for (const [componentId, ids] of byComp) {
    ids.splice(0, ids.length, ...sortThreadIds(ids));
    const earliest = ids.reduce((min, id) => Math.min(min, startOf.get(id) ?? Infinity), Infinity);
    threads.push({ cid: componentId, ids, earliest, isSolo: ids.length === 1 });
  }

  threads.sort((a, b) => {
    if (a.isSolo !== b.isSolo) return a.isSolo ? 1 : -1;
    return (a.earliest === Infinity ? 1e9 : a.earliest) - (b.earliest === Infinity ? 1e9 : b.earliest);
  });

  return threads;
}
