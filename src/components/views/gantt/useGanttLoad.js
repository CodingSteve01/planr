import { useMemo } from 'react';
import {
  buildHolidayDays,
  buildVacBands,
  buildResourceLoad,
  buildLoadRiskSummary,
  buildLoadWeekSummary,
} from '../../../utils/gantt/loadModel.js';

// Vacation, holiday and resource-load figures behind the bands and the heatmap.
export function useGanttLoad({
  vacations,
  wdSet,
  WPX,
  DPX,
  weeks,
  allItems,
  memberById,
  tw,
  dateToX,
  iMap,
  members,
  meetingPlans,
  teams,
  todayIso,
  capacityAt,
  scheduledWorkDaysOf,
  t,
}) {
  // Per-person vacation blocks: Map<personId, [{from, to}]>
  const vacByPerson = useMemo(() => {
    const m = {};
    (vacations || []).forEach(v => {
      if (!v.person || !v.from || !v.to) return;
      if (!m[v.person]) m[v.person] = [];
      m[v.person].push(v);
    });
    return m;
  }, [vacations]);
  // Every public holiday in the visible window, as a day column. The grid
  // tints them only at day zoom; a person's own row shows them at every zoom,
  // next to that person's vacation, because together they are the days that
  // person is not there.
  const holidayDays = useMemo(() => buildHolidayDays({ weeks, wdSet, WPX, DPX }), [weeks, wdSet, WPX, DPX]);
  const vacBandsByTaskId = useMemo(
    () => buildVacBands({ allItems, vacByPerson, memberById, tw, DPX, dateToX }),
    [allItems, vacByPerson, memberById, tw, DPX, weeks, WPX],
  );
  const resourceLoadByWeek = useMemo(
    () =>
      buildResourceLoad({
        allItems,
        iMap,
        memberById,
        members,
        vacByPerson,
        weeks,
        meetingPlans,
        teams,
        todayIso,
        capacityAt,
        scheduledWorkDaysOf,
      }),
    [allItems, iMap, memberById, members, vacByPerson, weeks, meetingPlans, teams, todayIso, capacityAt],
  );
  const loadRiskSummary = useMemo(() => buildLoadRiskSummary({ resourceLoadByWeek, memberById, t }), [resourceLoadByWeek, memberById, t]);
  const loadWeekSummary = useMemo(
    () => buildLoadWeekSummary({ weeks, resourceLoadByWeek, memberById, t }),
    [weeks, resourceLoadByWeek, memberById, t],
  );
  return { vacByPerson, holidayDays, vacBandsByTaskId, resourceLoadByWeek, loadRiskSummary, loadWeekSummary };
}
