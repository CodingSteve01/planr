import { addD, addWorkDays } from '../date.js';

const DAY = 864e5;

// Index of the grid week holding `d`, or -1 when `d` lies outside the grid.
const weekIndexOf = (wks, d) => wks.findIndex(w => d >= w.mon && d < addD(w.mon, 7));

// Like weekIndexOf, but a date outside the grid maps to the nearest edge week.
const clampedWeekIndex = (wks, d) => {
  const i = weekIndexOf(wks, d);
  if (i >= 0) return i;
  return d < wks[0].mon ? 0 : wks.length - 1;
};

// An end date is an offboard cut only when a working day of the grid lies after
// it. Work is allowed on the end date itself, so leaving on the last working day
// of the plan, or on the weekend after it, takes nothing away: a task that does
// not fit then ran into the horizon, not into the person leaving.
const lastGridWorkDay = wks => {
  for (let i = wks.length - 1; i >= 0; i--) {
    const wds = wks[i].wds;
    if (wds?.length) return wds[wds.length - 1];
  }
  return null;
};
export const offboardsInGrid = (wks, endDate) => {
  if (!endDate) return false;
  const last = lastGridWorkDay(wks);
  return !!last && endDate < last;
};

// The reported window of a scheduled task, shared by the assigned and the
// team-slot path. Guarantees `startD <= endD`.
//
// Contract: `startD`/`endD` are real dates and may lie past the plan end.
// `startWi`/`endWi` are week indices clamped to the grid (a date past the grid
// maps to the last week), and `weeks` is computed from those clamped indices,
// so `endWi >= startWi` and `weeks >= 1` always hold.
//
//   firstWorkDay / lastWorkDay  first and last day that actually took work
//   startFallback               start when no day took work (cascade start or week Monday)
//   eW                          end week index chosen by the caller
//   consumedDays                days already worked (WIP), 0 when none
//   depNextDate                 first free day after the latest dependency
//   effort                      scheduled effort (0 for milestones)
//   truncated                   an offboarding, not the horizon, cut the task short
//   ranOut                      the grid ended before the work did (partial
//                               placement, or a fixed duration cut short)
//
// `beyondHorizon` is true when the plan end, not an offboarding, kept the task
// from being fully placed: either no working day fitted at all (the dates are
// then a placeholder), or only part of it did (the end is the plan end).
export function taskWindow({
  firstWorkDay,
  lastWorkDay,
  startFallback,
  wks,
  eW,
  consumedDays,
  depNextDate,
  wdSet,
  effort,
  truncated,
  ranOut,
}) {
  let startD = firstWorkDay || startFallback;
  let endD = lastWorkDay || addD(wks[eW].mon, 4);
  let endWi = eW;
  // WIP-progress: show the done portion where it happened, before the start.
  if (consumedDays > 0) startD = addWorkDays(startD, -consumedDays, wdSet);
  if (depNextDate && startD < depNextDate) startD = depNextDate;
  // The start week follows the final start date, whichever path moved it.
  const startWeek = clampedWeekIndex(wks, startD);
  if (endD < startD) {
    // The fallback end (last week's Friday) lies before a start pushed past
    // a dependency: follow the start, and the end week with it.
    endD = startD;
  }
  // An end past the grid keeps the last week; one inside follows its date.
  if (endD >= addD(wks[wks.length - 1].mon, 7)) endWi = wks.length - 1;
  else if (endD !== lastWorkDay) endWi = Math.max(endWi, clampedWeekIndex(wks, endD));
  endWi = Math.max(endWi, startWeek);
  const beyondHorizon = !truncated && ((!lastWorkDay && effort > 0) || !!ranOut);
  return {
    startD,
    endD,
    startWi: startWeek,
    endWi,
    weeks: endWi - startWeek + 1,
    beyondHorizon,
    calDays: Math.round((endD - startD) / DAY) + 1,
  };
}
