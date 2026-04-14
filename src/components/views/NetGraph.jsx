import { useState, useRef, useEffect, useMemo } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Tip } from '../shared/Tooltip.jsx';
import { SL } from '../../constants.js';
import { pt } from '../../utils/scheduler.js';

const elk = new ELK();
const NW = { 1: 155, 2: 135, 3: 120 };
const NH = { 1: 30, 2: 26, 3: 42 };

// ── 3-level compound graph ──────────────────────────────────────────────────
// Root: layered DOWN → L1 groups top-to-bottom
// L1: layered RIGHT → L2 columns side-by-side
// L2: layered DOWN + ordering edges → L3 items stacked vertically
function buildElkGraph(tree) {
  const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
  const l1s = tree.filter(r => r.lvl === 1);
  const placed = new Set();
  const rootEdges = [];

  const rootChildren = l1s.map(p1 => {
    placed.add(p1.id);
    const l2s = tree.filter(r => r.lvl === 2 && r.id.startsWith(p1.id + '.'));

    if (!l2s.length) return { id: p1.id, width: NW[1], height: NH[1] };

    const l1Children = l2s.map(p2 => {
      placed.add(p2.id);
      const l3s = tree.filter(r => r.lvl === 3 && r.id.startsWith(p2.id + '.'));
      l3s.forEach(t => placed.add(t.id));

      if (!l3s.length) return { id: p2.id, width: NW[2], height: NH[2] };

      const l2Edges = [];
      // Ordering edges → force vertical stacking
      for (let i = 1; i < l3s.length; i++)
        l2Edges.push({ id: `o|${l3s[i - 1].id}|${l3s[i].id}`, sources: [l3s[i - 1].id], targets: [l3s[i].id] });
      // Dep edges within this L2 group
      l3s.forEach(t => {
        (t.deps || []).forEach(d => {
          if (iMap[d] && d.startsWith(p2.id + '.'))
            l2Edges.push({ id: `d|${d}|${t.id}`, sources: [d], targets: [t.id] });
        });
      });

      return {
        id: p2.id,
        layoutOptions: {
          'elk.algorithm': 'layered', 'elk.direction': 'DOWN',
          'elk.spacing.nodeNode': '5', 'elk.layered.spacing.nodeNodeBetweenLayers': '5',
          'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.edgeNode': '4',
          'elk.padding': `[top=${NH[2] + 6},left=4,bottom=4,right=4]`,
        },
        children: l3s.map(t => ({ id: t.id, width: NW[3], height: NH[3] })),
        edges: l2Edges,
      };
    });

    // Dep edges between L2 groups (within same L1)
    const l1Edges = [];
    tree.filter(r => r.lvl === 3 && r.id.startsWith(p1.id + '.')).forEach(t => {
      (t.deps || []).forEach(d => {
        if (!iMap[d] || !d.startsWith(p1.id + '.')) return;
        const tL2 = t.id.split('.').slice(0, 3).join('.');
        const dL2 = d.split('.').slice(0, 3).join('.');
        if (tL2 !== dL2) l1Edges.push({ id: `d|${d}|${t.id}`, sources: [d], targets: [t.id] });
      });
    });

    return {
      id: p1.id,
      layoutOptions: {
        'elk.algorithm': 'layered', 'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '8', 'elk.layered.spacing.nodeNodeBetweenLayers': '12',
        'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.edgeNode': '5',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.padding': `[top=${NH[1] + 8},left=5,bottom=5,right=5]`,
      },
      children: l1Children,
      edges: l1Edges,
    };
  });

  // Orphans
  tree.filter(r => !placed.has(r.id)).forEach(r => {
    rootChildren.push({ id: r.id, width: NW[r.lvl] || NW[3], height: NH[r.lvl] || NH[3] });
  });

  // Cross-L1 dep edges
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      if (!iMap[d]) return;
      if (r.id.split('.')[0] !== d.split('.')[0])
        rootEdges.push({ id: `d|${d}|${r.id}`, sources: [d], targets: [r.id] });
    });
  });

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      'elk.spacing.nodeNode': '14', 'elk.layered.spacing.nodeNodeBetweenLayers': '18',
      'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.edgeNode': '6',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: rootChildren,
    edges: rootEdges,
  };
}

