// Per-task Soll/Ist comparison. Returns the planned-vs-actual breakdown a
// single done leaf carries, including a workday-bereinigt actual duration so
// weekend / holiday / vacation overlaps don't inflate the "Ist" number.
//
// Shape:
//   {
//     soll:   { best, factor, realistic },     // estimate-side (best × factor)
//     ist:    { startD, endD, workDays, calDays }, // actually-spent
//     planned:{ startD, endD, workDays },      // pre-execution snapshot (if any)
//     delta:  { workDays, percent, tone },     // realistic vs. ist workdays
//     confounders: { weekends, holidays, vacationDays },
//     ok: 'on'|'over'|'under'|null,
//   }
// `null` is returned when the task lacks enough data to compute Soll/Ist.
import { workDaysBetween, offDaysBetween } from './date.js';

export function computeSollIst(node, { workDays, holidayIso, vacationDays = 0 } = {}) {
  if (!node || node.status !== 'done') return null;
  const startStr = node.completedStart || node.completedAt;
  const endStr   = node.completedEnd   || node.completedAt;
  if (!startStr || !endStr) return null;
  const startD = new Date(startStr);
  const endD   = new Date(endStr);

  const best = typeof node.best === 'number' ? node.best : 0;
  const factor = typeof node.factor === 'number' ? node.factor : 1.5;
  const realistic = best > 0 ? Math.round(best * factor * 10) / 10 : 0;

  const istWorkDays = workDaysBetween(startD, endD, workDays, holidayIso);
  const istCalDays = Math.max(1, Math.round((endD - startD) / 864e5) + 1);
  const off = offDaysBetween(startD, endD, workDays, holidayIso);

  const planned = (node.plannedStart && node.plannedEnd)
    ? {
        startD: new Date(node.plannedStart),
        endD: new Date(node.plannedEnd),
        workDays: workDaysBetween(new Date(node.plannedStart), new Date(node.plannedEnd), workDays, holidayIso),
      }
    : null;

  let delta = null;
  let ok = null;
  if (realistic > 0 && istWorkDays > 0) {
    const deltaDays = Math.round((istWorkDays - realistic) * 10) / 10;
    const percent = Math.round(((istWorkDays - realistic) / realistic) * 100);
    const tone = percent > 20 ? 'over' : percent < -20 ? 'under' : 'on';
    delta = { workDays: deltaDays, percent, tone };
    ok = tone;
  }

  return {
    soll: { best, factor, realistic },
    ist: { startD, endD, workDays: istWorkDays, calDays: istCalDays },
    planned,
    delta,
    confounders: { weekends: off.weekends, holidays: off.holidays, vacationDays },
    ok,
  };
}

// Aggregate the same data across many tasks. Drives the Retro banner: total
// Soll/Ist effort, hit-rate (±20 % tolerance), median ratio, outliers.
//
//   { count, sollSum, istSum, ratio, hitRate, hits, total, overruns: [], underruns: [] }
export function aggregateSollIst(nodes, ctx = {}) {
  let count = 0, sollSum = 0, istSum = 0, hits = 0;
  const overruns = [];
  const underruns = [];
  for (const node of nodes || []) {
    const r = computeSollIst(node, ctx);
    if (!r || !r.delta || r.soll.realistic <= 0) continue;
    count++;
    sollSum += r.soll.realistic;
    istSum += r.ist.workDays;
    if (r.delta.tone === 'on') hits++;
    const entry = { id: node.id, name: node.name, ...r };
    if (r.delta.tone === 'over') overruns.push(entry);
    else if (r.delta.tone === 'under') underruns.push(entry);
  }
  overruns.sort((a, b) => b.delta.percent - a.delta.percent);
  underruns.sort((a, b) => a.delta.percent - b.delta.percent);
  const ratio = sollSum > 0 ? istSum / sollSum : null;
  return {
    count, sollSum, istSum, ratio,
    hits, hitRate: count > 0 ? hits / count : null,
    overruns, underruns,
  };
}
