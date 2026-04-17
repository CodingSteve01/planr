import { useState, useRef, useEffect, useMemo } from 'react';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

const NODE_W = 130;
const NODE_H = 44;
const GAP_X = 10;
const GAP_Y = 10;
const TREE_GAP = 24;
const LEVEL_GAP = 20; // vertical gap between parent and children levels

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
  const allLeaves = children.every(c => !(childMap[c.id]?.length));
  if (allLeaves) {
    const half = Math.ceil(children.length / 2);
    const left = children.slice(0, half), right = children.slice(half);
    const cy = NODE_H + LEVEL_GAP;
    left.forEach((c, i) => { pos[c.id] = { x: 0, y: cy + i * (NODE_H + GAP_Y) }; });
    const rx = right.length ? NODE_W + GAP_X : 0;
    right.forEach((c, i) => { pos[c.id] = { x: rx, y: cy + i * (NODE_H + GAP_Y) }; });
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
    let bestCols = cols, bestRatio = Infinity;
    for (let c = 2; c <= Math.min(childLayouts.length, 6); c++) {
      const rows = Math.ceil(childLayouts.length / c);
      const estW = c * (avgW + TREE_GAP);
      const estH = rows * (avgH + LEVEL_GAP);
      const ratio = estW / Math.max(estH, 1);
      const penalty = Math.abs(Math.log(ratio / 2));
      if (penalty < bestRatio) { bestRatio = penalty; bestCols = c; }
    }
    cols = bestCols;
  }

  // Place children in grid rows
  const rows = [];
  for (let i = 0; i < childLayouts.length; i += cols) {
    rows.push(childLayouts.slice(i, i + cols));
  }

  let maxRowW = 0;
  let totalH = 0;
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

// ── Node-level overlap check (tighter than bounding box) ────────────────────
function nodesOverlap(treeA, ax, ay, treeB, bx, by) {
  const gap = TREE_GAP / 2;
  const nodesA = Object.values(treeA.pos);
  const nodesB = Object.values(treeB.pos);
  return nodesA.some(a => nodesB.some(b =>
    ax + a.x < bx + b.x + NODE_W + gap && ax + a.x + NODE_W + gap > bx + b.x &&
    ay + a.y < by + b.y + NODE_H + gap && ay + a.y + NODE_H + gap > by + b.y
  ));
}

// ── Bin-pack trees with TD/BU flip optimization ─────────────────────────────
function binPackTrees(trees) {
  const sorted = [...trees].sort((a, b) => (b.w * b.h) - (a.w * a.h));
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

    let bestX = 0, bestY = 0, bestScore = Infinity, bestVariant = t;
    variants.forEach(v => {
      cands.forEach(c => {
        if (c.x < 0 || c.y < 0) return;
        const overlaps = placed.some(p =>
          c.x < p.x + p.w + TREE_GAP && c.x + v.w + TREE_GAP > p.x &&
          c.y < p.y + p.h + TREE_GAP && c.y + v.h + TREE_GAP > p.y
        );
        if (overlaps) return;
        const bx = Math.max(c.x + v.w, ...placed.map(p => p.x + p.w));
        const by = Math.max(c.y + v.h, ...placed.map(p => p.y + p.h));
        const ratio = bx / Math.max(by, 1);
        const ratioPenalty = 1 + Math.abs(Math.log(ratio / 2)) * 3;
        const score = bx * by * ratioPenalty;
        if (score < bestScore) { bestScore = score; bestX = c.x; bestY = c.y; bestVariant = v; }
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
          if (ok) t.y = ny; else break;
        }
      }
      for (let step = G * 2; step > 0; step = Math.floor(step / 2)) {
        while (t.x - step >= 0) {
          const nx = t.x - step;
          const ok = !others.some(o => nx < o.x + o.w + G && nx + t.w + G > o.x && t.y < o.y + o.h + G && t.y + t.h + G > o.y);
          if (ok) t.x = nx; else break;
        }
      }
    });
  }

  return placed;
}

function computeLayout(tree) {
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
  tree.filter(r => !pos[r.id]).forEach(r => { pos[r.id] = { x: 0, y: oy }; oy += NODE_H + GAP_Y; });

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
        edges.push({ id: `d|${r.id}|${d}`, from: r.id, to: d, isHier: false, depOwner: r.id, depTarget: d });
      }
    });
  });

  return { pos, edges };
}

