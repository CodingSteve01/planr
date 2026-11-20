import { fixedDurationDays } from '../scheduler.js';
import { localDate } from '../date.js';
import { EMPTY_ARR } from './helpers.js';

// Everything a task row's bar derives from the row, the drag state and the
// view's geometry. `ctx` carries the view's locals under their own names.
export function buildTaskBarModel(row, s, tc, isSummary, ctx) {
  const {
    drag,
    dateToX,
    DPX,
    WPX,
    dDelta,
    showDays,
    resizePxPerDay,
    cpOnly,
    rowRelevantToCp,
    hoverDepId,
    hoverLines,
    searchMatches,
    iMap,
    selectedIds,
    scheduledWorkDaysOf,
    taskLoadCells,
    tw,
    confidence,
    now,
  } = ctx;
  const isDrag = drag?.id === s.id;
  // Bar geometry is day-accurate whenever scheduler dates exist.
  // Zoom only changes scale/labels; it must not snap bars to weeks.
  let baseLeft, baseWidth;
  if (s.startD && s.endD) {
    baseLeft = dateToX(s.startD) + 2;
    baseWidth = dateToX(s.endD) + DPX - dateToX(s.startD) - 4;
  } else {
    baseLeft = s.startWi * WPX + 2;
    baseWidth = (s.endWi - s.startWi + 1) * WPX - 4;
  }
  // Drag offset: dDelta is in days when showDays, weeks otherwise.
  const dragPxOffset = isDrag && drag?.kind !== 'resizeEnd' ? dDelta * (showDays ? DPX : WPX) : 0;
  const resizePxOffset = isDrag && drag?.kind === 'resizeEnd' ? dDelta * resizePxPerDay : 0;
  const barLeft = Math.max(0, baseLeft + dragPxOffset);
  const bW = Math.max(6, baseWidth + resizePxOffset);
  const dim = cpOnly && !rowRelevantToCp(row);
  const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
  const isHov = hoverDepId === s.id;
  const isMatch = searchMatches?.has(s.id);
  const searchDimmed = searchMatches && searchMatches.size > 0 && !isMatch;
  const node = row.node || iMap[s.treeId || s.id];
  const linkTaskId = s.treeId || s.id;
  const isSelected = selectedIds.has(linkTaskId);
  const fixedDays = !isSummary ? fixedDurationDays(node) : 0;
  const canResizeDuration = !!(!isSummary && node && s.status !== 'done' && !s._unestimated && !s.isHandoff);
  const canResizeDone = !!(!isSummary && node && s.status === 'done' && !s._unestimated && !s.isHandoff);
  const resizePreviewDays =
    isDrag && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone' || drag?.kind === 'resizeStartDone')
      ? Math.max(
          1,
          Math.ceil((drag.baseDurationDays || fixedDays || scheduledWorkDaysOf(s)) + (drag?.kind === 'resizeStartDone' ? -dDelta : dDelta)),
        )
      : fixedDays;
  const loadCells = !isSummary ? taskLoadCells(s, barLeft, bW) : EMPTY_ARR;
  const compactBar = !isSummary && bW < 36;
  const microBar = !isSummary && bW < 16;
  // Resize-handles need at least 30px bar width to avoid colliding with
  // the link-connector semicircle that sits flush against the right edge.
  const showResizeHandle = (canResizeDuration || canResizeDone) && bW >= 30;
  const showResizeStartHandle = canResizeDone && bW >= 30;
  const isResizingDuration = isDrag && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone' || drag?.kind === 'resizeStartDone');
  const resizePreviewLeft = Math.min(Math.max(0, barLeft + bW + 7), Math.max(0, tw - 74));
  const conf = confidence[s.id] || 'committed';
  const decideBy = isSummary ? null : node?.decideBy;
  const decideX = decideBy ? dateToX(localDate(decideBy)) : -1;
  const isDecideOverdue = decideBy && localDate(decideBy) < now;
  // Due-date marker: solid red bar at the start of the exact due date.
  // "Due 2026-07-01" means it must be done when 2026-07-01 starts.
  // (due < today and unfinished) OR scheduler's projected end blows
  // past due (sc.dueOverdue).
  const dueDate = isSummary ? null : node?.due;
  const dueX = dueDate ? dateToX(localDate(dueDate)) : -1;
  const isDueOverdue = dueDate && (s.dueOverdue || (localDate(dueDate) < now && s.status !== 'done'));
  // Confidence-based bar styling
  // ── What a bar's colour says ──────────────────────────────────
  // It used to say TEAM: the bar was filled with the team's colour
  // at full strength and labelled in white. Team colours come from
  // the plan, so on a real one that meant white text on #f0d342 and
  // on #10b981 — unreadable, and saying something this view is not
  // about. The Gantt answers "when does what happen, and is it
  // running": that is STATE, so state is what the fill says.
  //
  // A soft ground with its own state colour as the ink, which is
  // the pairing the palette already guarantees at 4.5:1 (see
  // paletteContrast.test.js). Confidence keeps its meaning on the
  // BORDER instead of fighting for the same channel: solid =
  // committed, thin = estimated, dashed = exploratory. And the team
  // is still there, as a cap on the bar's leading edge — available
  // at a glance, out of the way of the label.
  const stateFill =
    s.status === 'wip'
      ? { background: 'var(--st-wip-soft)', ink: 'var(--st-wip)', edge: 'var(--st-wip)' }
      : { background: 'var(--bg3)', ink: 'var(--tx2)', edge: 'var(--b3)' };
  const confBorder =
    conf === 'exploratory'
      ? `1.5px dashed ${stateFill.edge}`
      : conf === 'estimated'
        ? `1px solid ${stateFill.edge}`
        : `1.5px solid ${stateFill.edge}`;
  const confStyle = {
    background: stateFill.background,
    border: confBorder,
    color: stateFill.ink,
    textShadow: 'none',
    borderLeft: `3px solid ${tc}`,
    opacity: conf === 'exploratory' ? 0.85 : 1,
  };
  const summaryStyle =
    s.status === 'done'
      ? {
          background: 'var(--bg4)',
          border: '1px solid var(--b2)',
          color: 'var(--tx2)',
          textShadow: 'none',
        }
      : {
          background: 'var(--bg3)',
          border: '1px solid var(--b2)',
          color: 'var(--tx)',
          textShadow: 'none',
        };
  return {
    isDrag,
    barLeft,
    bW,
    dim,
    isHovDep,
    isHov,
    isMatch,
    searchDimmed,
    node,
    linkTaskId,
    isSelected,
    fixedDays,
    canResizeDone,
    resizePreviewDays,
    loadCells,
    compactBar,
    microBar,
    showResizeHandle,
    showResizeStartHandle,
    isResizingDuration,
    resizePreviewLeft,
    decideBy,
    decideX,
    isDecideOverdue,
    dueDate,
    dueX,
    isDueOverdue,
    confStyle,
    summaryStyle,
  };
}
