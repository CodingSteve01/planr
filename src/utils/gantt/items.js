// The item lists behind the Gantt: every scoped item, the searchable text of each task,
// the items that survive hide-done and search, and the tree's children by parent.
// Inputs in, value out.

import { clampCompletedDate, normalizeCompletedWindows } from '../completion.js';
import { localDate } from '../date.js';
import { parentId } from '../scheduler.js';
import { EMPTY_ARR } from './helpers.js';

export function buildAllItems(ctx) {
  const { scheduled, tree, leafIdSet, memberById, rootFilter, teamFilter, personFilter, workDays, UNASSIGNED_LABEL, weekIndexOfDate } = ctx;
  const sIdSet = new Set(scheduled.map(s => s.id));
  const doneWindows = normalizeCompletedWindows(tree || [], { workDays });
  const unscheduledLeaves = (tree || [])
    .filter(r => leafIdSet.has(r.id) && !sIdSet.has(r.id) && r.status !== 'done')
    .map(r => ({
      id: r.id,
      name: r.name,
      team: r.team || '',
      person: UNASSIGNED_LABEL,
      personId: null,
      assign: r.assign || [],
      prio: r.prio,
      seq: r.seq,
      best: r.best || 0,
      status: r.status,
      note: r.note || '',
      deps: (r.deps || []).join(', '),
      startD: null,
      endD: null,
      startWi: -1,
      endWi: -1,
      weeks: 0,
      calDays: 0,
      capPct: 0,
      vacDed: 0,
      _unestimated: true,
    }));
  const doneLeaves = (tree || [])
    .filter(r => leafIdSet.has(r.id) && !sIdSet.has(r.id) && r.status === 'done')
    .map(r => {
      const doneWindow = doneWindows.get(r.id);
      const completedAt = clampCompletedDate(doneWindow?.end || r.completedAt || r.completedEnd || r.completedStart);
      const endD = completedAt ? localDate(completedAt) : null;
      let startD = doneWindow?.start ? localDate(doneWindow.start) : r.completedStart ? localDate(r.completedStart) : endD;
      if (startD && endD && startD > endD) startD = new Date(endD);
      const completedPersonId = r.completedPersonId || r.assign?.[0] || null;
      const completedPerson =
        r.completedPerson || (completedPersonId ? memberById[completedPersonId]?.name || completedPersonId : UNASSIGNED_LABEL);
      return {
        id: r.id,
        name: r.name,
        team: r.team || '',
        person: completedPerson,
        personId: completedPersonId,
        assign: r.assign || [],
        prio: r.prio,
        seq: r.seq,
        best: r.best || 0,
        status: r.status,
        note: r.note || '',
        deps: (r.deps || []).join(', '),
        startD,
        endD,
        startWi: startD ? weekIndexOfDate(startD) : -1,
        endWi: endD ? weekIndexOfDate(endD) : -1,
        weeks: startD && endD ? Math.max(1, weekIndexOfDate(endD) - weekIndexOfDate(startD) + 1) : 0,
        calDays: startD && endD ? Math.max(1, Math.round((endD - startD) / 864e5) + 1) : 0,
        capPct: 0,
        vacDed: 0,
        autoAssigned: !!r.completedAutoAssigned,
        _completed: true,
        _historyAdjusted: !!doneWindow?.adjusted,
      };
    });
  let items = [...scheduled, ...doneLeaves, ...unscheduledLeaves];
  if (rootFilter) items = items.filter(s => s.id.startsWith(rootFilter + '.') || s.id === rootFilter);
  if (teamFilter) items = items.filter(s => (s.team || '') === teamFilter);
  if (personFilter) items = items.filter(s => (s.assign || []).includes(personFilter) || s.personId === personFilter);
  return items;
}

export function buildSearchTextById(ctx) {
  const { tree, iMap, teamById, memberById } = ctx;
  const cache = {};
  const textForId = id => {
    if (!id) return '';
    if (cache[id] != null) return cache[id];
    const node = iMap[id];
    if (!node) return (cache[id] = id.toLowerCase());
    const pid = parentId(id);
    const team = teamById[node.team]?.name || node.team || '';
    const assignees = (node.assign || []).map(mid => memberById[mid]?.name || mid).join(' ');
    const own = [
      node.id,
      node.name,
      node.note,
      node.description,
      team,
      assignees,
      ...(node.deps || EMPTY_ARR),
      ...(node.softDeps || EMPTY_ARR).map(dep => `~${dep}`),
      ...Object.values(node.customValues || {}),
    ]
      .filter(Boolean)
      .join(' ');
    const parentText = pid ? textForId(pid) : '';
    return (cache[id] = `${parentText} ${own}`.toLowerCase());
  };
  (tree || EMPTY_ARR).forEach(node => textForId(node.id));
  return cache;
}

export function filterDisplayItems(ctx) {
  const { allItems, hideDone, _diffActive, _diffChangedSet, searchNeedle, searchTextById, iMap, teamById, memberById } = ctx;
  const isChangedDoneInDiff = item => {
    const taskId = item.treeId || item.id;
    return _diffActive && item.status === 'done' && _diffChangedSet.has(taskId);
  };
  const items = hideDone ? allItems.filter(item => item.status !== 'done' || isChangedDoneInDiff(item)) : allItems;
  if (!searchNeedle) return items;
  return items.filter(item => {
    const taskId = item.treeId || item.id;
    const node = iMap[taskId] || item;
    const team = teamById[item.team || node.team]?.name || item.team || node.team || '';
    const people = [
      item.person,
      item.personId ? memberById[item.personId]?.name || item.personId : '',
      ...(item.assign || node.assign || EMPTY_ARR).map(mid => memberById[mid]?.name || mid),
    ]
      .filter(Boolean)
      .join(' ');
    const text = [searchTextById[taskId], item.id, item.name, item.note, item.deps, team, people].filter(Boolean).join(' ').toLowerCase();
    return text.includes(searchNeedle);
  });
}

export function buildChildrenByParent(ctx) {
  const { tree, ordMap } = ctx;
  const map = {};
  (tree || []).forEach(r => {
    const pid = parentId(r.id);
    if (!map[pid]) map[pid] = [];
    map[pid].push(r.id);
  });
  // The tree's order, and nothing else. This sorted by earliest scheduled
  // start first, with `displayOrder` as a fallback — so a project whose
  // first task waits on another project sank to the bottom of a list the
  // planner had deliberately arranged. Time is what the bars are for; the
  // rows are the plan.
  Object.values(map).forEach(ids =>
    ids.sort((a, b) => {
      const A = ordMap[a] || { idx: 0, ord: null },
        B = ordMap[b] || { idx: 0, ord: null };
      if (A.ord != null && B.ord != null && A.ord !== B.ord) return A.ord - B.ord;
      return A.idx - B.idx;
    }),
  );
  return map;
}
