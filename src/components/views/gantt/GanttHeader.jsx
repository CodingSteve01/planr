// Gantt header: the control strip on the left (zoom, compact, load, expand/collapse)
// and the scrolling time axis (months, weeks, days, holiday and horizon bands). Stateless.

import { MDE } from '../../../constants.js';
import { addD } from '../../../utils/date.js';

export function GanttHeader({
  t,
  groupBy,
  activateMode,
  setGB,
  compact,
  toggleCompact,
  showLoadHeatmap,
  toggleLoadHeatmap,
  loadRiskSummary,
  allCollapseKeys,
  expandAll,
  collapseAll,
  hR,
  onTimelinePanStart,
  zoomMode,
  HH,
  months,
  monthHeaderLabel,
  WPX,
  weeks,
  todayWi,
  weekHeaderLabel,
  showDays,
  wdSet,
  now,
  h1Weeks,
  h2Weeks,
  dateToX,
  tw,
}) {
  return (
    <div className="gantt-hdr">
      <div
        className="gh-fix"
        style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '4px 10px' }}
      >
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* group label removed — buttons are self-explanatory and the row was too wide */}
          {/* The chips had no tooltips at all, so which question each grouping
            answers — and that one of them is where a person's order is set —
            was something you had to already know. */}
          {[
            ['project', t('g.project')],
            ['team', t('g.team')],
            ['resource', t('g.resource')],
            ['thread', t('g.thread')],
          ].map(([k, l]) => (
            <button
              key={k}
              data-htip={t(`g.group.${k}Tip`)}
              className={`btn btn-xs ${groupBy === k ? 'btn-pri' : 'btn-sec'}`}
              onMouseDown={e => activateMode(e, () => setGB(k))}
              onClick={e => {
                if (e.detail === 0) setGB(k);
              }}
              style={{ padding: '2px 7px', fontSize: 11 }}
            >
              {l}
            </button>
          ))}
          <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
          {/* Beside the grouping pills, because it answers the same kind of
            question: the pills say what a row IS, this says how many rows
            there are. */}
          <button
            className={`btn btn-xs ${compact ? 'btn-pri' : 'btn-sec'}`}
            onClick={toggleCompact}
            aria-pressed={compact}
            data-testid="gantt-compact-toggle"
            data-htip={compact ? t('g.classicTip') : t('g.compactTip')}
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            {compact ? '●' : '○'} {t('g.compact')}
          </button>
          <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
          {/* The overload figure used to be a badge of its own, standing in
            the row of grouping pills — a number in a place that is
            otherwise a set of choices, which is why it read as a control
            and got looked at as neither. It lives on this toggle's tooltip
            now: same detail, one hover away, at the switch that turns the
            reading on. The count itself is still a filter chip under
            Filter, where a number you might want to ACT on belongs. */}
          <button
            className={`btn btn-xs ${showLoadHeatmap ? 'btn-pri' : 'btn-sec'}`}
            onClick={toggleLoadHeatmap}
            aria-pressed={showLoadHeatmap}
            data-htip={showLoadHeatmap ? loadRiskSummary.tip : t('g.loadHeatmapTip')}
            data-testid="gantt-load-toggle"
            style={{ padding: '2px 7px', fontSize: 11 }}
          >
            {showLoadHeatmap ? '●' : '○'} {t('g.loadHeatmap')}
          </button>
          {/* Overbooking now surfaces as a global quick-filter chip in the
            app's subtoolbar so the same indicator works for every view. */}
          {allCollapseKeys.length > 0 && (
            <>
              <span style={{ width: 1, height: 14, background: 'var(--b2)', margin: '0 2px' }} />
              <button
                className="btn btn-sec btn-xs"
                data-testid="gantt-expand-all"
                onClick={expandAll}
                style={{ padding: '2px 7px', fontSize: 11 }}
              >
                {t('tv.expandAll')}
              </button>
              <button className="btn btn-sec btn-xs" onClick={collapseAll} style={{ padding: '2px 7px', fontSize: 11 }}>
                {t('tv.collapseAll')}
              </button>
            </>
          )}
        </div>
      </div>
      <div ref={hR} className="gh-scroll" onMouseDown={onTimelinePanStart}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--b)', height: zoomMode === 'month' ? HH : HH / 2 }}>
          {months.map((m, i) => {
            const [y, mo] = m.ym.split('-');
            const isYS = mo === '0';
            const label = monthHeaderLabel(m);
            const title = `${MDE[+mo]} '${y.slice(2)}`;
            return (
              <div
                key={i}
                style={{
                  width: WPX * m.count,
                  flexShrink: 0,
                  borderRight: '1px solid var(--b2)',
                  padding: zoomMode === 'month' ? '2px 4px' : '2px 5px',
                  fontSize: zoomMode === 'month' ? 10 : 11,
                  color: isYS ? 'var(--ac)' : 'var(--tx2)',
                  fontFamily: 'var(--mono)',
                  fontWeight: isYS ? 600 : 500,
                  overflow: 'hidden',
                  background: isYS ? 'var(--bg3)' : '',
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
                title={title}
              >
                {label}
              </div>
            );
          })}
        </div>
        {zoomMode !== 'month' && (
          <div style={{ display: 'flex', height: HH / 2 }}>
            {weeks.map((w, i) => {
              const isYB = i > 0 && weeks[i - 1].mon.getFullYear() !== w.mon.getFullYear();
              const isNow = todayWi >= 0 && i === todayWi;
              const label = weekHeaderLabel(w, i, isYB, isNow);
              return (
                <div
                  key={i}
                  className={isNow ? 'gw-now' : w.hasH ? 'gw-hol' : isYB ? 'gw-yb' : ''}
                  style={{
                    width: WPX,
                    flexShrink: 0,
                    borderRight: '1px solid var(--b)',
                    borderLeft: isYB ? '2px solid var(--ac2)' : '',
                    textAlign: 'center',
                    fontSize: 11,
                    color: isNow ? 'var(--gr)' : w.hasH ? 'var(--re)' : 'var(--tx3)',
                    fontFamily: 'var(--mono)',
                    fontWeight: isNow ? 700 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    lineHeight: `${HH / 2}px`,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}
        {/* Day-level header row: all 7 days (Mon–Sun). Weekends grayed. */}
        {showDays && (
          <div style={{ display: 'flex', height: 14, borderTop: '1px solid var(--b2)' }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ width: WPX, flexShrink: 0, display: 'flex' }}>
                {[0, 1, 2, 3, 4, 5, 6].map(d => {
                  const date = addD(w.mon, d);
                  const dow = date.getDay();
                  const isWeekend = !wdSet.has(dow);
                  const isToday = date.toDateString() === now.toDateString();
                  return (
                    <div
                      key={d}
                      style={{
                        flex: 1,
                        fontSize: 10,
                        textAlign: 'center',
                        color: isToday ? 'var(--gr)' : isWeekend ? 'var(--tx3)' : 'var(--tx2)',
                        fontWeight: isToday ? 700 : 400,
                        fontFamily: 'var(--mono)',
                        borderRight: d < 6 ? '1px solid var(--b2)' : 'none',
                        lineHeight: '14px',
                        opacity: isWeekend ? 0.4 : 1,
                        background: isWeekend ? 'rgba(127,127,127,.06)' : '',
                      }}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {/* Horizon color band: green(H1) → amber(H2) → gray(beyond) */}
        {(() => {
          const h1D = new Date(now);
          h1D.setDate(h1D.getDate() + h1Weeks * 7);
          const h2D = new Date(now);
          h2D.setDate(h2D.getDate() + h2Weeks * 7);
          const todX = dateToX(now),
            h1X = dateToX(h1D),
            h2X = dateToX(h2D);
          return (
            <div style={{ display: 'flex', height: 3, position: 'relative', overflow: 'hidden', width: tw }}>
              {todX > 0 && <div style={{ position: 'absolute', left: 0, width: todX, height: '100%', background: 'var(--bg3)' }} />}
              {h1X > todX && (
                <div
                  style={{
                    position: 'absolute',
                    left: Math.max(todX, 0),
                    width: h1X - Math.max(todX, 0),
                    height: '100%',
                    background: 'var(--gr)',
                    opacity: 0.5,
                  }}
                  data-htip={t('g.h1BandTip', h1Weeks)}
                />
              )}
              {h2X > h1X && (
                <div
                  style={{ position: 'absolute', left: h1X, width: h2X - h1X, height: '100%', background: 'var(--am)', opacity: 0.4 }}
                  data-htip={t('g.h2BandTip', h2Weeks)}
                />
              )}
              <div
                style={{ position: 'absolute', left: h2X, right: 0, height: '100%', background: 'var(--tx3)', opacity: 0.15 }}
                data-htip={t('g.beyondH2BandTip')}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
