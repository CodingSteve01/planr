import { useT } from '../../../i18n.jsx';
import { Icon } from '../Icon.jsx';
import { KVRow, Section } from './InsightParts.jsx';

const PH_DOT = { done: '●', wip: '◐', open: '○' };
const PH_COLOR = { done: 'var(--gr)', wip: 'var(--am)', open: 'var(--tx3)' };

// Phases section — leaf only, if phases exist
export function PhasesSection({ node, sec, onPhaseToggle }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  const phaseToggleTip = t('ins.phaseToggle');
  const currentPhaseIdx = node.phases.findIndex(p => p.status !== 'done');
  return (
    <Section label={t('ins.phases')} onClick={sec('phases')} editLabel={editLabel}>
      {node.phases.map((ph, idx) => {
        const isCurrent = idx === currentPhaseIdx;
        const dot = PH_DOT[ph.status] || '○';
        const color = PH_COLOR[ph.status] || 'var(--tx3)';
        const pct = ph.effortPct != null ? ph.effortPct : null;
        return (
          <KVRow key={ph.id || idx} label="">
            <span
              style={{
                fontSize: 12,
                color: isCurrent ? 'var(--tx)' : 'var(--tx2)',
                fontWeight: isCurrent ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  color,
                  cursor: onPhaseToggle ? 'pointer' : 'default',
                  transition: 'transform .1s',
                  display: 'inline-block',
                }}
                data-htip={onPhaseToggle ? phaseToggleTip : undefined}
                onClick={
                  onPhaseToggle
                    ? e => {
                        e.stopPropagation();
                        onPhaseToggle(ph.id);
                      }
                    : undefined
                }
                onMouseEnter={
                  onPhaseToggle
                    ? e => {
                        e.currentTarget.style.transform = 'scale(1.4)';
                      }
                    : undefined
                }
                onMouseLeave={
                  onPhaseToggle
                    ? e => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    : undefined
                }
              >
                {dot}
              </span>
              <span>{ph.name || ph.id}</span>
              {pct != null && <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{pct}%</span>}
              {isCurrent && <Icon name="chevronLeft" size={10} style={{ color: 'var(--ac)', marginLeft: 2, display: 'inline-block' }} />}
            </span>
          </KVRow>
        );
      })}
    </Section>
  );
}
