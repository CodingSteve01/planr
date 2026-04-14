import { useState, useRef, useEffect, useMemo } from 'react';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

// ── Top-Down Tree Layout ────────────────────────────────────────────────────
// L1 across the top as wide headers, L2 as columns below, L3 as stacked cards
function treeLayout(items, iMap, NW, NH) {
  const pos = {};
  const PAD = 14;
  const l1s = items.filter(r => r.lvl === 1);

  let l1X = 0;
  const l1Boxes = []; // { id, x, y, w, h } for background rendering

  l1s.forEach(p1 => {
    const l2s = items.filter(r => r.lvl === 2 && r.id.startsWith(p1.id + '.'));
    const L1_Y = 0;

    if (!l2s.length) {
      pos[p1.id] = { x: l1X, y: L1_Y };
      l1Boxes.push({ id: p1.id, x: l1X - 6, y: L1_Y - 6, w: NW[1] + 12, h: NH[1] + 12 });
      l1X += NW[1] + PAD * 3;
      return;
    }

    // Measure L2 columns
    const l2Cols = l2s.map(p2 => {
      const l3s = items.filter(r => r.lvl === 3 && r.id.startsWith(p2.id + '.'));
      const colH = NH[2] + PAD + l3s.length * (NH[3] + PAD);
      return { p2, l3s, colH };
    });

    // Place L2 columns side by side, starting below L1 header
    const L2_TOP = NH[1] + PAD * 2;
    let colX = l1X;

    l2Cols.forEach(col => {
      pos[col.p2.id] = { x: colX, y: L2_TOP };
      // L3 tasks stacked under L2
      let taskY = L2_TOP + NH[2] + PAD;
      col.l3s.forEach(t => {
        pos[t.id] = { x: colX + (NW[2] - NW[3]) / 2, y: taskY };
        taskY += NH[3] + PAD;
      });
      colX += Math.max(NW[2], NW[3]) + PAD;
    });

    // L1 header spans the full width of its children
    const totalW = colX - l1X - PAD;
    pos[p1.id] = { x: l1X + (totalW - NW[1]) / 2, y: L1_Y };

    const maxH = Math.max(...l2Cols.map(c => c.colH)) + L2_TOP;
    l1Boxes.push({ id: p1.id, x: l1X - 8, y: L1_Y - 8, w: totalW + 16, h: maxH + 16 });

    l1X = colX + PAD * 2;
  });

  // Orphans (items without a parent in the tree)
  let orphanY = (l1Boxes.length ? Math.max(...l1Boxes.map(b => b.y + b.h)) : 0) + PAD * 2;
  items.filter(r => !pos[r.id]).forEach(r => {
    pos[r.id] = { x: 0, y: orphanY };
    orphanY += (NH[r.lvl] || 42) + PAD;
  });

  return { pos, l1Boxes };
}

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

  const items = tree;
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const sMap = Object.fromEntries(scheduled.map(s => [s.id, s]));

  const NW_MAP = { 1: 220, 2: 170, 3: 150 };
  const NH_MAP = { 1: 30, 2: 28, 3: 40 };
  const nw = id => NW_MAP[iMap[id]?.lvl] || 150;
  const nh = id => NH_MAP[iMap[id]?.lvl] || 40;

  const [hoverId, setHoverId] = useState(null);

  // Edges: only L2→L3 hierarchy (L1→L2 shown by container background)
  const hierEdges = []; const depEdges = [];
  items.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid] && items.find(x => x.id === pid) && iMap[pid].lvl >= 2) hierEdges.push({ from: pid, to: r.id });
    (r.deps || []).forEach(d => { if (iMap[d] && items.find(x => x.id === d)) depEdges.push({ from: d, to: r.id, label: r._depLabels?.[d] || '' }); });
  });

  // Dep visibility: only show deps connected to hovered or selected node
  const activeId = hoverId || selId;
  const visibleDeps = activeId
    ? depEdges.filter(e => e.from === activeId || e.to === activeId)
    : depEdges; // show all if nothing selected (but very faded)

  // Compute layout
  const { pos: autoPos, l1Boxes } = useMemo(() => treeLayout(items, iMap, NW_MAP, NH_MAP), [items]);

  // Merge manual overrides
  const pos = useMemo(() => {
    const p = { ...autoPos };
    Object.entries(manualPos).forEach(([id, mp]) => { if (p[id]) p[id] = mp; });
    return p;
  }, [autoPos, manualPos]);

  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  // Graph bounds
  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([id, p]) => p.x + nw(id))) + 40 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([id, p]) => p.y + nh(id))) + 40 : 300;

  function fitToScreen() {
    if (!svgRef.current || !items.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vw = rect.width - 20, vh = rect.height - 60;
    const z = Math.max(.05, Math.min(vw / graphW, vh / graphH, 1.2));
    setPan({ x: (rect.width - graphW * z) / 2, y: Math.max(20, (rect.height - graphH * z) / 2) });
    setZoom(z);
  }
  useEffect(() => { if (items.length) setTimeout(fitToScreen, 100); }, [items.length]);

  // SVG coordinate helpers
  function svgPt(e) { const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom }; }

  // Wheel: scroll=pan, pinch=zoom
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
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
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
    if (drawing) { const p = svgPt(e); const target = items.find(r => { const np = pos[r.id]; return np && p.x >= np.x && p.x <= np.x + nw(r.id) && p.y >= np.y && p.y <= np.y + nh(r.id); }); if (target && target.id !== drawing.fromId && onAddDep) onAddDep(drawing.fromId, target.id); setDrawing(null); return; }
    setPanning(false); setPanSt(null);
  }
  function onNodeMD(e, r) { e.stopPropagation(); const p = svgPt(e); const np = pos[r.id] || { x: 0, y: 0 }; setDragNode({ id: r.id, ox: p.x - np.x, oy: p.y - np.y }); }
  function onConnStart(e, r) { e.stopPropagation(); setDrawing({ fromId: r.id, mx: e.clientX, my: e.clientY }); }
  function onCtx(e, r) { e.preventDefault(); e.stopPropagation(); setCtxMenu({ id: r.id, x: e.clientX, y: e.clientY }); }

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);
  useEffect(() => { function onKey(e) { if ((e.key === 'Delete' || e.key === 'Backspace') && selId && onDeleteNode && !e.target.closest('input,textarea,select')) { if (confirm(`Delete ${selId}?`)) { onDeleteNode(selId); setSelId(null); } } } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [selId]);

  // Edge path: smart routing - go down from parent, right to child
  function edgePath(fromId, toId, dashed) {
    const fp = pos[fromId], tp = pos[toId]; if (!fp || !tp) return null;
    const fw = nw(fromId), fh = nh(fromId), tw = nw(toId), th = nh(toId);
    // Determine best connection points
    const fcx = fp.x + fw / 2, fcy = fp.y + fh / 2;
    const tcx = tp.x + tw / 2, tcy = tp.y + th / 2;

    if (dashed) {
      // Dependency: side-to-side bezier
      const x1 = fcx > tcx ? fp.x : fp.x + fw;
      const y1 = fcy;
      const x2 = fcx > tcx ? tp.x + tw : tp.x;
      const y2 = tcy;
      const dx = Math.abs(x2 - x1) || 40;
      return `M${x1},${y1} C${x1 + (x2 > x1 ? dx * .4 : -dx * .4)},${y1} ${x2 - (x2 > x1 ? dx * .4 : -dx * .4)},${y2} ${x2},${y2}`;
    }
    // Hierarchy: top-down straight with small bend
    const x1 = fcx, y1 = fp.y + fh;
    const x2 = tcx, y2 = tp.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }

  if (!items.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🕸</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div>
      {onAddNode && <button className="btn btn-pri" onClick={onAddNode}>+ Add first item</button>}
    </div>
  </div>;

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
        <marker id="ar-h" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--b3)" /></marker>
        <marker id="ar-d" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="6" markerHeight="5" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--ac)" /></marker>
        <marker id="ar-cp" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="6" markerHeight="5" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" /></marker>
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {/* L1 group backgrounds */}
        {l1Boxes.map(b => {
          const tc = gTC(iMap[b.id]?.team);
          return <rect key={'bg' + b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill={tc + '06'} stroke={tc + '18'} strokeWidth={1} />;
        })}
        {/* Hierarchy edges: only L2→L3, subtle top-down */}
        {hierEdges.map((e, i) => { const d = edgePath(e.from, e.to, false); return d && <path key={'h' + i} d={d} fill="none" stroke="var(--b3)" strokeWidth={1} opacity={.3} />; })}
        {/* Dependency edges: show all faded, highlight on hover/select */}
        {depEdges.map((e, i) => { const d = edgePath(e.from, e.to, true); if (!d) return null;
          const isCp = cpSet?.has(e.from) && cpSet?.has(e.to);
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          const show = isActive || isCp || !activeId;
          if (!show) return null;
          const fp = pos[e.from], tp = pos[e.to]; if (!fp || !tp) return null;
          const mx = (fp.x + nw(e.from) / 2 + tp.x + nw(e.to) / 2) / 2;
          const my = (fp.y + nh(e.from) / 2 + tp.y + nh(e.to) / 2) / 2;
          const op = isActive ? .8 : isCp ? .5 : .15;
          return <g key={'d' + i}>
            <path d={d} fill="none" stroke={isCp ? 'var(--re)' : 'var(--ac)'} strokeWidth={isActive ? 2.5 : isCp ? 1.5 : 1} strokeDasharray="6 4" opacity={op} markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'} />
            {e.label && (isActive || !activeId) && <text x={mx} y={my - 5} fontSize={8} fill="var(--ac)" textAnchor="middle" fontFamily="var(--mono)" opacity={isActive ? .9 : .4} style={{ pointerEvents: 'none' }}>{e.label}</text>}
          </g>;
        })}
        {/* Drawing line */}
        {drawing && (() => { const fp = pos[drawing.fromId]; if (!fp) return null; const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return null;
          const mx = (drawing.mx - rect.left - pan.x) / zoom, my = (drawing.my - rect.top - pan.y) / zoom;
          return <line x1={fp.x + nw(drawing.fromId) / 2} y1={fp.y + nh(drawing.fromId)} x2={mx} y2={my} stroke="var(--ac)" strokeWidth={2} strokeDasharray="6 3" />; })()}
        {/* Nodes */}
        {items.map(r => {
          const p = pos[r.id]; if (!p) return null;
          const w = nw(r.id), h = nh(r.id);
          const isCp = cpSet?.has(r.id); const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id; const isDone = r.status === 'done';
          const isL1 = r.lvl === 1, isL2 = r.lvl === 2;
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={isDone ? .45 : 1}>
            <rect width={w} height={h} rx={isL1 ? 8 : isL2 ? 6 : 5}
              fill={isL1 ? tc + '20' : isL2 ? tc + '15' : 'var(--bg2)'}
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : tc + (isL1 ? '66' : '44')}
              strokeWidth={isSel ? 2.5 : isL1 ? 1.5 : isCp ? 2 : 1}
              style={{ cursor: dragNode?.id === r.id ? 'grabbing' : 'grab' }}
              onMouseDown={e => onNodeMD(e, r)}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { if (!dragNode && !drawing) { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); } }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            <rect x={0} y={isL1 ? h - 3 : 0} width={isL1 ? w : 3} height={isL1 ? 3 : h} rx={2} fill={stC} style={{ pointerEvents: 'none' }} />
            {/* Connection handle at bottom */}
            <circle cx={w / 2} cy={h} r={4} fill={tc + '55'} stroke={tc} strokeWidth={.8}
              style={{ cursor: 'crosshair', opacity: .3 }} onMouseDown={e => onConnStart(e, r)}
              onMouseEnter={e => { e.target.style.opacity = '1'; e.target.setAttribute('r', '6'); }}
              onMouseLeave={e => { e.target.style.opacity = '.3'; e.target.setAttribute('r', '4'); }} />
            {/* Text */}
            {isL1 ? <>
              <text x={w / 2} y={h / 2} fontSize={11} fill={tc} fontWeight={700} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{r.name.length > 28 ? r.name.slice(0, 27) + '...' : r.name}</text>
            </> : isL2 ? <>
              <text x={6} y={11} fontSize={7} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
              <text x={6} y={22} fontSize={9.5} fill={tc} fontWeight={600} style={{ pointerEvents: 'none' }}>{r.name.length > 22 ? r.name.slice(0, 21) + '...' : r.name}</text>
            </> : <>
              <text x={8} y={12} fontSize={7} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
              <text x={8} y={24} fontSize={9} fill={tc} fontWeight={500} style={{ pointerEvents: 'none' }}>{r.name.length > 20 ? r.name.slice(0, 19) + '...' : r.name}</text>
              {sc && <text x={8} y={35} fontSize={7.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
            </>}
            {isDone && <text x={w - 14} y={isL1 ? h / 2 + 1 : h / 2 + 1} fontSize={12} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>&#x2705;</text>}
          </g>;
        })}
      </g>
    </svg>
    {/* Context menu */}
    {ctxMenu && <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 4, zIndex: 999, boxShadow: 'var(--sh)', minWidth: 150 }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onNodeClick(iMap[ctxMenu.id]); setCtxMenu(null); }}>Edit {ctxMenu.id}</div>
      {iMap[ctxMenu.id]?.lvl < 3 && <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onAddNode?.(); setCtxMenu(null); }}>+ Add child</div>}
      <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4, color: 'var(--re)' }} className="tr" onClick={() => { if (confirm(`Delete ${ctxMenu.id}?`)) { onDeleteNode(ctxMenu.id); setSelId(null); } setCtxMenu(null); }}>Delete</div>
    </div>}
    <div className="ng-legend">
      <div className="ng-li"><div style={{ width: 20, height: 2, background: 'var(--b3)', flexShrink: 0 }} />Hierarchy</div>
      <div className="ng-li"><div style={{ width: 20, height: 0, borderTop: '2px dashed var(--ac)', flexShrink: 0 }} />Dependency</div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>Crit. path</div>
      <span style={{ color: 'var(--tx3)', fontSize: 10 }}>Scroll=pan · Pinch=zoom · Drag=move · Right-click=menu</span>
    </div>
    {tip && !drawing && !dragNode && <Tip item={tip.item} x={tip.x} y={tip.y} />}
  </div>;
}
