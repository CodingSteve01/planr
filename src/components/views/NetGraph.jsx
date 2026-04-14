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

// ── Layout: L2 group (L2 centered, L3s split left/right) ───────────────────
function layoutL2Group(l2, tree) {
  const l3s = tree.filter(r => r.lvl === 3 && r.id.startsWith(l2.id + '.'));
  const items = {};
  if (!l3s.length) { items[l2.id] = { x: 0, y: 0 }; return { items, w: NODE_W, h: NODE_H }; }

  const half = Math.ceil(l3s.length / 2);
  const left = l3s.slice(0, half), right = l3s.slice(half);
  const l3Y = NODE_H + LEVEL_GAP;

  left.forEach((t, i) => { items[t.id] = { x: 0, y: l3Y + i * (NODE_H + GAP_Y) }; });
  const rx = right.length ? NODE_W + GAP_X : 0;
  right.forEach((t, i) => { items[t.id] = { x: rx, y: l3Y + i * (NODE_H + GAP_Y) }; });

  const gw = right.length ? NODE_W * 2 + GAP_X : NODE_W;
  const lastY = l3Y + (Math.max(left.length, right.length) - 1) * (NODE_H + GAP_Y) + NODE_H;
  items[l2.id] = { x: (gw - NODE_W) / 2, y: 0 };
  return { items, w: gw, h: lastY };
}

// ── Layout: L1 tree (L1 centered, L2 groups in row) ────────────────────────
function layoutTree(p1, tree) {
  const pos = {};
  const l2s = tree.filter(r => r.lvl === 2 && r.id.startsWith(p1.id + '.'));
  if (!l2s.length) { pos[p1.id] = { x: 0, y: 0 }; return { pos, w: NODE_W, h: NODE_H }; }

  const groups = l2s.map(l2 => layoutL2Group(l2, tree));
  const l2Y = NODE_H + LEVEL_GAP;
  let x = 0;
  groups.forEach(g => {
    Object.entries(g.items).forEach(([id, p]) => { pos[id] = { x: x + p.x, y: l2Y + p.y }; });
    x += g.w + TREE_GAP;
  });
  const totalW = Math.max(0, x - TREE_GAP);
  const treeW = Math.max(NODE_W, totalW);
  pos[p1.id] = { x: (treeW - NODE_W) / 2, y: 0 };
  if (totalW < treeW) { const off = (treeW - totalW) / 2; Object.keys(pos).forEach(id => { if (id !== p1.id) pos[id].x += off; }); }
  const maxH = groups.length ? Math.max(...groups.map(g => g.h)) : 0;
  return { pos, w: treeW, h: l2Y + maxH };
}

// ── Bin-pack trees: place each tree where it fits best (Tetris-style) ───────
function binPackTrees(trees) {
  // Sort by area descending (big trees first for better packing)
  const sorted = [...trees].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const placed = []; // { x, y, w, h, tree }

  sorted.forEach(t => {
    // Generate candidate positions: (0,0) + right/below edges of all placed trees
    const cands = [{ x: 0, y: 0 }];
    placed.forEach(p => {
      cands.push({ x: p.x + p.w + TREE_GAP, y: p.y });
      cands.push({ x: p.x, y: p.y + p.h + TREE_GAP });
      cands.push({ x: p.x + p.w + TREE_GAP, y: 0 });
      cands.push({ x: 0, y: p.y + p.h + TREE_GAP });
    });

    let bestX = 0, bestY = 0, bestScore = Infinity;
    cands.forEach(c => {
      if (c.x < 0 || c.y < 0) return;
      // Check no overlap with any placed tree
      const overlaps = placed.some(p =>
        c.x < p.x + p.w + TREE_GAP && c.x + t.w + TREE_GAP > p.x &&
        c.y < p.y + p.h + TREE_GAP && c.y + t.h + TREE_GAP > p.y
      );
      if (overlaps) return;
      // Score: minimize total bounding box area (compact)
      const bx = Math.max(c.x + t.w, ...placed.map(p => p.x + p.w));
      const by = Math.max(c.y + t.h, ...placed.map(p => p.y + p.h));
      const score = bx * by; // total area
      if (score < bestScore) { bestScore = score; bestX = c.x; bestY = c.y; }
    });

    placed.push({ x: bestX, y: bestY, w: t.w, h: t.h, tree: t });
  });

  return placed;
}

function computeLayout(tree) {
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const l1s = tree.filter(r => r.lvl === 1);
  const trees = l1s.map(p1 => ({ id: p1.id, ...layoutTree(p1, tree) }));

  // Bin-pack all trees
  const packed = binPackTrees(trees);

  const pos = {};
  packed.forEach(p => {
    Object.entries(p.tree.pos).forEach(([id, np]) => {
      pos[id] = { x: p.x + np.x, y: p.y + np.y };
    });
  });

  // Orphans
  let oy = totalH + NODE_H;
  tree.filter(r => !pos[r.id]).forEach(r => { pos[r.id] = { x: 0, y: oy }; oy += NODE_H + GAP_Y; });

  // Build edges
  const edges = [];
  tree.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid] && pos[pid] && pos[r.id])
      edges.push({ id: `h|${pid}|${r.id}`, from: pid, to: r.id, isHier: true });
  });
  // Dep edges: FROM the item that has the dep TO the prerequisite (arrow points at prereq)
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      if (iMap[d] && pos[d] && pos[r.id])
        edges.push({ id: `d|${r.id}|${d}`, from: r.id, to: d, isHier: false, depOwner: r.id, depTarget: d });
    });
  });

  return { pos, edges };
}

