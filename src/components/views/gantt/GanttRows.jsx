import React from 'react';
import { GanttTaskBarRow } from './GanttTaskBarRow.jsx';
import { GanttGroupBarRow } from './GanttGroupBarRow.jsx';

// The chart's row list: one bar row per visible row. Compact mode places each
// row absolutely at the top its lane was given.
export function GanttRows({
  visibleRows,
  rowHidden,
  compact,
  rowTop,
  FLAG_ROW_H,
  tw,
  RH,
  dateToX,
  DPX,
  WPX,
  t,
  rowIsCp,
  cpOnly,
  rowRelevantToCp,
  showLoadHeatmap,
  groupBy,
  resourceLoadByWeek,
  vacByPerson,
  holidayDays,
  rowKeyOf,
  rowColor,
  drag,
  dDelta,
  showDays,
  resizePxPerDay,
  hoverDepId,
  hoverLines,
  searchMatches,
  iMap,
  selectedIds,
  scheduledWorkDaysOf,
  taskLoadCells,
  confidence,
  now,
  weeks,
  scheduled,
  baseline,
  sinceDate,
  _diffDoneSet,
  _diffProgSet,
  activeMatchId,
  linkDrag,
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
  return visibleRows.map((row, _ri) => {
    // Compact stacks several rows onto one lane, so a row cannot sit
    // in normal flow any more — it is placed at the top its lane was
    // given. Everything inside a row is already positioned relative to
    // it, so the bars, the arrows and the hit areas are untouched.
    if (rowHidden(_ri)) return null;
    // FLAG_ROW_H, because that is where the rows begin: in classic they
    // sit in normal flow after the deadline-flag strip, and `rowTop` is
    // measured from the first row, not from the top of the box. Without
    // it every bar in compact sat 18px above where the arrows, the
    // label column and `rowCenterY` all agree it is — which is exactly
    // what "the connecting lines are not where they belong" looks like.
    const _pos = compact ? { position: 'absolute', top: FLAG_ROW_H + rowTop(_ri), left: 0, right: 0, minWidth: tw } : null;
    const _el = (() => {
      if (row.type === 'group') {
        return (
          <GanttGroupBarRow
            key={row.key}
            row={row}
            style={{
              height: RH,
              position: 'relative',
              background: 'rgba(127,127,127,.035)',
              borderBottom: '1px solid var(--b2)',
            }}
            dateToX={dateToX}
            DPX={DPX}
            WPX={WPX}
            tw={tw}
            t={t}
            rowIsCp={rowIsCp}
            cpOnly={cpOnly}
            rowRelevantToCp={rowRelevantToCp}
            showLoadHeatmap={showLoadHeatmap}
            groupBy={groupBy}
            resourceLoadByWeek={resourceLoadByWeek}
            vacByPerson={vacByPerson}
            holidayDays={holidayDays}
          />
        );
      }
      const s = row.s;
      const rowKey = rowKeyOf(row);
      if (s._unestimated) return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
      if (s._completed && (!s.startD || !s.endD))
        return <div key={rowKey} style={{ height: RH, position: 'relative', borderBottom: '1px solid var(--b)' }} />;
      return (
        <GanttTaskBarRow
          key={rowKey}
          row={row}
          rowColor={rowColor}
          rowIsCp={rowIsCp}
          drag={drag}
          dateToX={dateToX}
          DPX={DPX}
          WPX={WPX}
          dDelta={dDelta}
          showDays={showDays}
          resizePxPerDay={resizePxPerDay}
          cpOnly={cpOnly}
          rowRelevantToCp={rowRelevantToCp}
          hoverDepId={hoverDepId}
          hoverLines={hoverLines}
          searchMatches={searchMatches}
          iMap={iMap}
          selectedIds={selectedIds}
          scheduledWorkDaysOf={scheduledWorkDaysOf}
          taskLoadCells={taskLoadCells}
          tw={tw}
          confidence={confidence}
          now={now}
          RH={RH}
          weeks={weeks}
          scheduled={scheduled}
          t={t}
          baseline={baseline}
          sinceDate={sinceDate}
          _diffDoneSet={_diffDoneSet}
          _diffProgSet={_diffProgSet}
          activeMatchId={activeMatchId}
          linkDrag={linkDrag}
          groupBy={groupBy}
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
      );
    })();
    if (!React.isValidElement(_el)) return _el;
    return React.cloneElement(_el, {
      'data-row-type': row.type,
      ...(_pos
        ? { style: { ..._el.props.style, ..._pos, borderBottom: row.type === 'task' ? 'none' : _el.props.style?.borderBottom } }
        : {}),
    });
  });
}
