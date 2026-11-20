import { NO_PERSON, EMPTY_ARR, fmtLoadDays, loadHeatStroke } from '../../../utils/gantt/helpers.js';
import { tipLines } from '../../../utils/tipText.js';
import { localDate } from '../../../utils/date.js';

// A group row's bar: the group's extent plus its resource-load heat cells.
// `style` and `data-row-type` arrive from the row call site (cloneElement).
export function GanttGroupBarRow({
  row,
  style,
  'data-row-type': dataRowType,
  dateToX,
  DPX,
  WPX,
  tw,
  t,
  rowIsCp,
  cpOnly,
  rowRelevantToCp,
  showLoadHeatmap,
  groupBy,
  resourceLoadByWeek,
  vacByPerson,
  holidayDays,
}) {
  const s = row.s;
  const hasWindow = s?.startD && s?.endD && !s?._unestimated;
  let baseLeft = 0;
  let baseWidth = 0;
  if (hasWindow) {
    baseLeft = dateToX(s.startD) + 2;
    baseWidth = dateToX(s.endD) + DPX - dateToX(s.startD) - 4;
  }
  const barLeft = Math.max(0, baseLeft);
  const barWidth = Math.max(baseWidth, 6);
  const groupStyle =
    s?.status === 'done'
      ? { background: 'var(--bg4)', border: '1px solid var(--b2)', color: 'var(--tx2)', textShadow: 'none' }
      : { background: 'var(--bg3)', border: '1px solid var(--b2)', color: 'var(--tx)', textShadow: 'none' };
  const groupProgress = s?.progress ?? (s?.status === 'done' ? 100 : s?.status === 'wip' ? 50 : 0);
  const isCp = rowIsCp(row);
  const dim = cpOnly && !rowRelevantToCp(row);
  const loadCells =
    showLoadHeatmap && groupBy === 'resource' && row.personId && row.personId !== NO_PERSON ? resourceLoadByWeek[row.personId] : null;
  // A person's own row, in resource grouping: the one row that
  // belongs to exactly one person, so the one place their
  // absence can be drawn across the whole timeline without
  // repeating it on every task (see docs/gantt.md).
  const ownPerson = groupBy === 'resource' && row.personId && row.personId !== NO_PERSON ? row.personId : null;
  const personVacs = ownPerson ? vacByPerson[ownPerson] || EMPTY_ARR : EMPTY_ARR;
  return (
    <div style={style} data-row-type={dataRowType}>
      {ownPerson &&
        holidayDays.map(h => (
          <div
            key={`hol-${h.iso}`}
            data-person-holiday={h.iso}
            data-htip={`${t('g.holiday')}: ${h.iso}`}
            style={{
              position: 'absolute',
              left: h.x,
              top: 0,
              width: Math.max(DPX, 3),
              height: '100%',
              background: 'color-mix(in srgb, var(--st-risk) 22%, transparent)',
              zIndex: 1,
            }}
          />
        ))}
      {personVacs.map((v, vi) => {
        const from = localDate(v.from),
          to = localDate(v.to);
        if (!from || !to) return null;
        const left = dateToX(from),
          right = dateToX(to) + DPX;
        if (right <= 0 || left >= tw) return null;
        return (
          <div
            key={`vac-${vi}`}
            data-person-vacation={`${v.from}_${v.to}`}
            data-htip={`${row.label} · ${t('g.vacation')}: ${v.from} → ${v.to}${v.note ? ' · ' + v.note : ''}`}
            style={{
              position: 'absolute',
              left: Math.max(0, left),
              width: Math.max(3, right - Math.max(0, left)),
              top: 0,
              bottom: 0,
              zIndex: 3,
              // The bars' absence mark, at row scale: hatched wash,
              // solid seams where it starts and ends.
              background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--st-wip) 45%, transparent) 0 2px, transparent 2px 6px)',
              boxShadow: 'inset 2px 0 0 var(--st-wip), inset -2px 0 0 var(--st-wip)',
            }}
          />
        );
      })}
      {loadCells?.map(cell => {
        const pct = cell.percent || 0;
        const taskLines = (cell.tasks || EMPTY_ARR).slice(0, 8).map(task => `- ${task.id} ${task.name} · ${fmtLoadDays(task.load)}`);
        const tip = tipLines(
          `**${row.label} · KW ${cell.kw} (${cell.start})**`,
          `${pct}% · ${fmtLoadDays(cell.load)} / ${fmtLoadDays(cell.availability)}`,
          ...(taskLines.length ? taskLines : [`__${t('g.loadNoWork')}__`]),
        );
        return (
          <div
            key={`load-${cell.wi}`}
            data-htip={tip}
            style={{
              position: 'absolute',
              left: cell.wi * WPX,
              top: 0,
              width: WPX,
              // Same move as the task rows: a strip along the
              // baseline rather than a block behind the bar. The
              // hover target stays the full height so the week's
              // figures are still one hover away.
              height: '100%',
              background: 'transparent',
              borderBottom: `4px solid ${loadHeatStroke(pct, cell)}`,
              borderRight: pct > 110 ? '1px solid var(--st-risk)' : '1px solid rgba(127,127,127,.08)',
              pointerEvents: 'auto',
              zIndex: 0,
            }}
          />
        );
      })}
      {hasWindow && (
        <div
          className={`gbar${isCp ? ' cp-bar' : ''}`}
          style={{
            left: barLeft,
            width: barWidth,
            top: 5,
            height: 18,
            borderRadius: 5,
            cursor: 'default',
            boxShadow: 'none',
            opacity: dim ? 0.25 : 1,
            ...groupStyle,
          }}
        >
          {groupProgress > 0 && groupProgress < 100 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${groupProgress}%`,
                background: 'rgba(127,127,127,.18)',
                borderRadius: '5px 0 0 5px',
                pointerEvents: 'none',
              }}
            />
          )}
          {s?.status === 'done' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(119,128,138,.08)',
                borderRadius: 5,
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Same reasoning as the summary bars: the header beside
      this bar already carries the name, and repeating it here
      put the loudest text in the chart on what the reader
      already knows. The bar's own job is its extent. */}
        </div>
      )}
    </div>
  );
}