// ── Walk compound result → absolute positions + edge paths ──────────────────
function extractLayout(result) {
  const pos = {}; // id → { x, y, w, h }
  const edges = []; // { id, from, to, path, isOrder }

  function walk(node, ox, oy) {
    const ax = (node.x || 0) + ox, ay = (node.y || 0) + oy;
    if (node.id !== 'root') pos[node.id] = { x: ax, y: ay, w: node.width, h: node.height };

    (node.edges || []).forEach(edge => {
      if (!edge.sections?.length) return;
      const pts = [];
      edge.sections.forEach(s => {
        pts.push({ x: s.startPoint.x + ax, y: s.startPoint.y + ay });
        (s.bendPoints || []).forEach(p => pts.push({ x: p.x + ax, y: p.y + ay }));
        pts.push({ x: s.endPoint.x + ax, y: s.endPoint.y + ay });
      });
      const parts = edge.id.split('|');
      edges.push({ id: edge.id, from: parts[1], to: parts[2], isOrder: edge.id.startsWith('o|'), isDep: edge.id.startsWith('d|'),
        path: 'M' + pts.map(p => `${p.x},${p.y}`).join(' L') });
    });

    (node.children || []).forEach(ch => walk(ch, ax, ay));
  }
  walk(result, 0, 0);
  return { pos, edges };
}

