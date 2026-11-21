import { Icon } from '../../shared/Icon.jsx';
import { useT } from '../../../i18n.jsx';

// The predecessors an item has: the ones it inherits from its parents, then
// its own hard and soft ones.
export function PredecessorList({ bufferNode, f, flushNode, inheritedDeps, patchNode, tree }) {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
      {(f.deps || []).map(dep => {
        const target = tree.find(entry => entry.id === dep);
        const label = (f._depLabels || {})[dep] || '';
        return (
          <div key={'h_' + dep} className="dep-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span
                title={t('qe.dep.hardTip')}
                style={{ fontSize: 10, color: 'var(--am)', flexShrink: 0, fontWeight: 700, letterSpacing: '.05em' }}
              >
                H
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{dep}</span>
              {target?.name && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--tx2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {target.name}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <input
                value={label}
                onChange={e => bufferNode({ _depLabels: { ...(f._depLabels || {}), [dep]: e.target.value } })}
                onBlur={flushNode}
                placeholder="label"
                style={{
                  width: 50,
                  background: 'var(--bg)',
                  border: '1px solid var(--b2)',
                  borderRadius: 4,
                  color: 'var(--tx3)',
                  fontSize: 10,
                  padding: '1px 4px',
                  outline: 'none',
                  fontFamily: 'var(--mono)',
                }}
              />
              <span
                title={t('qe.dep.convertToSoft')}
                style={{ cursor: 'pointer', opacity: 0.7, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
                onClick={() => {
                  patchNode({
                    deps: (f.deps || []).filter(id => id !== dep),
                    softDeps: [...new Set([...(f.softDeps || []), dep])],
                  });
                }}
              >
                →S
              </span>
              <span
                className="tag-x"
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12, color: 'var(--tx3)' }}
                onClick={() => {
                  const nextDeps = (f.deps || []).filter(id => id !== dep);
                  const nextLabels = { ...(f._depLabels || {}) };
                  delete nextLabels[dep];
                  patchNode({ deps: nextDeps, _depLabels: nextLabels });
                }}
              >
                <Icon name="x" size={9} />
              </span>
            </div>
          </div>
        );
      })}
      {(f.softDeps || []).map(dep => {
        const target = tree.find(entry => entry.id === dep);
        return (
          <div key={'s_' + dep} className="dep-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span
                title={t('qe.dep.softTip')}
                style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0, fontWeight: 700, letterSpacing: '.05em' }}
              >
                S
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--tx3)',
                  flexShrink: 0,
                  fontWeight: 500,
                  fontStyle: 'italic',
                }}
              >
                ~{dep}
              </span>
              {target?.name && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--tx3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    fontStyle: 'italic',
                  }}
                >
                  {target.name}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <span
                title={t('qe.dep.convertToHard')}
                style={{ cursor: 'pointer', opacity: 0.7, fontSize: 10, color: 'var(--am)', fontFamily: 'var(--mono)' }}
                onClick={() => {
                  patchNode({
                    softDeps: (f.softDeps || []).filter(id => id !== dep),
                    deps: [...new Set([...(f.deps || []), dep])],
                  });
                }}
              >
                →H
              </span>
              <span
                className="tag-x"
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12, color: 'var(--tx3)' }}
                onClick={() => {
                  patchNode({ softDeps: (f.softDeps || []).filter(id => id !== dep) });
                }}
              >
                <Icon name="x" size={9} />
              </span>
            </div>
          </div>
        );
      })}

      {inheritedDeps.map(({ dep, from }) => {
        const target = tree.find(entry => entry.id === dep);
        return (
          <div key={`inh_${dep}_${from}`} className="dep-row" style={{ opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0 }}>{dep}</span>
              {target?.name && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--tx3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {target.name}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{t('ph.via', from)}</span>
          </div>
        );
      })}
    </div>
  );
}
