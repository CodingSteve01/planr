import { clamp } from './format.js';

// ─── Metro-specific helpers ───────────────────────────────────────────────────

/** Compute total pixel length of a route (sum of all segment lengths). */
function routeLength(waypoints) {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/** Return the {x, y} point at fraction t (0–1) along the route. */
function pointAtFraction(waypoints, t) {
  if (waypoints.length === 1) return { ...waypoints[0] };
  const total = routeLength(waypoints);
  const target = clamp(t, 0, 1) * total;
  let traveled = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (traveled + segLen >= target || i === waypoints.length - 1) {
      const rem = target - traveled;
      const frac = segLen > 0 ? rem / segLen : 0;
      return {
        x: waypoints[i - 1].x + dx * frac,
        y: waypoints[i - 1].y + dy * frac,
      };
    }
    traveled += segLen;
  }
  return { ...waypoints[waypoints.length - 1] };
}

/** Build an SVG path `d` attribute from waypoints. */
// How far back from a corner the curve starts. A jog is a 36-unit vertical
// drop, so 16 leaves a few units of straight between the two curves and the
// bend reads as one S rather than two kinks.
const ROUTE_CORNER_R = 16;
// A polyline with rounded corners. Metro maps draw curves, not mitres, and
// the difference is not decoration: a 45° diagonal reads as a line going
// somewhere else, while a curve reads as the same line continuing. At each
// interior vertex back off `r` along both adjacent segments (never more than
// half of either, so short legs degrade gracefully) and put a quadratic
// through the vertex itself.
//
// The travelled overlay goes through here too, on its own clipped point list,
// so the two paths curve identically where they share a corner.
function polylineToPath(points, r = ROUTE_CORNER_R) {
  const p = points.filter((q, i) => i === 0 || q.x !== points[i - 1].x || q.y !== points[i - 1].y);
  if (!p.length) return null;
  if (p.length === 1) return `M ${p[0].x} ${p[0].y}`;
  const n = v => Number(v.toFixed(1));
  if (p.length === 2 || r <= 0) {
    return (
      `M ${n(p[0].x)} ${n(p[0].y)} ` +
      p
        .slice(1)
        .map(q => `L ${n(q.x)} ${n(q.y)}`)
        .join(' ')
    );
  }
  const out = [`M ${n(p[0].x)} ${n(p[0].y)}`];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1],
      b = p[i],
      c = p[i + 1];
    const d1 = Math.hypot(b.x - a.x, b.y - a.y);
    const d2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (!d1 || !d2) continue;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    out.push(`L ${n(b.x + ((a.x - b.x) / d1) * rr)} ${n(b.y + ((a.y - b.y) / d1) * rr)}`);
    out.push(`Q ${n(b.x)} ${n(b.y)} ${n(b.x + ((c.x - b.x) / d2) * rr)} ${n(b.y + ((c.y - b.y) / d2) * rr)}`);
  }
  const last = p[p.length - 1];
  out.push(`L ${n(last.x)} ${n(last.y)}`);
  return out.join(' ');
}

function waypointsToPath(waypoints) {
  return polylineToPath(waypoints);
}

/**
 * Build an SVG path `d` for the portion of a route from t=0 to t=fraction.
 * Splits at the exact fractional point and returns only the traveled portion.
 */
function partialPath(waypoints, fraction, startFraction = 0) {
  if (fraction <= startFraction) return null;
  const total = routeLength(waypoints);
  const target = clamp(fraction, 0, 1) * total;
  const startTarget = clamp(startFraction, 0, 1) * total;

  // Two-pass: when startFraction > 0, find the start point on the route, emit
  // an `M` at that point, then accumulate intermediate vertices and the end
  // point.
  if (startFraction > 0) {
    const startPt = pointAtFraction(waypoints, startFraction);
    const parts = [{ x: startPt.x, y: startPt.y }];
    let traveled = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x;
      const dy = waypoints[i].y - waypoints[i - 1].y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const segStart = traveled;
      const segEnd = traveled + segLen;
      // Skip segments that lie entirely before start
      if (segEnd <= startTarget) {
        traveled = segEnd;
        continue;
      }
      // Final segment containing the target — emit and stop
      if (segEnd >= target) {
        const rem = target - traveled;
        const frac = segLen > 0 ? rem / segLen : 0;
        const ex = waypoints[i - 1].x + dx * frac;
        const ey = waypoints[i - 1].y + dy * frac;
        parts.push({ x: ex, y: ey });
        return polylineToPath(parts);
      }
      // Mid segment, fully traversed in window — emit endpoint
      // (segStart may be < startTarget but we already emitted M at start)
      void segStart;
      parts.push({ x: waypoints[i].x, y: waypoints[i].y });
      traveled = segEnd;
    }
    return polylineToPath(parts);
  }

  const parts = [{ x: waypoints[0].x, y: waypoints[0].y }];
  let traveled = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (traveled + segLen >= target) {
      const rem = target - traveled;
      const frac = segLen > 0 ? rem / segLen : 0;
      const ex = waypoints[i - 1].x + dx * frac;
      const ey = waypoints[i - 1].y + dy * frac;
      parts.push({ x: ex, y: ey });
      break;
    }

    parts.push({ x: waypoints[i].x, y: waypoints[i].y });
    traveled += segLen;

    if (traveled >= target) break;
  }

  return polylineToPath(parts);
}

export { routeLength, pointAtFraction, waypointsToPath, partialPath };
