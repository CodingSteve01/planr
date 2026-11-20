// The row tree of the Gantt: groups, summaries and task rows for the chosen grouping,
// plus the collapse keys that start folded. Inputs in, value out.

import { isLeafNode, parentId } from '../scheduler.js';
import { NO_TEAM, NO_TEAM_COLOR, NO_PERSON, EMPTY_ARR, personIdsOf, typeColorOf } from './helpers.js';

export function buildStructure(ctx) {
  const {
    treeRank,
    iMap,
    childrenByParent,
    rootIds,
    tree,
    teams,
    memberById,
    teamById,
    confidence,
    t,
    threadStructure,
    allItems,
    displayItems,
    groupBy,
    weekIndexOfDate,
    UNASSIGNED_LABEL,
  } = ctx;
  const defaultCollapsed = new Set();
  // Also the tree's order. This led with priority, which is the same
  // second ranking the scheduler carried until the tree became the order of
  // the work: importance is not position.
  const rankOfItem = it => {
    const r = treeRank.get(it.treeId || it.id);
    return r == null ? Number.MAX_SAFE_INTEGER : r;
  };
  const sortItems = arr =>
    [...arr].sort((a, b) => rankOfItem(a) - rankOfItem(b) || (a.segmentIdx || 0) - (b.segmentIdx || 0) || a.id.localeCompare(b.id));
  const buildScopeMeta = scopeItems => {
    const byNode = {};
    const itemById = {};
    scopeItems.forEach(item => {
      itemById[item.id] = item;
      // Start the walk from the tree-facing id so handoff-shadow rows
      // (`orig#N`) register under their primary's tree node.
      let cid = item.treeId || item.id;
      while (cid) {
        if (!byNode[cid]) byNode[cid] = [];
        byNode[cid].push(item);
        cid = parentId(cid);
      }
    });
    return { byNode, itemById };
  };
  const summaryProgress = scopeItems => {
    let totalWeight = 0;
    let totalProgress = 0;
    scopeItems.forEach(item => {
      const node = iMap[item.treeId || item.id];
      const progress = node?.progress != null ? node.progress : item.status === 'done' ? 100 : item.status === 'wip' ? 50 : 0;
      const weight = item.effort || Math.max(item.best || 0, 1);
      totalWeight += weight;
      totalProgress += progress * weight;
    });
    return totalWeight > 0 ? Math.round(totalProgress / totalWeight) : 0;
  };
  const buildSummaryItem = (node, scopeItems, scopeCtx = {}) => {
    const dated = scopeItems.filter(item => !item._unestimated && item.startD && item.endD);
    const doneCount = scopeItems.filter(item => item.status === 'done').length;
    const wipCount = scopeItems.filter(item => item.status === 'wip').length;
    const mix = { done: 0, committed: 0, estimated: 0, exploratory: 0 };
    scopeItems.forEach(item => {
      if (item.status === 'done') {
        mix.done++;
        return;
      }
      mix[confidence[item.id] || 'committed']++;
    });
    const best = scopeItems.reduce((sum, item) => sum + (item.best || 0), 0);
    const effort = scopeItems.reduce(
      (sum, item) => sum + (item.effort || (item.best || 0) * (iMap[item.treeId || item.id]?.factor || 1.5)),
      0,
    );
    const startD = dated.length ? new Date(Math.min(...dated.map(item => +item.startD))) : null;
    const endD = dated.length ? new Date(Math.max(...dated.map(item => +item.endD))) : null;
    const status = doneCount === scopeItems.length ? 'done' : doneCount > 0 || wipCount > 0 ? 'wip' : 'open';
    return {
      ...node,
      id: node.id,
      name: node.name,
      team: scopeCtx.teamId || node.team || '',
      person: scopeCtx.personName || null,
      assign: [],
      deps: node.deps || [],
      phases: node.phases || [],
      best,
      effort,
      status,
      progress: summaryProgress(scopeItems),
      startD,
      endD,
      startWi: startD ? weekIndexOfDate(startD) : -1,
      endWi: endD ? weekIndexOfDate(endD) : -1,
      calDays: startD && endD ? Math.max(1, Math.round((endD - startD) / 864e5) + 1) : 0,
      _summary: true,
      _summaryCount: scopeItems.length,
      _scheduledCount: dated.length,
      _doneCount: doneCount,
      _summaryMix: mix,
      _barColor: scopeCtx.color || typeColorOf(node),
    };
  };
  const buildNode = (nodeId, meta, visibleMeta, namespace, level, scopeCtx) => {
    const node = iMap[nodeId];
    const scopeItems = meta.byNode[nodeId] || EMPTY_ARR;
    const visibleScopeItems = visibleMeta.byNode[nodeId] || EMPTY_ARR;
    if (!node || !scopeItems.length || !visibleScopeItems.length) return null;
    const childIds = (childrenByParent[nodeId] || EMPTY_ARR).filter(cid => (visibleMeta.byNode[cid] || EMPTY_ARR).length > 0);
    if (isLeafNode(tree || [], nodeId) || !childIds.length) {
      // Handoff-shadow rows share a tree node with their primary. Emit
      // primary as a normal task row and each shadow as its own sibling row
      // so filters/person-grouping see them as distinct work items.
      const items = visibleScopeItems.filter(it => (it.treeId || it.id) === nodeId);
      if (!items.length) return null;
      const primary = items.find(it => !it.isHandoff) || items[0];
      const handoffs = items.filter(it => it.isHandoff).sort((a, b) => (a.segmentIdx || 0) - (b.segmentIdx || 0));
      if (!handoffs.length) {
        return { type: 'task', key: `${namespace}::task:${nodeId}`, s: primary, node, level, groupKey: namespace };
      }
      // Multiple rows → wrap as a synthetic summary with the primary + each
      // shadow as children so the Gantt renders one row per segment.
      const allChildren = [primary, ...handoffs].map(item => ({
        type: 'task',
        key: `${namespace}::task:${item.id}`,
        s: item,
        node,
        level: level + 1,
        groupKey: namespace,
      }));
      const collapseKey = `${namespace}::collapse:${nodeId}`;
      defaultCollapsed.add(collapseKey);
      return {
        type: 'summary',
        key: `${namespace}::summary:${nodeId}`,
        collapseKey,
        s: buildSummaryItem(node, scopeItems, scopeCtx),
        node,
        level,
        groupKey: namespace,
        children: allChildren,
      };
    }
    const children = childIds.map(cid => buildNode(cid, meta, visibleMeta, namespace, level + 1, scopeCtx)).filter(Boolean);
    const collapseKey = `${namespace}::collapse:${nodeId}`;
    if (children.length > 0 && children.every(child => child.type === 'task')) defaultCollapsed.add(collapseKey);
    return {
      type: 'summary',
      key: `${namespace}::summary:${nodeId}`,
      collapseKey,
      s: buildSummaryItem(node, scopeItems, scopeCtx),
      node,
      level,
      groupKey: namespace,
      children,
    };
  };
  const buildTreeNodes = (scopeItems, visibleScopeItems, namespace, baseLevel, scopeCtx = {}) => {
    const meta = buildScopeMeta(sortItems(scopeItems));
    const visibleMeta = buildScopeMeta(sortItems(visibleScopeItems));
    return rootIds.map(rid => buildNode(rid, meta, visibleMeta, namespace, baseLevel, scopeCtx)).filter(Boolean);
  };
  const nodes = [];
  if (groupBy === 'project') {
    nodes.push(...buildTreeNodes(allItems, displayItems, 'project', 0));
  } else if (groupBy === 'thread') {
    threadStructure.forEach((thread, i) => {
      const idSet = new Set(thread.ids);
      const threadItems = allItems.filter(it => idSet.has(it.treeId || it.id));
      const visibleThreadItems = displayItems.filter(it => idSet.has(it.treeId || it.id));
      if (!visibleThreadItems.length) return;
      const sortedItems = sortItems(threadItems);
      const namespace = `thread:${thread.cid}`;
      // Single-task threads render as a bare row — the "Solo · …" header is
      // pure noise when there's only one child and the row itself already
      // shows the task name.
      if (thread.isSolo) {
        for (const id of thread.ids) {
          const items = visibleThreadItems.filter(it => (it.treeId || it.id) === id);
          if (!items.length) continue;
          const primary = items.find(it => !it.isHandoff) || items[0];
          nodes.push({
            type: 'task',
            key: `solo:${primary.id}`,
            s: primary,
            node: iMap[id],
            level: 0,
            groupKey: null,
          });
          for (const ho of items.filter(it => it.isHandoff).sort((a, b) => (a.segmentIdx || 0) - (b.segmentIdx || 0))) {
            nodes.push({
              type: 'task',
              key: `solo:${ho.id}`,
              s: ho,
              node: iMap[id],
              level: 1,
              groupKey: null,
            });
          }
        }
        return;
      }
      const label = `Thread ${i + 1} · ${thread.ids.length} Tasks`;
      const color = 'var(--ac)';
      const groupSummary = buildSummaryItem(
        {
          id: namespace,
          name: label,
          team: '',
          deps: [],
          phases: [],
        },
        sortedItems,
        { color },
      );
      // Flat task rows in thread order (rank → startWi → id).
      const children = [];
      for (const id of thread.ids) {
        const items = visibleThreadItems.filter(it => (it.treeId || it.id) === id);
        if (!items.length) continue;
        const primary = items.find(it => !it.isHandoff) || items[0];
        children.push({
          type: 'task',
          key: `${namespace}::task:${primary.id}`,
          s: primary,
          node: iMap[id],
          level: 1,
          groupKey: namespace,
        });
        for (const ho of items.filter(it => it.isHandoff).sort((a, b) => (a.segmentIdx || 0) - (b.segmentIdx || 0))) {
          children.push({
            type: 'task',
            key: `${namespace}::task:${ho.id}`,
            s: ho,
            node: iMap[id],
            level: 2,
            groupKey: namespace,
          });
        }
      }
      if (thread.isSolo) defaultCollapsed.add(namespace);
      nodes.push({
        type: 'group',
        key: namespace,
        collapseKey: namespace,
        label,
        color,
        s: groupSummary,
        count: visibleThreadItems.length,
        level: 0,
        children,
      });
    });
  } else if (groupBy === 'team') {
    const usedTeams = [...new Set(displayItems.map(item => item.team || NO_TEAM))];
    const orderedTeams = [...new Set([...teams.map(team => team.id), ...usedTeams])].filter(id => usedTeams.includes(id));
    orderedTeams.forEach(teamId => {
      const scopeItems = sortItems(allItems.filter(item => (item.team || NO_TEAM) === teamId));
      const visibleScopeItems = sortItems(displayItems.filter(item => (item.team || NO_TEAM) === teamId));
      if (!visibleScopeItems.length) return;
      const team = teams.find(entry => entry.id === teamId);
      const label = teamId === NO_TEAM ? t('noTeam') : team?.name || teamId;
      const color = teamId === NO_TEAM ? NO_TEAM_COLOR : team?.color || '#3b82f6';
      const groupSummary = buildSummaryItem(
        {
          id: `team:${teamId}`,
          name: label,
          team: teamId === NO_TEAM ? '' : teamId,
          deps: [],
          phases: [],
        },
        scopeItems,
        { teamId: teamId === NO_TEAM ? '' : teamId, color },
      );
      nodes.push({
        type: 'group',
        key: `team:${teamId}`,
        collapseKey: `team:${teamId}`,
        label,
        color,
        s: groupSummary,
        count: visibleScopeItems.length,
        level: 0,
        children: buildTreeNodes(scopeItems, visibleScopeItems, `team:${teamId}`, 1, { teamId: teamId === NO_TEAM ? '' : teamId, color }),
      });
    });
  } else {
    const usedPeople = [...new Set(displayItems.flatMap(personIdsOf))];
    if (displayItems.some(item => !personIdsOf(item).length)) usedPeople.push(NO_PERSON);
    usedPeople
      .sort((a, b) => {
        if (a === NO_PERSON) return 1;
        if (b === NO_PERSON) return -1;
        const aLabel = memberById[a]?.name || a;
        const bLabel = memberById[b]?.name || b;
        return aLabel.localeCompare(bLabel);
      })
      .forEach(personId => {
        const scopeItems = sortItems(
          personId === NO_PERSON
            ? allItems.filter(item => !personIdsOf(item).length)
            : allItems.filter(item => personIdsOf(item).includes(personId)),
        );
        const visibleScopeItems = sortItems(
          personId === NO_PERSON
            ? displayItems.filter(item => !personIdsOf(item).length)
            : displayItems.filter(item => personIdsOf(item).includes(personId)),
        );
        if (!visibleScopeItems.length) return;
        const member = memberById[personId];
        const label = personId === NO_PERSON ? UNASSIGNED_LABEL : member?.name || personId;
        const color = personId === NO_PERSON ? NO_TEAM_COLOR : teamById[member?.team]?.color || 'var(--ac)';
        const groupSummary = buildSummaryItem(
          {
            id: `resource:${personId}`,
            name: label,
            team: member?.team || '',
            person: label,
            deps: [],
            phases: [],
          },
          scopeItems,
          { personName: label, color },
        );
        nodes.push({
          type: 'group',
          key: `resource:${personId}`,
          collapseKey: `resource:${personId}`,
          label,
          personId,
          color,
          s: groupSummary,
          count: visibleScopeItems.length,
          level: 0,
          children: buildTreeNodes(scopeItems, visibleScopeItems, `resource:${personId}`, 1, { personName: label, color }),
        });
      });
  }
  return { nodes, defaultCollapsed: [...defaultCollapsed] };
}
