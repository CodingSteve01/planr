import { iso, diffDays } from '../../../utils/date.js';
import { useT } from '../../../i18n.jsx';
import { Icon } from '../Icon.jsx';
import { KVRow, Section } from './InsightParts.jsx';

// Timing section — the dates, the due date and what the row is waiting for.
export function TimingSection({
  node,
  sc,
  scheduled,
  timeline,
  periodStartDate,
  periodEndDate,
  actualStartDate,
  actualEndDate,
  plannedStartDate,
  plannedEndDate,
  hasDistinctPlanned,
  calDays,
  sec,
  onOpenItem,
}) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  return (
    <Section label={t('ins.timing')} onClick={sec('timing')} editLabel={editLabel}>
      {actualStartDate && actualEndDate && (
        <KVRow label={t('ins.actual')}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
            {iso(actualStartDate)} → {iso(actualEndDate)}
          </span>
          {actualStartDate && actualEndDate && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--tx3)' }}>
              ({diffDays(actualStartDate, actualEndDate)} {t('ins.calDays')})
            </span>
          )}
        </KVRow>
      )}
      {!actualStartDate && periodStartDate && periodEndDate && (
        <KVRow label={t('ins.period')}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
            {iso(periodStartDate)} → {iso(periodEndDate)}
          </span>
          {calDays != null && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--tx3)' }}>
              ({calDays} {t('ins.calDays')})
            </span>
          )}
        </KVRow>
      )}
      {hasDistinctPlanned && (
        <KVRow label={t('ins.planned')}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
            {iso(plannedStartDate)} → {iso(plannedEndDate)}
          </span>
        </KVRow>
      )}
      {timeline?.deadline && (
        <KVRow label={t('qe.affectsDeadline')}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
            {iso(timeline.deadline.start)} → {iso(timeline.deadline.end)}
          </span>
          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--tx3)' }}>
            ({timeline.deadline.leafCount}/{timeline.leafCount} {t('ins.leaves')})
          </span>
        </KVRow>
      )}
      {node.pinnedStart && (
        <KVRow label={t('ins.pinned')}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="pin" size={10} />
            {node.pinnedStart}
          </span>
        </KVRow>
      )}
      {node.decideBy && (
        <KVRow label={t('ins.decideBy')}>
          <span
            style={{ fontFamily: 'var(--mono)', fontSize: 12, color: new Date(node.decideBy) < new Date() ? 'var(--re)' : 'var(--tx)' }}
          >
            {node.decideBy}
          </span>
        </KVRow>
      )}
      {/* Due date — hard deadline. Red when scheduler's projected end blows
              past it (sc.dueOverdue) or already in the past for unfinished work. */}
      {node.due &&
        (() => {
          const overdueByPlan = !!sc?.dueOverdue;
          const pastNow = new Date(node.due) < new Date() && node.status !== 'done';
          const bad = overdueByPlan || pastNow;
          const latest = sc?.latestStart;
          const infeasible = !!sc?.dueInfeasible;
          const fmt = d => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : d) : '—');
          return (
            <>
              <KVRow label={t('ins.due')}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: bad ? 'var(--re)' : 'var(--tx)',
                    fontWeight: bad ? 600 : 400,
                  }}
                >
                  ~ {node.due}
                  {overdueByPlan && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--re)' }}>! {t('ins.dueOverdueByPlan')}</span>}
                </span>
              </KVRow>
              {latest && node.status !== 'done' && (
                <KVRow label={t('ins.latestStart')}>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      color: infeasible ? 'var(--re)' : 'var(--tx2)',
                      fontWeight: infeasible ? 600 : 400,
                    }}
                  >
                    ↶ {fmt(latest)}
                    {infeasible && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--re)' }}>! {t('ins.latestStartPast')}</span>}
                  </span>
                </KVRow>
              )}
            </>
          );
        })()}
      {/* Why does this row sit so far in the future? blockedBy surfaces the
              dep that pushed startD past the assignee's prior free date. Click
              the blocker to jump to it. */}
      {sc?.blockedBy &&
        (() => {
          const blocker = scheduled?.find(x => x.id === sc.blockedBy.id);
          // Only treat as a real label when it differs from the ID — `scheduled`
          // doesn't include done tasks, so the fallback would just echo the ID.
          const blockerName = blocker?.name && blocker.name !== sc.blockedBy.id ? blocker.name : '';
          const blockerPerson = blocker?.person || blocker?.personShort || '';
          const endIso = sc.blockedBy.endD instanceof Date ? sc.blockedBy.endD.toISOString().slice(0, 10) : String(sc.blockedBy.endD);
          const meta = [blockerPerson, endIso].filter(Boolean).join(' · ');
          return (
            <KVRow label={t('ins.blockedBy')}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx2)' }}>
                ~{' '}
                <a
                  href="#"
                  style={{ color: 'var(--ac)', textDecoration: 'none' }}
                  onClick={e => {
                    e.preventDefault();
                    blocker && onOpenItem?.(blocker);
                  }}
                >
                  {sc.blockedBy.id}
                </a>
                {blockerName && <span style={{ marginLeft: 6, color: 'var(--tx3)' }}>{blockerName}</span>}
                {meta && <span style={{ marginLeft: 6, color: 'var(--tx3)' }}>· {meta}</span>}
              </span>
            </KVRow>
          );
        })()}
    </Section>
  );
}
