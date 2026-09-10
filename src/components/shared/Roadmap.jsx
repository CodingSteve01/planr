import { useMemo, useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { renderRoadmapSvg, computeRoadmapModel } from '../../utils/roadmap.js';
import { renderProjectRoadmapSvg } from '../../utils/projectRoadmap.js';
import { useT } from '../../i18n.jsx';

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
  return (
    <div ref={ref} style={{ marginBottom: 20, position: 'relative' }}
      onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
      <style>{`.rm-legend-item:hover{background:var(--bg3,#232830)}`}</style>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
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
