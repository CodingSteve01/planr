// Dependency lines for the chart: every line, and the ones for the hovered task.
// Inputs in, value out. The x/y helpers come in through the context because they
// depend on the current zoom and drag state.

// ALL dep lines (always rendered, faint by default; hovered ones highlight)
// When a dep targets a parent node, draw ONE line from the latest-finishing child
// (that's the actual blocker), not individual lines from every leaf child.
export function buildDepLines(ctx) {
  const { tree, allItems, sMap, iMap, rowIdx, cpEdgeSet, resD, depX1, depX2, rowCenterY } = ctx;
  if (!tree) return [];
  const lines = [];
  const processDep = (s, removeFromId, rawDep, isSoft) => {
    const leafIds = resD(rawDep);
    let latestId = null,
      latestEnd = null;
    leafIds.forEach(depId => {
      const dep = sMap[depId];
      if (!dep) return;
      if (!latestEnd || dep.endD > latestEnd) {
        latestEnd = dep.endD;
        latestId = depId;
      }
    });
    const addLine = (depId, keyPrefix, isCriticalEdge = false) => {
      const dep = sMap[depId];
      const srcRows = rowIdx[depId];
      const tgtRows = rowIdx[s.id];
      if (!dep || !srcRows?.length || !tgtRows?.length) return;
      srcRows.forEach((srcRow, si) => {
        tgtRows.forEach((tgtRow, ti) => {
          lines.push({
            key: `${keyPrefix}:${depId}@${si}->${s.id}@${ti}->${rawDep}`,
            x1: depX1(dep),
            y1: rowCenterY(srcRow),
            x2: depX2(s),
            y2: rowCenterY(tgtRow),
            removeFromId,
            removeDepId: rawDep,
            srcId: depId,
            tgtId: s.id,
            isCp: isCriticalEdge,
            isSoft,
          });
        });
      });
    };
    if (latestId) addLine(latestId, isSoft ? 'sdep' : 'dep', cpEdgeSet.has(`${latestId}->${s.id}`));
    leafIds.filter(depId => depId !== latestId && cpEdgeSet.has(`${depId}->${s.id}`)).forEach(depId => addLine(depId, 'cp', true));
  };
  allItems.forEach(s => {
    if (!sMap[s.id]) return;
    const node = iMap[s.treeId || s.id];
    if (!node) return;
    const removeFromId = node.id;
    (node.deps || []).forEach(rawDep => processDep(s, removeFromId, rawDep, false));
    (node.softDeps || []).forEach(rawDep => processDep(s, removeFromId, rawDep, true));
  });
  return lines;
}

// On hover: show ALL dependencies (incoming + outgoing) for the hovered task
export function buildHoverLines(ctx) {
  const { hoverDepId, tree, allItems, sMap, iMap, rowIdx, resD, depX1, depX2, rowCenterY } = ctx;
  if (!hoverDepId || !tree) return { lines: [], rowIds: new Set() };
  const lines = [];
  const rowIds = new Set([hoverDepId]);
  const node = iMap[hoverDepId];
  if (!node) return { lines, rowIds };
  const target = sMap[hoverDepId];
  // Outgoing: this task depends on these (deps must finish before this starts)
  if (target) {
    [...(node.deps || []), ...(node.softDeps || [])].forEach(rawDep => {
      const leafIds = resD(rawDep);
      let latestId = null,
        latestEnd = null;
      leafIds.forEach(depId => {
        const dep = sMap[depId];
        if (!dep) return;
        if (!latestEnd || dep.endD > latestEnd) {
          latestEnd = dep.endD;
          latestId = depId;
        }
      });
      if (!latestId) return;
      const dep = sMap[latestId];
      const srcRows = rowIdx[latestId],
        tgtRows = rowIdx[hoverDepId];
      if (!srcRows?.length || !tgtRows?.length) return;
      rowIds.add(latestId);
      srcRows.forEach(srcRow => {
        tgtRows.forEach(tgtRow => {
          lines.push({
            x1: depX1(dep),
            y1: rowCenterY(srcRow),
            x2: depX2(target),
            y2: rowCenterY(tgtRow),
            kind: 'in',
            removeFromId: hoverDepId,
            removeDepId: rawDep,
          });
        });
      });
    });
  }
  // Incoming: which tasks depend on this one (this must finish before they start)
  allItems.forEach(s => {
    if (!sMap[s.id]) return;
    const sNode = iMap[s.treeId || s.id];
    if (!sNode) return;
    [...(sNode.deps || []), ...(sNode.softDeps || [])].forEach(rawDep => {
      const resolved = resD(rawDep);
      if (!resolved.includes(hoverDepId)) return;
      if (!target) return;
      const srcRows = rowIdx[hoverDepId],
        tgtRows = rowIdx[s.id];
      if (!srcRows?.length || !tgtRows?.length) return;
      rowIds.add(s.id);
      srcRows.forEach(srcRow => {
        tgtRows.forEach(tgtRow => {
          lines.push({
            x1: depX1(target),
            y1: rowCenterY(srcRow),
            x2: depX2(s),
            y2: rowCenterY(tgtRow),
            kind: 'out',
            removeFromId: s.id,
            removeDepId: rawDep,
          });
        });
      });
    });
  });
  return { lines, rowIds };
}
