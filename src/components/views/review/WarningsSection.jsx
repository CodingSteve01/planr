import { iso } from '../../../utils/date.js';
import { useT } from '../../../i18n.jsx';

function NoCapacityGroup({ noCapacity, onOpenItem }) {
  const { t } = useT();
  return (
    <div style={{ marginBottom: 18 }} data-testid="plan-no-capacity">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '2px solid var(--re)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--re)' }}>! {t('pr.warnNoCapacity')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{noCapacity.length}</span>
      </div>
      <p className="helper" style={{ fontSize: 11, margin: '0 0 6px' }}>
        {t('pr.warnNoCapacityHelp')}
      </p>
      {noCapacity.map(({ member, taskIds }) => (
        <div
          key={member.id}
          data-no-capacity={member.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderBottom: '1px solid var(--b)',
            cursor: 'pointer',
            fontSize: 12,
          }}
          onClick={() => onOpenItem?.(taskIds[0])}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>
            {taskIds.slice(0, 3).join(', ')}
            {taskIds.length > 3 ? ' …' : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--re)', flexShrink: 0 }}>{t('pr.warnNoCapacityTasks', taskIds.length)}</span>
        </div>
      ))}
    </div>
  );
}

function ConflictsGroup({ conflicts, fullMap, onOpenItem }) {
  const { t } = useT();
  const conflictDetail = c =>
    c.kind === 'orphan'
      ? t('pr.conflictOrphan', c.parentId)
      : c.kind === 'droppedLive'
        ? t('pr.conflictDroppedLive', c.progress)
        : t('pr.conflictDoneOverOpen', c.openIds.length, c.openIds.slice(0, 3).join(', ') + (c.openIds.length > 3 ? ' …' : ''));
  return (
    <div style={{ marginBottom: 18 }} data-testid="plan-conflicts">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '2px solid var(--am)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--am)' }}>! {t('pr.conflicts')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{conflicts.length}</span>
      </div>
      <p className="helper" style={{ fontSize: 11, margin: '0 0 6px' }}>
        {t('pr.conflictsHelp')}
      </p>
      {conflicts.map(c => (
        <div
          key={`${c.kind}-${c.id}`}
          data-conflict={c.kind}
          data-conflict-id={c.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderBottom: '1px solid var(--b)',
            cursor: 'pointer',
            fontSize: 12,
          }}
          onClick={() => onOpenItem?.(c.id)}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--ac)',
              fontWeight: 600,
              flexShrink: 0,
              minWidth: 70,
            }}
          >
            {c.id}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullMap[c.id]?.name || c.id}</span>
          <span style={{ fontSize: 11, color: 'var(--am)', flexShrink: 0 }}>{conflictDetail(c)}</span>
        </div>
      ))}
    </div>
  );
}

function DueGroup({ dueViolations, iMap, onOpenItem }) {
  const { t } = useT();
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '2px solid var(--re)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--re)' }}>~ {t('pr.warnDueOverdue')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{dueViolations.length}</span>
      </div>
      {dueViolations.map(s => {
        const node = iMap[s.treeId || s.id];
        const projEnd = s.endD ? iso(s.endD) : '—';
        const latest = s.latestStart ? (s.latestStart instanceof Date ? iso(s.latestStart) : s.latestStart) : null;
        return (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderBottom: '1px solid var(--b)',
              cursor: 'pointer',
              fontSize: 12,
            }}
            onClick={() => onOpenItem?.(s.treeId || s.id)}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--ac)',
                fontWeight: 600,
                flexShrink: 0,
                minWidth: 70,
              }}
            >
              {s.id}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node?.name || s.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--re)', flexShrink: 0 }}>~ {s.due}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>→ {projEnd}</span>
            {latest && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: s.dueInfeasible ? 'var(--re)' : 'var(--am)',
                  flexShrink: 0,
                  fontWeight: s.dueInfeasible ? 600 : 400,
                }}
                data-htip={t(s.dueInfeasible ? 'ins.latestStartPast' : 'ins.latestStart')}
              >
                ↶ {latest}
                {s.dueInfeasible ? ' !' : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TruncatedGroup({ truncated, iMap, onOpenItem }) {
  const { t } = useT();
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '2px solid var(--am)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--am)' }}>! {t('pr.warnTruncated')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{truncated.length}</span>
      </div>
      {truncated.map(s => {
        const node = iMap[s.treeId || s.id];
        const tr = s.truncatedByOffboard;
        return (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderBottom: '1px solid var(--b)',
              cursor: 'pointer',
              fontSize: 12,
            }}
            onClick={() => onOpenItem?.(s.treeId || s.id)}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--ac)',
                fontWeight: 600,
                flexShrink: 0,
                minWidth: 70,
              }}
            >
              {s.id}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node?.name || s.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)', flexShrink: 0 }}>
              {tr.remainingEffort.toFixed(1)} PT
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>nach {tr.offboardDate}</span>
            <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>↳ {t('pr.warnSplitHint')}</span>
          </div>
        );
      })}
    </div>
  );
}

// Tasks for which no working day fitted before the plan end: their bar is a
// placeholder, so they are listed instead of looking like scheduled work.
function BeyondHorizonGroup({ beyond, iMap, onOpenItem }) {
  const { t } = useT();
  return (
    <div style={{ marginBottom: 18 }} data-testid="warn-beyond-horizon">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '2px solid var(--re)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--re)' }}>! {t('pr.warnBeyondHorizon')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{beyond.length}</span>
      </div>
      {beyond.map(s => (
        <div
          key={s.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderBottom: '1px solid var(--b)',
            cursor: 'pointer',
            fontSize: 12,
          }}
          onClick={() => onOpenItem?.(s.treeId || s.id)}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, flexShrink: 0, minWidth: 70 }}>
            {s.id}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {iMap[s.treeId || s.id]?.name || s.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>↳ {t('pr.warnBeyondHorizonHint')}</span>
        </div>
      ))}
    </div>
  );
}

export function WarningsSection({ scheduled, conflicts, noCapacity, fullMap, iMap, onOpenItem }) {
  const { t } = useT();
  const dueViolations = scheduled
    .filter(s => s.dueOverdue || (s.due && new Date(s.due) < new Date() && s.status !== 'done'))
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  const truncated = scheduled.filter(s => s.truncatedByOffboard).sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const beyond = scheduled.filter(s => s.beyondHorizon && s.status !== 'done').sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  if (!dueViolations.length && !truncated.length && !beyond.length && !conflicts.length && !noCapacity.length) {
    return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('pr.warningsNone')}</div>;
  }
  return (
    <>
      {noCapacity.length > 0 && <NoCapacityGroup noCapacity={noCapacity} onOpenItem={onOpenItem} />}
      {conflicts.length > 0 && <ConflictsGroup conflicts={conflicts} fullMap={fullMap} onOpenItem={onOpenItem} />}
      {dueViolations.length > 0 && <DueGroup dueViolations={dueViolations} iMap={iMap} onOpenItem={onOpenItem} />}
      {beyond.length > 0 && <BeyondHorizonGroup beyond={beyond} iMap={iMap} onOpenItem={onOpenItem} />}
      {truncated.length > 0 && <TruncatedGroup truncated={truncated} iMap={iMap} onOpenItem={onOpenItem} />}
    </>
  );
}