// ── Hierarchy edge: adapts to TD (parent above) or BU (parent below) ────────
function hierPath(fp, tp) {
  const px = fp.x + NODE_W / 2, cx = tp.x + NODE_W / 2;
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
function depPath(fp, tp, allBoxes) {
  const PAD = 6, ARR = 8;
  const fcx = fp.x + NODE_W / 2, fcy = fp.y + NODE_H / 2;
  const tcx = tp.x + NODE_W / 2, tcy = tp.y + NODE_H / 2;
  const dx = tcx - fcx, dy = tcy - fcy;

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
    const lx = Math.min(ax, bx) - PAD, rx = Math.max(ax, bx) + PAD;
    const ty = Math.min(ay, by) - PAD, by2 = Math.max(ay, by) + PAD;
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
  const mx = (fcx + tcx) / 2, my = (fcy + tcy) / 2;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Mostly horizontal
    const ex = dx > 0 ? exitR : exitL;
    const en = dx > 0 ? enterL : enterR; // enter from the side facing the source
    routes.push(route(ex, [{ x: mx, y: ex.y }, { x: mx, y: en.y }], en));
    // Also try vertical mid
    routes.push(route(exitB, [{ x: exitB.x, y: my }, { x: enterT.x, y: my }], enterT));
  } else {
    // Mostly vertical
    const ex = dy > 0 ? exitB : exitT;
    const en = dy > 0 ? enterT : enterB;
    routes.push(route(ex, [{ x: ex.x, y: my }, { x: en.x, y: my }], en));
    // Also try horizontal mid
    routes.push(route(exitR, [{ x: mx, y: exitR.y }, { x: mx, y: enterL.y }], enterL));
  }

  // Via top margin — enter from TOP
  const topY = Math.min(fp.y, tp.y) - 30;
  routes.push(route(exitT, [{ x: exitT.x, y: topY }, { x: enterT.x, y: topY }], enterT));

  // Via bottom margin — enter from BOTTOM
  const botY = Math.max(fp.y + NODE_H, tp.y + NODE_H) + 30;
  routes.push(route(exitB, [{ x: exitB.x, y: botY }, { x: enterB.x, y: botY }], enterB));

  // Via right margin — enter from RIGHT
  const rightX = Math.max(fp.x + NODE_W, tp.x + NODE_W) + 25;
  routes.push(route(exitR, [{ x: rightX, y: exitR.y }, { x: rightX, y: enterR.y }], enterR));

  // Via left margin — enter from LEFT
  const leftX = Math.min(fp.x, tp.x) - 25;
  routes.push(route(exitL, [{ x: leftX, y: exitL.y }, { x: leftX, y: enterL.y }], enterL));

  routes.sort((a, b) => a.hits - b.hits || a.path.length - b.path.length);
  return routes[0];
}

