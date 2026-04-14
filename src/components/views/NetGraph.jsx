import { useState, useRef, useEffect, useMemo } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

const elk = new ELK();
const NW = { 1: 150, 2: 130, 3: 115 };
const NH = { 1: 30, 2: 26, 3: 40 };
const PAD = 10; // minimum gap between nodes

// ── Stress layout → balanced positions ──────────────────────────────────────
function buildElkGraph(tree) {
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const children = tree.map(r => ({ id: r.id, width: NW[r.lvl] || 115, height: NH[r.lvl] || 40 }));
  const edges = [];

  tree.forEach(r => {
    const pid = r.id.split('.').slice(0, -1).join('.');
    if (pid && iMap[pid])
      edges.push({ id: `h|${pid}|${r.id}`, sources: [pid], targets: [r.id],
        layoutOptions: { 'elk.stress.desiredEdgeLength': String(r.lvl === 2 ? 140 : 100) } });
  });
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      if (iMap[d]) edges.push({ id: `d|${d}|${r.id}`, sources: [d], targets: [r.id],
        layoutOptions: { 'elk.stress.desiredEdgeLength': '180' } });
    });
  });

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'stress',
      'elk.stress.desiredEdgeLength': '120',
      'elk.stress.epsilon': '0.00001',
      'elk.spacing.nodeNode': '20',
    },
    children, edges,
  };
}

// ── Overlap removal: push overlapping nodes apart minimally ─────────────────
function removeOverlaps(rawPos, tree) {
  const nodes = tree.map(r => ({
    id: r.id, x: rawPos[r.id]?.x || 0, y: rawPos[r.id]?.y || 0,
    w: (NW[r.lvl] || 115) + PAD, h: (NH[r.lvl] || 40) + PAD,
  }));

  for (let iter = 0; iter < 80; iter++) {
    let maxOverlap = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0 && oy > 0) {
          maxOverlap = Math.max(maxOverlap, Math.min(ox, oy));
          if (ox < oy) {
            const d = ox / 2 + .5;
            if (a.x <= b.x) { a.x -= d; b.x += d; } else { a.x += d; b.x -= d; }
          } else {
            const d = oy / 2 + .5;
            if (a.y <= b.y) { a.y -= d; b.y += d; } else { a.y += d; b.y -= d; }
          }
        }
      }
    }
    if (maxOverlap < 1) break;
  }

  // Normalize to start near 0,0
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const pos = {};
  nodes.forEach(n => { pos[n.id] = { x: n.x - minX, y: n.y - minY }; });
  return pos;
}

