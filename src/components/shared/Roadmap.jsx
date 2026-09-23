import { useMemo, useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { renderRoadmapSvg, computeRoadmapModel } from '../../utils/roadmap.js';
import { renderProjectRoadmapSvg } from '../../utils/projectRoadmap.js';
import { useT } from '../../i18n.jsx';
import { SvgMarkup } from './SvgMarkup.jsx';
import { Tip } from './Tooltip.jsx';
import { StatusIcon } from './StatusIcon.jsx';
import { parseTip } from '../../utils/tipText.js';
import { fixedFrame, usePortalRoot } from '../../utils/embedHost.js';

const ZOOM_KEY = 'planr_roadmap_zoom';
const ZOOM_MAX = 4;
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
const ZOOM_BTN = { padding: '2px 7px', fontSize: 10 };   // same shape as the Gantt footer's zoom group
const nextStep = current => ZOOM_STEPS.find(step => step > current + 1e-6) ?? ZOOM_MAX;
const prevStep = current => [...ZOOM_STEPS].reverse().find(step => step < current - 1e-6) ?? 1;

// What a hovered station, line or train says.
//
// The SVG carries the answer as data in `data-tip` — id, name, status, the
// items in a cluster — and it is rendered here with the same StatusIcon the
// rest of the app uses. It used to carry HTML that went in through
// `dangerouslySetInnerHTML`; every colour and every strikethrough below used
// to be a style attribute in a template string in utils/roadmap.js.
const TIP_ROW = { display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' };
const TIP_HEAD = {
  ...TIP_ROW,
  marginBottom: 4,
  paddingBottom: 4,
  borderBottom: '1px solid var(--b2, #364456)',
};

function TipBody({ text }) {
  let data = null;
  if (text?.startsWith('{')) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!data) {
    // A plain label — "Previous position" and friends.
    return parseTip(text).map((line, li) => (
      <div key={li} style={{ font: '500 10.5px/1.4 Inter,system-ui,sans-serif' }}>
        {line.parts.map((part, pi) => (
          part.tone === 'bold'
            ? <b key={pi}>{part.text}</b>
            : <span key={pi} style={part.tone === 'muted' ? { color: 'var(--tx3)' } : undefined}>{part.text}</span>
        ))}
      </div>
    ));
  }

  const mono = "700 11px/1 'JetBrains Mono',monospace";

  if (data.kind === 'station') {
    return <>
      <div style={TIP_HEAD}>
        <StatusIcon status={data.status} progress={(data.prog || 0) * 100} style={{ width: 14, height: 14 }} />
        <span style={{ font: mono, color: data.color }}>{data.abbrev}</span>
        <span style={{ font: '600 11px/1.2 Inter,system-ui,sans-serif', color: 'var(--tx, #e8ecf4)' }}>{data.name}</span>
        <span style={{ font: "500 10px/1 'JetBrains Mono',monospace", color: 'var(--tx3, #8898b0)', marginLeft: 'auto' }}>{data.count}</span>
      </div>
      {(data.items || []).map((item, i) => (
        <div key={i} style={{
          ...TIP_ROW,
          paddingLeft: 4,
          ...(item.status === 'done' ? { textDecoration: 'line-through', opacity: .55 }
            : item.status === 'wip' ? { color: data.color } : { color: 'var(--tx2, #cbd5e1)' }),
        }}>
          <StatusIcon status={item.status} progress={(item.prog || 0) * 100} style={{ width: 11, height: 11 }} />
          <span style={{ font: '400 10px/1.2 Inter,system-ui,sans-serif' }}>{item.name}</span>
        </div>
      ))}
    </>;
  }

  // A line, or the train on it.
  return <>
    <div style={TIP_HEAD}>
      {data.glyph
        ? <span style={{ font: "700 14px/1 'JetBrains Mono',monospace", color: data.color }}>{data.glyph}</span>
        : <span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: data.color }} />}
      <span style={{ font: mono, color: data.color }}>{data.id}</span>
      <span style={{
        font: "700 10px/1 'JetBrains Mono',monospace", color: 'var(--tx3, #8898b0)',
        textTransform: 'uppercase', letterSpacing: '.06em', marginLeft: 'auto',
      }}>{data.badge}</span>
    </div>
    <div style={{ font: '500 10.5px/1.4 Inter,system-ui,sans-serif', color: 'var(--tx, #e8ecf4)', marginBottom: 4 }}>{data.name}</div>
    <div style={{ font: '500 10px/1.4 Inter,system-ui,sans-serif', color: 'var(--tx2, #cbd5e1)' }}>{data.note}</div>
    {data.atRisk && (
      <div style={{ font: "700 10px/1.4 'JetBrains Mono',monospace", color: 'var(--re, #ef4444)', marginTop: 2 }}>! {data.atRisk}</div>
    )}
  </>;
}

