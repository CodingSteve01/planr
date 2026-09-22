import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { computeProjectRoadmap } from '../../utils/projectRoadmap.js';
import { progressPctLabel } from '../../utils/progress.js';
import { fmtDate } from '../../utils/date.js';
import { Tip } from '../shared/Tooltip.jsx';
import { useT } from '../../i18n.jsx';

// Plan mode's Roadmap tab, built the way the Gantt is built: real DOM, a
// fixed row height, and a width that follows the pane.
//
// The SVG renderer (utils/projectRoadmap.js → Roadmap.jsx) stays where it is
// earned: the Subway map, and the PDF, where a single scalable image is
// exactly what you want. It is the wrong thing HERE, because an SVG with a
// fixed 1400px viewBox and `width:100%` SCALES — on a wide window every row,
// label and dot grows by the same factor, which is why this view looked
// oversized next to the Gantt. Pixels have to mean pixels for a view you
// work in.
//
// One model, two renderers: `computeProjectRoadmap` is untouched and shared.
// This file only draws.

const ROW_H = 28;          // same as GanttView's RH — they sit side by side
const AXIS_H = 28;         // and its FLAG_ROW_H
const LABEL_W = 230;
const DAY = 864e5;
// Zoom is a FACTOR on the fit, not an absolute px-per-day. A six-month
// project and a three-year one need wildly different pixel scales to fill
// the same pane, so an absolute step that magnifies one does nothing at all
// to the other — the first version of this had 2 px/day steps against a
// project whose fit was already 13 px/day, and the button was inert.
// 1× means "the whole project, edge to edge"; above that it magnifies and
// scrolls, which is the only thing zoom can usefully mean here.
const ZOOM_KEY = 'planr_plan_roadmap_zoom';
const ZOOM_STEPS = [1, 1.5, 2, 3, 5, 8];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function clampZoom(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, num));
}

