import { useEffect, useRef, useState, useMemo } from 'react';
import { useT } from '../../i18n.jsx';
import { buildDemoProject } from '../../utils/demoProject.js';
import { treeStats, schedule, leafNodes, computeConfidence } from '../../utils/scheduler.js';
import { buildHMap } from '../../utils/holidays.js';
import { renderRoadmapSvg } from '../../utils/roadmap.js';

// ── Shared mini-browser chrome ────────────────────────────────────────────────
function SlideChrome({ label, children }) {
  return (
    <div className="ob-preview">
      <div className="ob-preview-chrome">
        <span className="ob-dot ob-dot-red" />
        <span className="ob-dot ob-dot-amber" />
        <span className="ob-dot ob-dot-green" />
        <span className="ob-preview-title">{label}</span>
      </div>
      {children}
    </div>
  );
}

// ── Slide 1: Metro Roadmap ────────────────────────────────────────────────────
function Slide1Metro({ demo }) {
  const { t } = useT();
  const svg = useMemo(() => {
    try {
      const stats = treeStats(demo.tree);
      return renderRoadmapSvg({ tree: demo.tree, scheduled: [], stats });
    } catch { return ''; }
  }, [demo]);

  return (
    <SlideChrome label={t('ob.preview.label')}>
      <div className="ob-preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </SlideChrome>
  );
}

// ── Slide 2: Mini Gantt ───────────────────────────────────────────────────────
function Slide2Gantt({ demo }) {
  const items = useMemo(() => {
    try {
      const { meta, tree, members, vacations, holidays } = demo;
      const hm = buildHMap(holidays);
      const ps = meta.planStart;
      const pe = meta.planEnd;
      const { results } = schedule(tree, members, vacations || [], ps, pe, hm, null, ps);
      // Take first 8 scheduled results that have valid dates
      return results
        .filter(r => r.startD && r.endD)
        .slice(0, 8);
    } catch { return []; }
  }, [demo]);

  if (!items.length) return null;

  // Compute domain
  const allStart = items.map(r => r.startD.getTime());
  const allEnd = items.map(r => r.endD.getTime());
  const domainStart = Math.min(...allStart);
  const domainEnd = Math.max(...allEnd);
  const range = domainEnd - domainStart || 1;

  const W = 900, H = 290;
  const LEFT = 160, RIGHT = 20, TOP = 28, ROW = 28, BAR_H = 14;
  const chartW = W - LEFT - RIGHT;

  // Team color map from demo
  const teamColors = {};
  (demo.teams || []).forEach(t => { teamColors[t.id] = t.color; });
  // Also map by short team string (e.g. 'T1', 'T2')
  const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  const getColor = (item) => {
    // item.team is the short name like 'T1' or 'T2'
    const teamEntry = (demo.teams || []).find(t => t.id === item.team || t.name === item.team);
    if (teamEntry) return teamEntry.color;
    const idx = parseInt((item.team || '1').replace(/\D/g, ''), 10) - 1;
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length] || '#3b82f6';
  };

  // Week gridlines
  const weekLines = [];
  const gridDate = new Date(domainStart);
  // Snap to Monday
  const dow = gridDate.getDay();
  const diff = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  gridDate.setDate(gridDate.getDate() + diff);
  while (gridDate.getTime() < domainEnd) {
    const x = LEFT + ((gridDate.getTime() - domainStart) / range) * chartW;
    weekLines.push({ x, label: `W${isoWeek(gridDate)}` });
    gridDate.setDate(gridDate.getDate() + 7);
  }

  const today = new Date();
  const todayX = LEFT + ((today.getTime() - domainStart) / range) * chartW;
  const showToday = todayX >= LEFT && todayX <= LEFT + chartW;

  return (
    <SlideChrome label="planr · schedule">
      <div className="ob-preview-svg">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 260 }}>
          {/* Week gridlines */}
          {weekLines.map((wl, i) => (
            <g key={i}>
              <line x1={wl.x} y1={TOP} x2={wl.x} y2={H - 10} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              {i % 2 === 0 && (
                <text x={wl.x + 2} y={TOP - 8} fontSize="7" fill="rgba(255,255,255,0.25)" fontFamily="monospace">{wl.label}</text>
              )}
            </g>
          ))}
          {/* Today line */}
          {showToday && (
            <line x1={todayX} y1={TOP - 10} x2={todayX} y2={H - 10} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.7" />
          )}
          {/* Bars */}
          {items.map((item, i) => {
            const y = TOP + i * ROW;
            const x0 = LEFT + ((item.startD.getTime() - domainStart) / range) * chartW;
            const x1 = LEFT + ((item.endD.getTime() - domainStart) / range) * chartW;
            const bw = Math.max(x1 - x0, 3);
            const color = getColor(item);
            const isDone = item.status === 'done';
            const isWip = item.status === 'wip';
            const barY = y + (ROW - BAR_H) / 2;

            return (
              <g key={item.id}>
                {/* Label */}
                <text x={LEFT - 6} y={y + ROW / 2 + 4} fontSize="8.5" fill="rgba(255,255,255,0.65)"
                  textAnchor="end" fontFamily="-apple-system,sans-serif"
                  style={{ overflow: 'hidden' }}>
                  {item.name.length > 20 ? item.name.slice(0, 19) + '…' : item.name}
                </text>
                {/* Bar bg track */}
                <rect x={x0} y={barY} width={bw} height={BAR_H} rx="3"
                  fill={color} opacity={isDone ? 0.35 : 0.8} />
                {/* Progress fill for wip */}
                {isWip && (
                  <rect x={x0} y={barY} width={bw * 0.5} height={BAR_H} rx="3"
                    fill={color} opacity={1} />
                )}
                {/* Done check */}
                {isDone && (
                  <text x={x0 + bw / 2} y={barY + BAR_H - 3} fontSize="8" fill={color}
                    textAnchor="middle" opacity="0.9">✓</text>
                )}
                {/* Person badge */}
                {item.personShort && item.personShort !== '?' && (
                  <text x={x0 + bw + 3} y={barY + BAR_H - 3} fontSize="7.5" fill="rgba(255,255,255,0.45)"
                    fontFamily="monospace">{item.personShort}</text>
                )}
              </g>
            );
          })}
          {/* Axis baseline */}
          <line x1={LEFT} y1={H - 10} x2={W - RIGHT} y2={H - 10} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        </svg>
      </div>
    </SlideChrome>
  );
}

