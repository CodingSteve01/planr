// The footer strip: zoom buttons, search position, selection count, deadline badges,
// critical path toggle and the confidence legend. Stateless: everything comes in as props.

import { WPX as DEFAULT_WPX } from '../../../constants.js';
import { MONTH_ZOOM, DAY_ZOOM } from '../../../utils/gantt/helpers.js';

export function GanttFooter({
  t,
  WPX,
  zoomMode,
  setZ,
  scrollToToday,
  searchMatches,
  searchMatchList,
  searchIdx,
  selectedTaskIds,
  setSelectedIds,
  dlL,
  cpSet,
  cpOnly,
  setCpOnly,
  visibleCriticalCount,
  unestimatedCount,
  allItems,
  confidence,
  linkDrag,
}) {
  return (
    <div className="gantt-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-htip={t('g.zoomFooterTip', Math.round(WPX))}>
        <span style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 2 }}>
          {t('g.zoom')}
        </span>
        <button
          className={`btn btn-xs ${zoomMode === 'month' ? 'btn-pri' : 'btn-sec'}`}
          onClick={() => setZ(MONTH_ZOOM)}
          style={{ padding: '2px 7px', fontSize: 11 }}
        >
          {t('g.month')}
        </button>
        <button
          className={`btn btn-xs ${zoomMode === 'week' ? 'btn-pri' : 'btn-sec'}`}
          onClick={() => setZ(DEFAULT_WPX)}
          style={{ padding: '2px 7px', fontSize: 11 }}
        >
          {t('g.week')}
        </button>
        <button
          className={`btn btn-xs ${zoomMode === 'day' ? 'btn-pri' : 'btn-sec'}`}
          onClick={() => setZ(DAY_ZOOM)}
          style={{ padding: '2px 7px', fontSize: 11 }}
        >
          {t('g.day')}
        </button>
        <button
          className="btn btn-sec btn-xs"
          onClick={() => setZ(WPX * 0.8)}
          data-htip={t('g.zoomOutTip')}
          style={{ padding: '2px 7px', fontSize: 11 }}
        >
          −
        </button>
        <button
          className="btn btn-sec btn-xs"
          onClick={() => setZ(WPX * 1.25)}
          data-htip={t('g.zoomInTip')}
          style={{ padding: '2px 7px', fontSize: 11 }}
        >
          +
        </button>
        <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
        <button className="btn btn-sec btn-xs" onClick={scrollToToday} style={{ padding: '2px 7px', fontSize: 11 }}>
          {t('g.today')}
        </button>
      </div>
      {searchMatches && (
        <span style={{ fontSize: 11, color: searchMatches.size ? 'var(--am)' : 'var(--re)', fontFamily: 'var(--mono)' }}>
          {searchMatchList.length
            ? `${(((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length) + 1} / ${searchMatchList.length}`
            : `0 ${t('g.matches')}`}
        </span>
      )}
      {selectedTaskIds.length > 0 && (
        <span
          data-testid="gantt-selection-count"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ac)', fontFamily: 'var(--mono)' }}
        >
          <span>{t('g.selectedTasks', selectedTaskIds.length)}</span>
          <button
            data-testid="gantt-clear-selection"
            className="btn btn-xs btn-sec"
            onClick={() => setSelectedIds(new Set())}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            {t('g.clearSelection')}
          </button>
        </span>
      )}
      <span style={{ width: 1, height: 14, background: 'var(--b2)' }} />
      {dlL.map(dl => {
        const suffix = dl.isLate
          ? ` ${t('s.atRisk')}`
          : dl.dlState === 'doneLate'
            ? ` ${t('s.deadlineDoneLate')}`
            : dl.dlState === 'done'
              ? ` ${t('s.deadlineDone')}`
              : dl.maxEnd
                ? ` ${t('s.onTrack')}`
                : '';
        const cls = dl.isLate ? 'bc' : dl.dlState === 'doneLate' ? 'bh' : dl.maxEnd ? 'bd' : dl.severity === 'critical' ? 'bc' : 'bh';
        return (
          <span key={dl.id} className={`badge ${cls}`}>
            {dl.isLate ? '! ' : ''}
            {dl.name} {dl.date}
            {suffix}
          </span>
        );
      })}
      {cpSet?.size > 0 && (
        <button
          className={`badge b-cp${cpOnly ? '' : ''}`}
          style={{
            cursor: 'pointer',
            border: cpOnly ? '1px solid var(--re)' : '',
            background: cpOnly ? 'var(--re)' : '',
            color: cpOnly ? '#000' : '',
          }}
          data-htip={cpOnly ? t('g.cpShowAllTip') : t('g.cpShowOnlyTip')}
          onClick={() => setCpOnly(v => !v)}
        >
          {cpOnly ? '◉ ' : '○ '}Critical path: {visibleCriticalCount}
        </button>
      )}
      {unestimatedCount > 0 && (
        <span className="badge bw" data-htip={t('g.noEstimateTip')}>
          {unestimatedCount} {t('g.noEstimate')}
        </span>
      )}
      {/* Confidence legend */}
      {(() => {
        const counts = { committed: 0, estimated: 0, exploratory: 0 };
        allItems.forEach(s => {
          if (s.status !== 'done') counts[confidence[s.id] || 'committed']++;
        });
        return counts.estimated > 0 || counts.exploratory > 0 ? (
          <span
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
          >
            <span data-htip={t('g.confCommittedTip')}>● {counts.committed}</span>
            <span style={{ color: 'var(--am)' }} data-htip={t('g.confEstimatedTip')}>
              ◐ {counts.estimated}
            </span>
            <span data-htip={t('g.confExploratoryTip')}>○ {counts.exploratory}</span>
          </span>
        ) : null;
      })()}
      {linkDrag && <span style={{ fontSize: 12, color: 'var(--ac)', marginLeft: 'auto' }}>↗ {t('g.linkDrop')}</span>}
    </div>
  );
}