// ── Hierarchy edge: parent bottom → vertical spine → horizontal tap → child top
// The vertical spine runs at the parent's center X, then taps out to each child
function hierPath(fp, tp) {
  const px = fp.x + NODE_W / 2, py = fp.y + NODE_H;
  const cx = tp.x + NODE_W / 2, cy = tp.y;
  const busY = py + LEVEL_GAP / 2; // bus just below parent
  // Vertical down from parent, horizontal to child X, vertical down to child
  return `M${px},${py} L${px},${busY} L${cx},${busY} L${cx},${cy}`;
}

// ── Dep edge: obstacle-aware orthogonal routing ─────────────────────────────
function depPath(fp, tp, allBoxes) {
  const PAD = 6, ARR = 8;
  const fcx = fp.x + NODE_W / 2, fcy = fp.y + NODE_H / 2;
  const tcx = tp.x + NODE_W / 2, tcy = tp.y + NODE_H / 2;
  const dx = tcx - fcx, dy = tcy - fcy;

  // Exit/entry: always pick the side closest to the other node
  // Source exit
  let x1, y1;
  if (Math.abs(dx) > Math.abs(dy)) { x1 = dx > 0 ? fp.x + NODE_W : fp.x; y1 = fcy; }
  else { x1 = fcx; y1 = dy > 0 ? fp.y + NODE_H : fp.y; }
  // Target entry: from the side the edge arrives at
  let x2, y2;
  if (Math.abs(dx) > Math.abs(dy)) { x2 = dx > 0 ? tp.x - ARR : tp.x + NODE_W + ARR; y2 = tcy; }
  else { x2 = tcx; y2 = dy > 0 ? tp.y - ARR : tp.y + NODE_H + ARR; }

  function hitsNode(ax, ay, bx, by) {
    const lx = Math.min(ax, bx) - PAD, rx = Math.max(ax, bx) + PAD;
    const ty = Math.min(ay, by) - PAD, by2 = Math.max(ay, by) + PAD;
    return allBoxes.some(b => {
      if (b.x === fp.x && b.y === fp.y) return false;
      if (b.x === tp.x && b.y === tp.y) return false;
      return b.x < rx && b.x + NODE_W > lx && b.y < by2 && b.y + NODE_H > ty;
    });
  }

  // Try multiple routing strategies, pick first that doesn't hit nodes
  const routes = [];

  // Strategy 1: H-V-H (horizontal exit, vertical mid, horizontal enter)
  const mx1 = (x1 + x2) / 2;
  routes.push({ path: `M${x1},${y1} L${mx1},${y1} L${mx1},${y2} L${x2},${y2}`,
    hits: [hitsNode(x1, y1, mx1, y1), hitsNode(mx1, y1, mx1, y2), hitsNode(mx1, y2, x2, y2)].filter(Boolean).length,
    labelPt: { x: mx1, y: Math.min(y1, y2) - 8 } });

  // Strategy 2: V-H-V (vertical exit, horizontal mid, vertical enter)
  const my1 = (y1 + y2) / 2;
  routes.push({ path: `M${x1},${y1} L${x1},${my1} L${x2},${my1} L${x2},${y2}`,
    hits: [hitsNode(x1, y1, x1, my1), hitsNode(x1, my1, x2, my1), hitsNode(x2, my1, x2, y2)].filter(Boolean).length,
    labelPt: { x: Math.max(x1, x2) + 8, y: my1 } });

  // Strategy 3: route via top margin
  const topY = Math.min(fp.y, tp.y) - 30;
  routes.push({ path: `M${x1},${y1} L${x1},${topY} L${x2},${topY} L${x2},${y2}`,
    hits: [hitsNode(x1, y1, x1, topY), hitsNode(x1, topY, x2, topY), hitsNode(x2, topY, x2, y2)].filter(Boolean).length,
    labelPt: { x: (x1 + x2) / 2, y: topY - 8 } });

  // Strategy 4: route via bottom margin
  const botY = Math.max(fp.y + NODE_H, tp.y + NODE_H) + 30;
  routes.push({ path: `M${x1},${y1} L${x1},${botY} L${x2},${botY} L${x2},${y2}`,
    hits: [hitsNode(x1, y1, x1, botY), hitsNode(x1, botY, x2, botY), hitsNode(x2, botY, x2, y2)].filter(Boolean).length,
    labelPt: { x: (x1 + x2) / 2, y: botY + 10 } });

  // Strategy 5: wide margin route
  const goRight = dx > 0;
  const wideX = goRight ? Math.max(fp.x + NODE_W, tp.x + NODE_W) + 25 : Math.min(fp.x, tp.x) - 25;
  routes.push({ path: `M${x1},${y1} L${wideX},${y1} L${wideX},${y2} L${x2},${y2}`,
    hits: 0, // margin is always clear
    labelPt: { x: wideX + (goRight ? 5 : -5), y: (y1 + y2) / 2 } });

  // Pick best route (fewest hits, prefer shorter)
  routes.sort((a, b) => a.hits - b.hits || a.path.length - b.path.length);
  return routes[0];
}

