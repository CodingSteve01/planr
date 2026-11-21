import { buildRoutes } from './board.js';
import { routeLength } from './geometry.js';
import { hashStr } from './format.js';
import { PALETTE } from './palette.js';

/**
 * Fold the map's computed {rootId → {routeIdx, colorIdx}} into the stored one.
 *
 * Merge, never replace. The map only ever sees the *rendered* tree, which can
 * be a subset (archive filter, single-line mode) — replacing would drop the
 * colours and lanes of every project that happens to be hidden right now.
 * Stored entries win; computed values fill gaps for roots with no mapping.
 *
 * The one exception: a stored lane or colour that another stored project
 * holds too. The old eight-lane board wrote such duplicates, and the map now
 * gives the second project a free slot (see computeRoadmapModel) — taking
 * that over is what repairs the file, rather than resolving the same
 * collision again on every render.
 */
export function mergeRoadmapAssignment(prev, computed, rootIds) {
  const merged = {};
  Object.keys(prev || {}).forEach(id => {
    if (rootIds.has(id)) merged[id] = prev[id];
  });
  const holders = key => {
    const count = new Map();
    Object.values(merged).forEach(v => {
      if (Number.isFinite(v?.[key])) count.set(v[key], (count.get(v[key]) || 0) + 1);
    });
    return count;
  };
  const routeHolders = holders('routeIdx');
  const colorHolders = holders('colorIdx');
  Object.keys(computed || {}).forEach(id => {
    const was = merged[id];
    if (!rootIds.has(id) || !computed[id]) return;
    if (!was || routeHolders.get(was.routeIdx) > 1 || colorHolders.get(was.colorIdx) > 1) merged[id] = computed[id];
  });
  return merged;
}

export function assignRoutes(rawLines, assignment) {
  // ── Route assignment ──────────────────────────────────────────────────────
  // Sort routes by pixel length (longest first).
  const routesWithLen = buildRoutes(rawLines.length)
    .map((wp, idx) => ({ idx, wp, len: routeLength(wp) }))
    .sort((a, b) => b.len - a.len);

  // Sort projects by duration (longest first). Ties broken by hash of root.id for stability.
  const sortedLines = [...rawLines].sort((a, b) => {
    if (b.durationDays !== a.durationDays) return b.durationDays - a.durationDays;
    return hashStr(a.root.id) - hashStr(b.root.id);
  });

  // Assign route and palette color by rank.
  // Per-route deterministic micro-offset breaks up segments where two routes
  // share long stretches of identical waypoints (e.g. a vertical line riding
  // on top of a horizontal one for hundreds of pixels). Up to ±6 px in each
  // axis based on the route's original index in ROUTES — stations move with
  // the route so positioning stays consistent.
  // Color + route assignment. Two modes:
  //   1. Stored mapping (`args.assignment = {rootId: {routeIdx, colorIdx}}`)
  //      wins — gives the user stable visuals across data edits.
  //   2. Anything unmapped falls back to rank-based assignment (longest
  //      project gets palette 0, etc.), but picks the next FREE slot so
  //      a stored mapping never gets overwritten by a fallback.
  // Caller can read the assignment back via the model's `_assignment`
  // map and persist it (App.jsx auto-init on first render).
  const stored = assignment && typeof assignment === 'object' ? assignment : {};
  const usedRoute = new Set();
  const usedColor = new Set();
  // Pre-claim every stored slot first so fallbacks can't collide with them.
  //
  // A stored slot is only honoured once. Plans saved by the old eight-lane
  // board carry duplicates — past eight projects it wrapped to route 0 and
  // wrote that down — and honouring both put two lines on one lane, which
  // the spacing pass then shoved apart: one of them off the top of the map
  // with its title gone, another past the left edge. The first line (longest
  // first, the same order as everything below) keeps the slot; the second is
  // treated as unmapped and gets a free one. Colours likewise, as long as the
  // palette has one left — past that, sharing a colour is unavoidable.
  const staleRoute = new Set();
  const staleColor = new Set();
  sortedLines.forEach(line => {
    const st = stored[line.root.id];
    if (st && Number.isFinite(st.routeIdx)) {
      if (usedRoute.has(st.routeIdx)) staleRoute.add(line.root.id);
      else usedRoute.add(st.routeIdx);
    }
    if (st && Number.isFinite(st.colorIdx)) {
      if (usedColor.has(st.colorIdx)) staleColor.add(line.root.id);
      else usedColor.add(st.colorIdx);
    }
  });
  const nextFreeRoute = () => {
    for (let i = 0; i < routesWithLen.length; i++) {
      if (!usedRoute.has(routesWithLen[i].idx)) return i;
    }
    return 0; // all consumed — wrap, two lines will share a route
  };
  const nextFreeColor = () => {
    for (let i = 0; i < PALETTE.length; i++) if (!usedColor.has(i)) return i;
    return 0;
  };
  const assignmentOut = {};
  const baseAssigned = sortedLines.map((line, rank) => {
    const st = stored[line.root.id];
    let routeRank, colorIdx;
    if (st && Number.isFinite(st.routeIdx) && !staleRoute.has(line.root.id) && routesWithLen.some(r => r.idx === st.routeIdx)) {
      // routesWithLen is sorted by length, find the entry by original idx.
      routeRank = routesWithLen.findIndex(r => r.idx === st.routeIdx);
    } else {
      // Fallback prefers the rank-th routesWithLen slot, but skips any slot
      // already claimed by a stored assignment.
      let pick = rank;
      while (pick < routesWithLen.length && usedRoute.has(routesWithLen[pick].idx)) pick++;
      if (pick >= routesWithLen.length) pick = nextFreeRoute();
      routeRank = pick;
      usedRoute.add(routesWithLen[pick].idx);
    }
    if (st && Number.isFinite(st.colorIdx) && !(staleColor.has(line.root.id) && usedColor.size < PALETTE.length)) {
      colorIdx = st.colorIdx;
    } else {
      let pick = rank;
      while (pick < PALETTE.length && usedColor.has(pick)) pick++;
      if (pick >= PALETTE.length) pick = nextFreeColor();
      colorIdx = pick;
      usedColor.add(pick);
    }
    const routeEntry = routesWithLen[routeRank];
    const color = PALETTE[colorIdx % PALETTE.length];
    assignmentOut[line.root.id] = { routeIdx: routeEntry.idx, colorIdx };
    return { ...line, color, route: routeEntry.wp.map(p => ({ x: p.x, y: p.y })), routeLen: routeEntry.len };
  });
  return { baseAssigned, assignmentOut };
}

