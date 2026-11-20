import { buildTaskBarModel } from '../../../utils/gantt/taskBarModel.js';
import { BarOverlays } from './BarOverlays.jsx';

// A task or summary row: the row cell, its bar and the markers around it.
// `style` and `data-row-type` arrive from the row call site (cloneElement);
// a compact layout passes the absolute position in `style`.
export function GanttTaskBarRow({
  row,
  style,
  'data-row-type': dataRowType,
  rowColor,
  rowIsCp,
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
  RH,
  weeks,
  scheduled,
  t,
  baseline,
  sinceDate,
  _diffDoneSet,
  _diffProgSet,
  activeMatchId,
  linkDrag,
  groupBy,
  dragRef,
  hoverLineKey,
  showRowTip,
  hideRowTip,
  dismissTooltip,
  onReorderSibling,
  onBMD,
  onLinkDrop,
  justDraggedRef,
  onBarClick,
  handleSelectClick,
  _diffActive,
  diffPastLeafState,
  vacBandsByTaskId,
  onTaskUpdate,
  onResizeStartDoneMD,
  onResizeEndMD,
  onLinkStart,
}) {
  const s = row.s;
  const tc = rowColor(row);
  const isSummary = row.type === 'summary';
  const isCp = rowIsCp(row);
  const {
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
  } = buildTaskBarModel(row, s, tc, isSummary, {
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
  });
  return (
    <div
      className="grow-r"
      data-row-type={dataRowType}
      style={{
        height: RH,
        position: 'relative',
        opacity: dim ? 0.2 : searchDimmed ? 0.25 : 1,
        background: isHov ? 'rgba(127,127,127,.10)' : isHovDep ? 'rgba(127,127,127,.05)' : '',
        ...style,
        borderBottom: style?.borderBottom ?? '1px solid var(--b)',
      }}
    >
      {/* Load sits UNDER THE BAR and nowhere else — see the bar's own
    strip below. It was drawn across the row as well, which is
    how a week the task has nothing to do with ended up as a
    loose line floating in the row's empty half; in compact,
    where several tasks share a lane, those lines piled onto each
    other and read as noise. One line under the work package says
    what the load was while the work was happening, which is the
    question. The row-wide reading still exists where a row IS a
    person: the resource group header. */}
      {/* Idle-wait gap: hatched amber band from when the assignee was
    prev free → this task's start. Visualises why the bar sits
    far in the future (waiting for a dep). Only when gap > ~5d
    to avoid noise. */}
      {!isSummary &&
        s.blockedBy &&
        s.personPrevFree &&
        s.startD &&
        (() => {
          const prevFreeD = s.personPrevFree instanceof Date ? s.personPrevFree : new Date(s.personPrevFree);
          const startD = s.startD instanceof Date ? s.startD : new Date(s.startD);
          const gapDays = Math.round((startD - prevFreeD) / 864e5);
          if (gapDays < 5) return null;
          const x1 = showDays
            ? dateToX(prevFreeD)
            : Math.floor(
                weeks.findIndex(w => {
                  const nxt = weeks[weeks.indexOf(w) + 1];
                  return w.mon <= prevFreeD && (!nxt || nxt.mon > prevFreeD);
                }) * WPX,
              );
          const x2 = barLeft;
          if (!(x2 > x1)) return null;
          const blocker = scheduled.find(x => x.id === s.blockedBy.id);
          const blockerName = blocker?.name && blocker.name !== s.blockedBy.id ? blocker.name : '';
          const blockerPerson = blocker?.person || blocker?.personShort || '';
          const endIso = s.blockedBy.endD instanceof Date ? s.blockedBy.endD.toISOString().slice(0, 10) : String(s.blockedBy.endD);
          const blockerLabel = blockerName ? `${s.blockedBy.id} – ${blockerName}` : s.blockedBy.id;
          const meta = [blockerPerson, t('g.blockerEnds', endIso)].filter(Boolean).join(', ');
          return (
            <div
              data-htip={t('g.waitingForTip', gapDays, blockerLabel) + (meta ? ` (${meta})` : '')}
              style={{
                position: 'absolute',
                left: x1,
                top: 8,
                width: x2 - x1,
                height: 12,
                borderRadius: 3,
                background: 'repeating-linear-gradient(45deg, rgba(245,158,11,.35) 0 4px, rgba(245,158,11,.10) 4px 8px)',
                border: '1px dashed rgba(245,158,11,.65)',
                pointerEvents: 'auto',
                zIndex: 1,
              }}
            />
          );
        })()}
      {/* Absence is drawn under the bar as well, and only where it
    falls INSIDE it: a holiday two months after this task says
    nothing about this task, and drawn across the row it was one
    more loose line. Inside the bar it answers the question it is
    there for — why five days of work span three weeks. */}
      {/* A scenario is on screen: where this bar sits in the plan,
    drawn behind it. Only for bars the scenario moved, so the
    ghosts ARE the difference rather than a second chart. */}
      {!isSummary &&
        baseline?.has(s.treeId || s.id) &&
        (() => {
          // By tree id: a task handed over between people is several
          // rows here (`P1.1`, `P1.1#2`) and one item in the plan.
          const g = baseline.get(s.treeId || s.id);
          const gLeft = dateToX(g.start) + 2;
          const gWidth = Math.max(6, dateToX(g.end) + DPX - dateToX(g.start) - 4);
          return (
            <div
              className="scn-ghost"
              data-testid="scn-ghost"
              data-ghost-for={s.id}
              style={{ left: gLeft, width: gWidth, top: 2, height: 24 }}
            />
          );
        })()}
      {bW > 0 && sinceDate && (_diffDoneSet.has(s.id) || _diffProgSet.has(s.id)) && (
        <div
          data-htip={_diffDoneSet.has(s.id) ? t('diff.tipDone') : t('diff.tipNew')}
          style={{
            position: 'absolute',
            left: barLeft - 2,
            top: (isSummary ? 6 : 4) - 2,
            width: Math.max(bW, 6) + 4,
            height: (isSummary ? 16 : 20) + 4,
            borderRadius: isSummary ? 6 : 5,
            pointerEvents: 'none',
            zIndex: 1,
            // Amber branch = "progressed in window", not wip — literal on purpose, see docs/design-tokens.md.
            border: `2px solid ${_diffDoneSet.has(s.id) ? 'var(--st-done)' : 'var(--diff)'}`,
            boxShadow: `0 0 0 1px var(--bg,#111318), 0 0 10px ${_diffDoneSet.has(s.id) ? 'rgba(16,185,129,.6)' : 'rgba(245,158,11,.6)'}`,
          }}
        />
      )}
      {bW > 0 && (
        <div
          className={`gbar${isDrag ? ' dragging' : ''}${isCp ? ' cp-bar' : ''}${isDueOverdue ? ' overdue-bar' : ''}`}
          data-link-from={linkTaskId}
          data-link-target={linkTaskId}
          data-task-bar={!isSummary ? linkTaskId : undefined}
          style={{
            left: barLeft,
            width: Math.max(bW, 6),
            top: isSummary ? 6 : 4,
            height: isSummary ? 16 : 20,
            borderRadius: isSummary ? 5 : 4,
            padding: isSummary ? '0 6px' : microBar ? 0 : compactBar ? '0 2px' : '0 6px',
            justifyContent: compactBar ? 'center' : undefined,
            // Vertical reorder feedback: bar visually follows the mouse vertically,
            // with a strong glow so the user sees they're in reorder mode.
            transform: isDrag && drag?.isReorder ? `translateY(${Math.round(drag.lastDy / RH) * RH}px)` : undefined,
            zIndex: isDrag && drag?.isReorder ? 20 : undefined,
            boxShadow:
              isDrag && drag?.isReorder
                ? '0 4px 20px rgba(0,0,0,.5), 0 0 0 2px var(--ac)'
                : s.id === activeMatchId
                  ? '0 0 0 3px var(--ac), 0 0 8px rgba(59,130,246,.35)'
                  : isMatch
                    ? '0 0 0 2px var(--am)'
                    : isSelected
                      ? '0 0 0 2px var(--ac), 0 0 0 5px rgba(59,130,246,.22)'
                      : linkDrag?.fromId === s.id
                        ? '0 0 0 2px var(--ac)'
                        : undefined,
            ...(isSummary
              ? summaryStyle
              : s.status === 'done'
                ? {
                    background: 'var(--st-done-soft)',
                    border: '1.5px solid var(--st-done)',
                    borderLeft: `3px solid ${tc}`,
                    color: 'var(--st-done)',
                    textShadow: 'none',
                  }
                : confStyle),
            cursor: linkDrag
              ? 'crosshair'
              : isSummary
                ? groupBy === 'project'
                  ? 'ns-resize'
                  : 'pointer'
                : drag?.id === s.id && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone' || drag?.kind === 'resizeStartDone')
                  ? 'ew-resize'
                  : drag?.id === s.id && drag?.isReorder
                    ? 'ns-resize'
                    : drag
                      ? 'grabbing'
                      : 'grab',
          }}
          onMouseEnter={e => {
            if (dragRef.current || drag || linkDrag || hoverLineKey) return;
            showRowTip(row, e, !isSummary);
          }}
          onMouseLeave={() => hideRowTip(row, !isSummary)}
          onMouseDown={e => {
            dismissTooltip(true);
            if (linkDrag) return;
            if (isSummary) {
              if (groupBy !== 'project' || !onReorderSibling) return;
              onBMD(e, row);
              return;
            }
            onBMD(e, row);
          }}
          onMouseUp={() => {
            if (linkDrag && !isSummary) {
              dismissTooltip(true);
              onLinkDrop(linkTaskId);
            }
          }}
          onClick={e => {
            dismissTooltip(true);
            if (isSummary) {
              if (justDraggedRef.current) {
                justDraggedRef.current = false;
                return;
              }
              onBarClick?.(s);
              return;
            }
            if (justDraggedRef.current) {
              justDraggedRef.current = false;
              return;
            }
            if (linkDrag) return;
            if (handleSelectClick(e, s.treeId || s.id)) return;
            onBarClick?.(s);
          }}
        >
          <BarOverlays
            node={node}
            s={s}
            _diffActive={_diffActive}
            isSummary={isSummary}
            diffPastLeafState={diffPastLeafState}
            t={t}
            _diffDoneSet={_diffDoneSet}
            loadCells={loadCells}
            vacBandsByTaskId={vacBandsByTaskId}
            barLeft={barLeft}
            bW={bW}
          />
          {!compactBar && (
            <span style={{ position: 'sticky', left: 6, display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
              {s.status === 'done' && (
                <span
                  style={{
                    marginRight: 4,
                    fontSize: 11,
                    flexShrink: 0,
                    color: isSummary ? 'var(--tx3)' : 'rgba(255,255,255,.92)',
                  }}
                >
                  ●
                </span>
              )}
              {/* Priority is not drawn on a bar. It is an INPUT to the
        schedule — it helps decide what runs before what — and
        this view is the schedule's ANSWER. Printing the input
        next to the output says the same thing twice, and on a
        plan where most work is marked critical it is a column
        of identical marks that distinguishes nothing. It stays
        where it is set and where ordering is done: the tree and
        the work order. */}
              {!isSummary && node?.parallel && (
                <span style={{ marginRight: 4, fontSize: 11, flexShrink: 0 }} data-htip={t('g.parallelTip')}>
                  ≡
                </span>
              )}
              {!isSummary && node?.pinnedStart && (
                <span
                  style={{ marginRight: 4, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                  data-htip={`${s.pinOverridden ? t('g.pinOverriddenTip', node.pinnedStart) : t('g.pinnedTip', node.pinnedStart)} ${t('g.clickToUnpin')}`}
                  onClick={e => {
                    e.stopPropagation();
                    onTaskUpdate?.({ ...node, pinnedStart: '' });
                  }}
                >
                  {s.pinOverridden ? '!▸' : '▸'}
                </span>
              )}
              {!isSummary &&
                s.blockedBy &&
                (() => {
                  const blocker = scheduled.find(x => x.id === s.blockedBy.id);
                  const blockerName = blocker?.name && blocker.name !== s.blockedBy.id ? blocker.name : '';
                  const blockerPerson = blocker?.person || blocker?.personShort || '';
                  const endIso = s.blockedBy.endD instanceof Date ? s.blockedBy.endD.toISOString().slice(0, 10) : String(s.blockedBy.endD);
                  const blockerLabel = blockerName ? `${s.blockedBy.id} – ${blockerName}` : s.blockedBy.id;
                  const meta = [blockerPerson, t('g.blockerEnds', endIso)].filter(Boolean).join(', ');
                  return (
                    <span
                      style={{ marginRight: 4, fontSize: 11, flexShrink: 0, cursor: 'help' }}
                      data-htip={`${t('p.waitingFor')} ${blockerLabel}${meta ? ` (${meta})` : ''}`}
                    >
                      ~
                    </span>
                  );
                })()}
              {!isSummary && fixedDays > 0 && (
                <span
                  style={{
                    marginRight: 4,
                    fontSize: 11,
                    flexShrink: 0,
                    color: 'rgba(255,255,255,.94)',
                    fontFamily: 'var(--mono)',
                  }}
                  data-htip={`${t('qe.fixedDuration')}: ${fixedDays}d`}
                >
                  {fixedDays}d
                </span>
              )}
              {/* A summary bar does not repeat its own name. The label
        column beside it is sticky and already carries it, so
        printing it again inside the bar put the loudest text in
        the chart on the one thing the reader already knows —
        and on a nested plan that is a name in every second row.
        The count is what the bar adds, so the count is what it
        says. */}
              {bW > 35 && (
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textDecoration: s.status === 'done' ? 'line-through' : 'none',
                  }}
                >
                  {isSummary ? s._summaryCount : s.name}
                </span>
              )}
            </span>
          )}
          {compactBar && !microBar && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: s.status === 'done' ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.82)',
                boxShadow: '0 1px 1px rgba(0,0,0,.35)',
                pointerEvents: 'none',
              }}
            />
          )}
          {showResizeStartHandle && (
            <div
              className={`g-resize-handle done-edge${isDrag && drag?.kind === 'resizeStartDone' ? ' active' : ''}`}
              data-htip={`${t('g.doneResizeStart') || 'Drag to adjust completedStart'}${resizePreviewDays ? ` · ${resizePreviewDays}d` : ''}`}
              onMouseDown={e => onResizeStartDoneMD(e, row)}
              onClick={e => e.stopPropagation()}
              style={{ left: 1 }}
            />
          )}
          {showResizeHandle && (
            <div
              className={`g-resize-handle${canResizeDone ? ' done-edge' : ''}${isDrag && (drag?.kind === 'resizeEnd' || drag?.kind === 'resizeEndDone') ? ' active' : ''}`}
              data-htip={`${canResizeDone ? t('g.doneResizeEnd') || 'Drag to adjust completedEnd' : t('g.fixedResize')}${resizePreviewDays ? ` · ${resizePreviewDays}d` : ''}`}
              onMouseDown={e => onResizeEndMD(e, row)}
              onClick={e => e.stopPropagation()}
              style={{ right: 1 }}
            />
          )}
        </div>
      )}
      {isResizingDuration && (
        <div
          style={{
            position: 'absolute',
            left: barLeft + bW,
            top: 3,
            bottom: 3,
            width: 2,
            background: 'var(--ac)',
            borderRadius: 2,
            zIndex: 9,
            boxShadow: '0 0 8px rgba(59,130,246,.65)',
            pointerEvents: 'none',
          }}
        />
      )}
      {isResizingDuration && (
        <div
          data-htip={t('g.durationPreviewTip', resizePreviewDays)}
          style={{
            position: 'absolute',
            left: resizePreviewLeft,
            top: 2,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 7px',
            borderRadius: 999,
            background: 'var(--ac)',
            border: '1px solid rgba(255,255,255,.75)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 800,
            fontFamily: 'var(--mono)',
            lineHeight: '20px',
            boxShadow: '0 1px 4px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.15)',
            zIndex: 10,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          → {resizePreviewDays}d
        </div>
      )}
      {/* Dependency connector: semicircle plus-button OUTSIDE the bar's
    right edge so it never fights the resize-handle for pixels.
    Resize-handle lives inside the bar at right:1; this dot sits
    4px after the bar ends. */}
      {bW > 0 && !isSummary && (
        <div
          className={`g-link-connector${linkDrag?.fromId === linkTaskId ? ' active' : ''}`}
          data-link-target={linkTaskId}
          data-htip={t('g.linkHandle')}
          style={{
            position: 'absolute',
            left: barLeft + bW,
            top: 14,
            '--link-color': s.status === 'done' ? 'rgba(255,255,255,.88)' : tc,
            pointerEvents: 'none',
          }}
        >
          <span
            className="g-link-connector-dot"
            onMouseDown={e => onLinkStart(e, linkTaskId)}
            onClick={e => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
            +
          </span>
        </div>
      )}
      {/* Decision-by marker: diamond on the exact decide-by date */}
      {decideX >= 0 && decideX <= tw && !isSummary && s.status !== 'done' && (
        <div
          data-htip={`${t('g.decideByTip', decideBy)}${isDecideOverdue ? ` — ${t('g.overdue')}` : ''}`}
          style={{
            position: 'absolute',
            left: decideX + DPX / 2 - 6,
            top: RH / 2 - 6,
            width: 12,
            height: 12,
            background: isDecideOverdue ? 'var(--re)' : 'var(--am)',
            transform: 'rotate(45deg)',
            border: '1px solid #000',
            zIndex: 4,
            pointerEvents: 'auto',
          }}
        />
      )}
      {/* Due-date marker: vertical bar at the start of the exact due date. Solid red
    when scheduler projects end past due or due is already in
    the past + task unfinished. Otherwise dim red. */}
      {dueX >= 0 && dueX <= tw && !isSummary && s.status !== 'done' && (
        <div
          data-htip={`${t('g.dueTip', dueDate)}${isDueOverdue ? ` — ${t('g.overdue')} / ${t('ins.dueOverdueByPlan')}` : ''}`}
          style={{
            position: 'absolute',
            left: dueX,
            top: 2,
            width: 4,
            bottom: 2,
            background: isDueOverdue ? 'var(--re)' : 'rgba(220,38,38,0.55)',
            borderRadius: 2,
            zIndex: 4,
            pointerEvents: 'auto',
            boxShadow: isDueOverdue ? '0 0 8px rgba(220,38,38,0.7)' : 'none',
          }}
        />
      )}
    </div>
  );
}
