// Single source of truth for aggregate progress numbers and their formatting.
//
// Every surface that shows an overall/aggregate percentage MUST use these
// helpers: the Overview KPI row, the Subway-Map, the HTML report and every PDF
// export. A management PDF that disagrees with the screen is worse than no
// PDF, so the maths lives here exactly once.
//
// Semantics (mirrors the Subway-map train position):
//   * weight per leaf  = scheduleEffort (fixed-duration days, else realistic PT)
//   * progress per leaf = leafProgress → phases > manual progress > status,
//                         capped at 99 % while the leaf is not done
// Counting done leaves instead (done / total) systematically reports a
// *different* number and must not be used for the headline figure.
import { leafProgress, scheduleEffort } from './scheduler.js';

export const MIN_VISIBLE_PROGRESS_DELTA_PCT = 0.005;

export function trim1(value) {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export function trim2(value) {
  return (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

export function progressPctLabel(value) {
  return trim1(Math.max(0, Math.min(100, Number(value) || 0)));
}

export function progressDeltaLabel(deltaPct) {
  const delta = Number(deltaPct) || 0;
  if (Math.abs(delta) < MIN_VISIBLE_PROGRESS_DELTA_PCT) return '0%';
  const sign = delta > 0 ? '+' : '-';
  const abs = Math.abs(delta);
  if (abs >= 0.1) return `${sign}${trim1(abs)}%`;
  return `${sign}${trim2(abs)}%`;
}

// Effort-weighted progress over a set of leaves.
// `progressOf` lets callers swap in a historical progress lookup (diff views)
// while keeping the weighting identical to the live figure.
export function effortWeightedProgress(leaves, progressOf = leafProgress) {
  let totalEffort = 0;
  let progressedEffort = 0;
  for (const lf of leaves || []) {
    // `|| 1` keeps unestimated leaves in the denominator so scope without an
    // estimate still dilutes the percentage instead of vanishing.
    const effort = scheduleEffort(lf) || 1;
    totalEffort += effort;
    progressedEffort += effort * (Math.max(0, Math.min(100, progressOf(lf) || 0)) / 100);
  }
  return {
    totalEffort,
    progressedEffort,
    pct: totalEffort > 0 ? (progressedEffort / totalEffort) * 100 : 0,
  };
}

// THE percentage for any scope that is more than one task: a subtree, a goal,
// a Subway-line, a whole plan. Effort-weighted and phase-aware (see above), and
// it never claims 100 % while a leaf is still open — the rule leafProgress
// applies to a single task, lifted to a group of them.
//
// `done / total` is a DIFFERENT number: it answers "how many tasks", not "how
// much work". A 45 PT rebuild and a 1 PT typo fix count the same there, which
// is why the count-based figure drifted metres away from the Subway-Map. Print
// the count as a count ("21/51"), never as the percentage.
export function aggregateProgressPct(leaves) {
  const list = leaves || [];
  if (!list.length) return 0;
  const pct = effortWeightedProgress(list).pct;
  return list.every(lf => lf?.status === 'done') ? pct : Math.min(pct, 99);
}

// Absolute PT delivered (partial progress counts). Unlike the percentage this
// only ever grows, so it stays meaningful while scope is added.
export function deliveredEffort(leaves) {
  let acc = 0;
  for (const lf of leaves || []) acc += (scheduleEffort(lf) || 0) * (leafProgress(lf) / 100);
  return acc;
}

// Total planned effort — same weight function as the progress denominator,
// but without the `|| 1` fallback so the "Total PT" KPI stays a real PT sum.
export function totalEffort(leaves) {
  let acc = 0;
  for (const lf of leaves || []) acc += scheduleEffort(lf) || 0;
  return acc;
}
