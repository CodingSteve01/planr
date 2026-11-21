import { Icon } from '../../shared/Icon.jsx';
import { diffDays, iso } from '../../../utils/date.js';
import { horizonLabel } from '../../../utils/horizon.js';
import { GT_ICON } from '../../../constants.js';
import { deadlineScopedScheduledItems } from '../../../utils/deadlines.js';
import { deadlineStatus } from '../../../utils/timeline.js';
import { waitsLine } from '../../shared/ProjectWaits.jsx';
import { useT } from '../../../i18n.jsx';
import { aggregateProgressPct, progressPctLabel } from '../../../utils/progress.js';

const BC = { goal: 'var(--ac)', painpoint: 'var(--am)', deadline: 'var(--re)' };

// One project's card in the Focus section: name, date, state badge, period,
// and the progress bar with its critical items.
export function GoalCard({ dl, goalPaths, lvs, now, onNavigate, projectWaitsOf, scheduled, timelineById, tree }) {
  const { t, lang } = useT();
  const isDe = lang === 'de';
  const gp = goalPaths?.[dl.id];
  const timeline = timelineById[dl.id];
  const linked =
    dl.type === 'deadline' ? deadlineScopedScheduledItems(tree, scheduled, dl.id) : scheduled.filter(s => s.id.startsWith(dl.id + '.'));
  // Shared with Deadlines, Gantt, Subway-Map, report and PDFs — finished
  // work reports done/doneLate instead of an "at risk" alarm.
  const dlState = deadlineStatus(tree, scheduled, dl, timeline);
  const maxEnd =
    dlState?.end || (dl.type !== 'deadline' && linked.length > 0 ? linked.reduce((m, s) => (s.endD > m ? s.endD : m), new Date(0)) : null);
  const dlDate = dl.date ? new Date(dl.date) : null;
  const isLate = !!dlState?.isLate;
  const daysLeft = dlDate ? diffDays(new Date(), dlDate) : null;
  // Count the goal's OWN leaf work packages (concrete tasks), matching
  // the PDF report (report.js childLeaves). Earlier this used gp.needed,
  // which folds in transitive dependencies from *other* goals and so
  // inflated the denominator beyond this goal's own scope. leafNodes is
  // derived from the live tree, so newly added tasks bump the count
  // automatically.
  const goalLeaves = lvs.filter(l => l.id === dl.id || l.id.startsWith(dl.id + '.'));
  const gpTotal = goalLeaves.length;
  const gpDone = goalLeaves.filter(l => l.status === 'done').length;
  // Effort-weighted (utils/progress.js) — the same figure the Subway-Map
  // train sits at and the PDF prints. The N/M next to it stays a task
  // count; the two answer different questions and will differ.
  const gpProg = aggregateProgressPct(goalLeaves);
  const borderC = dl.type === 'painpoint' ? 'var(--am)' : isLate ? 'var(--re)' : BC[dl.type] || 'var(--b)';

  return (
    <div
      key={dl.id}
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${isLate && dl.type === 'deadline' ? 'var(--re)' : 'var(--b)'}`,
        borderLeft: `3px solid ${borderC}`,
        borderRadius: 'var(--r)',
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', color: 'var(--tx3)' }}>
          <Icon name={GT_ICON[dl.type] || 'folder'} size={13} />
        </span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{dl.name}</span>
        {dlDate && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx3)' }}>{dl.date}</span>}
        {dlDate && daysLeft >= 0 && (
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{t('pc.dLeft', daysLeft)}</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {dl.type === 'deadline' &&
            (dlState?.state === 'atRisk' ? (
              <span className="badge bc">{t('s.atRisk')}</span>
            ) : dlState?.state === 'doneLate' ? (
              <span className="badge bh" data-htip={t('s.deadlineDoneLateTip', dl.date)}>
                {t('s.deadlineDoneLate')}
              </span>
            ) : dlState?.state === 'done' ? (
              <span className="badge bd" data-htip={t('s.deadlineDoneTip')}>
                {t('s.deadlineDone')}
              </span>
            ) : maxEnd ? (
              <span className="badge bd">{t('s.onTrack')}</span>
            ) : null)}
          {dl.type !== 'deadline' && linked.length > 0 && (
            <span className="badge bo">
              {linked.length} {t('s.linked')}
            </span>
          )}
        </span>
      </div>
      {isLate &&
        projectWaitsOf &&
        (() => {
          const line = waitsLine(projectWaitsOf(dl.id), t);
          return line ? (
            <div className="pw-waits-line" data-pw-line={dl.id}>
              {line}
            </div>
          ) : null;
        })()}
      {dl.description && <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 8 }}>{dl.description}</div>}
      {timeline?.period?.end && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: 11,
            color: 'var(--tx3)',
            marginBottom: 8,
            fontFamily: 'var(--mono)',
          }}
        >
          <span data-htip={iso(timeline.period.start) + ' → ' + iso(timeline.period.end)}>
            {t('ins.period')}: {horizonLabel(timeline.period.start, null, isDe, now)} → {horizonLabel(timeline.period.end, null, isDe, now)}
          </span>
          {timeline.deadline && (
            <span data-htip={iso(timeline.deadline.start) + ' → ' + iso(timeline.deadline.end)}>
              {t('qe.affectsDeadline')}: {horizonLabel(timeline.deadline.start, null, isDe, now)} →{' '}
              {horizonLabel(timeline.deadline.end, null, isDe, now)}
            </span>
          )}
        </div>
      )}
      {/* The progress block hung off goalPaths, which is only built for
              TYPED roots — so an ordinary project showed its name and a date
              and nothing else, while a goal beside it showed a bar, a count
              and its critical items. The figures never needed goalPaths:
              goalLeaves is derived from the live tree either way. Only the
              critical-item chips do. */}
      {gpTotal > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--tx3)', marginBottom: 3 }}>
            <span>{t('s.tasksDone', gpDone + '/' + gpTotal, gp?.critical.size || 0)}</span>
            <span data-htip={t('s.progressTip', progressPctLabel(gpProg))}>{progressPctLabel(gpProg)}%</span>
          </div>
          {/* Delivered work is green. This bar was amber for every project
                that was not flagged critical, which reads as a warning about
                having made progress; the severity already has the left edge
                of the card. */}
          <div className="prog-wrap">
            <div className="prog-fill" style={{ width: `${gpProg}%`, background: 'var(--st-done)' }} />
          </div>
          {gp?.critical.size > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {[...gp.critical].slice(0, 6).map(id => {
                const r = tree.find(x => x.id === id);
                return (
                  <span
                    key={id}
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--mono)',
                      color: 'var(--re)',
                      background: 'var(--bg3)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onClick={() => onNavigate?.(id, 'tree')}
                    data-htip={r?.name}
                  >
                    {id}
                  </span>
                );
              })}
              {gp.critical.size > 6 && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>+{gp.critical.size - 6}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
