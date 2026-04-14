import { useState, useRef, useEffect, useMemo } from 'react';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

const NW = { 1: 150, 2: 125, 3: 110 };
const NH = { 1: 30, 2: 26, 3: 40 };
const GAP_X = 12; // horizontal gap between nodes
const GAP_Y = 14; // vertical gap between levels
const TREE_GAP = 30; // gap between L1 trees

// ── Custom tree layout ──────────────────────────────────────────────────────
// L1 centered on top. L2 children in a row below L1.
// Each L2's L3 children split 50/50 into left+right columns below that L2.
function layoutTree(p1, tree) {
  const pos = {};
  const l2s = tree.filter(r => r.lvl === 2 && r.id.startsWith(p1.id + '.'));
  if (!l2s.length) {
    pos[p1.id] = { x: 0, y: 0 };
    return { pos, w: NW[1], h: NH[1] };
  }

  // Layout each L2 group: L2 centered, L3s split left/right below
  function layoutL2Group(l2) {
    const l3s = tree.filter(r => r.lvl === 3 && r.id.startsWith(l2.id + '.'));
    const items = {};

    if (!l3s.length) {
      items[l2.id] = { x: 0, y: 0 };
      return { items, w: NW[2], h: NH[2] };
    }

    const half = Math.ceil(l3s.length / 2);
    const leftL3 = l3s.slice(0, half);
    const rightL3 = l3s.slice(half);

    const colW = NW[3];
    const l3Y = NH[2] + GAP_Y; // L3 columns start below L2

    // Left column
    let leftH = 0;
    leftL3.forEach((t, i) => {
      items[t.id] = { x: 0, y: l3Y + i * (NH[3] + GAP_Y) };
      leftH = l3Y + i * (NH[3] + GAP_Y) + NH[3];
    });

    // Right column
    let rightH = 0;
    const rightX = rightL3.length ? colW + GAP_X : 0;
    rightL3.forEach((t, i) => {
      items[t.id] = { x: rightX, y: l3Y + i * (NH[3] + GAP_Y) };
      rightH = l3Y + i * (NH[3] + GAP_Y) + NH[3];
    });

    const groupW = rightL3.length ? colW + GAP_X + colW : colW;
    const groupH = Math.max(leftH, rightH, NH[2]);

    // Center L2 above columns
    items[l2.id] = { x: (groupW - NW[2]) / 2, y: 0 };

    return { items, w: groupW, h: groupH };
  }

  const l2Groups = l2s.map(layoutL2Group);

  // Arrange L2 groups horizontally
  const l2Y = NH[1] + GAP_Y * 2;
  let x = 0;
  const l2Positions = [];
  l2Groups.forEach(g => {
    l2Positions.push(x);
    Object.entries(g.items).forEach(([id, p]) => {
      pos[id] = { x: x + p.x, y: l2Y + p.y };
    });
    x += g.w + TREE_GAP;
  });

  const totalChildW = Math.max(0, x - TREE_GAP);
  const treeW = Math.max(NW[1], totalChildW);

  // Center L1 above everything
  pos[p1.id] = { x: (treeW - NW[1]) / 2, y: 0 };

  // If children narrower than L1, center them
  if (totalChildW < NW[1]) {
    const offset = (NW[1] - totalChildW) / 2;
    Object.keys(pos).forEach(id => { if (id !== p1.id) pos[id].x += offset; });
  }

  const maxGroupH = l2Groups.length ? Math.max(...l2Groups.map(g => g.h)) : 0;
  return { pos, w: treeW, h: l2Y + maxGroupH };
}

