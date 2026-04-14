// Global critical path (longest path to project end)
export function cpm(tree) {
  const lv = Object.fromEntries(tree.filter(r => r.lvl === 3).map(r => [r.id, r]));
  const eff = r => r.status === 'done' ? 0 : Math.max((r.best || 0) * Math.min(r.factor || 1.5, 1.3) * 1.15, 0.01);
  function resD(id) { return lv[id] ? [id] : Object.keys(lv).filter(k => k.startsWith(id + '.')); }
  const rd = Object.fromEntries(Object.keys(lv).map(id => [id, new Set((lv[id].deps || []).flatMap(resD).filter(d => lv[d]))]));
  const vis = new Set(), order = [];
  const visit = id => { if (vis.has(id)) return; vis.add(id); rd[id].forEach(d => visit(d)); order.push(id); };
  Object.keys(lv).sort().forEach(visit);
  const ef = {};
  order.forEach(id => { const df = rd[id].size ? Math.max(...[...rd[id]].map(d => ef[d] || 0)) : 0; ef[id] = df + eff(lv[id]); });
  const pe = Math.max(0, ...Object.values(ef)); if (!pe) return { critical: new Set(), goalPaths: {} };
  const ls = {};
  [...order].reverse().forEach(id => {
    const succs = Object.keys(lv).filter(s => [...rd[s]].includes(id));
    const lf = succs.length ? Math.min(...succs.map(s => ls[s] || pe)) : pe;
    ls[id] = lf - eff(lv[id]);
  });
  const critical = new Set(Object.keys(lv).filter(id => Math.abs(ls[id] - (ef[id] - eff(lv[id]))) < 0.1));
  return { critical, goalPaths: {} };
}

// Goal-based critical path: per deadline, trace backward from linked items
// Returns { [deadlineId]: { critical: Set<taskId>, chainLength: number, items: string[] } }
export function goalCpm(tree, deadlines) {
  const all = Object.fromEntries(tree.map(r => [r.id, r]));
  const lv = Object.fromEntries(tree.filter(r => r.lvl === 3).map(r => [r.id, r]));
  const eff = r => r.status === 'done' ? 0 : Math.max((r.best || 0) * Math.min(r.factor || 1.5, 1.3) * 1.15, 0.01);

  // Resolve an ID to leaf task IDs (handles group references like P2.1)
  function resolveTo(id) {
    if (lv[id]) return [id];
    return Object.keys(lv).filter(k => k.startsWith(id + '.'));
  }

  // Build dependency graph for all leaf tasks
  const deps = {};
  Object.keys(lv).forEach(id => {
    deps[id] = new Set((lv[id].deps || []).flatMap(d => resolveTo(d)).filter(d => lv[d]));
  });

  const goalPaths = {};

  (deadlines || []).forEach(dl => {
    if (!dl.linkedItems?.length) return;

    // Find all target leaf tasks for this deadline
    const targets = dl.linkedItems.flatMap(id => resolveTo(id)).filter(id => lv[id]);
    if (!targets.length) return;

    // Trace backward from targets: find ALL tasks that are ancestors (transitively needed)
    const needed = new Set();
    const queue = [...targets];
    while (queue.length) {
      const id = queue.shift();
      if (needed.has(id)) continue;
      needed.add(id);
      // Add all dependencies of this task
      if (deps[id]) deps[id].forEach(d => { if (!needed.has(d)) queue.push(d); });
    }

    if (!needed.size) return;

    // Forward pass: earliest finish within the needed subgraph
    const topo = [];
    const vis = new Set();
    const visit = id => { if (vis.has(id) || !needed.has(id)) return; vis.add(id); if (deps[id]) deps[id].forEach(d => { if (needed.has(d)) visit(d); }); topo.push(id); };
    [...needed].sort().forEach(visit);

    const ef = {};
    topo.forEach(id => {
      const depFinish = deps[id]?.size ? Math.max(...[...deps[id]].filter(d => needed.has(d)).map(d => ef[d] || 0)) : 0;
      ef[id] = depFinish + eff(lv[id]);
    });

    // Project end for this goal = max finish of target tasks
    const goalEnd = Math.max(...targets.map(t => ef[t] || 0));
    if (!goalEnd) return;

    // Backward pass: latest start
    const ls = {};
    [...topo].reverse().forEach(id => {
      // Successors within the needed subgraph
      const succs = [...needed].filter(s => deps[s]?.has(id));
      const lf = succs.length ? Math.min(...succs.map(s => ls[s] ?? goalEnd)) : goalEnd;
      ls[id] = lf - eff(lv[id]);
    });

    // Critical = zero slack
    const critical = new Set([...needed].filter(id => {
      const es = (ef[id] || 0) - eff(lv[id]);
      return Math.abs((ls[id] ?? 0) - es) < 0.1;
    }));

    goalPaths[dl.id] = {
      critical,
      targets,
      needed: [...needed],
      chainLength: goalEnd,
      name: dl.name,
      date: dl.date,
      severity: dl.severity,
    };
  });

  return goalPaths;
}
