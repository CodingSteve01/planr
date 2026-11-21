import { NODE_W, NODE_H, GAP_X, GAP_Y, TREE_GAP, LEVEL_GAP } from './geometry.js';

function buildChildMap(tree) {
  const map = {};
  tree.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (!map[pid]) map[pid] = [];
    map[pid].push(r);
  });
  Object.values(map).forEach(items => items.sort((a, b) => a.id.localeCompare(b.id)));
  return map;
}

function layoutSubtree(node, childMap) {
  const children = childMap[node.id] || [];
  const pos = {};

  if (!children.length) {
    pos[node.id] = { x: 0, y: 0 };
    return { pos, w: NODE_W, h: NODE_H };
  }

  // If ALL children are leaves → compact 2-column layout (like old L2 groups)
  const allLeaves = children.every(c => !childMap[c.id]?.length);
  if (allLeaves) {
    const half = Math.ceil(children.length / 2);
    const left = children.slice(0, half),
      right = children.slice(half);
    const cy = NODE_H + LEVEL_GAP;
    left.forEach((c, i) => {
      pos[c.id] = { x: 0, y: cy + i * (NODE_H + GAP_Y) };
    });
    const rx = right.length ? NODE_W + GAP_X : 0;
    right.forEach((c, i) => {
      pos[c.id] = { x: rx, y: cy + i * (NODE_H + GAP_Y) };
    });
    const gw = right.length ? NODE_W * 2 + GAP_X : NODE_W;
    const lastY = cy + (Math.max(left.length, right.length) - 1) * (NODE_H + GAP_Y) + NODE_H;
    pos[node.id] = { x: (gw - NODE_W) / 2, y: 0 };
    return { pos, w: gw, h: lastY };
  }

  // Otherwise: children as subtrees — use multi-row grid if too many
  const childLayouts = children.map(child => layoutSubtree(child, childMap));

  // Determine optimal number of columns: target ~2:1 aspect ratio
  const avgW = childLayouts.reduce((s, l) => s + l.w, 0) / childLayouts.length;
  const avgH = childLayouts.reduce((s, l) => s + l.h, 0) / childLayouts.length;
  let cols = childLayouts.length;
  if (childLayouts.length > 3) {
    // Try different column counts, pick the one closest to 2:1
    let bestCols = cols,
      bestRatio = Infinity;
    for (let c = 2; c <= Math.min(childLayouts.length, 6); c++) {
      const rows = Math.ceil(childLayouts.length / c);
      const estW = c * (avgW + TREE_GAP);
      const estH = rows * (avgH + LEVEL_GAP);
      const ratio = estW / Math.max(estH, 1);
      const penalty = Math.abs(Math.log(ratio / 2));
      if (penalty < bestRatio) {
        bestRatio = penalty;
        bestCols = c;
      }
    }
    cols = bestCols;
  }

  // Place children in grid rows
  const rows = [];
  for (let i = 0; i < childLayouts.length; i += cols) {
    rows.push(childLayouts.slice(i, i + cols));
  }

  let maxRowW = 0;
  const rowMeta = rows.map(row => {
    const rowW = row.reduce((s, l) => s + l.w + TREE_GAP, -TREE_GAP);
    const rowH = Math.max(...row.map(l => l.h));
    maxRowW = Math.max(maxRowW, rowW);
    return { rowW, rowH };
  });

  const cy = NODE_H + LEVEL_GAP;
  let yOff = 0;
  rows.forEach((row, ri) => {
    const { rowW, rowH } = rowMeta[ri];
    const rowXOff = (maxRowW - rowW) / 2; // center each row
    let x = rowXOff;
    row.forEach(layout => {
      Object.entries(layout.pos).forEach(([id, p]) => {
        pos[id] = { x: x + p.x, y: cy + yOff + p.y };
      });
      x += layout.w + TREE_GAP;
    });
    yOff += rowH + LEVEL_GAP;
  });

  const width = Math.max(NODE_W, maxRowW);
  const height = cy + yOff - LEVEL_GAP;
  pos[node.id] = { x: (width - NODE_W) / 2, y: 0 };
  return { pos, w: width, h: height };
}

// ── Flip a tree vertically (parent at bottom instead of top) ────────────────
function flipTree(t) {
  const flipped = {};
  Object.entries(t.pos).forEach(([id, p]) => {
    flipped[id] = { x: p.x, y: t.h - p.y - NODE_H };
  });
  return { ...t, pos: flipped, flipped: true };
}

