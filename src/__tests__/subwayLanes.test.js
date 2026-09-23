// Reported: switching the archived projects back on makes the subway map
// "burst".
//
// The board was a literal table of eight lanes. A plan with more than eight
// projects ran out of them — `nextFreeRoute` wrapped to route 0 with the
// comment "two lines will share a route" — and the spacing pass then found
// two routes sitting exactly on top of each other and shoved them apart. It
// moves WHOLE routes, horizontally as well as vertically, ten passes of it,
// so the lines stopped starting at a common left edge and one was pushed far
// enough up to lose its title off the top of the canvas. Six archived
// projects coming back is what tipped the count past eight.
//
// The table also contradicted itself: seven lanes jogged down and the eighth
// jogged up, so lane 6's jog at y=668 and lane 7's at y=688 sat 20px apart —
// under the pass's own 50px minimum — and collided every time both were in
// use, with nothing added to the plan at all.
//
// The board is generated now: one lane per line, always, every jog the same
// way. The spacing pass becomes what it should have been — a guard that
// normally has nothing to do.
import { describe, it, expect } from 'vitest';
import { buildRoutes, boardHeight } from '../utils/roadmap.js';

const MIN_DIST = 50;  // the spacing pass's own threshold
const seg = route => route.slice(1).map((b, i) => [route[i], b]);
const isHoriz = ([a, b]) => Math.abs(a.y - b.y) <= 2 && Math.abs(b.x - a.x) > 8;
const isVert = ([a, b]) => Math.abs(a.x - b.x) <= 2 && Math.abs(b.y - a.y) > 8;
const span1D = (lo1, hi1, lo2, hi2) =>
  Math.min(Math.max(lo1, hi1), Math.max(lo2, hi2)) - Math.max(Math.min(lo1, hi1), Math.min(lo2, hi2));

describe('the board', () => {
  it('keeps the familiar eight lanes for a small plan', () => {
    expect(buildRoutes(3)).toHaveLength(8);
    expect(buildRoutes(8)).toHaveLength(8);
  });

  it('grows a lane for every line, so none is ever shared', () => {
    // The case reported: the archived projects come back and there are more
    // projects than lanes.
    expect(buildRoutes(14)).toHaveLength(14);
    const ids = new Set(buildRoutes(14).map(r => r[0].y));
    expect(ids.size, 'two lanes start at the same height').toBe(14);
  });

  it('starts and ends every line at the same two edges', () => {
    for (const route of buildRoutes(14)) {
      expect(route[0].x).toBe(60);
      expect(route[route.length - 1].x).toBe(1340);
      expect(route[route.length - 1].y).toBe(route[0].y);
    }
  });

  it.each([8, 9, 14, 20])('has nothing closer than the spacing minimum at %i lines', count => {
    const routes = buildRoutes(count);
    const tooClose = [];
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        for (const a of seg(routes[i])) {
          for (const b of seg(routes[j])) {
            if (isHoriz(a) && isHoriz(b)) {
              if (span1D(a[0].x, a[1].x, b[0].x, b[1].x) > 4 && Math.abs(a[0].y - b[0].y) < MIN_DIST) {
                tooClose.push(`lanes ${i}/${j} horizontal at y=${a[0].y} and ${b[0].y}`);
              }
            } else if (isVert(a) && isVert(b)) {
              if (span1D(a[0].y, a[1].y, b[0].y, b[1].y) > 4 && Math.abs(a[0].x - b[0].x) < MIN_DIST) {
                tooClose.push(`lanes ${i}/${j} vertical at x=${a[0].x} and ${b[0].x}`);
              }
            }
          }
        }
      }
    }
    expect(tooClose, `segments the spacing pass would push apart:\n${tooClose.join('\n')}`).toEqual([]);
  });

  it('is tall enough for the lanes it just built', () => {
    for (const count of [8, 9, 14, 20]) {
      const lowest = Math.max(...buildRoutes(count).flatMap(r => r.map(p => p.y)));
      expect(boardHeight(count)).toBeGreaterThan(lowest);
    }
  });
});
