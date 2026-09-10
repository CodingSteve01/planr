import { useMemo, useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { renderRoadmapSvg, computeRoadmapModel } from '../../utils/roadmap.js';
import { renderProjectRoadmapSvg } from '../../utils/projectRoadmap.js';
import { useT } from '../../i18n.jsx';

const ZOOM_KEY = 'planr_roadmap_zoom';
const ZOOM_MAX = 4;
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
const ZOOM_BTN = { width: 22, height: 20, padding: 0, fontSize: 13, lineHeight: 1, fontWeight: 700 };
const nextStep = current => ZOOM_STEPS.find(step => step > current + 1e-6) ?? ZOOM_MAX;
const prevStep = current => [...ZOOM_STEPS].reverse().find(step => step < current - 1e-6) ?? 1;

export function Roadmap({ tree, scheduled, stats, onOpenItem, diff, horizonIds = null, horizonEnd = null, futureProgressByRootId = null, assignment = null, onAssignmentChange = null, soloRootId = null, lineColor = null }) {
  const { t } = useT();
  const [expandedLegendIds, setExpandedLegendIds] = useState(() => new Set());
  // Pass raw template strings (with {0}) so roadmap.js can substitute the percentage itself.
  // t() without extra args leaves {0} intact, which roadmap.js replaces with the actual %.
  const labels = useMemo(() => ({
    train: t('rm.train'),
    currentPos: t('rm.currentPos'),  // keeps "{0}" placeholder — roadmap.js fills it
    atRisk: t('rm.atRisk'),
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
  // A non-passive listener is the only way to preventDefault a wheel event and
  // stop the browser zooming the whole page instead.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onMove = useCallback(e => {
    const g = e.target.closest('[data-tip]');
    if (g) {
      const text = g.getAttribute('data-tip');
      if (text) {
        const rect = ref.current?.getBoundingClientRect();
        setTip({
          text,
          cx: e.clientX - (rect?.left || 0),
          cy: e.clientY - (rect?.top || 0),
          cw: rect?.width || 0,
          ch: rect?.height || 0,
          x: e.clientX - (rect?.left || 0) + 14,
          y: e.clientY - (rect?.top || 0) - 8,
        });
        return;
      }
    }
    setTip(null);
  }, []);

  const onLeave = useCallback(() => setTip(null), []);

  const onClick = useCallback(e => {
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
      {/* Zoom controls sit over the map's top-right corner so they cost no
          vertical space in the already-busy Overview toolbar. */}
      <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 5, display: 'flex', gap: 3, alignItems: 'center' }}>
        {zoomed && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)', marginRight: 2 }}>
            {Math.round(zoom * 100)}%
          </span>
        )}
        <button type="button" className="btn btn-xs btn-sec" style={ZOOM_BTN}
          data-htip={t('rm.zoomOutTip')} disabled={zoom <= 1}
          onClick={() => applyZoom(prevStep)}>−</button>
        <button type="button" className="btn btn-xs btn-sec" style={ZOOM_BTN}
          data-htip={t('rm.zoomInTip')} disabled={zoom >= ZOOM_MAX}
          onClick={() => applyZoom(nextStep)}>+</button>
        {zoomed && (
          <button type="button" className="btn btn-xs btn-sec" style={{ ...ZOOM_BTN, width: 'auto', padding: '0 6px' }}
            data-htip={t('rm.zoomFitTip')} onClick={() => applyZoom(1)}>{t('rm.zoomFit')}</button>
        )}
      </div>
      <div ref={scrollRef}
        style={zoomed
          ? { overflow: 'auto', maxHeight: 'min(78vh, 860px)', cursor: 'grab', overscrollBehaviorX: 'contain' }
          : { overflow: 'visible' }}>
        <div style={zoomed ? { width: `${zoom * 100}%`, minWidth: '100%' } : undefined}
          dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
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
          dangerouslySetInnerHTML={{ __html: tip.text }}
        />
      )}
    </div>
  );
}
