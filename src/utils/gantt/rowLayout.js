// Where each visible row sits vertically. Classic mode gives every row its own line;
// compact mode packs the task bars of a group into lanes. Inputs in, value out.

// A lane fits a bar when the bar does not OVERLAP the last one in it. No
// clearance on top of that: two tasks the scheduler ran back to back end and
// start on the same x, so any positive gutter pushed the second one onto a
// lane of its own and re-drew the staircase inside the compact mode. The
// bars are already inset 2px each side, which is the gap the eye needs.
// The epsilon is float noise, not spacing.
const LANE_EPS = 0.5;

export function computeRowLayout(ctx) {
  const { visibleRows, compact, RH, dateToX, WPX, DPX, collapsed, rowDepth } = ctx;
  const tops = new Array(visibleRows.length).fill(0);
  if (!compact) {
    for (let i = 0; i < visibleRows.length; i++) tops[i] = i * RH;
    return { tops, height: visibleRows.length * RH, lanes: null };
  }
  // The horizontal extent of a task row's bar, in the same units the
  // renderer uses. A row with no bar takes no lane: there is nothing to
  // pack and nothing to read.
  const spanOf = row => {
    if (row.type !== 'task' || !row.s || row.s._unestimated) return null;
    const t = row.s;
    if (t._completed && (!t.startD || !t.endD)) return null;
    const left = t.startD && t.endD ? dateToX(t.startD) : t.startWi * WPX;
    const right = t.startD && t.endD ? dateToX(t.endD) + DPX : (t.endWi + 1) * WPX;
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return { left, right: Math.max(right, left + 6) };
  };
  // What a row IS in compact: the grouping's own containers, and nothing
  // else. The pills already answer "per project / per team / per person /
  // per thread"; compact takes them at their word and gives a row to those
  // and to nobody below them.
  //
  // My first attempt kept the work-package rows too, each resetting the
  // lanes. That is the hierarchy again by another name: a package with two
  // tasks still cost a header row plus a lane, packages packed separately
  // instead of together, and a group whose work was all filtered out kept a
  // stack of empty headers. The staircase came back as a terrace.
  let laneTop = 0;
  let laneEnds = [];
  const lanes = new Array(visibleRows.length).fill(0);
  const groupBottom = () => laneTop + laneEnds.length * RH;
  visibleRows.forEach((row, i) => {
    // What gets a row of its own: the grouping's containers, and anything
    // FOLDED. A folded package is one thing now — so it is one row, with a
    // name in the left column and the chevron that opens it again. Without
    // that it was a bar on a lane with no label and no way back.
    const folded = row.type !== 'task' && !!row.children?.length && collapsed.has(row.collapseKey || row.key);
    const isContainer = row.type !== 'task' && ((rowDepth.get(row) ?? 0) === 0 || folded);
    if (isContainer) {
      const y = groupBottom();
      tops[i] = y;
      laneTop = y + RH;
      laneEnds = [];
      return;
    }
    // A work package inside a group is not a row here — its bar is the
    // union of its children's and would overlap every one of them, taking a
    // lane of its own on every group.
    //
    // Unless it is folded, which is handled above: its children are not
    // drawn at all, so its own bar is the only thing standing for them, and
    // hiding it made a folded package with two hundred items under it
    // vanish from the chart.
    if (row.type !== 'task') {
      tops[i] = laneTop;
      lanes[i] = -1;
      return;
    }
    const span = spanOf(row);
    if (!span) {
      tops[i] = laneTop;
      lanes[i] = -1;
      return;
    }
    let lane = laneEnds.findIndex(end => end <= span.left + LANE_EPS);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(-Infinity);
    }
    laneEnds[lane] = span.right;
    lanes[i] = lane;
    tops[i] = laneTop + lane * RH;
  });
  return { tops, height: Math.max(groupBottom(), RH), lanes };
}