export function spaceParallelRoutes(baseAssigned) {
  // ── Parallel-rail spacing pass ───────────────────────────────────────────
  // Hard "minimum distance" constraint between parallel route segments:
  // whenever two horizontal-or-vertical segments of DIFFERENT routes overlap
  // on the shared axis and sit closer than MIN_DIST on the perpendicular
  // axis, both routes get pushed apart by half the deficit each. Two-sided
  // symmetric push avoids the "one route runs over another" bug we hit
  // before. Iterates a few passes; convergence is fast because the push
  // size is exactly the missing gap, not a fixed step.
  const MIN_DIST = 50; // px — segments closer than this are visually glued
  const EPSILON = 0.001; // px — guard for exactly-overlapping segments
  const PARALLEL_TOL = 2; // px — slope tolerance for axis-aligned segments
  const SHARE_TOL = 4; // px — span overlap must exceed this to count
  const DIAG_ANGLE_TOL = 0.45; // ~26° — diagonal pairs within this slope diff count as parallel
  const horiz = (a, b) => Math.abs(a.y - b.y) <= PARALLEL_TOL && Math.abs(b.x - a.x) > 8;
  const vert = (a, b) => Math.abs(a.x - b.x) <= PARALLEL_TOL && Math.abs(b.y - a.y) > 8;
  const overlap1D = (lo1, hi1, lo2, hi2) =>
    Math.min(Math.max(lo1, hi1), Math.max(lo2, hi2)) - Math.max(Math.min(lo1, hi1), Math.min(lo2, hi2));
  // For a diagonal segment, return its angle in radians and the perpendicular
  // unit vector. Used to detect close-parallel diagonals between routes.
  const segAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const perpFrom = (a, b) => {
    const ang = segAngle(a, b);
    return { px: -Math.sin(ang), py: Math.cos(ang) };
  };
  // Point-to-line distance for two parallel-ish segments (use midpoint of b
  // projected onto a's perpendicular).
  const perpDist = (a1, a2, b1, b2) => {
    const ang = segAngle(a1, a2);
    const nx = -Math.sin(ang),
      ny = Math.cos(ang);
    const bmx = (b1.x + b2.x) / 2,
      bmy = (b1.y + b2.y) / 2;
    return (bmx - a1.x) * nx + (bmy - a1.y) * ny;
  };

  for (let pass = 0; pass < 10; pass++) {
    const adjust = baseAssigned.map(() => ({ dx: 0, dy: 0 }));
    let collisionCount = 0;
    for (let i = 0; i < baseAssigned.length; i++) {
      const ri = baseAssigned[i].route;
      for (let j = i + 1; j < baseAssigned.length; j++) {
        const rj = baseAssigned[j].route;
        for (let si = 1; si < ri.length; si++) {
          const a1 = ri[si - 1],
            a2 = ri[si];
          const aH = horiz(a1, a2),
            aV = vert(a1, a2);
          if (!aH && !aV) continue;
          for (let sj = 1; sj < rj.length; sj++) {
            const b1 = rj[sj - 1],
              b2 = rj[sj];
            if (aH && horiz(b1, b2)) {
              const sx = overlap1D(a1.x, a2.x, b1.x, b2.x);
              if (sx <= SHARE_TOL) continue;
              const dy = a1.y - b1.y;
              if (Math.abs(dy) >= MIN_DIST) continue;
              const sign = dy === 0 ? 1 : Math.sign(dy);
              const push = (MIN_DIST - Math.abs(dy) + EPSILON) / 2;
              adjust[i].dy += sign * push;
              adjust[j].dy -= sign * push;
              collisionCount++;
              break;
            } else if (aV && vert(b1, b2)) {
              const sy = overlap1D(a1.y, a2.y, b1.y, b2.y);
              if (sy <= SHARE_TOL) continue;
              const dx = a1.x - b1.x;
              if (Math.abs(dx) >= MIN_DIST) continue;
              const sign = dx === 0 ? 1 : Math.sign(dx);
              const push = (MIN_DIST - Math.abs(dx) + EPSILON) / 2;
              adjust[i].dx += sign * push;
              adjust[j].dx -= sign * push;
              collisionCount++;
              break;
            } else if (!aH && !aV) {
              // Diagonal vs diagonal. Compare angles, fall through if too
              // different. Otherwise use perpendicular signed distance.
              const angA = segAngle(a1, a2);
              const angB = segAngle(b1, b2);
              // Normalize to [-π/2, π/2] so opposite-direction same line counts.
              const da = ((angA - angB + Math.PI * 1.5) % Math.PI) - Math.PI / 2;
              if (Math.abs(da) > DIAG_ANGLE_TOL) continue;
              const dist = perpDist(a1, a2, b1, b2);
              if (Math.abs(dist) >= MIN_DIST) continue;
              // Need at least some overlap along the segment direction.
              const along = (px, py) => (px - a1.x) * Math.cos(angA) + (py - a1.y) * Math.sin(angA);
              const aLen = Math.hypot(a2.x - a1.x, a2.y - a1.y);
              const tA0 = along(b1.x, b1.y),
                tA1 = along(b2.x, b2.y);
              const tLo = Math.min(tA0, tA1),
                tHi = Math.max(tA0, tA1);
              const proj = Math.min(tHi, aLen) - Math.max(tLo, 0);
              if (proj <= SHARE_TOL) continue;
              const sign = dist === 0 ? 1 : Math.sign(dist);
              const push = (MIN_DIST - Math.abs(dist) + EPSILON) / 2;
              const { px, py } = perpFrom(a1, a2);
              // a's side of the line gets pushed by -sign*push*perp, b by +sign*push*perp.
              // Wait: dist > 0 means b is on the +perp side of a. To push apart,
              // move a by -sign*push along perp, b by +sign*push.
              adjust[i].dx += -sign * push * px;
              adjust[i].dy += -sign * push * py;
              adjust[j].dx += sign * push * px;
              adjust[j].dy += sign * push * py;
              collisionCount++;
              break;
            }
          }
        }
      }
    }
    if (collisionCount === 0) break;
    adjust.forEach((d, li) => {
      if (!d.dx && !d.dy) return;
      baseAssigned[li].route = baseAssigned[li].route.map(p => ({ x: p.x + d.dx, y: p.y + d.dy }));
    });
  }
}