// ─────────────────────────────────────────────────────────────────────────────
export function NetGraph({ tree, scheduled, teams, cpSet, onNodeClick, onAddNode, onAddDep, onDeleteNode }) {
  const svgRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [panSt, setPanSt] = useState(null);
  const [tip, setTip] = useState(null);
  const [selId, setSelId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);

  const items = tree;
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);

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
    allEdges.forEach(e => { if (e.from === activeId || e.to === activeId) { s.add(e.from); s.add(e.to); } });
    return s;
  }, [activeId, allEdges]);

  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([, p]) => p.x + NODE_W)) + 20 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([, p]) => p.y + NODE_H)) + 20 : 300;

  function fitToScreen() {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const z = Math.max(.05, Math.min((r.width - 16) / graphW, (r.height - 50) / graphH, 1.5));
    setPan({ x: (r.width - graphW * z) / 2, y: Math.max(8, (r.height - graphH * z) / 2) }); setZoom(z);
  }
  useEffect(() => { if (layout) setTimeout(fitToScreen, 50); }, [layout]);

  function svgPt(e) { const r = svgRef.current?.getBoundingClientRect(); return r ? { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom } : { x: 0, y: 0 }; }

  useEffect(() => {
    const el = svgRef.current?.parentElement; if (!el) return;
    const h = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
        const mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY > 0 ? .92 : 1.08;
        const nz = Math.min(3, Math.max(.05, zoom * f));
        setPan(p => ({ x: mx - (mx - p.x) * (nz / zoom), y: my - (my - p.y) * (nz / zoom) })); setZoom(nz);
      } else { setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); }
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  });

  function onMD(e) { if (e.button === 0) { setPanning(true); setPanSt({ x: e.clientX - pan.x, y: e.clientY - pan.y }); } }
  function onMM(e) { if (panning && panSt) setPan({ x: e.clientX - panSt.x, y: e.clientY - panSt.y }); }
  function onMU() { setPanning(false); setPanSt(null); }
  function onCtx(e, r) { e.preventDefault(); e.stopPropagation(); setCtxMenu({ id: r.id, x: e.clientX, y: e.clientY }); }

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

  if (!items.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🕸</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div>
      {onAddNode && <button className="btn btn-pri" onClick={onAddNode}>+ Add first item</button>}
    </div>
  </div>;

  if (!layout) return null;

  return <div className="netgraph-wrap" style={{ cursor: panning ? 'grabbing' : 'default' }}>
    <div className="ng-toolbar">
      <button className="btn btn-pri btn-sm" onClick={fitToScreen}>Fit</button>
      <button className="btn btn-sec btn-sm" onClick={() => { setZoom(1); setPan({ x: 12, y: 12 }); }}>{Math.round(zoom * 100)}%</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.min(3, z * 1.25))}>+</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.max(.05, z * .8))}>-</button>
    </div>

    <svg ref={svgRef} style={{ width: '100%', height: '100%' }} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
      onMouseLeave={() => setPanning(false)}>
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
          return <g key={r.id} transform={`translate(${p.x},${p.y})`}>
            <rect width={NODE_W} height={NODE_H} rx={5} fill={isDone ? '#22c55e12' : 'var(--bg2)'}
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : isConn ? tc + '88' : tc + '33'}
              strokeWidth={isSel ? 2.5 : isConn ? 1.5 : isCp ? 1.5 : .7}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            {/* Status dot */}
            <circle cx={NODE_W - 7} cy={7} r={3.5} fill={stC} style={{ pointerEvents: 'none' }} />
            {/* ID */}
            <text x={5} y={10} fontSize={6} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
            {/* Name (2 lines) */}
            <text x={5} y={21} fontSize={7.5} fill={tc} fontWeight={r.lvl === 1 ? 700 : r.lvl === 2 ? 600 : 500} style={{ pointerEvents: 'none' }}>
              {r.name.length <= 26 ? r.name : <>{r.name.slice(0, 26)}<tspan x={5} dy={10}>{r.name.slice(26, 52)}{r.name.length > 52 ? '..' : ''}</tspan></>}
            </text>
            {/* Info line */}
            {sc && <text x={5} y={r.name.length > 26 ? 40 : 33} fontSize={5.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
            {isDone && <text x={NODE_W - 14} y={NODE_H - 5} fontSize={10} style={{ pointerEvents: 'none' }}>&#x2705;</text>}
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
