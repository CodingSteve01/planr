import { leafNodes, parentId, resolveToLeafIds } from './scheduler.js';
import { deadlineScopedLeafIds } from './deadlines.js';

const EPS = 0.1;

const effortOf = node => node.status === 'done'
  ? 0
  : Math.max((node.best || 0) * (node.factor || 1.5), 0.01);

function buildLeafContext(tree) {
  const leaves = leafNodes(tree);
  const leafMap = Object.fromEntries(leaves.map(node => [node.id, node]));
  const nodeMap = Object.fromEntries((tree || []).map(node => [node.id, node]));
  const resolveLeafIds = id => resolveToLeafIds(tree, id).filter(leafId => leafMap[leafId]);

  const deps = {};
  Object.keys(leafMap).forEach(id => {
    const inherited = [];
    let current = id;
    while (current) {
      const node = nodeMap[current];
      if (node?.deps?.length) inherited.push(...node.deps);
      current = parentId(current);
    }
    deps[id] = new Set(inherited.flatMap(depId => resolveLeafIds(depId)).filter(depId => depId !== id && leafMap[depId]));
  });

  return { leafMap, deps, resolveLeafIds };
}

function analyzeScopes(tree, scopes) {
  const { leafMap, deps } = buildLeafContext(tree);
  const allLeafIds = Object.keys(leafMap);
  const pathMap = {};
  const unionCritical = new Set();
  const unionEdges = new Set();

  scopes.forEach(scope => {
    const targets = [...new Set((scope.targets || []).filter(id => leafMap[id]))];
    if (!targets.length) return;

    const needed = new Set();
    const queue = [...targets];
    while (queue.length) {
      const id = queue.shift();
      if (needed.has(id)) continue;
      needed.add(id);
      deps[id]?.forEach(depId => {
        if (!needed.has(depId)) queue.push(depId);
      });
    }
    if (!needed.size) return;

    const topo = [];
    const visited = new Set();
    const visit = id => {
      if (visited.has(id) || !needed.has(id)) return;
      visited.add(id);
      deps[id]?.forEach(depId => visit(depId));
      topo.push(id);
    };
    [...needed].sort().forEach(visit);

    const ef = {};
    topo.forEach(id => {
      const depFinish = deps[id]?.size
        ? Math.max(0, ...[...deps[id]].filter(depId => needed.has(depId)).map(depId => ef[depId] || 0))
        : 0;
      ef[id] = depFinish + effortOf(leafMap[id]);
    });

    const scopeEnd = Math.max(0, ...targets.map(id => ef[id] || 0));
    if (!scopeEnd) return;

    const ls = {};
    [...topo].reverse().forEach(id => {
      const successors = [...needed].filter(successorId => deps[successorId]?.has(id));
      const lf = successors.length
        ? Math.min(...successors.map(successorId => ls[successorId] ?? scopeEnd))
        : scopeEnd;
      ls[id] = lf - effortOf(leafMap[id]);
    });

    const critical = new Set([...needed].filter(id => {
      const es = (ef[id] || 0) - effortOf(leafMap[id]);
      return Math.abs((ls[id] ?? 0) - es) < EPS;
    }));

    const criticalEdges = new Set();
    critical.forEach(id => {
      const es = (ef[id] || 0) - effortOf(leafMap[id]);
      deps[id]?.forEach(depId => {
        if (!needed.has(depId) || !critical.has(depId)) return;
        if (Math.abs((ef[depId] || 0) - es) < EPS) criticalEdges.add(`${depId}->${id}`);
      });
    });

    critical.forEach(id => unionCritical.add(id));
    criticalEdges.forEach(edge => unionEdges.add(edge));
    pathMap[scope.id] = {
      ...scope.meta,
      critical,
      criticalEdges,
      needed: [...needed],
      targets,
      chainLength: scopeEnd,
    };
  });

  return { critical: unionCritical, edges: unionEdges, paths: pathMap, leafIds: allLeafIds };
}

// Root-based CPM: one critical-path analysis per top-level item.
// The union across roots is what the UI highlights by default.
export function rootCpm(tree) {
  const roots = (tree || []).filter(node => !node.id.includes('.'));
  const scopes = roots.map(root => ({
    id: root.id,
    targets: root.type === 'deadline'
      ? deadlineScopedLeafIds(tree, root.id)
      : resolveToLeafIds(tree, root.id),
    meta: {
      name: root.name,
      type: root.type,
      date: root.date,
      severity: root.severity,
    },
  }));
  const result = analyzeScopes(tree, scopes);
  return {
    critical: result.critical,
    edges: result.edges,
    rootPaths: result.paths,
  };
}

// Global CPM across the entire graph. Kept for comparison/export use cases.
export function cpm(tree) {
  const { leafIds } = analyzeScopes(tree, [{
    id: '__global__',
    targets: leafNodes(tree).map(node => node.id),
    meta: {},
  }]);
  const result = analyzeScopes(tree, [{
    id: '__global__',
    targets: leafIds,
    meta: {},
  }]);
  return {
    critical: result.critical,
    edges: result.edges,
    goalPaths: {},
  };
}

// Goal/deadline CPM for typed root items shown in Focus views.
export function goalCpm(tree) {
  const goals = (tree || []).filter(node => !node.id.includes('.') && node.type);
  const scopes = goals.map(goal => ({
    id: goal.id,
    targets: goal.type === 'deadline'
      ? deadlineScopedLeafIds(tree, goal.id)
      : resolveToLeafIds(tree, goal.id),
    meta: {
      name: goal.name,
      date: goal.date,
      severity: goal.severity,
      type: goal.type,
    },
  }));
  return analyzeScopes(tree, scopes).paths;
}