export function Roadmap({ tree, scheduled, stats, teams = [], members = [], cpLabels = {}, onOpenItem, diff, horizonIds = null, horizonEnd = null, futureProgressByRootId = null, assignment = null, onAssignmentChange = null, soloRootId = null, lineColor = null }) {
  const { t } = useT();
  const portalRoot = usePortalRoot();
  const [expandedLegendIds, setExpandedLegendIds] = useState(() => new Set());
  // Pass raw template strings (with {0}) so roadmap.js can substitute the percentage itself.
  // t() without extra args leaves {0} intact, which roadmap.js replaces with the actual %.
  const labels = useMemo(() => ({
    train: t('rm.train'),
    currentPos: t('rm.currentPos'),  // keeps "{0}" placeholder — roadmap.js fills it
    atRisk: t('rm.atRisk'),
    arrived: t('rm.arrived'),
    tipDone: t('diff.tipDone'),
    tipProgress: t('diff.legendReachedTip'),
    prevPos: t('diff.prevPos'),
    plannedPos: t('horizon.plannedPos'),
    showMore: t('rm.showMore'),
    showLess: t('rm.showLess'),
    // Single-project roadmap (utils/projectRoadmap.js)
    months: t('rm.months'),
    tasks: t('rm.tasks'),
    today: t('rm.today'),
    deadline: t('rm.deadlineShort'),
    noDates: t('rm.noDates'),
    stateDone: t('rm.stateDone'),
    stateWip: t('rm.stateWip'),
    stateOpen: t('rm.stateOpen'),
  }), [t]);
  // Two-step: compute model once so we can inspect its `_assignment` map,
  // then build the SVG from the same args. Lets the parent (App.jsx)
  // persist the assignment back into the plan file the first time a new
  // root appears or no mapping exists yet — gives projects stable
  // colours + routes across data edits.
  const renderArgs = useMemo(() => ({
    tree, scheduled, stats, labels, diff, horizonIds, horizonEnd, futureProgressByRootId, assignment, expandedLegendIds,
  }), [tree, scheduled, stats, labels, diff, horizonIds, horizonEnd, futureProgressByRootId, assignment, expandedLegendIds]);
  // One project on its own is a calendar, not a metro line — different
  // renderer, same tooltip/click contract. See utils/projectRoadmap.js.
  const model = useMemo(() => (soloRootId ? null : computeRoadmapModel(renderArgs)), [renderArgs, soloRootId]);
  const svg = useMemo(() => (soloRootId
    ? renderProjectRoadmapSvg({ tree, scheduled, stats, rootId: soloRootId, color: lineColor || undefined, labels })
    : renderRoadmapSvg({ ...renderArgs })), [renderArgs, soloRootId, tree, scheduled, stats, lineColor, labels]);
  // Detect "stored assignment differs from what we just computed" — happens
  // on the first render of a plan that has no mapping yet, or when a new
  // root entered the tree and grabbed a fresh slot.
  useEffect(() => {
    if (!onAssignmentChange || !model?._assignment) return;
    const computed = model._assignment;
    const stored = assignment || {};
    const computedKeys = Object.keys(computed);
    let drift = computedKeys.length !== Object.keys(stored).length;
    if (!drift) {
      for (const k of computedKeys) {
        const s = stored[k];
        const c = computed[k];
        if (!s || s.routeIdx !== c.routeIdx || s.colorIdx !== c.colorIdx) { drift = true; break; }
      }
    }
    if (drift) onAssignmentChange(computed);
  }, [model, assignment, onAssignmentChange]);
  const [tip, setTip] = useState(null);
  // The app-wide item card, for the stations that are one item.
  const [itemTip, setItemTip] = useState(null);
  const ref = useRef(null);
  const tipRef = useRef(null);
  const scrollRef = useRef(null);

  // ── Zoom / pan ───────────────────────────────────────────────────────────
  // Both renderers draw a fixed-width SVG scaled to the container, which on a
  // dense plan means squinting. Zoom widens the drawing past the container and
  // lets it scroll — page-zoom semantics, so labels grow with the map and
  // nothing re-lays-out (a re-layout at every zoom step would move stations
  // around while the user is trying to read one).
  const [zoom, setZoom] = useState(() => {
    try { return Math.min(4, Math.max(1, parseFloat(localStorage.getItem(ZOOM_KEY)) || 1)); } catch { return 1; }
  });
  // `next` is a function of the previous zoom, not a value: two clicks in the
  // same tick would otherwise both compute their step from the same stale
  // closure and only advance once.
  const applyZoom = useCallback((next, anchor = null) => {
    setZoom(prev => {
      const raw = typeof next === 'function' ? next(prev) : next;
      const clamped = Math.min(ZOOM_MAX, Math.max(1, Math.round(raw * 100) / 100));
      if (clamped === prev) return prev;
      const box = scrollRef.current;
      if (box) {
        // Keep whatever sits under the cursor (or the viewport centre) put.
        const ax = anchor?.x ?? box.clientWidth / 2;
        const ay = anchor?.y ?? box.clientHeight / 2;
        const fx = (box.scrollLeft + ax) / Math.max(1, box.scrollWidth);
        const fy = (box.scrollTop + ay) / Math.max(1, box.scrollHeight);
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          scrollRef.current.scrollLeft = fx * scrollRef.current.scrollWidth - ax;
          scrollRef.current.scrollTop = fy * scrollRef.current.scrollHeight - ay;
        });
      }
      try { localStorage.setItem(ZOOM_KEY, String(clamped)); } catch { /* noop */ }
      return clamped;
    });
  }, []);
  const onWheel = useCallback(e => {
    if (!e.ctrlKey && !e.metaKey) return;   // plain wheel keeps scrolling the page
    e.preventDefault();
    const box = scrollRef.current;
    const rect = box?.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    applyZoom(prev => prev * factor, rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : null);
  }, [applyZoom]);
  // Drag to pan. The grab cursor promised this and nothing implemented it, so
  // the map could only be moved by trackpad gestures — fine if you own a
  // trackpad, a dead end with a mouse. Pointer events cover both plus touch.
  const dragRef = useRef(null);
  const onPointerDown = useCallback(e => {
    if (zoom <= 1 || e.button !== 0) return;
    const box = scrollRef.current;
    if (!box) return;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
    box.setPointerCapture?.(e.pointerId);
  }, [zoom]);
  const onPointerMove = useCallback(e => {
    const drag = dragRef.current;
    const box = scrollRef.current;
    if (!drag || !box || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;   // let a click stay a click
    drag.moved = true;
    box.scrollLeft = drag.left - dx;
    box.scrollTop = drag.top - dy;
  }, []);
  const endDrag = useCallback(e => {
    const drag = dragRef.current;
    if (!drag) return;
    scrollRef.current?.releasePointerCapture?.(drag.id);
    // Remember for one tick whether this was a drag, so the click handler can
    // ignore the pointerup that ends a pan instead of opening an item.
    dragWasPan.current = drag.moved;
    dragRef.current = null;
    if (drag.moved) e?.preventDefault?.();
  }, []);
  const dragWasPan = useRef(false);

  // A non-passive listener is the only way to preventDefault a wheel event and
  // stop the browser zooming the whole page instead.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // A mouse event and a bounding rect both speak viewport pixels; `left`/`top`
  // on the tooltip are written in the local pixels of the box it sits in. The
  // two are the same number only at 100% interface size. Planr sets `zoom` on
  // its root for the UI-scale setting — and defaults to 110% inside the
  // Obsidian plugin, which is why the map's tooltip trailed the cursor there
  // and looked fine on the web: at 110% every pixel of distance from the map's
  // left edge came out 10% too far right. Divide it back out. See
  // utils/embedHost.js, which measures the factor the same way for every other
  // popup in the app.
  const onMove = useCallback(e => {
    const g = e.target.closest('[data-tip]');
    if (g) {
      // Where the map points at exactly one item, it shows the one card the
      // rest of the app shows (the graph, the Gantt, the Roadmap tab) — the
      // map's own summary told you an abbreviation and a percentage, which is
      // the map repeating itself. Where a station stands for several tasks
      // that finish in the same fortnight there is no single item to describe,
      // so the summary stays: it is the honest answer to what is under the
      // cursor.
      const itemId = g.getAttribute('data-item-id');
      const cluster = Number(g.getAttribute('data-cluster-size') || 0);
      if (itemId && cluster === 1) {
        const node = tree.find(r => r.id === itemId);
        if (node) {
          const row = scheduled.find(sc => (sc.treeId || sc.id) === itemId && !sc.isHandoff);
          setItemTip({ item: row ? { ...node, ...row } : node, x: e.clientX, y: e.clientY });
          setTip(null);
          return;
        }
      }
      setItemTip(null);
      const text = g.getAttribute('data-tip');
      if (text) {
        const rect = ref.current?.getBoundingClientRect();
        const scale = fixedFrame(portalRoot).scale || 1;
        const cx = (e.clientX - (rect?.left || 0)) / scale;
        const cy = (e.clientY - (rect?.top || 0)) / scale;
        setTip({
          text,
          cx, cy,
          cw: (rect?.width || 0) / scale,
          ch: (rect?.height || 0) / scale,
          x: cx + 14,
          y: cy - 8,
        });
        return;
      }
    }
    setTip(null);
    setItemTip(null);
  }, [portalRoot, tree, scheduled]);

  const onLeave = useCallback(() => { setTip(null); setItemTip(null); }, []);

  const onClick = useCallback(e => {
    if (dragWasPan.current) { dragWasPan.current = false; return; }
    const toggle = e.target.closest('[data-rm-toggle]');
    if (toggle) {
      const id = toggle.getAttribute('data-rm-toggle');
      if (id) {
        setExpandedLegendIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
      return;
    }
    const el = e.target.closest('[data-item-id]');
    if (el && onOpenItem) {
      const id = el.getAttribute('data-item-id');
      if (id) onOpenItem(id);
    }
  }, [onOpenItem]);

  // After render, measure tooltip and flip it left/up if it would overflow the container
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const tw = tipRef.current.offsetWidth;
    const th = tipRef.current.offsetHeight;
    let nx = tip.cx + 14;
    let ny = tip.cy - 8;
    if (nx + tw > tip.cw - 8) nx = tip.cx - tw - 14;    // flip left
    if (nx < 8) nx = 8;                                  // clamp left edge
    if (ny + th > tip.ch - 8) ny = tip.ch - th - 8;      // clamp bottom
    if (ny < 8) ny = 8;                                  // clamp top
    if (nx !== tip.x || ny !== tip.y) {
      tipRef.current.style.left = nx + 'px';
      tipRef.current.style.top = ny + 'px';
    }
  }, [tip]);

  if (!svg) return null;
  const zoomed = zoom > 1;
  return (
    <div ref={ref} style={{ marginBottom: 20, position: 'relative' }}
      onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
      <style>{`.rm-legend-item:hover{background:var(--bg3,#232830)}`}</style>
      {/* Above the map, not on it.
          It floated over the top-right corner to cost no vertical space, and
          sat on the first line's terminus badge. Padding the canvas out from
          under it looked like a fix and was not: the SVG scales with the
          pane's width and the control does not, so the clearance that holds
          at one width closes at another, and the collision came back on a
          narrower window. In flow it cannot collide at any width, and the row
          it costs is one row. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center',
        background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: 'var(--r)', padding: '3px 5px' }}
        data-htip={t('rm.zoomInTip')}>
        <span style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          {t('g.zoom')}
        </span>
        <button type="button" className="btn btn-sec btn-xs" style={ZOOM_BTN}
          data-htip={t('rm.zoomOutTip')} disabled={zoom <= 1}
          onClick={() => applyZoom(prevStep)}>−</button>
        <button type="button" className="btn btn-sec btn-xs" style={ZOOM_BTN}
          data-htip={t('rm.zoomInTip')} disabled={zoom >= ZOOM_MAX}
          onClick={() => applyZoom(nextStep)}>+</button>
        {zoomed && <>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="btn btn-sec btn-xs" style={ZOOM_BTN}
            data-htip={t('rm.zoomFitTip')} onClick={() => applyZoom(1)}>{t('rm.zoomFit')}</button>
        </>}
      </div>
      </div>
      <div ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={zoomed
          ? { overflow: 'auto', maxHeight: 'min(78vh, 860px)', cursor: 'grab', overscrollBehaviorX: 'contain', touchAction: 'none' }
          : { overflow: 'visible' }}>
        <SvgMarkup markup={svg} style={zoomed ? { width: `${zoom * 100}%`, minWidth: '100%' } : undefined} />
      </div>
      {itemTip && <Tip item={itemTip.item} x={itemTip.x} y={itemTip.y}
        teams={teams} members={members} tree={tree} scheduled={scheduled} cpLabels={cpLabels}
        hint={t('tt.click')} />}
      {/* Tooltip lives OUTSIDE the scroll container: its coordinates come from
          the visible box, so they must not be shifted by scrollLeft/Top. */}
      {tip && (
        <div
          ref={tipRef}
          style={{
            position: 'absolute', left: tip.x, top: tip.y,
            background: 'var(--bg2, #191d25)', border: '1px solid var(--b2, #364456)',
            borderRadius: 'var(--r, 7px)', padding: '8px 10px', zIndex: 20,
            boxShadow: 'var(--sh, 0 4px 24px rgba(0,0,0,.55))',
            pointerEvents: 'none', minWidth: 180, maxWidth: 320,
            color: 'var(--tx, #e8ecf4)',
          }}
        ><TipBody text={tip.text} /></div>
      )}
    </div>
  );
}