// ─────────────────────────────────────────────────────────────────────────────
export function NetGraph({ tree, scheduled, teams, cpSet, stats, search = '', searchIdx = 0, isFiltered = false, onNodeClick, onAddNode, onAddDep, onDeleteNode }) {
  const svgRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [panSt, setPanSt] = useState(null);
  const [tip, setTip] = useState(null);
  const [selId, setSelId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  // Refs mirror the latest pan / zoom synchronously so rapid wheel events read
  // the freshest values inside the handler — without them, fast scrolls compute
  // off a stale closure-captured zoom and the viewport jumps.
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  const items = tree;
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  const hasChildrenSet = useMemo(() => { const s = new Set(); tree.forEach(r => { const p = r.id.split('.').slice(0, -1).join('.'); if (p) s.add(p); }); return s; }, [tree]);

  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  const layout = useMemo(() => items.length ? computeLayout(items) : null, [items]);
  const pos = layout?.pos || {};

  // Build obstacle list for dep routing
  const allBoxes = useMemo(() => Object.entries(pos).map(([, p]) => ({ x: p.x, y: p.y })), [pos]);

  const allEdges = useMemo(() => {
    if (!layout) return [];
    return layout.edges.map(e => {
      const fp = pos[e.from], tp = pos[e.to];
      if (!fp || !tp) return null;
      if (e.isHier) {
        return { ...e, path: hierPath(fp, tp), labelPt: null };
      }
      const r = depPath(fp, tp, allBoxes);
      return { ...e, ...r };
    }).filter(Boolean);
  }, [layout, pos, allBoxes]);

  const activeId = hoverId || selId;
  const connectedSet = useMemo(() => {
    if (!activeId) return null;
    const s = new Set([activeId]);
    const active = iMap[activeId];
    if (active && items.some(r => r.id.startsWith(activeId + '.'))) {
      // Parent hover: highlight entire subtree
      items.forEach(r => { if (r.id.startsWith(activeId + '.')) s.add(r.id); });
    } else {
      // Normal: highlight direct connections
      allEdges.forEach(e => { if (e.from === activeId || e.to === activeId) { s.add(e.from); s.add(e.to); } });
    }
    return s;
  }, [activeId, allEdges, items]);

  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([, p]) => p.x + NODE_W)) + 20 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([, p]) => p.y + NODE_H)) + 20 : 300;

  // Search: ordered match list + Set (same pattern as GanttView).
  const searchMatchList = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return [];
    return items.filter(r => (r.name || '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)).map(r => r.id);
  }, [search, items]);
  const searchMatches = useMemo(() => searchMatchList.length ? new Set(searchMatchList) : null, [searchMatchList]);
  const activeMatchId = searchMatchList.length
    ? searchMatchList[((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length]
    : null;

  function fitToNodes(nodeIds) {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const fitNodes = allPos.filter(([id]) => nodeIds.has(id));
    if (!fitNodes.length) return;
    const minX = Math.min(...fitNodes.map(([, p]) => p.x));
    const minY = Math.min(...fitNodes.map(([, p]) => p.y));
    const maxX = Math.max(...fitNodes.map(([, p]) => p.x + NODE_W));
    const maxY = Math.max(...fitNodes.map(([, p]) => p.y + NODE_H));
    const fw = maxX - minX + 40, fh = maxY - minY + 40;
    const z = Math.max(.05, Math.min((r.width - 16) / fw, (r.height - 50) / fh, 2));
    const newPan = { x: (r.width - fw * z) / 2 - minX * z + 20 * z, y: (r.height - fh * z) / 2 - minY * z + 20 * z };
    panRef.current = newPan;
    zoomRef.current = z;
    setPan(newPan); setZoom(z);
  }

  function fitToScreen() {
    // If a search is active, fit to its matches; else if a selection is active, fit to it; else fit all.
    const target = searchMatches?.size
      ? searchMatches
      : (connectedSet && connectedSet.size > 1 ? connectedSet : new Set(allPos.map(([id]) => id)));
    fitToNodes(target);
  }
  useEffect(() => { if (layout) setTimeout(fitToScreen, 50); }, [layout]);
  // When search or searchIdx changes, jump to the active match (or all matches on first query).
  useEffect(() => {
    if (!searchMatchList.length) return;
    if (activeMatchId && pos[activeMatchId]) {
      fitToNodes(new Set([activeMatchId]));
    } else {
      fitToNodes(searchMatches);
    }
  }, [search, searchIdx]);

  // Escape key deselects
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setSelId(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  function svgPt(e) { const r = svgRef.current?.getBoundingClientRect(); return r ? { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom } : { x: 0, y: 0 }; }

  useEffect(() => {
    const el = svgRef.current?.parentElement; if (!el) return;
    const h = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const f = e.deltaY > 0 ? .92 : 1.08;
        // Read latest zoom/pan from refs — closure values are stale during rapid scrolls.
        const cz = zoomRef.current, cp = panRef.current;
        const nz = Math.min(3, Math.max(.05, cz * f));
        const np = { x: mx - (mx - cp.x) * (nz / cz), y: my - (my - cp.y) * (nz / cz) };
        // Update refs synchronously so the next wheel event uses the new values
        // even before React commits the state update.
        zoomRef.current = nz;
        panRef.current = np;
        setZoom(nz);
        setPan(np);
      } else {
        const cp = panRef.current;
        const np = { x: cp.x - e.deltaX, y: cp.y - e.deltaY };
        panRef.current = np;
        setPan(np);
      }
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  function onMD(e) { if (e.button === 0) { setPanning(true); setPanSt({ x: e.clientX - pan.x, y: e.clientY - pan.y }); } }
  function onMM(e) { if (panning && panSt) setPan({ x: e.clientX - panSt.x, y: e.clientY - panSt.y }); }
  function onMU() { setPanning(false); setPanSt(null); }
  function onCtx(e, r) { e.preventDefault(); e.stopPropagation(); setCtxMenu({ id: r.id, x: e.clientX, y: e.clientY }); }

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

  if (!items.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🕸</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>{isFiltered ? 'No items match this filter' : 'No items yet'}</div>
      {isFiltered
        ? <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Adjust the root or team filter to widen the graph.</div>
        : (onAddNode && <button className="btn btn-pri" onClick={onAddNode}>+ Add first item</button>)}
    </div>
  </div>;

  if (!layout) return null;

  return <div className="netgraph-wrap" style={{ cursor: panning ? 'grabbing' : 'default' }}>
    <div className="ng-toolbar">
      <button className="btn btn-pri btn-sm" onClick={fitToScreen} title={searchMatches?.size ? 'Fit to search matches' : 'Fit to selection or whole graph'}>Fit</button>
      <button className="btn btn-sec btn-sm" onClick={() => { const newPan = { x: 12, y: 12 }; panRef.current = newPan; zoomRef.current = 1.5; setZoom(1.5); setPan(newPan); }} title="Reset to 100%">{Math.round(zoom / 1.5 * 100)}%</button>
      <button className="btn btn-sec btn-sm" onClick={() => {
        const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
        const mx = r.width / 2, my = r.height / 2;
        const cz = zoomRef.current, cp = panRef.current;
        const nz = Math.min(3, cz * 1.25);
        const np = { x: mx - (mx - cp.x) * (nz / cz), y: my - (my - cp.y) * (nz / cz) };
        zoomRef.current = nz; panRef.current = np; setZoom(nz); setPan(np);
      }}>+</button>
      <button className="btn btn-sec btn-sm" onClick={() => {
        const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
        const mx = r.width / 2, my = r.height / 2;
        const cz = zoomRef.current, cp = panRef.current;
        const nz = Math.max(.05, cz * .8);
        const np = { x: mx - (mx - cp.x) * (nz / cz), y: my - (my - cp.y) * (nz / cz) };
        zoomRef.current = nz; panRef.current = np; setZoom(nz); setPan(np);
      }}>−</button>
      {searchMatches && <span style={{ fontSize: 11, color: searchMatches.size ? 'var(--am)' : 'var(--re)', fontFamily: 'var(--mono)', marginLeft: 6 }}>
        {searchMatchList.length
          ? `${((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length + 1} / ${searchMatchList.length}`
          : '0 matches'}
      </span>}
    </div>

    <svg ref={svgRef} style={{ width: '100%', height: '100%' }} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
      onMouseLeave={() => setPanning(false)} onClick={() => setSelId(null)}>
      <defs>
        <marker id="ar-d" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--ac)" /></marker>
        <marker id="ar-cp" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" /></marker>
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

        {/* Hierarchy edges (tree connectors) */}
        {allEdges.filter(e => e.isHier).map(e => {
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          return <path key={e.id} d={e.path} fill="none" stroke={isActive ? 'var(--tx2)' : 'var(--b3)'}
            strokeWidth={isActive ? 1.5 : .8} opacity={isActive ? .7 : .35} />;
        })}

        {/* Dependency edges */}
        {allEdges.filter(e => !e.isHier).map(e => {
          const isCp = cpSet?.has(e.from) && cpSet?.has(e.to);
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          const op = isActive ? .85 : isCp ? .5 : .2;
          const owner = iMap[e.depOwner || e.from]; const label = owner?._depLabels?.[e.depTarget || e.to] || '';
          const lp = e.labelPt;
          return <g key={e.id}>
            <path d={e.path} fill="none" stroke={isCp ? 'var(--re)' : 'var(--ac)'}
              strokeWidth={isActive ? 2.5 : isCp ? 1.5 : .8} strokeDasharray={isActive ? 'none' : '5 3'}
              opacity={op} markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'} />
            {label && isActive && lp && <>
              <rect x={lp.x - label.length * 2.5 - 4} y={lp.y - 7} width={label.length * 5 + 8} height={13} rx={3}
                fill="var(--bg2)" stroke="var(--ac)" strokeWidth={.5} opacity={.92} style={{ pointerEvents: 'none' }} />
              <text x={lp.x} y={lp.y + 3} fontSize={7} fill="var(--ac)" textAnchor="middle" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{label}</text>
            </>}
          </g>;
        })}

        {/* Uniform card nodes */}
        {items.map(r => {
          const p = pos[r.id]; if (!p) return null;
          const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id; const isDone = r.status === 'done';
          const isCp = cpSet?.has(r.id);
          const isConn = connectedSet?.has(r.id);
          const subtreeDimmed = connectedSet && connectedSet.size > 3 && !connectedSet.has(r.id);
          const isRoot = !r.id.includes('.');
          const depth = r.id.split('.').length;
          const prog = stats?.[r.id]?._progress ?? 0;
          const pR = 5, pCx = NODE_W - 8, pCy = 8;
          const pCirc = 2 * Math.PI * pR;
          const pOff = pCirc * (1 - prog / 100);
          // Search highlight: matches stay full opacity + amber outline; non-matches dim.
          const isMatch = searchMatches?.has(r.id);
          const isActiveMatch = r.id === activeMatchId;
          const searchDimmed = searchMatches && searchMatches.size > 0 && !isMatch;
          const finalOpacity = subtreeDimmed ? .2 : searchDimmed ? .25 : 1;
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={finalOpacity}>
            <rect width={NODE_W} height={NODE_H} rx={5} fill={isDone ? 'var(--bg-done)' : isRoot ? tc : 'var(--bg2)'}
              stroke={isActiveMatch ? 'var(--ac)' : isMatch ? 'var(--am)' : isSel ? 'var(--ac)' : isCp ? 'var(--re)' : isConn ? tc : isRoot ? tc : tc + '44'}
              strokeWidth={isMatch ? 2.5 : isSel ? 2.5 : isRoot ? 2 : isConn ? 1.5 : isCp ? 1.5 : .7}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            {/* Circular progress */}
            <circle cx={pCx} cy={pCy} r={pR} fill="none" stroke={isRoot ? '#ffffff22' : 'var(--b2)'} strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
            {prog > 0 && <circle cx={pCx} cy={pCy} r={pR} fill="none" stroke={prog >= 100 ? 'var(--gr)' : stC} strokeWidth={1.5}
              strokeDasharray={pCirc} strokeDashoffset={pOff} strokeLinecap="round"
              transform={`rotate(-90 ${pCx} ${pCy})`} style={{ pointerEvents: 'none' }} />}
            {prog >= 100 && <text x={pCx} y={pCy + 1.5} fontSize={5} textAnchor="middle" fill="var(--gr)" fontWeight={700} style={{ pointerEvents: 'none' }}>✓</text>}
            {prog > 0 && prog < 100 && <text x={pCx} y={pCy + 2} fontSize={4} textAnchor="middle" fill={isRoot ? '#ffffffcc' : 'var(--tx3)'} fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{prog}</text>}
            {/* ID */}
            <text x={5} y={10} fontSize={6} fill={isRoot ? '#ffffffaa' : 'var(--tx3)'} fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
            {/* Name (2 lines) */}
            <text x={5} y={21} fontSize={7.5} fill={isRoot ? '#ffffff' : tc} fontWeight={depth <= 1 ? 700 : depth <= 2 ? 600 : 500} style={{ pointerEvents: 'none' }}>
              {r.name.length <= 26 ? r.name : <>{r.name.slice(0, 26)}<tspan x={5} dy={10}>{r.name.slice(26, 52)}{r.name.length > 52 ? '..' : ''}</tspan></>}
            </text>
            {/* Info line with priority chevron (for leaves) */}
            {(() => {
              const isLeafNode = !hasChildrenSet.has(r.id);
              const PRIO_GLYPH = { 1: '⏫', 2: '▲', 3: '▬', 4: '▼' };
              const PRIO_COL = { 1: '#f87171', 2: '#fbbf24', 3: '#6ca0ff', 4: '#8090a8' };
              const showPrio = isLeafNode && r.prio;
              const y = r.name.length > 26 ? 40 : 33;
              return <>
                {showPrio && <text x={5} y={y} fontSize={7} fill={PRIO_COL[r.prio]} fontWeight={700} style={{ pointerEvents: 'none' }}>{PRIO_GLYPH[r.prio]}</text>}
                {sc && <text x={showPrio ? 14 : 5} y={y} fontSize={5.5} fill={isRoot ? '#ffffffaa' : 'var(--tx3)'} fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
              </>;
            })()}
          </g>;
        })}
      </g>
    </svg>

    {ctxMenu && <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 4, zIndex: 999, boxShadow: 'var(--sh)', minWidth: 140 }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onNodeClick(iMap[ctxMenu.id]); setCtxMenu(null); }}>Edit {ctxMenu.id}</div>
      <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4, color: 'var(--re)' }} className="tr" onClick={() => { if (confirm(`Delete ${ctxMenu.id}?`)) { onDeleteNode(ctxMenu.id); setSelId(null); } setCtxMenu(null); }}>Delete</div>
    </div>}

    <div className="ng-legend">
      <div className="ng-li"><div style={{ width: 14, height: 1, background: 'var(--b3)', flexShrink: 0 }} />Hierarchy</div>
      <div className="ng-li"><div style={{ width: 14, height: 0, borderTop: '1.5px dashed var(--ac)', flexShrink: 0 }} />Dependency</div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>Crit. path</div>
      <span style={{ color: 'var(--tx3)', fontSize: 9 }}>Scroll=pan · Pinch=zoom · Click=highlight · Dbl-click=edit</span>
    </div>
    {tip && <Tip item={tip.item} x={tip.x + 12} y={tip.y + 20} teams={teams} tree={tree} />}
  </div>;
}