// ── Arrange all L1 trees in rows ────────────────────────────────────────────
function computeLayout(tree, maxRowW) {
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const l1s = tree.filter(r => r.lvl === 1);

  // Layout each L1 tree independently
  const trees = l1s.map(p1 => ({ id: p1.id, ...layoutTree(p1, tree) }));

  // Arrange trees in rows: fill first row left-to-right, if too wide → second row
  const rows = [[]];
  let rowW = 0;
  trees.forEach(t => {
    if (rows[0].length > 0 && rowW + TREE_GAP + t.w > maxRowW && maxRowW > 0) {
      rows.push([t]);
      rowW = t.w;
    } else {
      if (rows[rows.length - 1].length > 0) rowW += TREE_GAP;
      rows[rows.length - 1].push(t);
      rowW += t.w;
    }
  });

  // Position rows: row 0 top-down (normal), row 1+ bottom-up (flipped, parent at bottom)
  const pos = {};
  let totalH = 0;

  // Row 0: normal (parent top, children below)
  const row0 = rows[0] || [];
  const row0H = row0.length ? Math.max(...row0.map(t => t.h)) : 0;
  let x0 = 0;
  row0.forEach(t => {
    Object.entries(t.pos).forEach(([id, p]) => { pos[id] = { x: x0 + p.x, y: p.y }; });
    x0 += t.w + TREE_GAP;
  });
  totalH = row0H;

  // Row 1+: flipped (parent at bottom, children above), placed below row 0
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    const rowH = row.length ? Math.max(...row.map(t => t.h)) : 0;
    const rowTop = totalH + TREE_GAP * 2;
    let x = 0;
    row.forEach(t => {
      Object.entries(t.pos).forEach(([id, p]) => {
        // Flip Y: mirror within tree height, then offset to row
        pos[id] = { x: x + p.x, y: rowTop + (t.h - p.y - (NH[iMap[id]?.lvl] || 40)) };
      });
      x += t.w + TREE_GAP;
    });
    totalH = rowTop + rowH;
  }

  // Orphans
  let orphanY = totalH + TREE_GAP;
  tree.filter(r => !pos[r.id]).forEach(r => {
    pos[r.id] = { x: 0, y: orphanY };
    orphanY += (NH[r.lvl] || 40) + GAP_Y;
  });

  // Build edges
  const edges = [];
  tree.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid] && pos[pid] && pos[r.id])
      edges.push({ id: `h|${pid}|${r.id}`, from: pid, to: r.id, isHier: true });
  });
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      if (iMap[d] && pos[d] && pos[r.id])
        edges.push({ id: `d|${d}|${r.id}`, from: d, to: r.id, isHier: false });
    });
  });

  return { pos, edges };
}

