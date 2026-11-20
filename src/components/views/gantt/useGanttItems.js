import { useMemo } from 'react';
import { buildAllItems, buildSearchTextById, filterDisplayItems } from '../../../utils/gantt/items.js';

// The scoped item set the view starts from, and what the search box narrows it to.
export function useGanttItems({
  scheduled,
  tree,
  leafIdSet,
  memberById,
  teamById,
  rootFilter,
  teamFilter,
  personFilter,
  workDays,
  UNASSIGNED_LABEL,
  weekIndexOfDate,
  weeks,
  hideDone,
  _diffActive,
  _diffChangedSet,
  search,
}) {
  // Build the fact base for this Gantt scope: scheduled items + unscheduled leaves,
  // filtered by root/team/person, but NOT by hideDone. Summary rows derive from this
  // full scoped set so their aggregates stay factually correct.
  const allItems = useMemo(
    () =>
      buildAllItems({
        scheduled,
        tree,
        leafIdSet,
        memberById,
        rootFilter,
        teamFilter,
        personFilter,
        workDays,
        UNASSIGNED_LABEL,
        weekIndexOfDate,
      }),
    // `weeks` because the week index of a date depends on the window, and
    // the label because it changes with the language.
    [scheduled, tree, leafIdSet, memberById, rootFilter, teamFilter, personFilter, workDays, weeks, UNASSIGNED_LABEL],
  );
  // Determine root id of a task ('P1', 'D1.2.3' → 'D1')
  const iMap = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);
  const searchNeedle = useMemo(() => (search || '').trim().toLowerCase(), [search]);
  const searchTextById = useMemo(() => buildSearchTextById({ tree, iMap, teamById, memberById }), [tree, iMap, teamById, memberById]);
  const displayItems = useMemo(
    () =>
      filterDisplayItems({ allItems, hideDone, _diffActive, _diffChangedSet, searchNeedle, searchTextById, iMap, teamById, memberById }),
    [allItems, hideDone, _diffActive, _diffChangedSet, searchNeedle, searchTextById, iMap, teamById, memberById],
  );
  return { allItems, iMap, searchNeedle, searchTextById, displayItems };
}
