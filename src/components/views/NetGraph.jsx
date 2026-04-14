import { useState, useRef, useEffect, useMemo } from 'react';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

// Force-directed overlap removal: iteratively push apart overlapping nodes
function removeOverlaps(pos, items, NW, NH, PAD = 8, iterations = 60) {
  const p = {}; items.forEach(r => { p[r.id] = { ...pos[r.id] }; });
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const pa = p[a.id], pb = p[b.id]; if (!pa || !pb) continue;
        const wa = (NW[a.lvl] || 130) + PAD, ha = (NH[a.lvl] || 40) + PAD;
        const wb = (NW[b.lvl] || 130) + PAD, hb = (NH[b.lvl] || 40) + PAD;
        const ox = Math.max(0, (wa + wb) / 2 - Math.abs((pa.x + wa / 2) - (pb.x + wb / 2)));
        const oy = Math.max(0, (ha + hb) / 2 - Math.abs((pa.y + ha / 2) - (pb.y + hb / 2)));
        if (ox > 0 && oy > 0) {
          // Push apart along smallest overlap axis
          if (oy < ox) {
            const dy = oy / 2 + 1; if (pa.y < pb.y) { pa.y -= dy; pb.y += dy; } else { pa.y += dy; pb.y -= dy; }
          } else {
            const dx = ox / 2 + 1; if (pa.x < pb.x) { pa.x -= dx; pb.x += dx; } else { pa.x += dx; pb.x -= dx; }
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return p;
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

  const items = tree.filter(r => r.status !== 'done' || r.lvl < 3);
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const sMap = Object.fromEntries(scheduled.map(s => [s.id, s]));

  const NW_MAP = { 1: 200, 2: 160, 3: 135 };
  const NH_MAP = { 1: 32, 2: 30, 3: 42 };
  const nw = id => NW_MAP[iMap[id]?.lvl] || 135;
  const nh = id => NH_MAP[iMap[id]?.lvl] || 42;

  // Edges
  const hierEdges = []; const depEdges = [];
  items.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid] && items.find(x => x.id === pid)) hierEdges.push({ from: pid, to: r.id });
    (r.deps || []).forEach(d => { if (iMap[d] && items.find(x => x.id === d)) depEdges.push({ from: d, to: r.id }); });
  });

  // Hierarchical layout: group by L1, then L2, then L3
  const layout = useMemo(() => {
    const pos = {};
    const P = 12;
    const l1s = items.filter(r => r.lvl === 1);
    let globalY = 0;

    l1s.forEach(p1 => {
      const l2s = items.filter(r => r.lvl === 2 && r.id.startsWith(p1.id + '.'));
      pos[p1.id] = { x: 0, y: globalY };
      let colX = NW_MAP[1] + 50;
      const startY = globalY;

      if (!l2s.length) { globalY += NH_MAP[1] + P * 2; return; }

      l2s.forEach(p2 => {
        const l3s = items.filter(r => r.lvl === 3 && r.id.startsWith(p2.id + '.'));
        pos[p2.id] = { x: colX, y: globalY };
        let taskX = colX + NW_MAP[2] + 35;
        let taskY = globalY;
        const COL_MAX = 5;

        l3s.forEach((t, idx) => {
          pos[t.id] = { x: taskX, y: taskY };
          taskY += NH_MAP[3] + P;
          if ((idx + 1) % COL_MAX === 0 && idx < l3s.length - 1) { taskY = globalY; taskX += NW_MAP[3] + 25; }
        });
        const blockBottom = Math.max(taskY, globalY + NH_MAP[2] + P);
        globalY = blockBottom + 6;
      });

      // Center L1 box beside its children
      pos[p1.id].y = startY + (globalY - P - startY - NH_MAP[1]) / 2;
      globalY += P;
    });

    // Orphans
    items.filter(r => !pos[r.id]).forEach(r => { pos[r.id] = { x: 0, y: globalY }; globalY += (NH_MAP[r.lvl] || 42) + P; });

    // Apply manual overrides before overlap removal
    Object.entries(manualPos).forEach(([id, p]) => { if (pos[id]) pos[id] = p; });

    // Remove overlaps with force-directed separation
    return removeOverlaps(pos, items, NW_MAP, NH_MAP);
  }, [items, manualPos]);

  const pos = layout;
  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  // Graph bounds
  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([id, p]) => p.x + nw(id))) + 20 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([id, p]) => p.y + nh(id))) + 20 : 300;

  function fitToScreen() {
    if (!svgRef.current || !items.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vw = rect.width - 20, vh = rect.height - 60;
    const z = Math.max(.08, Math.min(vw / graphW, vh / graphH, 1.3));
    setPan({ x: (rect.width - graphW * z) / 2, y: Math.max((rect.height - graphH * z) / 2, 10) }); setZoom(z);
  }
  useEffect(() => { if (items.length) setTimeout(fitToScreen, 100); }, [items.length]);

  function svgPt(e) { const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom }; }
  function onW(e) { e.preventDefault(); const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return; const mx = e.clientX - rect.left, my = e.clientY - rect.top; const f = e.deltaY > 0 ? .88 : 1.12; const nz = Math.min(3, Math.max(.08, zoom * f)); setPan({ x: mx - (mx - pan.x) * (nz / zoom), y: my - (my - pan.y) * (nz / zoom) }); setZoom(nz); }
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
  function onConnStart(e, r) { e.stopPropagation(); e.preventDefault(); setDrawing({ fromId: r.id, mx: e.clientX, my: e.clientY }); }
  function onCtx(e, r) { e.preventDefault(); e.stopPropagation(); setCtxMenu({ id: r.id, x: e.clientX, y: e.clientY }); }

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);
  useEffect(() => { function onKey(e) { if ((e.key === 'Delete' || e.key === 'Backspace') && selId && onDeleteNode && !e.target.closest('input,textarea,select')) { if (confirm(`Delete ${selId}?`)) { onDeleteNode(selId); setSelId(null); } } } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [selId]);

  function edgePath(fromId, toId) {
    const fp = pos[fromId], tp = pos[toId]; if (!fp || !tp) return null;
    const fw = nw(fromId), fh = nh(fromId), th = nh(toId);
    const x1 = fp.x + fw, y1 = fp.y + fh / 2, x2 = tp.x, y2 = tp.y + th / 2;
    const dx = Math.abs(x2 - x1) || 40;
    return `M${x1},${y1} C${x1 + dx * .3},${y1} ${x2 - dx * .3},${y2} ${x2},${y2}`;
  }

  if (!items.length) return <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🕸</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>No items yet</div>
      {onAddNode && <button className="btn btn-pri" onClick={onAddNode}>+ Add first item</button>}
    </div>
  </div>;

  return <div className="netgraph-wrap" onWheel={onW} style={{ cursor: dragNode ? 'grabbing' : drawing ? 'crosshair' : panning ? 'grabbing' : 'grab' }}>
    <div className="ng-toolbar">
      <button className="btn btn-pri btn-sm" onClick={fitToScreen}>Fit</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(1)}>100%</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.min(3, z * 1.25))}>+</button>
      <button className="btn btn-sec btn-sm" onClick={() => setZoom(z => Math.max(.08, z * .8))}>-</button>
      {Object.keys(manualPos).length > 0 && <button className="btn btn-sec btn-sm" onClick={() => setManualPos({})}>Reset</button>}
      {selId && <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete ${selId}?`)) { onDeleteNode(selId); setSelId(null); } }}>Del {selId}</button>}
    </div>
    <svg ref={svgRef} style={{ width: '100%', height: '100%' }} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
      onMouseLeave={() => { setPanning(false); setDragNode(null); setDrawing(null); }}
      onDoubleClick={e => { if (e.target === svgRef.current || e.target.tagName === 'svg') onAddNode?.(); }}>
      <defs>
        <marker id="ar" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,3 L0,6 Z" fill="var(--b3)" /></marker>
        <marker id="ar-d" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="6" markerHeight="5" orient="auto"><path d="M0,0 L10,3 L0,6 Z" fill="var(--ac)" /></marker>
        <marker id="ar-cp" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="6" markerHeight="5" orient="auto"><path d="M0,0 L10,3 L0,6 Z" fill="var(--re)" /></marker>
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {hierEdges.map((e, i) => { const d = edgePath(e.from, e.to); return d && <path key={'h' + i} d={d} fill="none" stroke="var(--b2)" strokeWidth={1} strokeDasharray="4 3" opacity={.5} />; })}
        {depEdges.map((e, i) => { const d = edgePath(e.from, e.to); if (!d) return null; const isCp = cpSet?.has(e.from) && cpSet?.has(e.to); return <path key={'d' + i} d={d} fill="none" stroke={isCp ? 'var(--re)' : 'var(--ac)'} strokeWidth={isCp ? 2.5 : 1.5} opacity={isCp ? .8 : .5} markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'} />; })}
        {drawing && (() => { const fp = pos[drawing.fromId]; if (!fp) return null; const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return null; const mx = (drawing.mx - rect.left - pan.x) / zoom, my = (drawing.my - rect.top - pan.y) / zoom; return <line x1={fp.x + nw(drawing.fromId)} y1={fp.y + nh(drawing.fromId) / 2} x2={mx} y2={my} stroke="var(--ac)" strokeWidth={2} strokeDasharray="6 3" />; })()}
        {items.map(r => {
          const p = pos[r.id]; if (!p) return null;
          const w = nw(r.id), h = nh(r.id);
          const isCp = cpSet?.has(r.id); const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id;
          const isL1 = r.lvl === 1, isL2 = r.lvl === 2;
          return <g key={r.id} transform={`translate(${p.x},${p.y})`}>
            <rect width={w} height={h} rx={isL1 ? 10 : isL2 ? 7 : 5}
              fill={isL1 ? tc + '15' : isL2 ? tc + '12' : tc + '18'}
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : tc + (isL1 ? '55' : '44')}
              strokeWidth={isSel ? 2.5 : isL1 ? 2 : isCp ? 2.5 : 1}
              style={{ cursor: dragNode?.id === r.id ? 'grabbing' : 'grab' }}
              onMouseDown={e => onNodeMD(e, r)}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => !dragNode && !drawing && setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTip(null)} />
            <rect x={0} y={0} width={isL1 ? w : 4} height={isL1 ? 4 : h} rx={2} fill={stC} style={{ pointerEvents: 'none' }} opacity={isL1 ? .6 : 1} />
            {/* Connection handle */}
            <circle cx={w} cy={h / 2} r={5} fill={tc + '66'} stroke={tc} strokeWidth={1}
              style={{ cursor: 'crosshair', opacity: .4 }} onMouseDown={e => onConnStart(e, r)}
              onMouseEnter={e => { e.target.style.opacity = '1'; e.target.setAttribute('r', '7'); }}
              onMouseLeave={e => { e.target.style.opacity = '.4'; e.target.setAttribute('r', '5'); }} />
            {isL1 ? <>
              <text x={8} y={h / 2 + 1} fontSize={12} fill={tc} fontWeight={700} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{r.name.length > 24 ? r.name.slice(0, 23) + '...' : r.name}</text>
              <text x={w - 8} y={h / 2 + 1} fontSize={8} fill="var(--tx3)" fontFamily="var(--mono)" textAnchor="end" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{r.id}</text>
            </> : isL2 ? <>
              <text x={8} y={12} fontSize={7.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
              <text x={8} y={24} fontSize={10} fill={tc} fontWeight={600} style={{ pointerEvents: 'none' }}>{r.name.length > 22 ? r.name.slice(0, 21) + '...' : r.name}</text>
            </> : <>
              <text x={8} y={13} fontSize={7.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
              <text x={8} y={26} fontSize={9.5} fill={tc} fontWeight={500} style={{ pointerEvents: 'none' }}>{r.name.length > 18 ? r.name.slice(0, 17) + '...' : r.name}</text>
              {sc && <text x={8} y={37} fontSize={7.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
            </>}
          </g>;
        })}
      </g>
    </svg>
    {ctxMenu && <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 4, zIndex: 999, boxShadow: 'var(--sh)', minWidth: 150 }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onNodeClick(iMap[ctxMenu.id]); setCtxMenu(null); }}>Edit {ctxMenu.id}</div>
      {iMap[ctxMenu.id]?.lvl < 3 && <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onAddNode?.(); setCtxMenu(null); }}>+ Add child</div>}
      <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4, color: 'var(--re)' }} className="tr" onClick={() => { if (confirm(`Delete ${ctxMenu.id}?`)) { onDeleteNode(ctxMenu.id); setSelId(null); } setCtxMenu(null); }}>Delete</div>
    </div>}
    <div className="ng-legend">
      <div className="ng-li"><div className="ng-dot" style={{ background: 'var(--b2)', border: '1px dashed var(--b3)' }} />Hierarchy</div>
      <div className="ng-li"><div className="ng-dot" style={{ background: 'var(--ac)' }} />Dependency</div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>Crit. path</div>
      <span style={{ color: 'var(--tx3)', fontSize: 10 }}>Drag=move · Circle=connect · Dbl-click=edit · Right-click=menu</span>
    </div>
    {tip && !drawing && !dragNode && <Tip item={tip.item} x={tip.x} y={tip.y} />}
  </div>;
}