// ── Orthogonal elbow routing ────────────────────────────────────────────────
function elbowPath(fp, tp, fw, fh, tw, th) {
  const fcx = fp.x + fw / 2, fcy = fp.y + fh / 2;
  const tcx = tp.x + tw / 2, tcy = tp.y + th / 2;
  const dx = tcx - fcx, dy = tcy - fcy;

  if (Math.abs(dx) > Math.abs(dy)) {
    const x1 = dx > 0 ? fp.x + fw : fp.x, y1 = fcy;
    const x2 = dx > 0 ? tp.x : tp.x + tw, y2 = tcy;
    const mx = (x1 + x2) / 2;
    return { path: `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`, labelPt: { x: mx, y: Math.min(y1, y2) - 8 } };
  } else {
    const x1 = fcx, y1 = dy > 0 ? fp.y + fh : fp.y;
    const x2 = tcx, y2 = dy > 0 ? tp.y : tp.y + th;
    const my = (y1 + y2) / 2;
    return { path: `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`, labelPt: { x: Math.max(x1, x2) + 8, y: my } };
  }
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

  const nw = id => NW[iMap[id]?.lvl] || 110;
  const nh = id => NH[iMap[id]?.lvl] || 40;
  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  // ── Layout ──────────────────────────────────────────
  const layout = useMemo(() => {
    if (!items.length) return null;
    return computeLayout(items, 1600); // max row width before wrapping
  }, [items]);

  const pos = layout?.pos || {};

  // Compute edge paths
  const allEdges = useMemo(() => {
    if (!layout) return [];
    return layout.edges.map(e => {
      const fp = pos[e.from], tp = pos[e.to];
      if (!fp || !tp) return null;
      const { path, labelPt } = elbowPath(fp, tp, nw(e.from), nh(e.from), nw(e.to), nh(e.to));
      return { ...e, path, labelPt };
    }).filter(Boolean);
  }, [layout, pos]);

  const activeId = hoverId || selId;
  const connectedSet = useMemo(() => {
    if (!activeId) return null;
    const s = new Set([activeId]);
    allEdges.forEach(e => { if (e.from === activeId || e.to === activeId) { s.add(e.from); s.add(e.to); } });
    return s;
  }, [activeId, allEdges]);

  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([id, p]) => p.x + nw(id))) + 20 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([id, p]) => p.y + nh(id))) + 20 : 300;

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
      <button className="btn btn-sec btn-sm" onClick={() => { setZoom(1); setPan({ x: 12, y: 12 }); }}>100%</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.min(3, z * 1.25))}>+</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.max(.05, z * .8))}>-</button>
    </div>

    <svg ref={svgRef} style={{ width: '100%', height: '100%' }} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
      onMouseLeave={() => { setPanning(false); }}>
      <defs>
        <marker id="ar-h" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="4" markerHeight="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--b3)" /></marker>
        <marker id="ar-d" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--ac)" /></marker>
        <marker id="ar-cp" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" /></marker>
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

        {/* Hierarchy edges */}
        {allEdges.filter(e => e.isHier).map(e => {
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          return <path key={e.id} d={e.path} fill="none" stroke={isActive ? 'var(--tx2)' : 'var(--b3)'}
            strokeWidth={isActive ? 1.8 : .8} opacity={isActive ? .7 : .3} markerEnd="url(#ar-h)" />;
        })}

        {/* Dependency edges + labels */}
        {allEdges.filter(e => !e.isHier).map(e => {
          const isCp = cpSet?.has(e.from) && cpSet?.has(e.to);
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          const op = isActive ? .85 : isCp ? .5 : .2;
          const item = iMap[e.to]; const label = item?._depLabels?.[e.from] || '';
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

        {/* Nodes */}
        {items.map(r => {
          const p = pos[r.id]; if (!p) return null;
          const w = nw(r.id), h = nh(r.id);
          const isCp = cpSet?.has(r.id); const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id; const isDone = r.status === 'done';
          const isL1 = r.lvl === 1, isL2 = r.lvl === 2;
          const isConn = connectedSet?.has(r.id);
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={isDone ? .35 : 1}>
            <rect width={w} height={h} rx={isL1 ? 6 : 4}
              fill={isL1 ? tc + '22' : isL2 ? tc + '14' : 'var(--bg2)'}
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : isConn ? tc + '88' : tc + (isL1 ? '55' : '33')}
              strokeWidth={isSel ? 2.5 : isConn ? 1.5 : isCp ? 1.5 : .7}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            <rect x={0} y={isL1 ? h - 2 : 0} width={isL1 ? w : 2.5} height={isL1 ? 2 : h} rx={1} fill={stC} style={{ pointerEvents: 'none' }} />
            {isL1 ? <text x={w / 2} y={h / 2} fontSize={9} fill={tc} fontWeight={700} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
              {r.name.length > 22 ? r.name.slice(0, 21) + '..' : r.name}
            </text>
            : <>
              <text x={6} y={9} fontSize={6} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
              <text x={6} y={isL2 ? 18 : 19} fontSize={isL2 ? 7.5 : 7} fill={tc} fontWeight={isL2 ? 600 : 500} style={{ pointerEvents: 'none' }}>
                {r.name.length <= 18 ? r.name : <>{r.name.slice(0, 18)}<tspan x={6} dy={9}>{r.name.slice(18, 36)}{r.name.length > 36 ? '..' : ''}</tspan></>}
              </text>
              {!isL2 && sc && <text x={6} y={r.name.length > 18 ? 37 : 29} fontSize={6} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
            </>}
            {isDone && <text x={w - 10} y={h / 2 + 1} fontSize={10} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>&#x2705;</text>}
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
