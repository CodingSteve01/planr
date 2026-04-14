import { useState, useRef, useEffect, useMemo } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

const elk = new ELK();
const NW = { 1: 120, 2: 105, 3: 95 };
const NH = { 1: 28, 2: 24, 3: 34 };

// ── Stress-based layout: balanced, compact, optimization-based ──────────────
function buildElkGraph(tree) {
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const children = tree.map(r => ({ id: r.id, width: NW[r.lvl] || 95, height: NH[r.lvl] || 34 }));

  const edges = [];
  // Hierarchy edges — desired length > node widths to prevent overlap
  tree.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid]) {
      const len = r.lvl === 2 ? 150 : 120; // L1→L2 wider, L2→L3 tighter
      edges.push({
        id: `h|${pid}|${r.id}`, sources: [pid], targets: [r.id],
        layoutOptions: { 'elk.stress.desiredEdgeLength': String(len) },
      });
    }
  });
  // Dependency edges — longer to visually separate from hierarchy
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      if (iMap[d]) edges.push({
        id: `d|${d}|${r.id}`, sources: [d], targets: [r.id],
        layoutOptions: { 'elk.stress.desiredEdgeLength': '200' },
      });
    });
  });

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'stress',
      'elk.stress.desiredEdgeLength': '140',
      'elk.stress.epsilon': '0.00001',
      'elk.stress.fixed': 'NONE',
      'elk.spacing.nodeNode': '20',
    },
    children,
    edges,
  };
}

// ── Extract positions from ELK result ───────────────────────────────────────
function extractLayout(result, tree, iMap) {
  const pos = {};
  (result.children || []).forEach(n => { pos[n.id] = { x: n.x, y: n.y }; });

  // Build edge paths from positions (stress produces straight-line routes)
  const hierRoutes = [];
  const depRoutes = [];

  (result.edges || []).forEach(edge => {
    const parts = edge.id.split('|');
    const from = parts[1], to = parts[2];
    const isHier = edge.id.startsWith('h|');

    let path;
    if (edge.sections?.length) {
      const pts = [];
      edge.sections.forEach(s => {
        pts.push(s.startPoint);
        (s.bendPoints || []).forEach(p => pts.push(p));
        pts.push(s.endPoint);
      });
      path = 'M' + pts.map(p => `${p.x},${p.y}`).join(' L');
    }

    (isHier ? hierRoutes : depRoutes).push({ id: edge.id, from, to, path });
  });

  return { pos, hierRoutes, depRoutes };
}

// ── Compute edge path from node positions ───────────────────────────────────
function edgePath(fp, tp, fw, fh, tw, th, curved) {
  // Find best connection points (closest sides)
  const fcx = fp.x + fw / 2, fcy = fp.y + fh / 2;
  const tcx = tp.x + tw / 2, tcy = tp.y + th / 2;
  const dx = tcx - fcx, dy = tcy - fcy;
  const angle = Math.atan2(dy, dx);

  // Exit/enter points on node borders
  let x1, y1, x2, y2;
  if (Math.abs(dx) * fh > Math.abs(dy) * fw) {
    // Horizontal connection
    x1 = dx > 0 ? fp.x + fw : fp.x;
    y1 = fcy + (dx > 0 ? 1 : -1) * dy * (fw / 2) / Math.abs(dx);
    x2 = dx > 0 ? tp.x : tp.x + tw;
    y2 = tcy - (dx > 0 ? 1 : -1) * dy * (tw / 2) / Math.abs(dx);
  } else {
    // Vertical connection
    y1 = dy > 0 ? fp.y + fh : fp.y;
    x1 = fcx + (dy > 0 ? 1 : -1) * dx * (fh / 2) / Math.abs(dy);
    y2 = dy > 0 ? tp.y : tp.y + th;
    x2 = tcx - (dy > 0 ? 1 : -1) * dx * (th / 2) / Math.abs(dy);
  }

  y1 = Math.max(fp.y, Math.min(fp.y + fh, y1));
  x1 = Math.max(fp.x, Math.min(fp.x + fw, x1));
  y2 = Math.max(tp.y, Math.min(tp.y + th, y2));
  x2 = Math.max(tp.x, Math.min(tp.x + tw, x2));

  if (curved) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const off = Math.min(15, Math.sqrt(dx * dx + dy * dy) * 0.15);
    const nx = -(y2 - y1), ny = x2 - x1;
    const len = Math.sqrt(nx * nx + ny * ny) || 1;
    return `M${x1},${y1} Q${mx + nx / len * off},${my + ny / len * off} ${x2},${y2}`;
  }
  return `M${x1},${y1} L${x2},${y2}`;
}

