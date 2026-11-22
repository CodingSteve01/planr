import { addD, addWorkDays } from '../date.js';

const DAY = 864e5;

// Index of the grid week holding `d`, or -1 when `d` lies outside the grid.
const weekIndexOf = (wks, d) => wks.findIndex(w => d >= w.mon && d < addD(w.mon, 7));

// The reported window of a scheduled task, shared by the assigned and the
// team-slot path. Guarantees `startD <= endD`.
//
//   firstWorkDay / lastWorkDay  first and last day that actually took work
//   startFallback               start when no day took work (cascade start or week Monday)
//   eW                          end week index chosen by the caller
//   consumedDays                days already worked (WIP), 0 when none
//   depNextDate                 first free day after the latest dependency
//   effort                      scheduled effort (0 for milestones)
//   truncated                   an offboarding, not the horizon, cut the task short
//
// `beyondHorizon` is true when effort exists but no working day fitted before
// the plan horizon: the dates are then a placeholder, not a plan.
export function taskWindow({ firstWorkDay, lastWorkDay, startFallback, wks, eW, consumedDays, depNextDate, wdSet, effort, truncated }) {
  let startD = firstWorkDay || startFallback;
  let endD = lastWorkDay || addD(wks[eW].mon, 4);
  let endWi = eW;
  // WIP-progress: show the done portion where it happened, before the start.
  if (consumedDays > 0) startD = addWorkDays(startD, -consumedDays, wdSet);
  if (depNextDate && startD < depNextDate) startD = depNextDate;
  if (endD < startD) {
    // The fallback end (last week's Friday) lies before a start pushed past
    // a dependency: follow the start, and the end week with it.
    endD = startD;
    const inGrid = weekIndexOf(wks, endD);
    if (inGrid >= 0) endWi = inGrid;
  }
  const beyondHorizon = !lastWorkDay && effort > 0 && !truncated;
  return { startD, endD, endWi, beyondHorizon, calDays: Math.round((endD - startD) / DAY) + 1 };
}