// ── Bin-pack trees with TD/BU flip optimization ─────────────────────────────
function binPackTrees(trees) {
  const sorted = [...trees].sort((a, b) => b.w * b.h - a.w * a.h);
  const placed = [];

  sorted.forEach(t => {
    const variants = [t, flipTree(t)];
    const cands = [{ x: 0, y: 0 }];
    placed.forEach(p => {
      cands.push({ x: p.x + p.w + TREE_GAP, y: p.y });
      cands.push({ x: p.x, y: p.y + p.h + TREE_GAP });
      cands.push({ x: p.x + p.w + TREE_GAP, y: 0 });
      cands.push({ x: 0, y: p.y + p.h + TREE_GAP });
      placed.forEach(q => {
        if (p === q) return;
        cands.push({ x: p.x + p.w + TREE_GAP, y: q.y + q.h + TREE_GAP });
        cands.push({ x: p.x, y: q.y + q.h + TREE_GAP });
      });
    });

    let bestX = 0,
      bestY = 0,
      bestScore = Infinity,
      bestVariant = t;
    variants.forEach(v => {
      cands.forEach(c => {
        if (c.x < 0 || c.y < 0) return;
        const overlaps = placed.some(
          p => c.x < p.x + p.w + TREE_GAP && c.x + v.w + TREE_GAP > p.x && c.y < p.y + p.h + TREE_GAP && c.y + v.h + TREE_GAP > p.y,
        );
        if (overlaps) return;
        const bx = Math.max(c.x + v.w, ...placed.map(p => p.x + p.w));
        const by = Math.max(c.y + v.h, ...placed.map(p => p.y + p.h));
        const ratio = bx / Math.max(by, 1);
        const ratioPenalty = 1 + Math.abs(Math.log(ratio / 2)) * 3;
        const score = bx * by * ratioPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestX = c.x;
          bestY = c.y;
          bestVariant = v;
        }
      });
    });

    placed.push({ x: bestX, y: bestY, w: bestVariant.w, h: bestVariant.h, tree: bestVariant });
  });

  // Post-process: flip trees in the bottom half to BU
  if (placed.length > 1) {
    const medianY = placed.reduce((s, p) => s + p.y, 0) / placed.length;
    placed.forEach(p => {
      if (p.y > medianY && !p.tree.flipped) {
        const flipped = {};
        Object.entries(p.tree.pos).forEach(([id, np]) => {
          flipped[id] = { x: np.x, y: p.tree.h - np.y - NODE_H };
        });
        p.tree = { ...p.tree, pos: flipped, flipped: true };
      }
    });
  }

  // Compaction: push each tree as far up-left as possible (bounding-box, clean gaps)
  const G = TREE_GAP;
  for (let pass = 0; pass < 3; pass++) {
    placed.forEach((t, i) => {
      const others = placed.filter((_, j) => j !== i);
      for (let step = G * 2; step > 0; step = Math.floor(step / 2)) {
        while (t.y - step >= 0) {
          const ny = t.y - step;
          const ok = !others.some(o => t.x < o.x + o.w + G && t.x + t.w + G > o.x && ny < o.y + o.h + G && ny + t.h + G > o.y);
          if (ok) t.y = ny;
          else break;
        }
      }
      for (let step = G * 2; step > 0; step = Math.floor(step / 2)) {
        while (t.x - step >= 0) {
          const nx = t.x - step;
          const ok = !others.some(o => nx < o.x + o.w + G && nx + t.w + G > o.x && t.y < o.y + o.h + G && t.y + t.h + G > o.y);
          if (ok) t.x = nx;
          else break;
        }
      }
    });
  }

  return placed;
}

export function computeLayout(tree) {
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const childMap = buildChildMap(tree);
  const roots = (childMap[''] || []).filter(r => !r.id.includes('.'));

  // Layout each root tree recursively (N-level), then bin-pack
  const trees = roots.map(root => ({ id: root.id, ...layoutSubtree(root, childMap) }));
  const packed = binPackTrees(trees);

  const pos = {};
  packed.forEach(p => {
    Object.entries(p.tree.pos).forEach(([id, np]) => {
      pos[id] = { x: p.x + np.x, y: p.y + np.y };
    });
  });

  // Orphans
  const totalH = packed.length ? Math.max(...packed.map(p => p.y + p.h)) : 0;
  let oy = totalH + NODE_H;
  tree
    .filter(r => !pos[r.id])
    .forEach(r => {
      pos[r.id] = { x: 0, y: oy };
      oy += NODE_H + GAP_Y;
    });

  const edges = [];
  tree.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid] && pos[pid] && pos[r.id]) {
      edges.push({ id: `h|${pid}|${r.id}`, from: pid, to: r.id, isHier: true });
    }
  });
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      if (iMap[d] && pos[d] && pos[r.id]) {
        edges.push({ id: `d|${r.id}|${d}`, from: r.id, to: d, isHier: false, depOwner: r.id, depTarget: d, isSoft: false });
      }
    });
    (r.softDeps || []).forEach(d => {
      if (iMap[d] && pos[d] && pos[r.id]) {
        edges.push({ id: `s|${r.id}|${d}`, from: r.id, to: d, isHier: false, depOwner: r.id, depTarget: d, isSoft: true });
      }
    });
  });

  return { pos, edges };
}