// Simple ISO week number helper (local use only)
function isoWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ── Slide 3: Network Graph ────────────────────────────────────────────────────
function Slide3Network({ demo }) {
  // Pick a representative subset: 10 nodes with visible dependency edges
  const { nodes, edges } = useMemo(() => {
    const tree = demo.tree;
    const teams = demo.teams || [];
    const teamColorMap = {};
    teams.forEach(t => { teamColorMap[t.id] = t.color; });
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const getColor = (teamId) => {
      if (teamColorMap[teamId]) return teamColorMap[teamId];
      const idx = parseInt((teamId || '1').replace(/\D/g, ''), 10) - 1;
      return COLORS[Math.max(0, idx) % COLORS.length];
    };

    // Pick nodes with deps for interesting graph — roots + some leaves
    const interesting = tree.filter(n => n.deps?.length > 0 || tree.some(o => (o.deps || []).includes(n.id)));
    const subset = tree.filter(n => !n.id.includes('.') || n.id.split('.').length <= 2).slice(0, 10);
    const nodeIds = new Set(subset.map(n => n.id));

    // Layout: simple grid with jitter
    const cols = 4;
    const W = 900, H = 270;
    const padX = 110, padY = 48;
    const spacingX = (W - 2 * padX) / (cols - 1);
    const spacingY = (H - 2 * padY) / (Math.ceil(subset.length / cols) - 1 || 1);

    const positioned = subset.map((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Slight vertical stagger for odd columns
      const jitterY = (col % 2) * 18;
      return {
        ...n,
        x: padX + col * spacingX,
        y: padY + row * spacingY + jitterY,
        color: getColor(n.team),
      };
    });

    const posMap = {};
    positioned.forEach(n => { posMap[n.id] = n; });

    const edges = [];
    positioned.forEach(n => {
      (n.deps || []).forEach(dep => {
        if (posMap[dep]) {
          edges.push({ from: posMap[dep], to: n });
        }
      });
    });

    return { nodes: positioned, edges };
  }, [demo]);

  const W = 900, H = 270;
  const R = 20;

  return (
    <SlideChrome label="planr · network">
      <div className="ob-preview-svg">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 260 }}>
          <defs>
            <marker id="arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="var(--tx3)" opacity="0.55" />
            </marker>
          </defs>
          {/* Edges */}
          {edges.map((e, i) => {
            const dx = e.to.x - e.from.x;
            const dy = e.to.y - e.from.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;
            const x1 = e.from.x + ux * (R + 2);
            const y1 = e.from.y + uy * (R + 2);
            const x2 = e.to.x - ux * (R + 4);
            const y2 = e.to.y - uy * (R + 4);
            const cx1 = x1 + (x2 - x1) * 0.4;
            const cy1 = y1;
            const cx2 = x1 + (x2 - x1) * 0.6;
            const cy2 = y2;
            return (
              <path key={i}
                d={`M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`}
                stroke="var(--tx3)"
                strokeOpacity="0.5"
                strokeWidth="1.5"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
          {/* Nodes */}
          {nodes.map(n => {
            const isDone = n.status === 'done';
            const isWip = n.status === 'wip';
            const label = n.name.length > 13 ? n.name.slice(0, 12) + '…' : n.name;
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={R}
                  fill={isDone ? 'transparent' : n.color}
                  stroke={n.color}
                  strokeWidth={isDone ? 2 : 1}
                  opacity={isDone ? 0.5 : 0.85}
                />
                {isWip && (
                  <circle cx={n.x} cy={n.y} r={R - 4}
                    fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.35" />
                )}
                {isDone && (
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11"
                    fill={n.color} opacity="0.8">✓</text>
                )}
                <text x={n.x} y={n.y + R + 11} textAnchor="middle"
                  fontSize="8" fill="rgba(255,255,255,0.65)"
                  fontFamily="-apple-system,sans-serif">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </SlideChrome>
  );
}

// ── Slide 4: Plan Review snapshot ────────────────────────────────────────────
function Slide4PlanReview({ demo }) {
  const { t } = useT();

  const { tasks, confidence } = useMemo(() => {
    try {
      const { tree, members } = demo;
      const { confidence } = computeConfidence(tree, members);
      const leaves = leafNodes(tree);
      // Take open/wip leaves for "up next"
      const upcoming = leaves
        .filter(n => n.status !== 'done')
        .slice(0, 4);

      const memberMap = {};
      (members || []).forEach(m => { memberMap[m.id] = m; });

      const tasks = upcoming.map(n => {
        const assignee = (n.assign || []).map(id => memberMap[id]?.name || id).join(', ') || null;
        const teamEntry = (demo.teams || []).find(t => t.id === n.team);
        return {
          id: n.id,
          name: n.name,
          status: n.status,
          assignee,
          teamColor: teamEntry?.color || '#6b7280',
          confidence: confidence[n.id] || 'exploratory',
        };
      });

      // Count committed / estimated / exploratory among all leaves
      const leaves2 = leafNodes(tree);
      let comm = 0, est = 0, expl = 0;
      leaves2.forEach(n => {
        const c = confidence[n.id] || 'exploratory';
        if (c === 'committed') comm++;
        else if (c === 'estimated') est++;
        else expl++;
      });
      const total = leaves2.length || 1;

      return { tasks, confidence: { comm, est, expl, total } };
    } catch { return { tasks: [], confidence: { comm: 0, est: 0, expl: 0, total: 1 } }; }
  }, [demo]);

  const { comm, est, expl, total } = confidence;
  const pComm = Math.round((comm / total) * 100);
  const pEst = Math.round((est / total) * 100);
  const pExpl = Math.round((expl / total) * 100);

  const confDot = { committed: '●', estimated: '◐', exploratory: '○' };
  const confColor = { committed: '#3b82f6', estimated: '#f59e0b', exploratory: '#6b7280' };

  return (
    <SlideChrome label="planr · plan review">
      <div className="ob-plan-review-slide">
        {/* Confidence bar */}
        <div className="ob-pr-section">
          <div className="ob-pr-label">{t('s.planConfidence')}</div>
          <div className="ob-pr-bar-wrap">
            <div className="ob-pr-bar">
              {pComm > 0 && (
                <div className="ob-pr-bar-seg ob-pr-bar-comm" style={{ width: `${pComm}%` }} title={`${t('conf.committed')}: ${pComm}%`} />
              )}
              {pEst > 0 && (
                <div className="ob-pr-bar-seg ob-pr-bar-est" style={{ width: `${pEst}%` }} title={`${t('conf.estimated')}: ${pEst}%`} />
              )}
              {pExpl > 0 && (
                <div className="ob-pr-bar-seg ob-pr-bar-expl" style={{ width: `${pExpl}%` }} title={`${t('conf.exploratory')}: ${pExpl}%`} />
              )}
            </div>
            <div className="ob-pr-bar-legend">
              <span style={{ color: '#3b82f6' }}>● {t('conf.committed')} {pComm}%</span>
              <span style={{ color: '#f59e0b' }}>◐ {t('conf.estimated')} {pEst}%</span>
              <span style={{ color: '#6b7280' }}>○ {t('conf.exploratory')} {pExpl}%</span>
            </div>
          </div>
        </div>
        {/* Upcoming tasks */}
        <div className="ob-pr-section">
          <div className="ob-pr-label">{t('s.upNext')}</div>
          <div className="ob-pr-tasks">
            {tasks.map(task => (
              <div key={task.id} className="ob-pr-task-row">
                <span className="ob-pr-conf-dot" style={{ color: confColor[task.confidence] }}>
                  {confDot[task.confidence]}
                </span>
                <span className="ob-pr-team-dot" style={{ background: task.teamColor }} />
                <span className="ob-pr-task-name">{task.name}</span>
                {task.assignee && (
                  <span className="ob-pr-badge">{task.assignee.split(' ').map(w => w[0]).join('')}</span>
                )}
                <span className={`ob-pr-status ob-pr-status-${task.status}`}>
                  {task.status === 'wip' ? t('wip') : t('open')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideChrome>
  );
}

// ── FeatureCarousel ───────────────────────────────────────────────────────────
const AUTO_INTERVAL = 7000;
const IDLE_RESTART = 30000;

export function FeatureCarousel() {
  const { t } = useT();
  const demo = useMemo(() => {
    try { return buildDemoProject(t); } catch { return null; }
  }, [t]);

  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const idleRef = useRef(null);

  const SLIDE_COUNT = 4;

  const captions = [
    t('carousel.slide1.caption'),
    t('carousel.slide2.caption'),
    t('carousel.slide3.caption'),
    t('carousel.slide4.caption'),
  ];

  const go = (idx) => setCurrent(((idx % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT);

  const handleUserInteract = () => {
    setPaused(true);
    clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setPaused(false), IDLE_RESTART);
  };

  const prev = () => { go(current - 1); handleUserInteract(); };
  const next = () => { go(current + 1); handleUserInteract(); };
  const goTo = (i) => { go(i); handleUserInteract(); };

  // Auto-rotate
  useEffect(() => {
    if (paused) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setCurrent(c => (c + 1) % SLIDE_COUNT), AUTO_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [paused]);

  // Keyboard navigation when carousel is focused
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
  };

  if (!demo) return null;

  return (
    <div
      className="ob-carousel"
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); clearTimeout(idleRef.current); }}
      onKeyDown={handleKeyDown}
      tabIndex="0"
      role="region"
      aria-label="Feature preview"
    >
      {/* Viewport clips the sliding track */}
      <div className="ob-carousel-viewport">
        <div
          className="ob-carousel-track"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          <div className="ob-carousel-slide">
            <Slide1Metro demo={demo} />
          </div>
          <div className="ob-carousel-slide">
            <Slide2Gantt demo={demo} />
          </div>
          <div className="ob-carousel-slide">
            <Slide3Network demo={demo} />
          </div>
          <div className="ob-carousel-slide">
            <Slide4PlanReview demo={demo} />
          </div>
        </div>

        {/* Left arrow */}
        <button
          className="ob-carousel-arrow ob-carousel-arrow-left"
          onClick={prev}
          aria-label="Previous slide"
          tabIndex="-1"
        >
          &#8592;
        </button>

        {/* Right arrow */}
        <button
          className="ob-carousel-arrow ob-carousel-arrow-right"
          onClick={next}
          aria-label="Next slide"
          tabIndex="-1"
        >
          &#8594;
        </button>
      </div>{/* end ob-carousel-viewport */}

      {/* Caption */}
      <div className="ob-carousel-caption">{captions[current]}</div>

      {/* Dots */}
      <div className="ob-carousel-dots">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <button
            key={i}
            className={`ob-carousel-dot${i === current ? ' ob-carousel-dot-active' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}`}
            tabIndex="-1"
          />
        ))}
      </div>
    </div>
  );
}
