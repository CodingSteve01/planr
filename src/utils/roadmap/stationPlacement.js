import { progressToRouteT, clamp } from './format.js';
import { ROUTE_T_LO, ROUTE_T_HI } from './board.js';
import { pointAtFraction } from './geometry.js';

export function positionStations(assignedLines, planRank, now) {
  // ── Station placement on routes ───────────────────────────────────────────
  // Effort-proportional spacing: the subway line is a percent-of-scope loading
  // bar, not a calendar timeline. The train is the real effort progress.
  // Stations are milestone thresholds: reached stations must sit behind the
  // train, unfinished stations must sit ahead of it. Dates define order within
  // those two bands, not whether the train has passed a milestone.
  const positionedLines = assignedLines.map(line => {
    const { route } = line;

    // Two halves of one line, ordered by two different things, because they
    // are two different kinds of statement.
    //
    // BEHIND the train is history: those packages were finished, in an order
    // that actually happened, and the date is the record of it. Re-sorting
    // completed work by the plan would show a sequence that never occurred.
    //
    // AHEAD of the train is intent, and the only statement anybody has made
    // about that is the tree — the same rank the scheduler plans by
    // (utils/displayOrder.js, `treeOrderRank`). It used to be the end date
    // here too, which is a CONSEQUENCE of the order rather than the order
    // itself: one long package finishing after a later short one swapped two
    // stations, and the map disagreed with the tree, the work order and the
    // Gantt about what comes next. The date stays as the tiebreak, for the
    // stops the tree does not separate.
    const byEnd = (a, b) =>
      (+(a.milestoneDate || a.endDate) || Infinity) - (+(b.milestoneDate || b.endDate) || Infinity) ||
      a.id.localeCompare(b.id, undefined, { numeric: true });
    const byPlan = (a, b) => {
      const ar = planRank.has(a.id) ? planRank.get(a.id) : Number.MAX_SAFE_INTEGER;
      const br = planRank.has(b.id) ? planRank.get(b.id) : Number.MAX_SAFE_INTEGER;
      return ar - br || byEnd(a, b);
    };
    const allStations = [...line.majorStations, ...line.minorStations].sort(byEnd);
    const doneOrdered = allStations.filter(station => station.allDone).sort(byEnd);
    const activeOrdered = allStations.filter(station => !station.allDone).sort(byPlan);

    // Project span is retained only for the "today on calendar" ghost marker
    // and as fallback if a line has no effort data.
    const dates = allStations.map(s => +(s.milestoneDate || s.endDate)).filter(Number.isFinite);
    const firstD = dates.length ? Math.min(...dates) : null;
    const lastD = dates.length ? Math.max(...dates) : null;
    const span = lastD && firstD && lastD > firstD ? lastD - firstD : 0;
    const totalStationEffort = allStations.reduce((sum, station) => sum + Math.max(0, station.effort || 0), 0);
    const totalRouteEffort = Math.max(totalStationEffort, line.totalEffort || 0);

    // Raw effort progress: how much of the total effort has actually been
    // completed. `line.progress` comes from treeStats._progress, so a 1d leaf
    // weighs less than a 10d leaf.
    const effortTrainT = progressToRouteT(line.progress);
    // Today-on-timeline marker — kept as `ghostT` so a Soll/Ist gap can be
    // rendered later (effort progress vs calendar position).
    const nowMs = +new Date(now);
    const ghostT =
      span > 0 && firstD != null && lastD != null
        ? ROUTE_T_LO + clamp((nowMs - firstD) / span, 0, 1) * (ROUTE_T_HI - ROUTE_T_LO)
        : effortTrainT;

    const positionBand = (stations, rawTs, minT, maxT, anchorLast = false) => {
      if (!stations.length) return [];
      const lo = clamp(minT, ROUTE_T_LO, ROUTE_T_HI);
      const hi = clamp(Math.max(maxT, lo), ROUTE_T_LO, ROUTE_T_HI);
      const desiredSpacing = 0.035;
      const available = Math.max(0, hi - lo);
      const spacing = stations.length > 1 ? Math.min(desiredSpacing, available / (stations.length - 1 || 1)) : 0;

      let positionedBand = stations.map((station, idx) => {
        const rawT = Number.isFinite(rawTs[idx]) ? rawTs[idx] : lo + available * ((idx + 1) / (stations.length + 1));
        return { ...station, t: clamp(rawT, lo, hi) };
      });

      positionedBand.sort((a, b) => a.t - b.t || byEnd(a, b));
      for (let i = 1; i < positionedBand.length; i++) {
        if (positionedBand[i].t - positionedBand[i - 1].t < spacing) {
          positionedBand[i] = { ...positionedBand[i], t: positionedBand[i - 1].t + spacing };
        }
      }
      if (positionedBand.length && positionedBand[positionedBand.length - 1].t > hi) {
        const n = positionedBand.length;
        positionedBand = positionedBand.map((station, idx) => {
          const t = n === 1 ? (anchorLast ? hi : lo + available / 2) : lo + (available * idx) / (n - 1);
          return { ...station, t };
        });
      } else if (anchorLast && positionedBand.length === 1) {
        positionedBand[0] = { ...positionedBand[0], t: hi };
      }

      return positionedBand.map(station => {
        const pt = pointAtFraction(route, station.t);
        return { ...station, x: pt.x, y: pt.y };
      });
    };

    let doneEffort = 0;
    const doneRawTs = doneOrdered.map(station => {
      doneEffort += Math.max(0, station.effort || 0);
      if (totalRouteEffort > 0) return progressToRouteT(doneEffort / totalRouteEffort);
      const milestoneDate = station.milestoneDate || station.endDate;
      if (span > 0 && Number.isFinite(+milestoneDate)) {
        return ROUTE_T_LO + ((+milestoneDate - firstD) / span) * (ROUTE_T_HI - ROUTE_T_LO);
      }
      return NaN;
    });
    let activeEffort = doneEffort;
    const activeRawTs = activeOrdered.map(station => {
      activeEffort += Math.max(0, station.effort || 0);
      if (totalRouteEffort > 0) return progressToRouteT(activeEffort / totalRouteEffort);
      const milestoneDate = station.milestoneDate || station.endDate;
      if (span > 0 && Number.isFinite(+milestoneDate)) {
        return ROUTE_T_LO + ((+milestoneDate - firstD) / span) * (ROUTE_T_HI - ROUTE_T_LO);
      }
      return NaN;
    });

    const trainT = clamp(effortTrainT, ROUTE_T_LO, ROUTE_T_HI);
    const activeStartT = Math.min(ROUTE_T_HI, trainT + (activeOrdered.length ? 0.018 : 0));
    // On a finished line the train stands at the terminus and the last station
    // is anchored to the same point, so the car covered the stop it had just
    // reached. The done band stops short of the train by the width of one, so
    // the two sit side by side.
    const arrivedHere = (line.progress || 0) >= 1 && !activeOrdered.length;
    const doneBandHi = arrivedHere ? Math.max(ROUTE_T_LO, trainT - 0.035) : trainT;
    const positioned = [
      ...positionBand(doneOrdered, doneRawTs, ROUTE_T_LO, doneBandHi, true),
      ...positionBand(activeOrdered, activeRawTs, activeStartT, ROUTE_T_HI, false),
    ].sort((a, b) => a.t - b.t || byEnd(a, b));

    const majors = positioned.filter(s => s.kind === 'major');
    const minors = positioned.filter(s => s.kind === 'minor');

    // Current station: first not-done station (the one being approached).
    // The train may advance between the last done station and this station
    // according to the station's own partial progress, but it must never pass
    // the station until every clustered item is actually done.
    const currentStation = positioned.find(s => !s.allDone && s.prog > 0) || positioned.find(s => !s.allDone);
    const currentId = currentStation?.id || null;

    // Train rides between ROUTE_T_LO and ROUTE_T_HI (0.04..0.96) so badges
    // at the route endpoints stay visually clear. When a line is 100% done
    // there is no train glyph to clear, and the user expects the colored
    // route to reach the very end badge — not stop at the last station's
    // route-T (0.96). Extend reachedT to 1.0 in that case so the traveled
    // path covers the route from badge to badge.
    const reachedT = line.progress >= 1 ? 1 : trainT;
    const trainPt = pointAtFraction(route, trainT);
    const ghostPt = pointAtFraction(route, ghostT);

    return {
      ...line,
      majorStations: majors,
      minorStations: minors,
      currentId,
      reachedT,
      trainT,
      trainPt,
      ghostT,
      ghostPt,
    };
  });
  return positionedLines;
}
