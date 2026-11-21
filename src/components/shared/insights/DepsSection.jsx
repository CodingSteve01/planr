import { useT } from '../../../i18n.jsx';
import { KVRow, Section, activatable, S_COLOR, S_DOT } from './InsightParts.jsx';

// Dependencies section
export function DepsSection({ preds, succs, inheritedPreds, sec, onOpenItem }) {
  const { t } = useT();
  const editLabel = t('ins.editSection');
  return (
    <Section label={t('ins.deps')} onClick={sec('dependencies')} editLabel={editLabel}>
      {preds.length > 0 && (
        <KVRow label={t('qe.predecessors')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {preds.map(p => (
              <span
                key={p.id}
                style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                onClick={e => {
                  e.stopPropagation();
                  onOpenItem?.(p.id);
                }}
                {...activatable(onOpenItem ? () => onOpenItem(p.id) : null, 'link')}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ac)' }}>{p.id}</span>
                <span style={{ marginLeft: 4, color: S_COLOR[p.status] }}>{S_DOT[p.status]}</span>
                <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--tx2)' }}>{p.name}</span>
              </span>
            ))}
          </div>
        </KVRow>
      )}
      {inheritedPreds.length > 0 && (
        <KVRow label={t('ins.inheritedDeps')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {inheritedPreds.map(p => (
              <span
                key={p.id + ':' + p.via}
                style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                data-htip={t('ins.inheritedDepTip', p.via, p.id)}
                onClick={e => {
                  e.stopPropagation();
                  onOpenItem?.(p.id);
                }}
                {...activatable(onOpenItem ? () => onOpenItem(p.id) : null, 'link')}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--am)' }}>↰ {p.id}</span>
                <span style={{ marginLeft: 4, color: S_COLOR[p.status] }}>{S_DOT[p.status]}</span>
                <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--tx2)' }}>{p.name}</span>
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>via {p.via}</span>
              </span>
            ))}
          </div>
        </KVRow>
      )}
      {succs.length > 0 && (
        <KVRow label={t('qe.successors')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {succs.map(s => (
              <span
                key={s.id}
                style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                onClick={e => {
                  e.stopPropagation();
                  onOpenItem?.(s.id);
                }}
                {...activatable(onOpenItem ? () => onOpenItem(s.id) : null, 'link')}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ac)' }}>{s.id}</span>
                <span style={{ marginLeft: 4, color: S_COLOR[s.status] }}>{S_DOT[s.status]}</span>
                <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--tx2)' }}>{s.name}</span>
              </span>
            ))}
          </div>
        </KVRow>
      )}
    </Section>
  );
}
