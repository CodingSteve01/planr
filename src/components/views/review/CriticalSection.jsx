import { Icon } from '../../shared/Icon.jsx';
import { useT } from '../../../i18n.jsx';

export function CriticalSection({ criticalScopes, iMap, sMap, teamFilter, personFilter, matchesFilter, onOpenItem }) {
  const { t } = useT();
  return (
    <>
      {criticalScopes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tx3)', fontSize: 12 }}>{t('pr.noCriticalPaths')}</div>
      )}
      {criticalScopes.length > 0 && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--b)',
            borderRadius: 'var(--r)',
            padding: '12px 14px',
            marginBottom: 14,
            fontSize: 12,
            color: 'var(--tx2)',
          }}
        >
          {t('pr.criticalHint')}
          {(teamFilter || personFilter) && <div style={{ marginTop: 6, color: 'var(--tx3)' }}>{t('pr.filterHint')}</div>}
        </div>
      )}
      {criticalScopes.map((entry, scopeIndex) => {
        const scopeNode = iMap[entry.scopeId];
        return (
          <div
            key={entry.scopeId}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--b)',
              borderRadius: 'var(--r)',
              padding: '12px 14px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: '1px solid var(--b)',
              }}
            >
              <span className="badge b-cp">{scopeIndex + 1}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{scopeNode?.name || entry.scopeId}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{entry.scopeId}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
                {t('pr.scopePaths', entry.chains.length, entry.nodes.length)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entry.chains.map((chain, chainIndex) => {
                const cpNo = `${scopeIndex + 1}.${chainIndex + 1}`;
                return (
                  <div key={`${entry.scopeId}:${chain.join('>')}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span className="badge b-cp" style={{ flexShrink: 0, minWidth: 42, textAlign: 'center' }}>
                      CP{cpNo}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                      {chain.map((id, idx) => {
                        const node = iMap[id];
                        const sc = sMap[id];
                        const dimmed = (teamFilter || personFilter) && !matchesFilter(node);
                        return (
                          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            {idx > 0 && (
                              <Icon name="chevronRight" size={11} strokeWidth={2.4} style={{ color: 'var(--re)', flexShrink: 0 }} />
                            )}
                            <button
                              className="btn btn-sec btn-xs"
                              onClick={() => onOpenItem?.(id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                maxWidth: 260,
                                padding: '4px 8px',
                                borderColor: 'rgba(154,36,40,.45)',
                                background: dimmed ? 'var(--bg3)' : 'rgba(154,36,40,.08)',
                                opacity: dimmed ? 0.55 : 1,
                              }}
                              data-htip={node?.name || id}
                            >
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--re)', flexShrink: 0 }}>{id}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                                {node?.name || id}
                              </span>
                              {sc?.effort > 0 && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>
                                  {sc.effort.toFixed(0)}d
                                </span>
                              )}
                            </button>
                          </span>
                        );
                      })}
                      {chain.length === 1 && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('pr.standalone')}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
              {t('pr.chainLength', entry.scope.chainLength.toFixed(1))}
            </div>
          </div>
        );
      })}
    </>
  );
}