// ── Smart elbow routing (orthogonal, 3-segment) ────────────────────────────
function elbowRoute(fp, tp, fw, fh, tw, th) {
  const fcx = fp.x + fw / 2, fcy = fp.y + fh / 2;
  const tcx = tp.x + tw / 2, tcy = tp.y + th / 2;
  const dx = tcx - fcx, dy = tcy - fcy;
  const horiz = Math.abs(dx) > Math.abs(dy);

  let x1, y1, x2, y2;
  if (horiz) {
    x1 = dx > 0 ? fp.x + fw : fp.x; y1 = fcy;
    x2 = dx > 0 ? tp.x : tp.x + tw; y2 = tcy;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
  } else {
    y1 = dy > 0 ? fp.y + fh : fp.y; x1 = fcx;
    y2 = dy > 0 ? tp.y : tp.y + th; x2 = tcx;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`;
  }
}

// ── L1 group bounding boxes ─────────────────────────────────────────────────
function groupBoxes(tree, pos) {
  const P = 8;
  return tree.filter(r => r.lvl === 1).map(p1 => {
    const desc = tree.filter(r => r.id === p1.id || r.id.startsWith(p1.id + '.'));
    const rects = desc.map(r => { const p = pos[r.id]; if (!p) return null; return { l: p.x, t: p.y, r: p.x + (NW[r.lvl] || 115), b: p.y + (NH[r.lvl] || 40) }; }).filter(Boolean);
    if (!rects.length) return null;
    return { id: p1.id, x: Math.min(...rects.map(r => r.l)) - P, y: Math.min(...rects.map(r => r.t)) - P,
      w: Math.max(...rects.map(r => r.r)) - Math.min(...rects.map(r => r.l)) + P * 2,
      h: Math.max(...rects.map(r => r.b)) - Math.min(...rects.map(r => r.t)) + P * 2 };
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

  const nw = id => NW[iMap[id]?.lvl] || 115;
  const nh = id => NH[iMap[id]?.lvl] || 40;
  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  // ── Layout: stress + overlap removal ────────────────
  useEffect(() => {
    if (!items.length) { setLayout(null); return; }
    let cancelled = false;
    elk.layout(buildElkGraph(items)).then(result => {
      if (cancelled) return;
      const rawPos = {};
      (result.children || []).forEach(n => { rawPos[n.id] = { x: n.x, y: n.y }; });
      const pos = removeOverlaps(rawPos, items);
      // Build edge list (from/to/isHier/isDep)
      const edgeList = [];
      (result.edges || []).forEach(edge => {
        const parts = edge.id.split('|');
        edgeList.push({ id: edge.id, from: parts[1], to: parts[2], isHier: edge.id.startsWith('h|'), isDep: edge.id.startsWith('d|') });
      });
      setLayout({ pos, edgeList });
    }).catch(e => console.error('ELK:', e));
    return () => { cancelled = true; };
  }, [items]);

  // Merge manual overrides
  const pos = useMemo(() => {
    if (!layout) return {};
    const p = { ...layout.pos };
    Object.entries(manualPos).forEach(([id, mp]) => { if (p[id]) p[id] = mp; });
    return p;
  }, [layout, manualPos]);

  const l1Boxes = useMemo(() => layout ? groupBoxes(items, pos) : [], [layout, items, pos]);

  // Compute ALL edge paths from current positions (live during drag)
  const visEdges = useMemo(() => {
    if (!layout) return [];
    return layout.edgeList.map(e => {
      const fp = pos[e.from], tp = pos[e.to];
      if (!fp || !tp) return null;
      return { ...e, path: elbowRoute(fp, tp, nw(e.from), nh(e.from), nw(e.to), nh(e.to)) };
    }).filter(Boolean);
  }, [layout, pos]);

  const allPos = Object.entries(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(([id, p]) => p.x + nw(id))) + 20 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(([id, p]) => p.y + nh(id))) + 20 : 300;

  function fitToScreen() {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const z = Math.max(.05, Math.min((r.width - 16) / graphW, (r.height - 50) / graphH, 1.5));
    setPan({ x: (r.width - graphW * z) / 2, y: Math.max(8, (r.height - graphH * z) / 2) });
    setZoom(z);
  }
  useEffect(() => { if (layout) { setZoom(1); setPan({ x: 12, y: 12 }); } }, [layout]);

  function svgPt(e) { const r = svgRef.current?.getBoundingClientRect(); return r ? { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom } : { x: 0, y: 0 }; }

  useEffect(() => {
    const el = svgRef.current?.parentElement; if (!el) return;
    const h = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
        const mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY > 0 ? .92 : 1.08;
        const nz = Math.min(3, Math.max(.05, zoom * f));
        setPan(p => ({ x: mx - (mx - p.x) * (nz / zoom), y: my - (my - p.y) * (nz / zoom) }));
        setZoom(nz);
      } else { setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); }
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  });

  function onMD(e) { if (drawing || dragNode) return; if (e.button === 0) { setPanning(true); setPanSt({ x: e.clientX - pan.x, y: e.clientY - pan.y }); } }
  function onMM(e) {
    if (dragNode) { const p = svgPt(e); setManualPos(mp => ({ ...mp, [dragNode.id]: { x: p.x - dragNode.ox, y: p.y - dragNode.oy } })); return; }
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
  useEffect(() => { function h(e) { if ((e.key === 'Delete' || e.key === 'Backspace') && selId && onDeleteNode && !e.target.closest('input,textarea,select')) { if (confirm(`Delete ${selId}?`)) { onDeleteNode(selId); setSelId(null); } } } window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [selId]);

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
      <button className="btn btn-sec btn-sm" onClick={() => { setZoom(1); setPan({ x: 12, y: 12 }); }}>100%</button>
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
          return <rect key={'bg' + b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={tc + '06'} stroke={tc + '15'} strokeWidth={.7} />;
        })}

        {/* Hierarchy edges */}
        {visEdges.filter(e => e.isHier).map(e => {
          const isL1 = iMap[e.from]?.lvl === 1;
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          return <path key={e.id} d={e.path} fill="none" stroke={isActive ? 'var(--tx2)' : 'var(--b3)'}
            strokeWidth={isActive ? 1.5 : isL1 ? .6 : .8} opacity={isActive ? .6 : .25} markerEnd="url(#ar-h)" />;
        })}

        {/* Dependency edges */}
        {visEdges.filter(e => e.isDep).map(e => {
          const isCp = cpSet?.has(e.from) && cpSet?.has(e.to);
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          if (!isActive && !isCp && activeId) return null;
          const op = isActive ? .85 : isCp ? .5 : .15;
          const item = iMap[e.to]; const label = item?._depLabels?.[e.from] || '';
          // Label position: midpoint of path
          const fp = pos[e.from], tp = pos[e.to];
          const lx = fp && tp ? (fp.x + nw(e.from) / 2 + tp.x + nw(e.to) / 2) / 2 : 0;
          const ly = fp && tp ? (fp.y + nh(e.from) / 2 + tp.y + nh(e.to) / 2) / 2 - 8 : 0;
          return <g key={e.id}>
            <path d={e.path} fill="none" stroke={isCp ? 'var(--re)' : 'var(--ac)'}
              strokeWidth={isActive ? 2.5 : isCp ? 1.5 : .8} strokeDasharray={isActive ? 'none' : '5 3'}
              opacity={op} markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'} />
            {label && isActive && <><rect x={lx - label.length * 2.5 - 3} y={ly - 5} width={label.length * 5 + 6} height={12} rx={3}
              fill="var(--bg2)" stroke="var(--ac)" strokeWidth={.5} opacity={.9} style={{ pointerEvents: 'none' }} />
              <text x={lx} y={ly + 4} fontSize={7} fill="var(--ac)" textAnchor="middle" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{label}</text></>}
          </g>;
        })}

        {/* Drawing line */}
        {drawing && (() => { const fp = pos[drawing.fromId]; if (!fp) return null; const r = svgRef.current?.getBoundingClientRect(); if (!r) return null;
          const mx = (drawing.mx - r.left - pan.x) / zoom, my = (drawing.my - r.top - pan.y) / zoom;
          return <line x1={fp.x + nw(drawing.fromId) / 2} y1={fp.y + nh(drawing.fromId)} x2={mx} y2={my} stroke="var(--ac)" strokeWidth={1.5} strokeDasharray="5 3" />; })()}

        {/* Nodes */}
        {items.map(r => {
          const p = pos[r.id]; if (!p) return null;
          const w = nw(r.id), h = nh(r.id);
          const isCp = cpSet?.has(r.id); const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id; const isDone = r.status === 'done';
          const isL1 = r.lvl === 1, isL2 = r.lvl === 2;
          const isConnected = activeId && (r.id === activeId || visEdges.some(e => (e.from === activeId && e.to === r.id) || (e.to === activeId && e.from === r.id)));
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={isDone ? .4 : activeId && !isConnected ? .3 : 1}>
            <rect width={w} height={h} rx={isL1 ? 6 : 4}
              fill={isL1 ? tc + '22' : isL2 ? tc + '14' : 'var(--bg2)'}
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : isConnected ? tc + '88' : tc + '33'}
              strokeWidth={isSel ? 2.5 : isCp ? 1.5 : isConnected ? 1.5 : .7}
              style={{ cursor: dragNode?.id === r.id ? 'grabbing' : 'grab' }}
              onMouseDown={e => onNodeMD(e, r)}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { if (!dragNode && !drawing) { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); } }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            <rect x={0} y={isL1 ? h - 2 : 0} width={isL1 ? w : 2.5} height={isL1 ? 2 : h} rx={1} fill={stC} style={{ pointerEvents: 'none' }} />
            <circle cx={w / 2} cy={h} r={2.5} fill={tc + '44'} stroke={tc} strokeWidth={.5}
              style={{ cursor: 'crosshair', opacity: .2 }} onMouseDown={e => onConnStart(e, r)}
              onMouseEnter={e => { e.target.style.opacity = '1'; e.target.setAttribute('r', '4'); }}
              onMouseLeave={e => { e.target.style.opacity = '.2'; e.target.setAttribute('r', '2.5'); }} />
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
      {iMap[ctxMenu.id]?.lvl < 3 && <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }} className="tr" onClick={() => { onAddNode?.(); setCtxMenu(null); }}>+ Add child</div>}
      <div style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4, color: 'var(--re)' }} className="tr" onClick={() => { if (confirm(`Delete ${ctxMenu.id}?`)) { onDeleteNode(ctxMenu.id); setSelId(null); } setCtxMenu(null); }}>Delete</div>
    </div>}

    <div className="ng-legend">
      <div className="ng-li"><div style={{ width: 14, height: 1, background: 'var(--b3)', flexShrink: 0 }} />Hierarchy</div>
      <div className="ng-li"><div style={{ width: 14, height: 0, borderTop: '1.5px dashed var(--ac)', flexShrink: 0 }} />Dependency</div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>Crit. path</div>
      <span style={{ color: 'var(--tx3)', fontSize: 9 }}>Scroll=pan · Pinch=zoom · Drag=move · Click=highlight</span>
    </div>
    {tip && !drawing && !dragNode && <Tip item={tip.item} x={tip.x} y={tip.y} teams={teams} tree={tree} />}
  </div>;
}
