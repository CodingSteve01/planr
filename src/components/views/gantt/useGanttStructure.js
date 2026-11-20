import { useMemo } from 'react';
import { buildStructure } from '../../../utils/gantt/structure.js';
import { buildThreadStructure } from '../../../utils/threads.js';
import { treeOrderRank } from '../../../utils/displayOrder.js';

// The grouped structure of rows the chart shows.
export function useGanttStructure({
  groupBy,
  allItems,
  tree,
  iMap,
  scheduled,
  displayItems,
  childrenByParent,
  rootIds,
  teams,
  memberById,
  teamById,
  confidence,
  t,
  weekIndexOfDate,
  UNASSIGNED_LABEL,
  weeks,
}) {
  const threadStructure = useMemo(() => {
    return buildThreadStructure({ groupBy, allItems, tree, iMap, scheduled });
  }, [groupBy, allItems, tree, iMap, scheduled]);
  const treeRank = useMemo(() => treeOrderRank(tree), [tree]);
  const structure = useMemo(
    () =>
      buildStructure({
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
      }),
    [
      allItems,
      displayItems,
      groupBy,
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
      weeks,
    ],
  );
  return { threadStructure, treeRank, structure };
}
