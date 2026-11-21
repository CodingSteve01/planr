import { scheduleEffort } from '../scheduler.js';
import { aggregateProgressPct } from '../progress.js';
import { toDate, depthOf, clamp } from './format.js';

function buildMeta(tree, childMap, nodeMap, schedMap, stats, completedWindows = new Map(), now = new Date()) {
  const today = toDate(now) || toDate(new Date());
  const ordered = [...tree].sort((a, b) => depthOf(b.id) - depthOf(a.id) || b.id.localeCompare(a.id));
  const leafIdsById = {};
  const result = {};

  ordered.forEach(node => {
    const children = childMap[node.id] || [];
    const leafIds = children.length ? children.flatMap(child => leafIdsById[child.id] || []) : [node.id];

    leafIdsById[node.id] = leafIds;

    let done = 0;
    let earliestStart = null;
    let latestEnd = null;
    let totalEffort = 0;
    const leafRows = [];

    leafIds.forEach(id => {
      const n = nodeMap[id];
      if (n?.status === 'done') done++;
      if (n) leafRows.push(n);
      totalEffort += scheduleEffort(n) || 1;
      const sched = schedMap[id];
      // For DONE items prefer the actual completion dates (`completedStart` /
      // `completedEnd`) so past work lands at its real past timestamp on the
      // roadmap. Falling back to pinnedStart/decideBy/date loses the "this
      // was finished in April" signal and pushes done items into the future
      // window of their successors.
      const doneWindow = n?.status === 'done' ? completedWindows.get(id) : null;
      let start = toDate(
        doneWindow?.start ||
          (n?.status === 'done' ? n?.completedStart : null) ||
          sched?.startD ||
          (n?.status === 'done' ? n?.completedEnd : null) ||
          n?.pinnedStart ||
          n?.decideBy ||
          n?.date,
      );
      let end = toDate(
        doneWindow?.end ||
          (n?.status === 'done' ? n?.completedEnd || n?.completedAt : null) ||
          sched?.endD ||
          n?.date ||
          n?.pinnedStart ||
          n?.decideBy,
      );
      if (n?.status === 'done') {
        if (end && end > today) end = new Date(today);
        if (start && start > today) start = new Date(today);
        if (start && end && start > end) start = new Date(end);
      }
      if (start && (!earliestStart || start < earliestStart)) earliestStart = start;
      if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
    });

    const ownDate = toDate(node.pinnedStart || node.decideBy || node.date);
    if (!earliestStart && ownDate) earliestStart = ownDate;
    if (!latestEnd && ownDate) latestEnd = ownDate;

    // Same helper the tree grid, the goal cards and every export use, so the
    // train position can never contradict the percentage printed elsewhere.
    const progressPct = leafRows.length ? aggregateProgressPct(leafRows) : (stats?.[node.id]?._progress ?? 0);
    result[node.id] = {
      total: leafIds.length,
      done,
      prog: clamp(progressPct / 100, 0, 1),
      effort: totalEffort || stats?.[node.id]?._effort || Math.max(leafIds.length, 1),
      allDone: leafIds.length > 0 && done === leafIds.length,
      earliestStart,
      latestEnd,
      hasChildren: children.length > 0,
    };
  });

  return result;
}

export { buildMeta };