// ── Simple elbow for live drag ──────────────────────────────────────────────
function elbowPath(fp, tp) {
  const x1 = fp.x + fp.w, y1 = fp.y + fp.h / 2;
  const x2 = tp.x, y2 = tp.y + tp.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
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

  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  const SC = { done: '#22c55e', wip: '#f59e0b', open: '#4f8ef7' };

  useEffect(() => {
    if (!items.length) { setLayout(null); return; }
    let cancelled = false;
    elk.layout(buildElkGraph(items))
      .then(r => { if (!cancelled) setLayout(extractLayout(r)); })
      .catch(e => console.error('ELK:', e));
    return () => { cancelled = true; };
  }, [items]);

  // Positions: merge manual overrides (keeping w/h from layout)
  const pos = useMemo(() => {
    if (!layout) return {};
    const p = {};
    for (const [id, lp] of Object.entries(layout.pos))
      p[id] = manualPos[id] ? { ...lp, x: manualPos[id].x, y: manualPos[id].y } : lp;
    return p;
  }, [layout, manualPos]);

  // Edges: use ELK paths, or elbow when manual positions exist
  const visEdges = useMemo(() => {
    if (!layout) return [];
    const hasManual = Object.keys(manualPos).length > 0;
    return layout.edges.filter(e => !e.isOrder).map(e => {
      const affected = hasManual && (manualPos[e.from] || manualPos[e.to]);
      if (affected && pos[e.from] && pos[e.to]) return { ...e, path: elbowPath(pos[e.from], pos[e.to]) };
      return e;
    });
  }, [layout, pos, manualPos]);

  const allPos = Object.values(pos);
  const graphW = allPos.length ? Math.max(...allPos.map(p => p.x + p.w)) + 20 : 400;
  const graphH = allPos.length ? Math.max(...allPos.map(p => p.y + p.h)) + 20 : 300;

  function fitToScreen() {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const z = Math.max(.05, Math.min((rect.width - 16) / graphW, (rect.height - 50) / graphH, 1.5));
    setPan({ x: (rect.width - graphW * z) / 2, y: Math.max(8, (rect.height - graphH * z) / 2) });
    setZoom(z);
  }
  // Start at 100% zoom, top-left
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
      const target = items.find(r => { const np = pos[r.id]; return np && p.x >= np.x && p.x <= np.x + np.w && p.y >= np.y && p.y <= np.y + np.h; });
      if (target && target.id !== drawing.fromId && onAddDep) onAddDep(drawing.fromId, target.id);
      setDrawing(null); return;
    }
    setPanning(false); setPanSt(null);
  }
  function onNodeMD(e, r) {
    if (r.lvl < 3) return; // only drag L3 leaf nodes
    e.stopPropagation(); const p = svgPt(e); const np = pos[r.id] || { x: 0, y: 0 };
    setDragNode({ id: r.id, ox: p.x - np.x, oy: p.y - np.y });
  }
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
        <marker id="ar-d" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--ac)" /></marker>
        <marker id="ar-cp" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" /></marker>
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

        {/* L1 compound backgrounds + headers */}
        {items.filter(r => r.lvl === 1).map(r => {
          const p = pos[r.id]; if (!p || p.h <= NH[1] + 10) return null;
          const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          return <g key={'l1-' + r.id} opacity={r.status === 'done' ? .4 : 1}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8} fill={tc + '06'} stroke={tc + '18'} strokeWidth={.8} />
            <text x={p.x + p.w / 2} y={p.y + NH[1] / 2 + 2} fontSize={9} fill={tc} fontWeight={700} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
              {r.name.length > 24 ? r.name.slice(0, 23) + '..' : r.name}
            </text>
            <rect x={p.x} y={p.y + NH[1]} width={p.w} height={1.5} fill={stC} opacity={.4} style={{ pointerEvents: 'none' }} />
          </g>;
        })}

        {/* L2 compound backgrounds + headers */}
        {items.filter(r => r.lvl === 2).map(r => {
          const p = pos[r.id]; if (!p || p.h <= NH[2] + 10) return null;
          const tc = gTC(r.team);
          return <g key={'l2-' + r.id} opacity={r.status === 'done' ? .4 : 1}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={5} fill={tc + '04'} stroke={tc + '10'} strokeWidth={.5} />
            <text x={p.x + 4} y={p.y + 8} fontSize={5.5} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
            <text x={p.x + 4} y={p.y + 17} fontSize={7.5} fill={tc} fontWeight={600} style={{ pointerEvents: 'none' }}>
              {r.name.length > 20 ? r.name.slice(0, 19) + '..' : r.name}
            </text>
          </g>;
        })}

        {/* Dependency edges (orthogonal, ELK-routed) */}
        {visEdges.filter(e => e.isDep).map(e => {
          const isCp = cpSet?.has(e.from) && cpSet?.has(e.to);
          const isActive = activeId && (e.from === activeId || e.to === activeId);
          if (!isActive && !isCp && activeId) return null;
          const op = isActive ? .8 : isCp ? .5 : .15;
          return <path key={e.id} d={e.path} fill="none" stroke={isCp ? 'var(--re)' : 'var(--ac)'}
            strokeWidth={isActive ? 2 : isCp ? 1.2 : .8} strokeDasharray="4 3" opacity={op}
            markerEnd={isCp ? 'url(#ar-cp)' : 'url(#ar-d)'} />;
        })}

        {/* Drawing line */}
        {drawing && (() => { const fp = pos[drawing.fromId]; if (!fp) return null; const r = svgRef.current?.getBoundingClientRect(); if (!r) return null;
          const mx = (drawing.mx - r.left - pan.x) / zoom, my = (drawing.my - r.top - pan.y) / zoom;
          return <line x1={fp.x + fp.w / 2} y1={fp.y + fp.h} x2={mx} y2={my} stroke="var(--ac)" strokeWidth={1.5} strokeDasharray="5 3" />; })()}

        {/* L3 nodes */}
        {items.filter(r => r.lvl === 3).map(r => {
          const p = pos[r.id]; if (!p) return null;
          const isCp = cpSet?.has(r.id); const sc = sMap[r.id]; const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id; const isDone = r.status === 'done';
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={isDone ? .4 : 1}>
            <rect width={p.w} height={p.h} rx={4} fill="var(--bg2)"
              stroke={isSel ? 'var(--ac)' : isCp ? 'var(--re)' : tc + '30'}
              strokeWidth={isSel ? 2 : isCp ? 1.5 : .7}
              style={{ cursor: dragNode?.id === r.id ? 'grabbing' : 'grab' }}
              onMouseDown={e => onNodeMD(e, r)}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)}
              onMouseEnter={e => { if (!dragNode && !drawing) { setTip({ item: { ...r, ...(sc || {}) }, x: e.clientX, y: e.clientY }); setHoverId(r.id); } }}
              onMouseLeave={() => { setTip(null); setHoverId(null); }} />
            <rect x={0} y={0} width={2} height={p.h} rx={1} fill={stC} style={{ pointerEvents: 'none' }} />
            <text x={6} y={10} fontSize={6} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{r.id}</text>
            <text x={6} y={20} fontSize={7} fill={tc} fontWeight={500} style={{ pointerEvents: 'none' }}>
              {r.name.length <= 18 ? r.name : <>{r.name.slice(0, 18)}<tspan x={6} dy={9}>{r.name.slice(18, 36)}{r.name.length > 36 ? '..' : ''}</tspan></>}
            </text>
            {sc && <text x={6} y={r.name.length > 18 ? 37 : 30} fontSize={6} fill="var(--tx3)" fontFamily="var(--mono)" style={{ pointerEvents: 'none' }}>{sc.effort?.toFixed(0)}d · {sc.person}</text>}
            <circle cx={p.w} cy={p.h / 2} r={2.5} fill={tc + '44'} stroke={tc} strokeWidth={.5}
              style={{ cursor: 'crosshair', opacity: .2 }} onMouseDown={e => onConnStart(e, r)}
              onMouseEnter={e => { e.target.style.opacity = '1'; e.target.setAttribute('r', '4'); }}
              onMouseLeave={e => { e.target.style.opacity = '.2'; e.target.setAttribute('r', '2.5'); }} />
            {isDone && <text x={p.w - 10} y={p.h / 2 + 1} fontSize={10} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>&#x2705;</text>}
          </g>;
        })}

        {/* L1 and L2 nodes that are NOT compounds (no children) */}
        {items.filter(r => r.lvl <= 2 && pos[r.id] && pos[r.id].h <= (r.lvl === 1 ? NH[1] + 10 : NH[2] + 10)).map(r => {
          const p = pos[r.id]; if (!p) return null;
          const tc = gTC(r.team); const stC = SC[r.status] || '#4f8ef7';
          const isSel = selId === r.id;
          return <g key={r.id} transform={`translate(${p.x},${p.y})`} opacity={r.status === 'done' ? .4 : 1}>
            <rect width={p.w} height={p.h} rx={r.lvl === 1 ? 6 : 4} fill={tc + '18'} stroke={isSel ? 'var(--ac)' : tc + '44'} strokeWidth={isSel ? 2 : .8}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setSelId(isSel ? null : r.id); }}
              onDoubleClick={e => { e.stopPropagation(); onNodeClick(r); }}
              onContextMenu={e => onCtx(e, r)} />
            <text x={p.w / 2} y={p.h / 2} fontSize={r.lvl === 1 ? 9 : 8} fill={tc} fontWeight={r.lvl === 1 ? 700 : 600} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
              {r.name.length > 22 ? r.name.slice(0, 21) + '..' : r.name}
            </text>
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
      <div className="ng-li"><div style={{ width: 14, height: 0, borderTop: '1.5px dashed var(--ac)', flexShrink: 0 }} />Dependency</div>
      <div className="ng-li" style={{ color: 'var(--re)' }}>Crit. path</div>
      <span style={{ color: 'var(--tx3)', fontSize: 9 }}>Scroll=pan · Pinch=zoom · Drag L3=move · Dbl-click=edit</span>
    </div>
    {tip && !drawing && !dragNode && <Tip item={tip.item} x={tip.x} y={tip.y} teams={teams} tree={tree} />}
  </div>;
}
