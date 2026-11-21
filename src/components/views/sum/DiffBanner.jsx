import { iso } from '../../../utils/date.js';
import { useT } from '../../../i18n.jsx';

// The movement banner of the map view: what happened since the review window began.
export function DiffBanner({ diff, sinceDate }) {
  const { t } = useT();
  return (
    <div
      style={{
        marginBottom: 8,
        padding: '6px 10px',
        background: 'rgba(245,158,11,.08)',
        border: '1px solid rgba(245,158,11,.35)',
        borderRadius: 4,
        fontSize: 12,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 12,
        rowGap: 4,
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--diff)' }}>{t('diff.stand', iso(sinceDate))}</span>
      <span style={{ color: 'var(--tx2)' }}>·</span>
      <span data-htip={t('diff.tipDone')}>{t('diff.tasksDone', diff.doneCount)}</span>
      {diff.startedInWindowIds.length > 0 && (
        <>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span data-htip={t('diff.tipStartedDetail')}>{t('diff.tasksStarted', diff.startedInWindowIds.length)}</span>
        </>
      )}
      <span style={{ color: 'var(--tx2)' }}>·</span>
      <span data-htip={t('diff.tipEffortDetail')}>{t('diff.effort', Math.round(diff.effortInWindow))}</span>
      {diff.availablePersonDays > 0 && (
        <>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span data-htip={t('diff.tipCapacity', Math.round(diff.availablePersonDays), diff.grossWorkdays, diff.holidayCount)}>
            {t('diff.capacity', Math.round(diff.availablePersonDays))}
          </span>
        </>
      )}
      {diff.vacationDaysInWindow > 0 && (
        <>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span>{t('diff.vacation', Math.round(diff.vacationDaysInWindow))}</span>
        </>
      )}
      {diff.holidayCount > 0 && (
        <>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span>{t('diff.holidays', diff.holidayCount)}</span>
        </>
      )}
      {typeof diff.utilisation === 'number' && diff.utilisation > 0 && (
        <>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span
            data-htip={t(
              'diff.tipUtilisation',
              Math.round(diff.effortInWindow),
              Math.max(1, Math.round(diff.availablePersonDays - diff.vacationDaysInWindow)),
            )}
            style={{
              color: diff.utilisation >= 80 ? 'var(--gr)' : diff.utilisation >= 40 ? 'var(--am)' : 'var(--tx3)',
              fontWeight: 600,
            }}
          >
            {t('diff.utilisation', diff.utilisation)}
          </span>
        </>
      )}
      {diff.newRootIds.length > 0 && (
        <>
          <span style={{ color: 'var(--tx2)' }}>·</span>
          <span>{t(diff.newRootIds.length === 1 ? 'diff.newLines' : 'diff.newLinesPlural', diff.newRootIds.length)}</span>
        </>
      )}
      {diff.doneCount === 0 &&
        diff.newRootIds.length === 0 &&
        diff.progressedInWindowIds.length === 0 &&
        diff.startedInWindowIds.length === 0 && (
          <span style={{ color: 'var(--tx3)', fontStyle: 'italic', marginLeft: 'auto' }}>{t('diff.noMovement')}</span>
        )}
    </div>
  );
}
