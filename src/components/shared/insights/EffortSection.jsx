import { useT } from '../../../i18n.jsx';
import { KVRow, Section, StatChip } from './InsightParts.jsx';

// Effort section — leaf only
export function EffortSection({ node, effort, effortBest, effortStats, sec }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  return (
    <Section label={t('ins.effort')} onClick={sec('effort')} editLabel={editLabel}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px 8px',
            flexWrap: 'wrap',
            padding: '4px 0 2px',
          }}
        >
          <span style={{ color: 'var(--tx3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {t('ins.effortBest')}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{effortBest}d</span>
          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>× {node.factor || 1.5} =</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--am)' }}>{effort?.toFixed(1)}d</span>
        </div>
        {effortStats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {effortStats.map(stat => (
              <StatChip key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

// Parent: aggregate section — no onClick, no hover
export function SubtasksSection({ doneUnder, wipUnder, openUnder, leafCount, effort, effortBest }) {
  const { t } = useT();
  return (
    <Section label={t('ins.subtasks')}>
      <KVRow label={t('ins.breakdown')}>
        <span>
          <span style={{ color: 'var(--gr)' }}>● {doneUnder}</span>
          <span style={{ color: 'var(--tx3)' }}> · </span>
          <span style={{ color: 'var(--am)' }}>◐ {wipUnder}</span>
          <span style={{ color: 'var(--tx3)' }}> · </span>
          <span>○ {openUnder}</span>
          <span style={{ color: 'var(--tx3)', fontSize: 11 }}>
            {' '}
            / {leafCount} {t('ins.leaves')}
          </span>
        </span>
      </KVRow>
      {effortBest != null && effortBest > 0 && (
        <KVRow label={t('qe.realistic')}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--am)' }}>{effort?.toFixed(0)}d</span>
          {effortBest > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', marginLeft: 4 }}>
              ({effortBest?.toFixed(0)}d best)
            </span>
          )}
        </KVRow>
      )}
    </Section>
  );
}
