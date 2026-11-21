import { normalizeCompletedWindows } from '../completion.js';
import { treeOrderRank } from '../displayOrder.js';
import { toDate, parentId, depthOf } from './format.js';
import { buildMeta } from './nodeMeta.js';
import { makeAbbrev } from './abbrev.js';
import { buildRawLines } from './rawLines.js';
import { assignRoutes, spaceParallelRoutes } from './assignment.js';
import { positionStations } from './stationPlacement.js';
import { separateStationsAcrossLines } from './stationSeparation.js';

// ─── computeRoadmapModel ──────────────────────────────────────────────────────

export function computeRoadmapModel({ tree, scheduled, stats, now = new Date(), assignment = null }) {
  const nodeMap = Object.fromEntries(tree.map(node => [node.id, node]));
  const today = toDate(now) || toDate(new Date());
  const childMap = {};
  tree.forEach(node => {
    const pid = parentId(node.id);
    if (!childMap[pid]) childMap[pid] = [];
    childMap[pid].push(node);
  });
  const schedMap = scheduled ? Object.fromEntries(scheduled.map(item => [item.id, item])) : {};
  const completedWindows = normalizeCompletedWindows(tree || [], { now: today });
  const meta = buildMeta(tree, childMap, nodeMap, schedMap, stats, completedWindows, today);

  const roots = tree.filter(node => !node.id.includes('.'));
  if (!roots.length) return null;

  // The plan's own order, once for the whole map. Everything the map puts in a
  // sequence — the stops along a line, the rows in its legend — uses it, so
  // the map, the tree, the work order and the schedule all say the same thing
  // about what comes first.
  const planRank = treeOrderRank(tree);

  const buildStation = (node, kind, fallbackDate) => {
    const info = meta[node.id] || {};
    const anchorDate =
      info.earliestStart || toDate(node.pinnedStart) || toDate(node.decideBy) || toDate(node.date) || info.latestEnd || fallbackDate;
    const endDate = info.latestEnd || toDate(node.date) || toDate(node.decideBy) || toDate(node.pinnedStart) || anchorDate;

    return {
      id: node.id,
      name: node.name,
      abbrev: makeAbbrev(node.name),
      parentId: parentId(node.id),
      kind,
      anchorDate,
      milestoneDate: endDate && endDate >= anchorDate ? endDate : anchorDate,
      endDate: endDate && endDate >= anchorDate ? endDate : anchorDate,
      prog: info.prog || 0,
      done: info.done || 0,
      total: info.total || 0,
      allDone: !!info.allDone,
      depth: depthOf(node.id),
    };
  };

  const rawLines = buildRawLines({ roots, meta, scheduled, childMap, completedWindows, today, tree, nodeMap, stats, now });

  if (!rawLines.length) return null;

  const { baseAssigned, assignmentOut } = assignRoutes(rawLines, assignment);
  spaceParallelRoutes(baseAssigned);
  const assignedLines = baseAssigned;

  const positionedLines = positionStations(assignedLines, planRank, now);

  // ── Cross-line station separation ────────────────────────────────────────
  // The parallel-rail pass above keeps whole ROUTES apart, but routes still
  // cross — and where they cross, a station of one line can land on top of a
  // station of another. Two unrelated milestones sharing one dot is the least
  // intuitive thing this map can do.
  //
  // A station cannot simply be moved in 2D: it has to stay on its own line. So
  // nudge it ALONG its route instead, by shifting its `t`. Two constraints
  // make that safe:
  //   * a station stays between its neighbours on the same line, so the
  //     chronological order along a line never changes,
  //   * a station stays on its own side of the train — done stations behind
  //     it, unfinished ones ahead — because that is what the map means.
  // Anything that cannot move far enough keeps its position; a slightly close
  // pair is much better than a reordered line.
  separateStationsAcrossLines(positionedLines);

  return {
    lines: positionedLines,
    nodeMap,
    _assignment: assignmentOut,
  };
}
