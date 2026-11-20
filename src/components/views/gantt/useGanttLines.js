import { useMemo } from 'react';
import { buildDepLines, buildHoverLines } from '../../../utils/gantt/depLines.js';
import { rowDrawsBar } from '../../../utils/gantt/helpers.js';

// Where each task sits among the rows, and the dependency lines between the bars.
export function useGanttLines({
  visibleRows,
  compact,
  rowLayout,
  allItems,
  tree,
  iMap,
  cpEdges,
  cpOnly,
  hoverDepId,
  groupBy,
  WPX,
  showDays,
  dDelta,
  drag,
  resD,
  depX1,
  depX2,
  rowCenterY,
}) {
  // rowIdx maps task ID → array of ALL visible row indices (a multi-assigned task appears
  // in multiple person/team groups, so we need every occurrence for dep-line drawing).
  //
  // Only rows that actually DRAW a bar. A dependency line is an arrow between
  // two bars, so a row with nothing on it cannot be one of its ends — and the
  // row renderer bails out on two cases, not one: an unestimated task and a
  // finished one with no dates. This map excluded only the first, so a line
  // ran to a blank row in the middle of a group and looked like it had come
  // adrift. In compact it is worse: a row with no bar takes no lane, so the
  // line landed on a lane belonging to other work entirely.
  const rowIdx = useMemo(() => {
    const m = {};
    visibleRows.forEach((r, i) => {
      if (!rowDrawsBar(r)) return;
      if (compact && rowLayout.lanes?.[i] === -1) return;
      if (!m[r.s.id]) m[r.s.id] = [];
      m[r.s.id].push(i);
    });
    return m;
  }, [visibleRows, compact, rowLayout]);
  const sMap = useMemo(
    () => Object.fromEntries(allItems.filter(s => !s._unestimated && s.startWi >= 0 && s.endWi >= 0).map(s => [s.id, s])),
    [allItems],
  );

  const cpEdgeSet = useMemo(() => (cpEdges instanceof Set ? cpEdges : new Set(cpEdges || [])), [cpEdges]);

  const allDepLines = useMemo(
    () => buildDepLines({ tree, allItems, sMap, iMap, rowIdx, cpEdgeSet, resD, depX1, depX2, rowCenterY }),
    [allItems, sMap, tree, visibleRows, rowIdx, cpEdgeSet, WPX, showDays, groupBy, dDelta, drag],
  );

  const hoverLines = useMemo(
    () => buildHoverLines({ hoverDepId, tree, allItems, sMap, iMap, rowIdx, resD, depX1, depX2, rowCenterY }),
    [hoverDepId, tree, allItems, sMap, visibleRows, WPX, showDays, dDelta, drag],
  );

  const renderedDepLines = useMemo(() => (cpOnly ? allDepLines.filter(line => line.isCp) : allDepLines), [allDepLines, cpOnly]);
  return { rowIdx, sMap, cpEdgeSet, allDepLines, hoverLines, renderedDepLines };
}
