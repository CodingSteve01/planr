import { NODE_W, NODE_H, LEVEL_GAP } from './geometry.js';

// ── Hierarchy edge: adapts to TD (parent above) or BU (parent below) ────────
export function hierPath(fp, tp) {
  const px = fp.x + NODE_W / 2,
    cx = tp.x + NODE_W / 2;
  if (fp.y < tp.y) {
    // TD: parent above child — exit bottom, enter top
    const busY = fp.y + NODE_H + LEVEL_GAP / 2;
    return `M${px},${fp.y + NODE_H} L${px},${busY} L${cx},${busY} L${cx},${tp.y}`;
  } else {
    // BU: parent below child — exit top, enter bottom
    const busY = fp.y - LEVEL_GAP / 2;
    return `M${px},${fp.y} L${px},${busY} L${cx},${busY} L${cx},${tp.y + NODE_H}`;
  }
}

// ── Dep edge: obstacle-aware orthogonal routing ─────────────────────────────
export function depPath(fp, tp, allBoxes) {
  const PAD = 6,
    ARR = 8;
  const fcx = fp.x + NODE_W / 2,
    fcy = fp.y + NODE_H / 2;
  const tcx = tp.x + NODE_W / 2,
    tcy = tp.y + NODE_H / 2;
  const dx = tcx - fcx,
    dy = tcy - fcy;

  // Exit point from source (side closest to target)
  const exitR = { x: fp.x + NODE_W, y: fcy };
  const exitL = { x: fp.x, y: fcy };
  const exitB = { x: fcx, y: fp.y + NODE_H };
  const exitT = { x: fcx, y: fp.y };

  // Entry point on target — from the side the LAST segment approaches
  const enterL = { x: tp.x - ARR, y: tcy };
  const enterR = { x: tp.x + NODE_W + ARR, y: tcy };
  const enterT = { x: tcx, y: tp.y - ARR };
  const enterB = { x: tcx, y: tp.y + NODE_H + ARR };

  function hitsNode(ax, ay, bx, by) {
    const lx = Math.min(ax, bx) - PAD,
      rx = Math.max(ax, bx) + PAD;
    const ty = Math.min(ay, by) - PAD,
      by2 = Math.max(ay, by) + PAD;
    return allBoxes.some(b => {
      if (b.x === fp.x && b.y === fp.y) return false;
      if (b.x === tp.x && b.y === tp.y) return false;
      return b.x < rx && b.x + NODE_W > lx && b.y < by2 && b.y + NODE_H > ty;
    });
  }

  function route(exit, mid, enter) {
    const pts = mid ? [exit, ...mid, enter] : [exit, enter];
    let hits = 0;
    for (let i = 0; i < pts.length - 1; i++) if (hitsNode(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)) hits++;
    const path = 'M' + pts.map(p => `${p.x},${p.y}`).join(' L');
    const lp = pts[Math.floor(pts.length / 2)];
    return { path, hits, labelPt: { x: lp.x, y: lp.y - 8 } };
  }

  const routes = [];
  const mx = (fcx + tcx) / 2,
    my = (fcy + tcy) / 2;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Mostly horizontal
    const ex = dx > 0 ? exitR : exitL;
    const en = dx > 0 ? enterL : enterR; // enter from the side facing the source
    routes.push(
      route(
        ex,
        [
          { x: mx, y: ex.y },
          { x: mx, y: en.y },
        ],
        en,
      ),
    );
    // Also try vertical mid
    routes.push(
      route(
        exitB,
        [
          { x: exitB.x, y: my },
          { x: enterT.x, y: my },
        ],
        enterT,
      ),
    );
  } else {
    // Mostly vertical
    const ex = dy > 0 ? exitB : exitT;
    const en = dy > 0 ? enterT : enterB;
    routes.push(
      route(
        ex,
        [
          { x: ex.x, y: my },
          { x: en.x, y: my },
        ],
        en,
      ),
    );
    // Also try horizontal mid
    routes.push(
      route(
        exitR,
        [
          { x: mx, y: exitR.y },
          { x: mx, y: enterL.y },
        ],
        enterL,
      ),
    );
  }

  // Via top margin — enter from TOP
  const topY = Math.min(fp.y, tp.y) - 30;
  routes.push(
    route(
      exitT,
      [
        { x: exitT.x, y: topY },
        { x: enterT.x, y: topY },
      ],
      enterT,
    ),
  );

  // Via bottom margin — enter from BOTTOM
  const botY = Math.max(fp.y + NODE_H, tp.y + NODE_H) + 30;
  routes.push(
    route(
      exitB,
      [
        { x: exitB.x, y: botY },
        { x: enterB.x, y: botY },
      ],
      enterB,
    ),
  );

  // Via right margin — enter from RIGHT
  const rightX = Math.max(fp.x + NODE_W, tp.x + NODE_W) + 25;
  routes.push(
    route(
      exitR,
      [
        { x: rightX, y: exitR.y },
        { x: rightX, y: enterR.y },
      ],
      enterR,
    ),
  );

  // Via left margin — enter from LEFT
  const leftX = Math.min(fp.x, tp.x) - 25;
  routes.push(
    route(
      exitL,
      [
        { x: leftX, y: exitL.y },
        { x: leftX, y: enterL.y },
      ],
      enterL,
    ),
  );

  routes.sort((a, b) => a.hits - b.hits || a.path.length - b.path.length);
  return routes[0];
}