export function PlanRoadmap({ tree, scheduled, stats, rootId, color = 'var(--ac)',
  teams = [], members = [], cpSet = null, cpLabels = {}, onOpenItem,
  // Review window. The Roadmap was the one working view with no diff support
  // at all — the filter bar offered a "since" window and this view ignored
  // it, so a sprint review had to be read somewhere else and come back.
  // Same vocabulary as the Gantt: what finished in the window, what moved,
  // and the option to show only those.
  diffDoneIds = null, diffProgressedIds = null, sinceDate = null, onlyChanged = false }) {
  const { t } = useT();
  // The same tooltip the graph and the Gantt show — one item, one card, the
  // whole story: status, window, effort, deps, phases, handoff chain. The
  // roadmap used to carry `data-htip="AB.1 öffnen"`, which told you what a
  // click does and nothing about the item you were pointing at. Reading a
  // roadmap is exactly when you want to know the item.
  const [tip, setTip] = useState(null); // { item, x, y }
  const scrollRef = useRef(null);
  const [zoom, setZoomState] = useState(() => {
    try { return clampZoom(parseFloat(localStorage.getItem(ZOOM_KEY)) || MIN_ZOOM); } catch { return MIN_ZOOM; }
  });
  const setZoom = next => {
    const clamped = clampZoom(typeof next === 'function' ? next(zoom) : next);
    setZoomState(clamped);
    try { localStorage.setItem(ZOOM_KEY, String(clamped)); } catch { /* noop */ }
  };

  const model = useMemo(
    () => computeProjectRoadmap({ tree, scheduled, stats, rootId }),
    [tree, scheduled, stats, rootId],
  );

  const nodeById = useMemo(() => new Map((tree || []).map(node => [node.id, node])), [tree]);
  // Handoff shadows share a tree id with their primary and would otherwise
  // win the lookup; the primary is the row the roadmap draws.
  const schedById = useMemo(() => {
    const map = new Map();
    for (const row of scheduled || []) {
      const id = row.treeId || row.id;
      if (!map.has(id) || (!row.isHandoff && map.get(id).isHandoff)) map.set(id, row);
    }
    return map;
  }, [scheduled]);

  // What the Tip wants: a tree node merged with its scheduled row. A leaf has
  // one; a work package does not (only leaves are scheduled), so it is
  // summarised over its own leaves the same way the Gantt summarises a group
  // row — `_summary` and the two counts, which the Tip already renders.
  const tipItemFor = useCallback((id, row = null) => {
    const node = nodeById.get(id);
    if (!node) return null;
    const sched = schedById.get(id);
    if (sched) return { ...node, ...sched, isCp: !!cpSet?.has(sched.id) };
    const leaves = (row?.milestones || []).map(m => schedById.get(m.id)).filter(Boolean);
    return {
      ...node,
      status: row?.status || node.status,
      startD: row?.start || null,
      endD: row?.end || null,
      best: leaves.reduce((sum, leaf) => sum + (leaf.best || 0), 0),
      effort: leaves.reduce((sum, leaf) => sum + (leaf.effort || 0), 0),
      _summary: true,
      _summaryCount: row?.leafCount ?? 0,
      _doneCount: row?.doneCount ?? 0,
    };
  }, [nodeById, schedById, cpSet]);

  const showTip = useCallback((id, row, event) => {
    const item = tipItemFor(id, row);
    if (item) setTip({ item, x: event.clientX, y: event.clientY });
  }, [tipItemFor]);
  const hideTip = useCallback(() => setTip(null), []);
  // A click opens the item; leaving the tooltip up over the dialog that just
  // covered the row is how you end up with two cards fighting for the screen.
  const openItem = useCallback(id => { setTip(null); onOpenItem?.(id); }, [onOpenItem]);

  // The pane's width, measured — the base every scale is derived from. This
  // is the reason the view is DOM and not a scaled image: it can ask how
  // much room it actually has instead of stretching a fixed picture.
  const [paneW, setPaneW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect?.width;
      if (width) setPaneW(Math.round(width));
    });
    ro.observe(el);
    setPaneW(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const totalDays = model ? (model.axisEnd - model.axisStart) / DAY : 0;
  // 24px of slack so the last month label and the right-most stop are not
  // flush against the edge.
  const fitPxDay = totalDays > 0 && paneW > 0 ? (paneW - 24) / totalDays : 0;
  const effectivePxDay = fitPxDay * zoom;

  // Scroll so today is in view on first paint — a roadmap that opens on a
  // month you finished two quarters ago is a picture, not a tool. Only ever
  // when the plot is actually wider than the pane (nothing to scroll
  // otherwise) AND today actually falls on this project's own axis — the
  // model no longer pads the axis out to today unconditionally (a finished
  // or not-yet-started project draws exactly its own span), so there may be
  // nothing to scroll to.
  const todayInRange = !!model && model.today >= model.axisStart && model.today <= model.axisEnd;
  const scrolledFor = useRef(null);
  useEffect(() => {
    if (!model || !scrollRef.current || !paneW || !todayInRange) return;
    if (scrolledFor.current === rootId) return;
    scrolledFor.current = rootId;
    if (totalDays * effectivePxDay <= paneW) return;
    const x = ((model.today - model.axisStart) / DAY) * effectivePxDay;
    scrollRef.current.scrollLeft = Math.max(0, x - paneW / 3);
  }, [model, rootId, effectivePxDay, paneW, totalDays, todayInRange]);

  if (!model) return null;

  const plotW = Math.max(320, totalDays * effectivePxDay);
  const xOf = date => (((date instanceof Date ? +date : date) - model.axisStart) / DAY) * effectivePxDay;

  // How many months a label may cover. The model guesses this from the month
  // COUNT, which is the wrong quantity: at "fit" zoom on a three-year project
  // a quarter is barely thirty pixels, so "Nov '25" ran straight into the
  // next label — seen on the real plan as "Nov '25Feb". What decides it is
  // pixels per month, and only the view knows those, because zoom is here.
  // 62px is the widest label this axis draws (a month plus a year).
  const pxPerMonth = effectivePxDay * 30.4;
  const tickEvery = Math.max(model.tickEvery, Math.ceil(62 / Math.max(1, pxPerMonth)));

  // The year is what gives the axis any temporal orientation at all — and
  // showing it only on January meant a project starting mid-year (the
  // common case) never printed one. It now shows on the FIRST rendered tick
  // unconditionally, and on every January after that.
  const monthLabel = (date, isFirstTick) => date.toLocaleDateString(undefined, { month: 'short' })
    + (isFirstTick || date.getMonth() === 0 ? ` ’${String(date.getFullYear()).slice(2)}` : '');

  return <div className="pr" data-testid="plan-roadmap">
    {/* Header — the project, its figure, and the zoom. Mirrors the Gantt's
        own footer controls so the two read as one family. */}
    <div className="pr-head">
      <span className="pr-head-bar" style={{ background: color }} />
      <span className="pr-head-name">{model.root.id} · {model.root.name || ''}</span>
      <span className="pr-head-meta">
        {progressPctLabel(model.progress)}% · {model.doneCount}/{model.leafCount} {t('tv.items')}
      </span>
      <span style={{ flex: 1 }} />
      <span className="pr-zoom">
        <span className="pr-zoom-lbl">{t('g.zoom')}</span>
        <span className="pr-zoom-val">{zoom === 1 ? t('pr.zoomFit') : `${zoom}×`}</span>
        <button className="btn btn-sec btn-xs" data-testid="plan-roadmap-zoom-out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom(z => [...ZOOM_STEPS].reverse().find(step => step < z - 1e-6) ?? MIN_ZOOM)}
          data-htip={t('rm.zoomOutTip')}>−</button>
        <button className="btn btn-sec btn-xs" data-testid="plan-roadmap-zoom-in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom(z => ZOOM_STEPS.find(step => step > z + 1e-6) ?? MAX_ZOOM)}
          data-htip={t('rm.zoomInTip')}>+</button>
      </span>
    </div>

    <div className="pr-body">
      {/* Left column — sticky, exactly like the Gantt's row labels, so the
          names stay readable however far right you scroll. */}
      <div className="pr-labels" style={{ width: LABEL_W }}>
        <div className="pr-axis-spacer" style={{ height: AXIS_H }} />
        {model.rows.map(row => (
          <div key={row.id} className="pr-label" style={{ height: ROW_H }}
            onClick={() => openItem(row.id)}
            onMouseEnter={e => showTip(row.id, row, e)}
            onMouseLeave={hideTip}>
            <span className="pr-label-id">{row.id}</span>
            <span className={`pr-label-name${row.allDone ? ' done' : ''}`}>{row.name}</span>
          </div>
        ))}
      </div>

      <div className="pr-scroll" ref={scrollRef}>
        <div style={{ width: plotW, position: 'relative' }}>
          {/* Month axis */}
          <div className="pr-axis" style={{ height: AXIS_H }}>
            {model.months.map((month, idx) => {
              if (idx % tickEvery) return null;
              return <span key={+month} className="pr-tick" style={{ left: xOf(month) }}>
                <span className="pr-tick-lbl">{monthLabel(month, idx === 0)}</span>
              </span>;
            })}
          </div>

          {/* Rows */}
          <div style={{ position: 'relative', minHeight: model.rows.length * ROW_H }}>
            {model.months.map((month, idx) => (idx % tickEvery ? null : (
              <span key={`g${+month}`} className="pr-grid" style={{ left: xOf(month), height: model.rows.length * ROW_H }} />
            )))}

            {model.rows.map((row, idx) => {
              const hasSpan = row.start && row.end;
              const left = hasSpan ? xOf(row.start) : 0;
              const width = hasSpan ? Math.max(6, xOf(row.end) - left) : 0;
              // A package counts as touched when anything under it is.
              const touched = !!sinceDate && (row.milestones || []).some(m =>
                diffDoneIds?.has(m.id) || diffProgressedIds?.has(m.id));
              if (onlyChanged && sinceDate && !touched) return null;
              return <div key={row.id} data-pr-changed={touched ? 'true' : undefined}
                className={`pr-row${idx % 2 ? ' alt' : ''}${touched ? ' changed' : ''}`} style={{ height: ROW_H }}>
                {hasSpan && <span
                  className="pr-bar"
                  style={{ left, width, background: color }}
                  onClick={() => openItem(row.id)}
                  onMouseEnter={e => showTip(row.id, row, e)}
                  onMouseLeave={hideTip}>
                  <span className="pr-bar-fill" style={{
                    width: `${Math.max(0, Math.min(100, row.progress))}%`,
                    background: color,
                  }} />
                </span>}
                {row.milestones.map(m => (
                  <span key={m.id}
                    data-pr-changed={sinceDate && (diffDoneIds?.has(m.id) || diffProgressedIds?.has(m.id)) ? 'true' : undefined}
                    className={`pr-stop s-${m.status}${sinceDate && (diffDoneIds?.has(m.id) || diffProgressedIds?.has(m.id)) ? ' changed' : ''}`}
                    style={{ left: xOf(m.end), borderColor: color, background: m.status === 'done' ? color : 'var(--bg)' }}
                    onClick={e => { e.stopPropagation(); openItem(m.id); }}
                    onMouseEnter={e => { e.stopPropagation(); showTip(m.id, null, e); }}
                    onMouseLeave={hideTip} />
                ))}
              </div>;
            })}

            {/* Today and the root's deadline — drawn last so they sit on top.
                Today only draws when it actually falls on this project's own
                axis; a finished or not-yet-started project has nothing to
                mark. */}
            {todayInRange && (
              <span className="pr-today" style={{ left: xOf(model.today), height: model.rows.length * ROW_H }}
                data-htip={`${t('rm.today')} · ${fmtDate(model.today)}`} />
            )}
            {model.deadline && (
              <span className="pr-deadline" style={{ left: xOf(model.deadline), height: model.rows.length * ROW_H }}
                data-htip={`${t('deadline')} · ${fmtDate(model.deadline)}`} />
            )}
          </div>
        </div>
      </div>

      {/* Right column — the same two figures the Gantt puts at the end of a
          row, so a wide window is not wasted on whitespace. */}
      <div className="pr-figures">
        <div className="pr-axis-spacer" style={{ height: AXIS_H }} />
        {model.rows.map(row => (
          <div key={row.id} className="pr-figure" style={{ height: ROW_H }}>
            <span className="pr-figure-count">{row.doneCount}/{row.leafCount}</span>
            <span className={`pr-figure-pct${row.allDone ? ' done' : ''}`}>{progressPctLabel(row.progress)}%</span>
          </div>
        ))}
      </div>
    </div>

    {tip && <Tip item={tip.item} x={tip.x + 14} y={tip.y + 16}
      teams={teams} members={members} tree={tree} scheduled={scheduled}
      cpLabels={cpLabels} hint={t('tt.click')} />}
  </div>;
}
