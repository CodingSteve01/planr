import { leafNodes, leafProgress, scheduleEffort } from '../utils/scheduler.js';

// Source 1: scheduled bar — partial credit prorated across the bar
// duration up to the horizon.
function fromSchedule(s, horizonEnd, projFrac, maxFutureFrac) {
  if (!s?.endD) return projFrac;
  const endD = s.endD instanceof Date ? s.endD : new Date(s.endD);
  const startD = s.startD instanceof Date ? s.startD : s.startD ? new Date(s.startD) : endD;
  if (endD <= horizonEnd) return maxFutureFrac;
  if (startD < horizonEnd) {
    const dur = +endD - +startD;
    const elapsed = +horizonEnd - +startD;
    const frac = dur > 0 ? Math.min(1, Math.max(0, elapsed / dur)) : 0;
    return Math.max(projFrac, Math.min(maxFutureFrac, frac));
  }
  return projFrac;
}

// Source 2: WIP + due date — linear interpolation from current
// progress toward 100% by `due`. Captures the user's plan: "I know
// I'll finish D1.1 by 2026-06-30 because I'm 58% there now". Even
// if the scheduler isn't routing the work into the horizon window
// (because another assignee's queue is full), the active task's
// own trajectory still counts.
function fromDueDate(lf, horizonEnd, today, { projFrac, curFrac, maxFutureFrac }) {
  if (!(lf.status === 'wip' && lf.due && projFrac < maxFutureFrac)) return projFrac;
  const dueD = new Date(lf.due);
  const horizonD = horizonEnd instanceof Date ? horizonEnd : new Date(horizonEnd);
  if (!(dueD > today)) return projFrac;
  if (horizonD >= dueD) return Math.max(projFrac, maxFutureFrac);
  const span = +dueD - +today;
  const elapsed = +horizonD - +today;
  const frac = span > 0 ? Math.min(1, Math.max(0, elapsed / span)) : 0;
  return Math.max(projFrac, curFrac + (maxFutureFrac - curFrac) * frac);
}

// How much of one leaf is done by the horizon, capped at what a leaf that is
// not finished can show.
function leafFractionAtHorizon(lf, s, horizonEnd, today) {
  // Floor by the leaf's CURRENT progress so the future projection never
  // regresses below the live train.
  const curFrac = leafProgress(lf) / 100;
  const maxFutureFrac = lf.status === 'done' ? 1 : 0.99;
  let projFrac = curFrac;
  if (lf.status === 'done') {
    projFrac = 1;
  } else {
    projFrac = fromSchedule(s, horizonEnd, projFrac, maxFutureFrac);
    projFrac = fromDueDate(lf, horizonEnd, today, { projFrac, curFrac, maxFutureFrac });
  }
  return Math.min(projFrac, maxFutureFrac);
}

// Forward-looking per-root progress: where would the train sit at horizonEnd
// if the current schedule plays out? Used by the Subway map to draw a "Plan"
// ghost-train ahead of the live one (Diff = past, Ist = now, Plan = future).
export function futureProgressByRoot(tree, scheduled, horizonEnd) {
  if (!horizonEnd) return null;
  const sById = Object.fromEntries((scheduled || []).map(s => [s.id, s]));
  const roots = tree.filter(r => !r.id.includes('.'));
  // Live leaves only. Dropped work leaves BOTH sides of every fraction —
  // the same rule progress.js applies to the "Ist" figure right next to
  // this one. Counting it here made a finished project project as unfinished
  // forever, on screen and in the Management Summary's Subway Map.
  const liveLeaves = leafNodes(tree);
  const out = {};
  for (const root of roots) {
    const leaves = liveLeaves.filter(n => n.id === root.id || n.id.startsWith(root.id + '.'));
    const today = new Date();
    let total = 0,
      doneByHorizon = 0;
    for (const lf of leaves) {
      const eff = scheduleEffort(lf) || 1;
      total += eff;
      doneByHorizon += eff * leafFractionAtHorizon(lf, sById[lf.id], horizonEnd, today);
    }
    const allDone = leaves.length > 0 && leaves.every(lf => lf.status === 'done');
    const projected = total > 0 ? doneByHorizon / total : 0;
    out[root.id] = allDone ? projected : Math.min(0.99, projected);
  }
  return out;
}
