import { useState, useRef, useMemo, memo } from 'react';
import { useCapacityAt } from '../../utils/capacityLens.js';
import { GanttFooter } from './gantt/GanttFooter.jsx';
import { LinkDragOverlay } from './gantt/LinkDragOverlay.jsx';
import { GanttSelectionBar } from './gantt/GanttSelectionBar.jsx';
import { GanttHeader } from './gantt/GanttHeader.jsx';
import { GanttLabelColumn } from './gantt/GanttLabelColumn.jsx';
import { DepLinesSvg } from './gantt/DepLinesSvg.jsx';
import { GanttFlagStrip } from './gantt/GanttFlagStrip.jsx';
import { GanttGridLayer } from './gantt/GanttGridLayer.jsx';
import { useGanttPrefs } from './gantt/useGanttPrefs.js';
import { useGanttSelection } from './gantt/useGanttSelection.js';
import { useGanttScrollTo } from './gantt/useGanttScrollTo.js';
import { useGanttDrag } from './gantt/useGanttDrag.js';
import { useGanttZoom } from './gantt/useGanttZoom.js';
import { useGanttItems } from './gantt/useGanttItems.js';
import { useGanttTree } from './gantt/useGanttTree.js';
import { useGanttStructure } from './gantt/useGanttStructure.js';
import { useGanttRows } from './gantt/useGanttRows.js';
import { useGanttVisibleRows } from './gantt/useGanttVisibleRows.js';
import { useGanttLoad } from './gantt/useGanttLoad.js';
import { useGanttLines } from './gantt/useGanttLines.js';
import { useGanttSearch } from './gantt/useGanttSearch.js';
import { GanttRows } from './gantt/GanttRows.jsx';
import { GanttSelectionRect } from './gantt/GanttSelectionRect.jsx';
import { computeRowLayout } from '../../utils/gantt/rowLayout.js';
import {
  reorderSelectionInTime as reorderSelection,
  adjustSelectionPrio as adjustPrio,
  linkSelectedInOrder as linkSelected,
  clearSelectedLinks as clearLinks,
} from '../../utils/gantt/selectionEdits.js';
import { taskLoadCells as computeTaskLoadCells } from '../../utils/gantt/loadModel.js';
import {
  createGeometry,
  buildMonths,
  monthHeaderLabel as monthHeaderLabelOf,
  weekHeaderLabel as weekHeaderLabelOf,
} from '../../utils/gantt/geometry.js';
import { usePortalRoot } from '../../utils/embedHost.js';
import { iso, localDate } from '../../utils/date.js';
import { resolveToLeafIds, isLeafNode } from '../../utils/scheduler.js';
import { deadlineStatus } from '../../utils/timeline.js';
import { chainShorts } from '../../utils/handoff.js';
import { buildMemberShortMap } from '../../App.jsx';
import { Tip } from '../shared/Tooltip.jsx';
import { useT } from '../../i18n.jsx';
import { NO_TEAM, NO_TEAM_COLOR, EMPTY_ARR } from '../../utils/gantt/helpers.js';

