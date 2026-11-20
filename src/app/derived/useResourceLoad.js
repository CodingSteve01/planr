import { useMemo } from 'react';
import { buildResourceLoadMatrix } from '../../components/shared/ResourceLoadMatrix.jsx';
import { changeDates, resourcesAsOf } from '../../utils/effective.js';
import { overbookedIds } from '../viewTree.js';

// Global resource-load + overbooked task ids — shared by the quick-filter
// chip and any view that wants to flag overbookings (vs each view rolling
// its own load matrix and drifting out of sync).
export function useResourceLoad({ data, members, teams, vacations, scheduled, weeks, capacityAt }) {
  const resourceLoadByWeek = useMemo(
    () => buildResourceLoadMatrix({ members, teams, vacations, meetingPlans: data?.meetingPlans || [], scheduled, weeks, capacityAt }),
    [members, teams, vacations, data?.meetingPlans, scheduled, weeks],
  );
  const overbookedTaskIds = useMemo(() => overbookedIds(scheduled, weeks, resourceLoadByWeek), [scheduled, weeks, resourceLoadByWeek]);
  return { resourceLoadByWeek, overbookedTaskIds };
}

// The plan's resources as they are on the chosen day, and the days on which
// something changes.
export function useResourceLens({ data, effDate }) {
  const resLens = useMemo(() => resourcesAsOf(data, effDate || new Date()), [data, effDate]);
  const effDates = useMemo(() => changeDates(data), [data?.changes]);
  const effCount = effDates.find(d => d.from === effDate)?.count || 0;
  return { resLens, effDates, effCount };
}
