import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { usePortalRoot } from '../../utils/embedHost.js';
import { Tip } from '../shared/Tooltip.jsx';
import { pt } from '../../utils/scheduler.js';
import { buildMemberShortMap } from '../../App.jsx';
import { chainShorts } from '../../utils/handoff.js';
import { NODE_W, NODE_H } from '../../utils/net/geometry.js';
import { computeLayout } from '../../utils/net/layout.js';
import { hierPath, depPath } from '../../utils/net/edges.js';
import { NetToolbar } from './net/NetToolbar.jsx';
import { NetEdges } from './net/NetEdges.jsx';
import { NetNode } from './net/NetNode.jsx';
import { NetContextMenu } from './net/NetContextMenu.jsx';
import { NetLegend } from './net/NetLegend.jsx';
import { NetEmptyState } from './net/NetEmptyState.jsx';
import { NetTooBig } from './net/NetTooBig.jsx';

export { wrapTwoLines } from '../../utils/net/label.js';

function NetGraphImpl({
  tree: _treeProp,
  scheduled,
  teams,
  members = [],
  cpSet,
  cpLabels = {},
  stats,
  search = '',
  searchIdx = 0,
  isFiltered = false,
  onPickRoot = null,
  diffDoneIds = null,
  diffProgressedIds = null,
  onlyChanged = false,
  horizonIds = null,
  horizonOnlyPlanned = true,
  onNodeClick,
  onAddNode,
  onDeleteNode,
}) {
  const portalRoot = usePortalRoot();
  // Sets of leaf ids that completed / progressed in the diff window. Used to
  // ring matching nodes in the SVG so the graph reflects sprint movement.
  const _diffDoneSet = diffDoneIds instanceof Set ? diffDoneIds : new Set(diffDoneIds || []);
  const _diffProgSet = diffProgressedIds instanceof Set ? diffProgressedIds : new Set(diffProgressedIds || []);
  const _diffChangedSet = new Set([..._diffDoneSet, ..._diffProgSet]);
  const _diffOnlyMode = onlyChanged && _diffChangedSet.size > 0;

  // Hard-filter the graph nodes when an "Only…" toggle is on. Drops every
  // node outside the match set (plus their ancestors) so the layout itself
  // shrinks instead of just dimming. Edges drawn later only consider nodes
  // present in this filtered tree, so no dangling arrows survive.
  const tree = useMemo(() => {
    let items = _treeProp;
    const applyKeep = matchSet => {
      const keep = new Set();
      items.forEach(r => {
        if (matchSet.has(r.id)) {
          keep.add(r.id);
          const parts = r.id.split('.');
          for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('.'));
        }
      });
      return items.filter(r => keep.has(r.id));
    };
    if (_diffOnlyMode) items = applyKeep(_diffChangedSet);
    if (horizonIds && horizonOnlyPlanned) items = applyKeep(horizonIds);
    return items;
  }, [_treeProp, _diffOnlyMode, horizonIds, horizonOnlyPlanned]);
  const svgRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [panSt, setPanSt] = useState(null);
  const [tip, setTip] = useState(null);
  const [selId, setSelId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  // "Show it anyway" is a real answer — the graph is still there, it is just
  // not the default, because the default should be something you can read.
  const [showAll, setShowAll] = useState(false);
  const roots = useMemo(() => (_treeProp || []).filter(r => !String(r.id).includes('.')), [_treeProp]);
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
  const hasChildrenSet = useMemo(() => {
    const s = new Set();
    tree.forEach(r => {
      const p = r.id.split('.').slice(0, -1).join('.');
      if (p) s.add(p);
    });
    return s;
  }, [tree]);
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  // Render all assignees of a node compactly — "KK+MB" or "KK+MB+1" for 3+.
  // Handoff cascades appear as "KK+MB→AB→!" so the chain is visible here too.
  const assignLabel = (r, sc) => {
    const ids = (r.assign || []).length > 0 ? r.assign : sc?.personId ? [sc.personId] : [];
    const primary = (() => {
      if (!ids.length) return sc?.personShort || sc?.person?.split(' ')[0] || '';
      const shorts = ids.map(id => shortMap[id] || '?');
      if (shorts.length <= 2) return shorts.join('+');
      return shorts.slice(0, 2).join('+') + '+' + (shorts.length - 2);
    })();
    return chainShorts(sc, shortMap, primary);
  };

  const gTC = t => teams.find(x => x.id === pt(t))?.color || '#3b82f6';
  // 'open' stays a distinct blue here (progress-ring contrast against the node
  // fill) rather than the neutral grey --st-open — see docs/design-tokens.md.
  const SC = { done: 'var(--st-done)', wip: 'var(--st-wip)', open: '#4f8ef7' };

  const layout = useMemo(() => (items.length ? computeLayout(items) : null), [items]);
  const pos = layout?.pos || {};

  // Build obstacle list for dep routing
  const allBoxes = useMemo(() => Object.entries(pos).map(([, p]) => ({ x: p.x, y: p.y })), [pos]);

  const allEdges = useMemo(() => {
    if (!layout) return [];
    return layout.edges
      .map(e => {
        const fp = pos[e.from],
          tp = pos[e.to];
        if (!fp || !tp) return null;
        if (e.isHier) {
          return { ...e, path: hierPath(fp, tp), labelPt: null };
        }
        const r = depPath(fp, tp, allBoxes);
        return { ...e, ...r };
      })
      .filter(Boolean);
  }, [layout, pos, allBoxes]);

  const activeId = hoverId || selId;
  const connectedSet = useMemo(() => {
    if (!activeId) return null;
    const s = new Set([activeId]);
    const active = iMap[activeId];
    if (active && items.some(r => r.id.startsWith(activeId + '.'))) {
      // Parent hover: highlight entire subtree
      items.forEach(r => {
        if (r.id.startsWith(activeId + '.')) s.add(r.id);
      });
    } else {
      // Normal: highlight direct connections
      allEdges.forEach(e => {
        if (e.from === activeId || e.to === activeId) {
          s.add(e.from);
          s.add(e.to);
        }
      });
    }
    return s;
  }, [activeId, allEdges, items]);

  const allPos = Object.entries(pos);

  // Search: ordered match list + Set (same pattern as GanttView).
  const searchMatchList = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return [];
    return items.filter(r => (r.name || '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)).map(r => r.id);
  }, [search, items]);
  const searchMatches = useMemo(() => (searchMatchList.length ? new Set(searchMatchList) : null), [searchMatchList]);
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
    const fw = maxX - minX + 40,
      fh = maxY - minY + 40;
    const z = Math.max(0.05, Math.min((r.width - 16) / fw, (r.height - 50) / fh, 2));
    const newPan = { x: (r.width - fw * z) / 2 - minX * z + 20 * z, y: (r.height - fh * z) / 2 - minY * z + 20 * z };
    panRef.current = newPan;
    zoomRef.current = z;
    setPan(newPan);
    setZoom(z);
  }

  function fitToScreen() {
    // If a search is active, fit to its matches; else if a selection is active, fit to it; else fit all.
    const target = searchMatches?.size
      ? searchMatches
      : connectedSet && connectedSet.size > 1
        ? connectedSet
        : new Set(allPos.map(([id]) => id));
    fitToNodes(target);
  }
  // Auto-fit only on first mount — subsequent layout changes (node edits) must not
  // reset zoom/pan. User can always press the Fit button to re-center manually.
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (layout && !didInitialFit.current) {
      didInitialFit.current = true;
      setTimeout(fitToScreen, 50);
    }
  }, [layout]);
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
    const h = e => {
      if (e.key === 'Escape') setSelId(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const h = e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return;
        const mx = e.clientX - r.left,
          my = e.clientY - r.top;
        const f = e.deltaY > 0 ? 0.92 : 1.08;
        // Read latest zoom/pan from refs — closure values are stale during rapid scrolls.
        const cz = zoomRef.current,
          cp = panRef.current;
        const nz = Math.min(3, Math.max(0.05, cz * f));
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

  function onMD(e) {
    if (e.button === 0) {
      setPanning(true);
      setPanSt({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }
  function onMM(e) {
    if (panning && panSt) setPan({ x: e.clientX - panSt.x, y: e.clientY - panSt.y });
  }
  function onMU() {
    setPanning(false);
    setPanSt(null);
  }
  function onCtx(e, r) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ id: r.id, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    const h = () => setCtxMenu(null);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  if (!items.length) return <NetEmptyState isFiltered={isFiltered} onAddNode={onAddNode} />;

  // ── Too big to draw is not the same as too big to use ────────────────────
  // On a real plan this view drew all 404 nodes at 11% zoom: a dust cloud
  // with nothing legible in it, and no hint that the way out was to narrow
  // the scope rather than to zoom in. A dependency graph is readable up to a
  // hundred-odd nodes; past that more pixels do not help.
  //
  // So say so, and offer the one thing that does help. The scope filter
  // already exists — this only makes it findable at the moment it is needed,
  // and picking a project here sets the same filter every other view reads.
  const TOO_MANY_NODES = 140;
  if (items.length > TOO_MANY_NODES && !isFiltered && !showAll) {
    return <NetTooBig itemCount={items.length} onPickRoot={onPickRoot} roots={roots} setShowAll={setShowAll} />;
  }

  if (!layout) return null;

  return (
    <div className="netgraph-wrap" style={{ cursor: panning ? 'grabbing' : 'default' }}>
      <NetToolbar
        fitToScreen={fitToScreen}
        panRef={panRef}
        searchIdx={searchIdx}
        searchMatchList={searchMatchList}
        searchMatches={searchMatches}
        setPan={setPan}
        setZoom={setZoom}
        svgRef={svgRef}
        zoom={zoom}
        zoomRef={zoomRef}
      />

      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%' }}
        onMouseDown={onMD}
        onMouseMove={onMM}
        onMouseUp={onMU}
        onMouseLeave={() => setPanning(false)}
        onClick={() => setSelId(null)}
      >
        <defs>
          <marker id="ar-d" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="var(--ac)" />
          </marker>
          <marker id="ar-cp" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="5" markerHeight="4" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="var(--re)" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <NetEdges activeId={activeId} allEdges={allEdges} cpSet={cpSet} iMap={iMap} />

          {/* Uniform card nodes */}
          {items.map(r => {
            const p = pos[r.id];
            if (!p) return null;
            const sc = sMap[r.id];
            const tc = gTC(r.team);
            const stC = SC[r.status] || '#4f8ef7';
            return (
              <NetNode
                key={r.id}
                activeMatchId={activeMatchId}
                assignLabel={assignLabel}
                connectedSet={connectedSet}
                cpSet={cpSet}
                diffDoneSet={_diffDoneSet}
                diffProgSet={_diffProgSet}
                hasChildrenSet={hasChildrenSet}
                onCtx={onCtx}
                onNodeClick={onNodeClick}
                p={p}
                r={r}
                sc={sc}
                searchMatches={searchMatches}
                selId={selId}
                setHoverId={setHoverId}
                setSelId={setSelId}
                setTip={setTip}
                stC={stC}
                stats={stats}
                tc={tc}
              />
            );
          })}
        </g>
      </svg>

      {ctxMenu && (
        <NetContextMenu
          ctxMenu={ctxMenu}
          iMap={iMap}
          onDeleteNode={onDeleteNode}
          onNodeClick={onNodeClick}
          portalRoot={portalRoot}
          setCtxMenu={setCtxMenu}
          setSelId={setSelId}
        />
      )}

      <NetLegend />
      {tip && (
        <Tip
          item={tip.item}
          x={tip.x + 12}
          y={tip.y + 20}
          teams={teams}
          members={members}
          tree={tree}
          scheduled={scheduled}
          cpLabels={cpLabels}
        />
      )}
    </div>
  );
}

export const NetGraph = memo(NetGraphImpl);