// ── L1 group bounding boxes ─────────────────────────────────────────────────
function groupBoxes(tree, pos) {
  const PAD = 10;
  return tree.filter(r => r.lvl === 1).map(p1 => {
    const desc = tree.filter(r => r.id === p1.id || r.id.startsWith(p1.id + '.'));
    const rects = desc.map(r => { const p = pos[r.id]; if (!p) return null; return { l: p.x, t: p.y, r: p.x + (NW[r.lvl] || 95), b: p.y + (NH[r.lvl] || 34) }; }).filter(Boolean);
    if (!rects.length) return null;
    const x = Math.min(...rects.map(r => r.l)) - PAD;
    const y = Math.min(...rects.map(r => r.t)) - PAD;
    return { id: p1.id, x, y, w: Math.max(...rects.map(r => r.r)) + PAD - x, h: Math.max(...rects.map(r => r.b)) + PAD - y };
  }).filter(Boolean);
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
  const [drawing, setDrawing] = useState(null);
  const [manualPos, setManualPos] = useState({});
  const [dragNode, setDragNode] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [layout, setLayout] = useState(null);

  const items = tree;
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);

  const nw = id => NW[iMap[id]?.lvl] || 95;
  const nh = id => NH[iMap[id]?.lvl] || 34;
  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  // ── ELK stress layout ──────────────────────────────
  useEffect(() => {
    if (!items.length) { setLayout(null); return; }
    let cancelled = false;
    elk.layout(buildElkGraph(items))
      .then(r => { if (!cancelled) setLayout(extractLayout(r, items, iMap)); })
      .catch(e => console.error('ELK layout error:', e));
    return () => { cancelled = true; };
  }, [items]);

  const pos = useMemo(() => {
    if (!layout) return {};
    const p = { ...layout.pos };
    Object.entries(manualPos).forEach(([id, mp]) => { if (p[id]) p[id] = mp; });
    return p;
  }, [layout, manualPos]);

  const l1Boxes = useMemo(() => layout ? groupBoxes(items, pos) : [], [layout, items, pos]);

  // Compute edge paths from positions
  const hierLines = useMemo(() => {
    if (!layout) return [];
    return layout.hierRoutes.map(r => {
      if (r.path) return r;
      const fp = pos[r.from], tp = pos[r.to];
      if (!fp || !tp) return null;
      return { ...r, path: edgePath(fp, tp, nw(r.from), nh(r.from), nw(r.to), nh(r.to), false) };
    }).filter(Boolean);
  }, [layout, pos]);

  const depLines = useMemo(() => {
    if (!layout) return [];
    // Include ELK-computed routes + any deps without routes
    const edgeSet = new Set(layout.depRoutes.map(r => r.id));
    const all = [...layout.depRoutes];
    // Add deps that weren't in the ELK graph (shouldn't happen, but safety)
    items.forEach(r => {
      (r.deps || []).forEach(d => {
        const id = `d|${d}|${r.id}`;
        if (!edgeSet.has(id) && iMap[d] && pos[d] && pos[r.id]) {
          all.push({ id, from: d, to: r.id, path: null });
        }
      });
    });
    return all.map(r => {
      if (r.path) return r;
      const fp = pos[r.from], tp = pos[r.to];
      if (!fp || !tp) return null;
      return { ...r, path: edgePath(fp, tp, nw(r.from), nh(r.from), nw(r.to), nh(r.to), true) };
    }).filter(Boolean);
  }, [layout, pos, items]);

  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([id, p]) => p.x + nw(id))) + 30 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([id, p]) => p.y + nh(id))) + 30 : 300;

  function fitToScreen() {
    if (!svgRef.current || !items.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vw = rect.width - 16, vh = rect.height - 50;
    const z = Math.max(.05, Math.min(vw / graphW, vh / graphH, 1.5));
    setPan({ x: (rect.width - graphW * z) / 2, y: Math.max(10, (rect.height - graphH * z) / 2) });
    setZoom(z);
  }
  useEffect(() => { if (layout) setTimeout(fitToScreen, 80); }, [layout]);

  function svgPt(e) { const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom }; }

  useEffect(() => {
    const el = svgRef.current?.parentElement; if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return;
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const f = e.deltaY > 0 ? .92 : 1.08;
        const nz = Math.min(3, Math.max(.05, zoom * f));
        setPan(p => ({ x: mx - (mx - p.x) * (nz / zoom), y: my - (my - p.y) * (nz / zoom) }));
        setZoom(nz);
      } else { setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  function onMD(e) { if (drawing || dragNode) return; if (e.button === 0) { setPanning(true); setPanSt({ x: e.clientX - pan.x, y: e.clientY - pan.y }); } }
  function onMM(e) {
    if (dragNode) { const p = svgPt(e); setManualPos(np => ({ ...np, [dragNode.id]: { x: p.x - dragNode.ox, y: p.y - dragNode.oy } })); return; }
    if (drawing) { setDrawing(d => ({ ...d, mx: e.clientX, my: e.clientY })); return; }
    if (panning && panSt) setPan({ x: e.clientX - panSt.x, y: e.clientY - panSt.y });
  }
  function onMU(e) {
    if (dragNode) { setDragNode(null); return; }
    if (drawing) {
      const p = svgPt(e);
      const target = items.find(r => { const np = pos[r.id]; return np && p.x >= np.x && p.x <= np.x + nw(r.id) && p.y >= np.y && p.y <= np.y + nh(r.id); });
      if (target && target.id !== drawing.fromId && onAddDep) onAddDep(drawing.fromId, target.id);
      setDrawing(null); return;
    }
    setPanning(false); setPanSt(null);
  }
  function onNodeMD(e, r) { e.stopPropagation(); const p = svgPt(e); const np = pos[r.id] || { x: 0, y: 0 }; setDragNode({ id: r.id, ox: p.x - np.x, oy: p.y - np.y }); }
  function onConnStart(e, r) { e.stopPropagation(); setDrawing({ fromId: r.id, mx: e.clientX, my: e.clientY }); }
  function onCtx(e, r) { e.preventDefault(); e.stopPropagation(); setCtxMenu({ id: r.id, x: e.clientX, y: e.clientY }); }

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);
  useEffect(() => { function onKey(e) { if ((e.key === 'Delete' || e.key === 'Backspace') && selId && onDeleteNode && !e.target.closest('input,textarea,select')) { if (confirm(`Delete ${selId}?`)) { onDeleteNode(selId); setSelId(null); } } } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [selId]);

  const activeId = hoverId || selId;

  if (!items.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🕸</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div>
      {onAddNode && <button className="btn btn-pri" onClick={onAddNode}>+ Add first item</button>}
    </div>
  </div>;

  if (!layout) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)' }}>Computing layout...</div>;

  return <div className="netgraph-wrap" style={{ cursor: dragNode ? 'grabbing' : drawing ? 'crosshair' : panning ? 'grabbing' : 'default' }}>
    <div className="ng-toolbar">
      <button className="btn btn-pri btn-sm" onClick={fitToScreen}>Fit</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(1)}>100%</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.min(3, z * 1.25))}>+</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.max(.05, z * .8))}>-</button>
      {Object.keys(manualPos).length > 0 && <button className="btn btn-sec btn-sm" onClick={() => setManualPos({})}>Reset</button>}
      {selId && <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete ${selId}?`)) { onDeleteNode(selId); setSelId(null); } }}>Del {selId}</button>}
    </div>

    <svg ref={svgRef} style={{ width: '100%', height: '100%' }} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
      onMouseLeave={() => { setPanning(false); setDragNode(null); setDrawing(null); }}
      onDoubleClick={e => { if (e.target === svgRef.current || e.target.tagName === 'svg') onAddNode?.(); }}>
      <defs>
        <marker id="ar-h" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="4" markerHeight="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--b3)" /></marker>
        <marker id="ar-d" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--ac)" /></marker>
        <marker id="ar-cp" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" /></marker>
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

        {/* L1 group backgrounds */}
        {l1Boxes.map(b => {
          const tc = gTC(iMap[b.id]?.team);
          return <rect key={'bg' + b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={tc + '06'} stroke={tc + '15'} strokeWidth={.8} />;
        })}

        {/* Hierarchy edges */}
        {hierLines.map(r => {
          const isL1 = iMap[r.from]?.lvl === 1;
          return <path key={r.id} d={r.path} fill="none" stroke="var(--b3)" strokeWidth={isL1 ? .7 : .9} opacity={.3} markerEnd="url(#ar-h)" />;
        })}

        {/* Dependency edges */}
        {depLines.map(r => {
          const isCp = cpSet?.has(r.from) && cpSet?.has(r.to);
          const isActive = activeId && (r.from === activeId || r.to === activeId);
          if (!isActive && !isCp && activeId) return null;
          const op = isActive ? .75 : isCp ? .45 : .1;
          return <path key={r.id} d={r.path} fill="none" stroke={isCp ? 'var(--re)' : 'var(--ac)'} strokeWidth={isActive ? 2 : isCp ? 1.2 : .7} strokeDasharray="4 3" opacity={op} markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'} />;
        })}

        {/* Drawing line */}
        {drawing && (() => { const fp = pos[drawing.fromId]; if (!fp) return null; const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return null;
          const mx = (drawing.mx - rect.left - pan.x) / zoom, my = (drawing.my - rect.top - pan.y) / zoom;
          return <line x1={fp.x + nw(drawing.fromId) / 2} y1={fp.y + nh(drawing.fromId)} x2={mx} y2={my} stroke="var(--ac)" strokeWidth={1.5} strokeDasharray="5 3" />; })()}

        {/* Nodes */}
        {items.map(r => {
          const p = pos[r.id]; if (!p) return null;
          const w = nw(r.id), h = nh(r.id);
          const isCp = cpSet?.has(r.id); const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id; const isDone = r.status === 'done';
          const isL1 = r.lvl === 1, isL2 = r.lvl === 2;
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={isDone ? .4 : 1}>
            <rect width={w} height={h} rx={isL1 ? 6 : 4}
              fill={isL1 ? tc + '20' : isL2 ? tc + '12' : 'var(--bg2)'}
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : tc + (isL1 ? '55' : '30')}
              strokeWidth={isSel ? 2 : isCp ? 1.5 : .7}
              style={{ cursor: dragNode?.id === r.id ? 'grabbing' : 'grab' }}
              onMouseDown={e => onNodeMD(e, r)}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { if (!dragNode && !drawing) { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); } }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            <rect x={0} y={isL1 ? h - 2 : 0} width={isL1 ? w : 2} height={isL1 ? 2 : h} rx={1} fill={stC} style={{ pointerEvents: 'none' }} />
            <circle cx={w / 2} cy={h} r={2.5} fill={tc + '44'} stroke={tc} strokeWidth={.5}
              style={{ cursor: 'crosshair', opacity: .2 }} onMouseDown={e => onConnStart(e, r)}
              onMouseEnter={e => { e.target.style.opacity = '1'; e.target.setAttribute('r', '4'); }}
              onMouseLeave={e => { e.target.style.opacity = '.2'; e.target.setAttribute('r', '2.5'); }} />
            {isL1 ? <text x={w / 2} y={h / 2} fontSize={8.5} fill={tc} fontWeight={700} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
              {r.name.length > 18 ? r.name.slice(0, 17) + '..' : r.name}
            </text>
            : <>
              <text x={4} y={8} fontSize={5.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
              <text x={4} y={isL2 ? 16 : 18} fontSize={isL2 ? 7 : 6.5} fill={tc} fontWeight={isL2 ? 600 : 500} style={{ pointerEvents: 'none' }}>
                {r.name.length <= 16 ? r.name : <>{r.name.slice(0, 16)}<tspan x={4} dy={isL2 ? 8 : 8}>{r.name.slice(16, 32)}{r.name.length > 32 ? '..' : ''}</tspan></>}
              </text>
              {!isL2 && sc && <text x={4} y={r.name.length > 16 ? 33 : 27} fontSize={5.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
            </>}
            {isDone && <text x={w - 8} y={h / 2 + 1} fontSize={9} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>&#x2705;</text>}
          </g>;
        })}
      </g>
    </svg>

    {ctxMenu && <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 4, zIndex: 999, boxShadow: 'var(--sh)', minWidth: 140 }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onNodeClick(iMap[ctxMenu.id]); setCtxMenu(null); }}>Edit {ctxMenu.id}</div>
      {iMap[ctxMenu.id]?.lvl < 3 && <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onAddNode?.(); setCtxMenu(null); }}>+ Add child</div>}
      <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4, color: 'var(--re)' }} className="tr" onClick={() => { if (confirm(`Delete ${ctxMenu.id}?`)) { onDeleteNode(ctxMenu.id); setSelId(null); } setCtxMenu(null); }}>Delete</div>
    </div>}

    <div className="ng-legend">
      <div className="ng-li"><div style={{ width: 14, height: 1, background: 'var(--b3)', flexShrink: 0 }} />Hierarchy</div>
      <div className="ng-li"><div style={{ width: 14, height: 0, borderTop: '1.5px dashed var(--ac)', flexShrink: 0 }} />Dependency</div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>Crit. path</div>
      <span style={{ color: 'var(--tx3)', fontSize: 9 }}>Scroll=pan · Pinch=zoom · Drag=move · Right-click=menu</span>
    </div>
    {tip && !drawing && !dragNode && <Tip item={tip.item} x={tip.x} y={tip.y} teams={teams} tree={tree} />}
  </div>;
}
