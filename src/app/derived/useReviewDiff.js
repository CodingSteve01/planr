import { useMemo } from 'react';
import { computeDiff, parseSinceValue } from '../../utils/diff.js';
import { parseHorizonValue, horizonScopedIds } from '../../utils/horizon.js';
import { futureProgressByRoot } from '../futureProgress.js';

// The review window and the planning horizon as overlays on the plan: what
// changed since a day, what is planned inside the horizon, and the sets the
// views filter by. Takes one object, returns one object.
export function useReviewDiff(args) {
  const { data, scn, tree, scheduled, members, vacations, hm, workDays } = args;
  const { sinceDays, horizonDays, horizonOnlyPlanned, diffOnlyChanged } = args;
  // Paused while a scenario is on screen. Two overlays at once is how amber
  // rows for "progressed since the 5th" came to be read as "moved by the
  // scenario". The window is not forgotten — `sinceDays` stays as it is and
  // the filter says it is paused — it just does not paint while the question
  // on screen is a different one (principles.md: overlays belong to a
  // moment, never two at once).
  const sinceDate = useMemo(() => (scn ? null : parseSinceValue(sinceDays)), [sinceDays, scn]);
  const horizonEnd = useMemo(() => parseHorizonValue(horizonDays), [horizonDays]);
  const horizonIds = useMemo(() => horizonScopedIds({ tree, scheduled, horizonEnd }), [tree, scheduled, horizonEnd]);
  const futureProgressByRootId = useMemo(() => futureProgressByRoot(tree, scheduled, horizonEnd), [tree, scheduled, horizonEnd]);
  const diff = useMemo(
    () =>
      computeDiff({
        tree,
        historyEvents: data?.historyEvents || [],
        sinceDate,
        members,
        vacations,
        holidays: hm,
        workDays,
      }),
    [tree, data?.historyEvents, sinceDate, members, vacations, hm, workDays],
  );
  const diffDoneSet = useMemo(() => new Set(diff?.doneInWindowIds || []), [diff]);
  const diffChangedSet = useMemo(() => new Set(diff?.changedInWindowIds || []), [diff]);
  const diffProgressedSet = useMemo(() => new Set(diff?.progressedInWindowIds || []), [diff]);
  // Effective filter sets: pass to views only when they actually carry
  // entries. Critical: an empty Set is truthy, so consumers like Plan /
  // Briefing / Queues would `if (diffChangedIds)` and filter EVERYTHING
  // out the moment the toggle was on without a matching diff/horizon
  // configured. Null when inactive → consumer skips the filter cleanly.
  const horizonFilterSet = horizonOnlyPlanned && horizonIds && horizonIds.size > 0 ? horizonIds : null;
  const diffFilterSet = diffOnlyChanged && diffChangedSet.size > 0 ? diffChangedSet : null;
  const diffVisibleSet = sinceDate && diffChangedSet.size > 0 ? diffChangedSet : null;
  return {
    sinceDate,
    horizonEnd,
    horizonIds,
    futureProgressByRootId,
    diff,
    diffDoneSet,
    diffChangedSet,
    diffProgressedSet,
    horizonFilterSet,
    diffFilterSet,
    diffVisibleSet,
  };
}
