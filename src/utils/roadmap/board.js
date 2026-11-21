// ─── Fixed metro route network (1400×800 canvas) ─────────────────────────────
// Every route runs WEST → EAST, and that is the whole point rather than a
// style choice. A station's place along its route IS the project's progress
// (see progressToRouteT), so the reading has to be "further right = further
// on" for every line on the map at once. The routes this replaced were a
// hand-drawn metro network: one ran right-to-left, one ran vertically, one
// was a U-shape doubling back on itself. On those, a line's own geometry
// contradicted the quantity it was drawing, and you could not compare two
// projects by looking — which is the only thing a portfolio map is for.
//
// Each route is a lane with one vertical jog, and the jogs sit at different x
// per lane so it still reads as a network rather than a bar chart. The jog is
// vertical rather than diagonal because polylineToPath rounds every corner:
// two 16-unit curves either side of a 36-unit drop meet as a single S, which
// is what a metro map draws. A 45° diagonal reads as a line going somewhere
// else; a curve reads as the same line continuing.
// The board the lines run on.
//
// It was a literal table of eight lanes, and two things were wrong with that.
//
// A plan with more than eight projects ran out: `nextFreeRoute` wrapped to
// route 0 with the comment "two lines will share a route", and the spacing
// pass (now in assignment.js) then found two routes sitting exactly on top of each other and
// shoved them apart — whole routes, horizontally as well as vertically, ten
// passes of it. The result was the reported "looks odd": lines no longer
// starting at a common left edge, a lane pushed off the top with its title
// gone. The filters made it come and go because they change how many
// projects there are to draw.
//
// And the table contradicted itself. Seven lanes jogged DOWN and the eighth
// jogged UP, so lane 6's jog at y=668 and lane 7's at y=688 sat 20px apart —
// under the 50px minimum — and collided every single time both were in use.
// The spacing pass was cleaning up after the board rather than after the data.
//
// Generated instead: one lane per line, always, every jog in the same
// direction. Lane i runs at y = 80 + 92i and jogs down 36 in the middle, so
// a jog clears the next lane by 56 and the next jog by 92. Nothing on this
// board is ever closer than the minimum, which leaves the spacing pass as
// what it should have been — a guard that normally does nothing.
const LANE_Y0 = 80; // first lane's y
const LANE_GAP = 92; // between lanes
const LANE_JOG = 36; // how far the middle of a lane drops
const LANE_X0 = 60; // where every line starts
const LANE_X1 = 1340; // and ends
const LANE_MIN = 8; // keep the familiar board for small plans
// Where each lane's jog sits. Staggered so the vertical segments of nearby
// lanes do not line up into a column; the cycle is deliberately not a
// divisor of the lane count, so it takes a while to repeat.
const JOG_STARTS = [300, 420, 200, 540, 320, 620, 260, 460, 380, 240, 560, 340];
const JOG_WIDTH = 480;

export function buildRoutes(count) {
  const lanes = Math.max(LANE_MIN, count || 0);
  const out = [];
  for (let i = 0; i < lanes; i++) {
    const y = LANE_Y0 + LANE_GAP * i;
    const jogY = y + LANE_JOG;
    const xa = JOG_STARTS[i % JOG_STARTS.length];
    const xb = Math.min(xa + JOG_WIDTH, LANE_X1 - 120);
    out.push([
      { x: LANE_X0, y },
      { x: xa, y },
      { x: xa, y: jogY },
      { x: xb, y: jogY },
      { x: xb, y },
      { x: LANE_X1, y },
    ]);
  }
  return out;
}

/** How tall the board is for a given number of lines, with room to breathe. */
export function boardHeight(count) {
  const lanes = Math.max(LANE_MIN, count || 0);
  return LANE_Y0 + LANE_GAP * (lanes - 1) + LANE_JOG + 60;
}
// ─── Canvas dimensions ────────────────────────────────────────────────────────
const SVG_W = 1400;
// The tallest board the fixed eight lanes need. `boardHeight()` is the real
// answer once the line count is known; this is the floor everything that has
// no line count to hand can use.
const SVG_H = boardHeight(LANE_MIN);
const ROUTE_T_LO = 0.04;
const ROUTE_T_HI = 0.96;

export { SVG_W, SVG_H, ROUTE_T_LO, ROUTE_T_HI };
