import { clamp } from './format.js';
import { ROUTE_T_LO, ROUTE_T_HI } from './board.js';
import { routeLength, pointAtFraction } from './geometry.js';

const STATION_MIN_GAP = 21; // px — two dots closer than this read as one
const STATION_T_EPS = 0.004; // keep a hair of daylight between same-line stops

function separateStationsAcrossLines(lines) {
  if (!lines || lines.length < 2) return;

  // Flat view of every station, with the bounds it may move within.
  const entries = [];
  lines.forEach((line, lineIdx) => {
    const ordered = [...line.majorStations, ...line.minorStations].sort((a, b) => a.t - b.t);
    const routeLen = Math.max(1, routeLength(line.route));
    ordered.forEach((station, idx) => {
      const prev = ordered[idx - 1];
      const next = ordered[idx + 1];
      // Own side of the train: a done station must not slide past it, and an
      // unfinished one must not slide behind it.
      const bandLo = station.allDone ? ROUTE_T_LO : Math.max(ROUTE_T_LO, line.trainT);
      const bandHi = station.allDone ? Math.min(ROUTE_T_HI, line.trainT) : ROUTE_T_HI;
      entries.push({
        station,
        lineIdx,
        route: line.route,
        routeLen,
        lo: Math.max(bandLo, prev ? prev.t + STATION_T_EPS : bandLo),
        hi: Math.min(bandHi, next ? next.t - STATION_T_EPS : bandHi),
      });
    });
  });
  if (entries.length < 2) return;

  const tangentAt = (route, t) => {
    const h = 0.004;
    const a = pointAtFraction(route, clamp(t - h, 0, 1));
    const b = pointAtFraction(route, clamp(t + h, 0, 1));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { tx: (b.x - a.x) / len, ty: (b.y - a.y) / len };
  };

  for (let pass = 0; pass < 6; pass++) {
    let moved = 0;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.lineIdx === b.lineIdx) continue;
        const dx = b.station.x - a.station.x;
        const dy = b.station.y - a.station.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= STATION_MIN_GAP) continue;

        // Split the deficit between the two, each along its own route.
        const need = (STATION_MIN_GAP - dist) / 2 + 0.5;
        const ux = dist > 0.001 ? dx / dist : 1;
        const uy = dist > 0.001 ? dy / dist : 0;
        [
          [a, -1],
          [b, 1],
        ].forEach(([entry, sign]) => {
          const { tx, ty } = tangentAt(entry.route, entry.station.t);
          // How much of the push direction actually runs along this route?
          const along = sign * (ux * tx + uy * ty);
          if (Math.abs(along) < 0.15) return; // route runs across the push — cannot help
          const deltaT = (need * Math.sign(along)) / entry.routeLen;
          const nextT = clamp(entry.station.t + deltaT, entry.lo, entry.hi);
          if (Math.abs(nextT - entry.station.t) < 1e-6) return;
          entry.station.t = nextT;
          const pt = pointAtFraction(entry.route, nextT);
          entry.station.x = pt.x;
          entry.station.y = pt.y;
          moved++;
        });
      }
    }
    if (!moved) break;
  }
}

export { separateStationsAcrossLines };