function GanttViewImpl({
  scheduled,
  weeks,
  goals,
  teams,
  members = [],
  vacations = [],
  meetingPlans = [],
  cpSet,
  cpLabels = {},
  cpEdges,
  tree,
  hideDone = false,
  search = '',
  searchIdx = 0,
  workDays,
  planStart,
  confidence = {},
  confReasons = {},
  rootFilter = '',
  teamFilter = '',
  personFilter = '',
  diffDoneIds = null,
  diffProgressedIds = null,
  diffPastLeafState = null,
  sinceDate = null,
  onlyChanged = false,
  horizonIds = null,
  horizonEnd = null,
  horizonOnlyPlanned = true,
  onBarClick,
  onSeqUpdate,
  onExtendViewStart,
  onTaskUpdate,
  onRemoveDep,
  onAddDep,
  onReorderSibling,
  personQueues = null,
  onOpenBulkEdit,
  baseline = null,
}) {
  // How much of a person there is on a day, as the scheduler sees it.
  const capacityAt = useCapacityAt();
  const portalRoot = usePortalRoot();
  // Diff-overlay sets (project-wide "since" window). Highlight bars that
  // completed or progressed in the chosen window.
  const _diffDoneSet = diffDoneIds instanceof Set ? diffDoneIds : new Set(diffDoneIds || []);
  const _diffProgSet = diffProgressedIds instanceof Set ? diffProgressedIds : new Set(diffProgressedIds || []);
  const _diffChangedSet = useMemo(() => new Set([..._diffDoneSet, ..._diffProgSet]), [_diffDoneSet, _diffProgSet]);
  const _diffActive = !!sinceDate;
  const { t } = useT();
  const REASON_TIP = {
    'manual': t('g.reasonManual'),
    'done': t('g.reasonDone'),
    'auto:person+estimate': t('g.reasonPersonEstimate'),
    'auto:no-person': t('g.reasonNoPerson'),
    'auto:high-risk': t('g.reasonHighRisk'),
    'auto:no-estimate': t('g.reasonNoEstimate'),
    'inherited': t('g.reasonInherited'),
  };
  const UNASSIGNED_LABEL = t('unassigned');
  const wdSet = useMemo(() => new Set(workDays || [1, 2, 3, 4, 5]), [workDays]);
  // Build short-name map directly from members (avoids stale-prop issues).
  const shortMap = useMemo(() => buildMemberShortMap(members), [members]);
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);
  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams]);
  const leafIdSet = useMemo(() => new Set((tree || []).filter(r => isLeafNode(tree || [], r.id)).map(r => r.id)), [tree]);
  const sn = (personId, fullName) => shortMap[personId] || (fullName || '').split(' ')[0] || '';
  // Render all assignees compactly: "KK+MB" or "KK+MB+1" for 3+.
  // When the task has a handoff cascade, append the chain: "KK+MB→AB→!".
  const snAll = s => {
    const ids = (s.assign || []).length > 0 ? s.assign : s.personId ? [s.personId] : [];
    const primary = (() => {
      if (!ids.length) return sn(s.personId, s.person);
      const shorts = ids.map(id => shortMap[id] || sn(id, ''));
      if (shorts.length <= 2) return shorts.join('+');
      return shorts.slice(0, 2).join('+') + '+' + (shorts.length - 2);
    })();
    return chainShorts(s, shortMap, primary);
  };
  const [tip, setTip] = useState(null); // {item, x, y} — hover tooltip on left-panel task names
  const [drag, setDrag] = useState(null);
  const [dDelta, setDDelta] = useState(0);
  const [cpOnly, setCpOnly] = useState(false); // dim non-critical items
  const [hoverDepId, setHoverDepId] = useState(null); // task ID currently hovered (for dep arrows)
  const [hoverLineKey, setHoverLineKey] = useState(null); // currently hovered dep line (for × badge + emphasis)
  const [pinnedLineKey, setPinnedLineKey] = useState(null); // sticky-selected dep line — survives mouse leave
  const [linkDrag, setLinkDrag] = useState(null); // {fromId, fromX, fromY, mouseX, mouseY} — drag-to-link in progress
  const [selectRect, setSelectRect] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const hR = useRef(null),
    bR = useRef(null),
    lR = useRef(null);
  const { zoom, setZ, WPX, showDays, zoomMode } = useGanttZoom({ hR, bR });
  const {
    groupBy,
    collapsedByMode,
    setCollapsedByMode,
    h1Weeks,
    h2Weeks,
    showLoadHeatmap,
    toggleLoadHeatmap,
    compact,
    toggleCompact,
    setGB,
  } = useGanttPrefs();
  const activateMode = (e, action) => {
    if (e.button !== 0) return;
    e.preventDefault();
    action();
  };
  const hoverClearTimerRef = useRef(null);
  // Guard flag: when true, syncL won't feed bR.scrollTop back (prevents
  // the syncS→syncL loop from killing smooth programmatic scrolls on bR).
  const scrollLock = useRef(false);

  function syncS(e) {
    if (hR.current) hR.current.scrollLeft = e.target.scrollLeft;
    if (lR.current) {
      scrollLock.current = true;
      lR.current.scrollTop = e.target.scrollTop;
    }
  }
  function syncL(e) {
    if (scrollLock.current) {
      scrollLock.current = false;
      return;
    }
    if (bR.current) bR.current.scrollTop = e.target.scrollTop;
  }
  function onLWheel(e) {
    if (bR.current) {
      bR.current.scrollTop += e.deltaY;
      bR.current.scrollLeft += e.deltaX;
    }
  }

  const tw = weeks.length * WPX;
  // Map a Date to its pixel X position on the Gantt body.
  // Each week = WPX px covering all 7 days (Mon–Sun) so weekends are visible
  // as grayed-out columns in day-mode. The DPX constant = pixels per day.
  const { DPX, dateToX, weekIndexOfDate, scheduledWorkDaysOf } = createGeometry({ weeks, WPX });
  const months = useMemo(() => buildMonths(weeks), [weeks]);
  const monthHeaderLabel = m => monthHeaderLabelOf(m, { WPX, zoomMode });
  const weekHeaderLabel = (w, i, isYB, isNow) => weekHeaderLabelOf(w, i, isYB, isNow, { WPX });

  const { allItems, iMap, searchNeedle, displayItems } = useGanttItems({
    scheduled,
    tree,
    leafIdSet,
    memberById,
    teamById,
    rootFilter,
    teamFilter,
    personFilter,
    workDays,
    UNASSIGNED_LABEL,
    weekIndexOfDate,
    weeks,
    hideDone,
    _diffActive,
    _diffChangedSet,
    search,
  });
  const { childrenByParent, rootIds } = useGanttTree({ tree });
  const { structure } = useGanttStructure({
    groupBy,
    allItems,
    tree,
    iMap,
    scheduled,
    displayItems,
    childrenByParent,
    rootIds,
    teams,
    memberById,
    teamById,
    confidence,
    t,
    weekIndexOfDate,
    UNASSIGNED_LABEL,
    weeks,
  });
  const { collapsed, allCollapseKeys, toggleCollapse, collapseAll, expandAll, rows, rowDepth } = useGanttRows({
    collapsedByMode,
    setCollapsedByMode,
    groupBy,
    structure,
    setTip,
  });
  const { rowIsCp, rowRelevantToCp, visibleRows } = useGanttVisibleRows({
    cpSet,
    collapsed,
    rows,
    cpOnly,
    _diffActive,
    onlyChanged,
    _diffChangedSet,
    horizonIds,
    horizonOnlyPlanned,
  });

  const RH = 28,
    HH = 28,
    FLAG_ROW_H = 18;
  // Where each visible row sits, in pixels from the top of the chart body.
  //
  // Classic: row i is at i * RH, which is what it has always been and what
  // every arrow, flag and hover box already assumes. Compact: the rows of one
  // group share lanes, so several of them resolve to the SAME top and the
  // group is as tall as its busiest moment.
  //
  // Everything vertical goes through here — the dependency arrows, the bar
  // rectangles, the two columns — so the two modes cannot drift apart.
  const rowLayout = useMemo(
    () => computeRowLayout({ visibleRows, compact, RH, dateToX, WPX, DPX, collapsed, rowDepth }),
    [visibleRows, rowDepth, collapsed, compact, WPX, DPX, zoom, weeks],
  );
  const rowTop = rowIndex => rowLayout.tops[rowIndex] ?? rowIndex * RH;
  // A task row that took no lane draws nothing in compact mode — it has no
  // bar, so a bordered empty strip would only sit on top of lane 0.
  const rowHidden = rowIndex => compact && rowLayout.lanes?.[rowIndex] === -1;
  const rowCenterY = rowIndex => FLAG_ROW_H + rowTop(rowIndex) + RH / 2;
  const dlL = (goals || [])
    .filter(d => d.date)
    .map(dl => {
      const dateD = localDate(dl.date);
      const x = dateToX(dateD);
      const wi = weekIndexOfDate(dateD);
      const linked = scheduled.filter(s => s.id.startsWith(dl.id + '.'));
      // Shared state machine (utils/timeline.js): finished work is never "late".
      const ds = deadlineStatus(tree, scheduled, dl);
      const maxEnd = ds?.end || (linked.length ? linked.reduce((m, s) => (s.endD > m ? s.endD : m), new Date(0)) : null);
      const isLate = !!ds?.isLate;
      return { ...dl, wi, x, dateD, isLate, maxEnd, dlState: ds?.state || 'unscheduled' };
    });
  const now = new Date();
  const todayIso = iso(now);
  const todayWi = weeks.findIndex((w, i) => {
    const next = weeks[i + 1];
    return w.mon <= now && (!next || next.mon > now);
  });
  // Always day-accurate — even in week mode the line sits on the correct day
  // column within the week, not at the week's left edge.
  const todayX = todayWi >= 0 ? dateToX(now) : -1;
  const gTC = t => (t === NO_TEAM ? NO_TEAM_COLOR : teamById[t]?.color || '#3b82f6');

  // Day-accurate mount-point helpers for dependency lines. Source mounts at
  // the RIGHT edge of the bar (end of endD's day column); target mounts at
  // the LEFT edge (start of startD's day column). Falls back to week-aligned
  // positions when dates aren't available.
  // When the task is currently being dragged, add the live drag pixel offset so
  // dependency lines follow the bar in real time (Bug 2 fix).
  const resizePxPerDay = showDays ? DPX : WPX / 5;
  function dragOffsetFor(s, edge = 'both') {
    if (!drag || drag.id !== s.id || drag.isReorder) return 0;
    if (drag.kind === 'resizeEnd') return edge === 'end' ? dDelta * resizePxPerDay : 0;
    return dDelta * (showDays ? DPX : WPX);
  }
  function depX1(s) {
    const base = s.endD ? dateToX(s.endD) + DPX : (s.endWi + 1) * WPX;
    return base + dragOffsetFor(s, 'end');
  }
  function depX2(s) {
    const base = s.startD ? dateToX(s.startD) : s.startWi * WPX;
    return base + dragOffsetFor(s, 'start');
  }

  function taskBarRectForRow(row, index) {
    if (row?.type !== 'task' || !row.s || row.s._unestimated) return null;
    if (row.s._completed && (!row.s.startD || !row.s.endD)) return null;
    const s = row.s;
    let baseLeft, baseWidth;
    if (s.startD && s.endD) {
      baseLeft = dateToX(s.startD) + 2;
      baseWidth = dateToX(s.endD) + DPX - dateToX(s.startD) - 4;
    } else {
      baseLeft = s.startWi * WPX + 2;
      baseWidth = (s.endWi - s.startWi + 1) * WPX - 4;
    }
    const isSummary = row.type === 'summary';
    return {
      id: s.treeId || s.id,
      isSummary,
      left: Math.max(0, baseLeft),
      top: FLAG_ROW_H + rowTop(index) + (isSummary ? 6 : 4),
      width: Math.max(6, baseWidth),
      height: isSummary ? 16 : 20,
    };
  }
  const { selectedIds, setSelectedIds, handleSelectClick, selectedTaskIds, cursorId } = useGanttSelection({
    visibleRows,
    bR,
    onReorderSibling,
    onBarClick,
  });
  const reorderSelectionInTime = dir => reorderSelection({ selectedTaskIds, leafIdSet, onReorderSibling }, dir);
  const adjustSelectionPrio = step => adjustPrio({ selectedTaskIds, iMap, onTaskUpdate }, step);
  const linkSelectedInOrder = () => linkSelected({ selectedTaskIds, onAddDep });
  const clearSelectedLinks = (kind = 'all') => clearLinks({ selectedTaskIds, iMap, tree, onTaskUpdate, onRemoveDep }, kind);
  const { vacByPerson, holidayDays, vacBandsByTaskId, resourceLoadByWeek, loadRiskSummary, loadWeekSummary } = useGanttLoad({
    vacations,
    wdSet,
    WPX,
    DPX,
    weeks,
    allItems,
    memberById,
    tw,
    dateToX,
    iMap,
    members,
    meetingPlans,
    teams,
    todayIso,
    capacityAt,
    scheduledWorkDaysOf,
    t,
  });

  const taskLoadCells = (s, barLeft, barWidth) =>
    computeTaskLoadCells({ showLoadHeatmap, resourceLoadByWeek, weeks, WPX }, s, barLeft, barWidth);
  function resD(id) {
    return resolveToLeafIds(tree || [], id);
  }
  const { rowIdx, hoverLines, renderedDepLines } = useGanttLines({
    visibleRows,
    compact,
    rowLayout,
    allItems,
    tree,
    iMap,
    cpEdges,
    cpOnly,
    hoverDepId,
    groupBy,
    WPX,
    showDays,
    dDelta,
    drag,
    resD,
    depX1,
    depX2,
    rowCenterY,
  });

  const rowKeyOf = row => row.key || `${row.groupKey || 'row'}::${row.s?.id || row.label}`;
  const rowColor = row => row?.s?._barColor || gTC(row?.s?.team || NO_TEAM);
  const visibleCriticalCount = useMemo(() => {
    if (!cpSet?.size) return 0;
    return new Set(rows.filter(row => row.type === 'task' && cpSet.has(row.s.id)).map(row => row.s.id)).size;
  }, [rows, cpSet]);
  const rowTooltipItem = row => (row.type === 'group' ? null : { ...row.node, ...row.s, isCp: rowIsCp(row) });
  const dismissTooltip = (clearDepHover = false) => {
    setTip(null);
    if (clearDepHover) setHoverDepId(null);
  };
  const showRowTip = (row, event, includeDeps = false) => {
    const item = rowTooltipItem(row);
    if (!item) return;
    if (includeDeps && row.type === 'task') setHoverDepId(row.s.id);
    setTip({ item, x: event.clientX, y: event.clientY });
  };
  const hideRowTip = (row, includeDeps = false) => {
    if (includeDeps && row.type === 'task') setHoverDepId(null);
    setTip(null);
  };
  const openRowItem = (row, focusRequest = null) => {
    if (row.type === 'group') return;
    dismissTooltip(true);
    onBarClick?.(row.s, focusRequest);
  };

  const { searchMatches, searchMatchList, activeMatchId } = useGanttSearch({ displayItems, searchNeedle, visibleRows, searchIdx });

  const { bodyScrollbarH, scrollToToday } = useGanttScrollTo({ bR, visibleRows, tw, showDays, WPX, RH, dateToX, todayX, activeMatchId });

  const {
    onBMD,
    onTimelinePanStart,
    onResizeEndMD,
    onResizeStartDoneMD,
    onMM,
    onMU,
    onLinkStart,
    onLinkDrop,
    dragRef,
    selectRef,
    justDraggedRef,
    clearTimelinePan,
  } = useGanttDrag({
    dismissTooltip,
    iMap,
    onReorderSibling,
    compact,
    rowIdx,
    drag,
    setDrag,
    dDelta,
    setDDelta,
    bR,
    hR,
    lR,
    setSelectRect,
    selectedIds,
    setSelectedIds,
    selectedTaskIds,
    scheduledWorkDaysOf,
    resizePxPerDay,
    showDays,
    DPX,
    WPX,
    RH,
    linkDrag,
    setLinkDrag,
    visibleRows,
    taskBarRectForRow,
    onSeqUpdate,
    weeks,
    vacByPerson,
    wdSet,
    onExtendViewStart,
    pinnedLineKey,
    setPinnedLineKey,
    onAddDep,
  });

  const unestimatedCount = useMemo(() => displayItems.filter(s => s._unestimated).length, [displayItems]);
  if (!allItems.length)
    return (
      <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--tx3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}></div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>{t('g.noItems')}</div>
          <div style={{ fontSize: 12 }}>{t('g.addTasks')}</div>
        </div>
      </div>
    );

  return (
    <div
      className="gantt"
      onMouseMove={onMM}
      onMouseUp={onMU}
      onClickCapture={e => {
        // Click-away on the dep-arrow pin: any click whose target isn't the
        // pinned arrow itself clears the pin. The arrow + its × badge call
        // stopPropagation so they keep their own toggling behaviour.
        if (pinnedLineKey) setPinnedLineKey(null);
      }}
      onMouseLeave={() => {
        dismissTooltip(true);
        setHoverLineKey(null);
        clearTimelinePan();
        if (selectRef.current) {
          selectRef.current = null;
          setSelectRect(null);
        }
        if (drag || dragRef.current) {
          dragRef.current = null;
          setDrag(null);
          setDDelta(0);
        }
      }}
    >
      <GanttHeader
        t={t}
        groupBy={groupBy}
        activateMode={activateMode}
        setGB={setGB}
        compact={compact}
        toggleCompact={toggleCompact}
        showLoadHeatmap={showLoadHeatmap}
        toggleLoadHeatmap={toggleLoadHeatmap}
        loadRiskSummary={loadRiskSummary}
        allCollapseKeys={allCollapseKeys}
        expandAll={expandAll}
        collapseAll={collapseAll}
        hR={hR}
        onTimelinePanStart={onTimelinePanStart}
        zoomMode={zoomMode}
        HH={HH}
        months={months}
        monthHeaderLabel={monthHeaderLabel}
        WPX={WPX}
        weeks={weeks}
        todayWi={todayWi}
        weekHeaderLabel={weekHeaderLabel}
        showDays={showDays}
        wdSet={wdSet}
        now={now}
        h1Weeks={h1Weeks}
        h2Weeks={h2Weeks}
        dateToX={dateToX}
        tw={tw}
      />
      <div className="gantt-body">
        <GanttLabelColumn
          lR={lR}
          syncL={syncL}
          onLWheel={onLWheel}
          FLAG_ROW_H={FLAG_ROW_H}
          visibleRows={visibleRows}
          collapsed={collapsed}
          compact={compact}
          rowDepth={rowDepth}
          rowIsCp={rowIsCp}
          cpOnly={cpOnly}
          rowRelevantToCp={rowRelevantToCp}
          RH={RH}
          t={t}
          toggleCollapse={toggleCollapse}
          personQueues={personQueues}
          hoverDepId={hoverDepId}
          hoverLines={hoverLines}
          searchMatches={searchMatches}
          activeMatchId={activeMatchId}
          rowKeyOf={rowKeyOf}
          cursorId={cursorId}
          dragRef={dragRef}
          drag={drag}
          linkDrag={linkDrag}
          showRowTip={showRowTip}
          hideRowTip={hideRowTip}
          handleSelectClick={handleSelectClick}
          openRowItem={openRowItem}
          cpLabels={cpLabels}
          snAll={snAll}
          members={members}
          rowLayout={rowLayout}
          bodyScrollbarH={bodyScrollbarH}
        />
        <div ref={bR} data-testid="gantt-timeline" style={{ flex: 1, overflow: 'auto' }} onScroll={syncS} onMouseDown={onTimelinePanStart}>
          <div
            style={{
              width: tw,
              position: 'relative',
              minHeight: FLAG_ROW_H + rowLayout.height,
              height: compact ? FLAG_ROW_H + rowLayout.height : undefined,
            }}
          >
            <GanttGridLayer
              tw={tw}
              weeks={weeks}
              WPX={WPX}
              showDays={showDays}
              wdSet={wdSet}
              DPX={DPX}
              planStart={planStart}
              dateToX={dateToX}
              t={t}
              todayX={todayX}
              now={now}
              h1Weeks={h1Weeks}
              h2Weeks={h2Weeks}
              dlL={dlL}
            />
            {selectRect && <GanttSelectionRect selectRect={selectRect} />}
            <GanttFlagStrip
              FLAG_ROW_H={FLAG_ROW_H}
              showLoadHeatmap={showLoadHeatmap}
              loadWeekSummary={loadWeekSummary}
              setGB={setGB}
              WPX={WPX}
              dlL={dlL}
              t={t}
            />
            <GanttRows
              visibleRows={visibleRows}
              rowHidden={rowHidden}
              compact={compact}
              rowTop={rowTop}
              FLAG_ROW_H={FLAG_ROW_H}
              tw={tw}
              RH={RH}
              dateToX={dateToX}
              DPX={DPX}
              WPX={WPX}
              t={t}
              rowIsCp={rowIsCp}
              cpOnly={cpOnly}
              rowRelevantToCp={rowRelevantToCp}
              showLoadHeatmap={showLoadHeatmap}
              groupBy={groupBy}
              resourceLoadByWeek={resourceLoadByWeek}
              vacByPerson={vacByPerson}
              holidayDays={holidayDays}
              rowKeyOf={rowKeyOf}
              rowColor={rowColor}
              drag={drag}
              dDelta={dDelta}
              showDays={showDays}
              resizePxPerDay={resizePxPerDay}
              hoverDepId={hoverDepId}
              hoverLines={hoverLines}
              searchMatches={searchMatches}
              iMap={iMap}
              selectedIds={selectedIds}
              scheduledWorkDaysOf={scheduledWorkDaysOf}
              taskLoadCells={taskLoadCells}
              confidence={confidence}
              now={now}
              weeks={weeks}
              scheduled={scheduled}
              baseline={baseline}
              sinceDate={sinceDate}
              _diffDoneSet={_diffDoneSet}
              _diffProgSet={_diffProgSet}
              activeMatchId={activeMatchId}
              linkDrag={linkDrag}
              dragRef={dragRef}
              hoverLineKey={hoverLineKey}
              showRowTip={showRowTip}
              hideRowTip={hideRowTip}
              dismissTooltip={dismissTooltip}
              onReorderSibling={onReorderSibling}
              onBMD={onBMD}
              onLinkDrop={onLinkDrop}
              justDraggedRef={justDraggedRef}
              onBarClick={onBarClick}
              handleSelectClick={handleSelectClick}
              _diffActive={_diffActive}
              diffPastLeafState={diffPastLeafState}
              vacBandsByTaskId={vacBandsByTaskId}
              onTaskUpdate={onTaskUpdate}
              onResizeStartDoneMD={onResizeStartDoneMD}
              onResizeEndMD={onResizeEndMD}
              onLinkStart={onLinkStart}
            />
            <DepLinesSvg
              renderedDepLines={renderedDepLines}
              tw={tw}
              FLAG_ROW_H={FLAG_ROW_H}
              rowLayout={rowLayout}
              pinnedLineKey={pinnedLineKey}
              hoverLineKey={hoverLineKey}
              hoverDepId={hoverDepId}
              hoverClearTimerRef={hoverClearTimerRef}
              dismissTooltip={dismissTooltip}
              setHoverLineKey={setHoverLineKey}
              setPinnedLineKey={setPinnedLineKey}
              t={t}
              onRemoveDep={onRemoveDep}
            />
          </div>
        </div>
      </div>
      <GanttFooter
        t={t}
        WPX={WPX}
        zoomMode={zoomMode}
        setZ={setZ}
        scrollToToday={scrollToToday}
        searchMatches={searchMatches}
        searchMatchList={searchMatchList}
        searchIdx={searchIdx}
        selectedTaskIds={selectedTaskIds}
        setSelectedIds={setSelectedIds}
        dlL={dlL}
        cpSet={cpSet}
        cpOnly={cpOnly}
        setCpOnly={setCpOnly}
        visibleCriticalCount={visibleCriticalCount}
        unestimatedCount={unestimatedCount}
        allItems={allItems}
        confidence={confidence}
        linkDrag={linkDrag}
      />
      <GanttSelectionBar
        selectedTaskIds={selectedTaskIds}
        setSelectedIds={setSelectedIds}
        linkSelectedInOrder={linkSelectedInOrder}
        t={t}
        reorderSelectionInTime={reorderSelectionInTime}
        adjustSelectionPrio={adjustSelectionPrio}
        onOpenBulkEdit={onOpenBulkEdit}
        clearSelectedLinks={clearSelectedLinks}
        showAssignModal={showAssignModal}
        teams={teams}
        members={members}
        setShowAssignModal={setShowAssignModal}
        tree={tree}
        onTaskUpdate={onTaskUpdate}
      />
      <LinkDragOverlay linkDrag={linkDrag} portalRoot={portalRoot} />
      {/* Hover tooltip on left-panel task names — same Tip component as NetGraph */}
      {tip && (
        <Tip
          item={tip.item}
          x={tip.x + 14}
          y={tip.y + 16}
          teams={teams}
          members={members}
          tree={tree}
          scheduled={scheduled}
          cpLabels={cpLabels}
          vacations={vacBandsByTaskId[tip.item?.id] || EMPTY_ARR}
        />
      )}
    </div>
  );
}

export const GanttView = memo(GanttViewImpl);
