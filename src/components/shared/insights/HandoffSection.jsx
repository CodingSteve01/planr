import { useT } from '../../../i18n.jsx';
import { Icon } from '../Icon.jsx';
import { KVRow, Section } from './InsightParts.jsx';

// Handoff / offboarding cascade — leaf only when the scheduler had to
// split work across multiple people (or flagged a truncation).
export function HandoffSection({ node, sc, onSplitHandoff, onSplitTaskAtProgress }) {
  const { t } = useT();
  return (
    <Section
      label={sc.segments.length > 1 ? 'Handoff-Kette' : t('ins.offboardWarn')}
      extra={
        // Cascade chain present → splitHandoff. Cascade-free truncation →
        // splitTaskAtProgress at the consumed/total ratio so the split
        // produces a "done" original (consumed in the past) plus a
        // follow-up for the unassigned tail.
        (() => {
          const hasChain = sc.segments.slice(1).some(s => !s.unscheduled);
          if (hasChain && onSplitHandoff) {
            return (
              <button
                className="btn btn-sec btn-xs"
                data-htip={t('split.handoff.tip')}
                onClick={() => onSplitHandoff(node.id)}
                style={{ padding: '2px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Icon name="subtask" size={11} />
                {t('split.btn')}
              </button>
            );
          }
          if (sc.truncatedByOffboard && onSplitTaskAtProgress) {
            const consumed = sc.segments[0]?.effort || 0;
            const total = consumed + sc.truncatedByOffboard.remainingEffort;
            const pct = total > 0 ? Math.max(1, Math.min(99, Math.round((consumed / total) * 100))) : 50;
            return (
              <button
                className="btn btn-sec btn-xs"
                data-htip={t('split.task.tip')}
                onClick={() => onSplitTaskAtProgress(node.id, pct)}
                style={{ padding: '2px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Icon name="subtask" size={11} />
                {t('split.btn')}
              </button>
            );
          }
          return null;
        })()
      }
    >
      {sc.segments.map((seg, i) => {
        const isGhost = !!seg.unscheduled;
        const fmt = d => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : d) : '—');
        return (
          <KVRow key={i} label={isGhost ? '!' : seg.handoff ? '↳' : '●'}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: isGhost ? 'var(--re)' : 'var(--tx)' }}>{seg.personName}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{seg.effort.toFixed(1)}d</span>
              <span style={{ color: 'var(--tx3)', fontSize: 11 }}>·</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
                {fmt(seg.startD)} → {fmt(seg.endD)}
              </span>
              {seg.offboarded && <span style={{ fontSize: 11, color: 'var(--am)' }}>offboarded</span>}
            </span>
          </KVRow>
        );
      })}
      {sc.truncatedByOffboard && (
        <KVRow label="">
          <span style={{ fontSize: 12, color: 'var(--re)', fontWeight: 600 }}>
            ! {sc.truncatedByOffboard.remainingEffort.toFixed(1)} PT ohne Nachbesetzung nach {sc.truncatedByOffboard.offboardDate}
          </span>
        </KVRow>
      )}
      {onSplitHandoff && sc.segments.slice(1).some(s => !s.unscheduled) && (
        <KVRow label="">
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic' }}>
            {(() => {
              const txt = t('split.handoff.hint', t('split.btn'));
              // The {0} placeholder is the button label — bold-render
              // the slot when locating it by literal match.
              const idx = txt.indexOf(t('split.btn'));
              if (idx < 0) return txt;
              return (
                <>
                  {txt.slice(0, idx)}
                  <b>{t('split.btn')}</b>
                  {txt.slice(idx + t('split.btn').length)}
                </>
              );
            })()}
          </span>
        </KVRow>
      )}
    </Section>
  );
}
