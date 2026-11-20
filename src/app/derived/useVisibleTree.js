import { useMemo } from 'react';
import { scanArchive, stripArchivedRoots, stripArchivedMembers, isArchivedId } from '../../utils/archive.js';
import { treeStats, enrichParentSchedules } from '../../utils/scheduler.js';
import { scheduleFiltered, scopeFiltered, withReviewedDone, withoutDone } from '../viewTree.js';

// What the views draw, in the order the filters are applied: the archive
// layer, hide-done, the scope (root, team, person), the quick filters that
// need the schedule, and last the review window's reviewed-done rows put back.
// Takes one object, returns one object.
export function useVisibleTree(args) {
  const archived = useArchiveLayer(args);
  const scoped = useScopedTree({ ...args, ...archived });
  const shown = useShownTree({ ...args, ...archived, ...scoped });
  return { ...archived, ...scoped, ...shown };
}

// ── Archive layer ────────────────────────────────────────────────────────
// Long-finished projects and long-gone people are dropped from what the
// views render, but NOT from `tree` / `stats` / `scheduled`. The headline
// percentage and PT totals keep counting them — archiving a finished
// project must never make the project look less finished.
function useArchiveLayer({ tree, members, archiveDays, showArchived, hideDone, scheduled }) {
  const archive = useMemo(() => scanArchive({ tree, members, days: archiveDays }), [tree, members, archiveDays]);
  const activeTree = useMemo(
    () => (showArchived ? tree : stripArchivedRoots(tree, archive.rootIds)),
    [tree, showArchived, archive.rootIds],
  );
  const activeMembers = useMemo(
    () => (showArchived ? members : stripArchivedMembers(members, archive.memberIds)),
    [members, showArchived, archive.memberIds],
  );
  const visibleTree = useMemo(() => {
    // Archive first, then hide-done: both are display filters over the same
    // tree, and the archive set is the coarser of the two.
    return hideDone ? withoutDone(activeTree) : activeTree;
  }, [activeTree, hideDone]);
  // Gantt reads `scheduled` directly (not the view tree), so it needs its own
  // archive-filtered copy — same reason the tree gets one.
  const activeScheduled = useMemo(
    () => (showArchived || !archive.rootIds.size ? scheduled : scheduled.filter(s => !isArchivedId(archive.rootIds, s.id))),
    [scheduled, showArchived, archive.rootIds],
  );
  return { archive, activeTree, activeMembers, visibleTree, activeScheduled };
}

function useScopedTree({ visibleTree, rootFilter, teamFilter, personFilter, onlyUnestimated }) {
  const rootItems = useMemo(() => visibleTree.filter(r => !r.id.includes('.')), [visibleTree]);
  const netRootOptions = useMemo(() => rootItems.map(r => ({ id: r.id, label: r.name || r.id })), [rootItems]);
  const netTree = useMemo(
    () => scopeFiltered(visibleTree, { rootFilter, teamFilter, personFilter, onlyUnestimated }),
    [visibleTree, rootFilter, teamFilter, personFilter, onlyUnestimated],
  );
  return { rootItems, netRootOptions, netTree };
}

function useShownTree(args) {
  const { hideDone, sinceDate, diffChangedSet, netTree, activeTree, scheduled, stats } = args;
  const { onlyAutoAssigned, onlyOverdue, onlyOverbooked, overbookedTaskIds } = args;
  // Handoff segments have synthetic ids like `${treeId}#N` and live alongside
  // their primary in scheduled[]. Match either id or treeId so all segments
  // pass through view-filters together with their tree node.
  // Quick-filter chips that depend on the scheduler output (auto-assigned,
  // overdue, overbooked). Applied to netTree downstream so all views share
  // the same view.
  const quickFilteredNetTree = useMemo(
    () => scheduleFiltered(netTree, scheduled, { onlyAutoAssigned, onlyOverdue, onlyOverbooked, overbookedTaskIds }),
    [netTree, onlyAutoAssigned, onlyOverdue, onlyOverbooked, scheduled, overbookedTaskIds],
  );
  const visibleTreeForViews = useMemo(() => {
    if (!hideDone || !sinceDate || diffChangedSet.size === 0) return quickFilteredNetTree;
    return withReviewedDone(quickFilteredNetTree, activeTree, diffChangedSet);
  }, [hideDone, sinceDate, diffChangedSet, quickFilteredNetTree, activeTree]);
  const visibleViewIdSet = useMemo(() => new Set(visibleTreeForViews.map(r => r.id)), [visibleTreeForViews]);
  const viewScheduled = useMemo(
    () => scheduled.filter(s => visibleViewIdSet.has(s.id) || (s.treeId && visibleViewIdSet.has(s.treeId))),
    [scheduled, visibleViewIdSet],
  );
  const viewGoals = useMemo(() => visibleTreeForViews.filter(r => !r.id.includes('.') && r.type), [visibleTreeForViews]);
  const viewStats = useMemo(() => {
    if (!hideDone) return stats;
    const s = treeStats(visibleTreeForViews);
    enrichParentSchedules(s, visibleTreeForViews, viewScheduled);
    return s;
  }, [hideDone, stats, visibleTreeForViews, viewScheduled]);
  return { quickFilteredNetTree, visibleTreeForViews, visibleViewIdSet, viewScheduled, viewGoals, viewStats };
}
