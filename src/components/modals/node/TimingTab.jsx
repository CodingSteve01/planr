import { Icon } from '../../shared/Icon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { iso } from '../../../utils/date.js';

export function TimingTab({
  t,
  f,
  s,
  setF,
  node,
  tree,
  isLeaf,
  focusRefs,
  depRowRefs,
  highlightedDepId,
  handleNavigate,
  onNavigate,
  allIds,
  findById,
  inheritedDeps,
  setCompletion,
  deadlineRoot,
  deadlineRootId,
  deadlineParentExcluded,
  showDeadlineRelevant,
}) {
  return (
    <>
      {isLeaf && (
        <>
          <div className="frow">
            <div className="field">
              <label>{t('qe.decideBy')}</label>
              <input type="date" value={f.decideBy || ''} onChange={e => s('decideBy', e.target.value)} />
            </div>
            <div className="field">
              <label>
                {t('qe.due')} {f.due && <span style={{ fontSize: 11, color: 'var(--re)' }}>~</span>}
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="date" value={f.due || ''} onChange={e => s('due', e.target.value)} style={{ flex: 1 }} />
                {f.due && (
                  <button className="btn btn-ghost btn-xs" onClick={() => s('due', '')} aria-label={t('p.clear')}>
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="field">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {t('qe.pinnedStart')}
                {f.pinnedStart && <Icon name="pin" size={10} style={{ color: 'var(--am)' }} />}
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  ref={focusRefs.pinnedStart}
                  type="date"
                  value={f.pinnedStart || ''}
                  onChange={e => s('pinnedStart', e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-sec btn-xs" onClick={() => s('pinnedStart', iso(new Date()))}>
                  {t('nm.pinToday')}
                </button>
                {f.pinnedStart && (
                  <button className="btn btn-ghost btn-xs" onClick={() => s('pinnedStart', '')} aria-label={t('p.clear')}>
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="frow">
            <div className="field">
              <label>{t('qe.completedStart')}</label>
              <input
                type="date"
                value={f.completedStart || ''}
                disabled={f.status === 'open'}
                onChange={e => setCompletion({ completedStart: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('qe.completedEnd')}</label>
              <input
                type="date"
                value={f.completedEnd || ''}
                disabled={f.status !== 'done'}
                onChange={e => setCompletion({ completedEnd: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('qe.completedAt')}</label>
              <input
                type="date"
                value={f.completedAt || ''}
                disabled={f.status !== 'done'}
                onChange={e => setCompletion({ completedAt: e.target.value })}
              />
            </div>
          </div>
          <div className="helper" style={{ marginTop: -8, marginBottom: 10 }}>
            {t('qe.completedHint')}
          </div>
          <p className="helper" style={{ marginBottom: 12 }}>
            {t('qe.horizonHint')}
          </p>
        </>
      )}
      {showDeadlineRelevant && (
        <div className="field">
          <label>{t('qe.affectsDeadline')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={f.deadlineRelevant !== false}
                disabled={deadlineParentExcluded}
                onChange={e => s('deadlineRelevant', e.target.checked ? undefined : false)}
              />
              <span className="slider" />
            </label>
            <span
              style={{
                fontSize: 12,
                color: deadlineParentExcluded ? 'var(--tx3)' : f.deadlineRelevant === false ? 'var(--am)' : 'var(--tx2)',
              }}
            >
              {f.deadlineRelevant === false ? t('no') : t('yes')}
            </span>
          </div>
          <div className="helper">
            {deadlineParentExcluded
              ? t('qe.affectsDeadlineInheritedOff')
              : t('qe.affectsDeadlineHint', deadlineRoot?.name || deadlineRootId)}
          </div>
        </div>
      )}

      <div className="field">
        <label>
          {t('qe.predecessors')} {!isLeaf && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('nm.appliesToAllLeaves')}</span>}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
          {[...new Set([...(f.deps || []), ...(f.softDeps || [])])].map(d => {
            const dn = findById(d);
            const isHighlighted = highlightedDepId === d;
            return (
              <div
                key={'d_' + d}
                className="dep-row"
                ref={el => {
                  if (el) depRowRefs.current[d] = el;
                  else delete depRowRefs.current[d];
                }}
                style={
                  isHighlighted
                    ? {
                        background: 'rgba(59,130,246,.10)',
                        borderColor: 'rgba(59,130,246,.35)',
                        boxShadow: '0 0 0 1px rgba(59,130,246,.25)',
                      }
                    : undefined
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
                  {dn?.name && (
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--tx2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {dn.name}
                    </span>
                  )}
                </div>
                <span
                  className="tag-x"
                  style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }}
                  onClick={() =>
                    setF(x => {
                      const nd = (x.deps || []).filter(y => y !== d);
                      const ns = (x.softDeps || []).filter(y => y !== d);
                      const nl = { ...(x._depLabels || {}) };
                      delete nl[d];
                      return { ...x, deps: nd, softDeps: ns, _depLabels: nl };
                    })
                  }
                >
                  <Icon name="x" size={9} />
                </span>
              </div>
            );
          })}
          {inheritedDeps.map(({ dep, from }) => {
            const dn = findById(dep);
            return (
              <div key={`inh_${dep}_${from}`} className="dep-row" style={{ opacity: 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', flexShrink: 0, fontWeight: 600 }}>
                    {dep}
                  </span>
                  {dn?.name && (
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--tx3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {dn.name}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: 'var(--tx3)', flexShrink: 0 }}>{t('ph.via', from)}</span>
              </div>
            );
          })}
        </div>
        <div ref={focusRefs.deps} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <SearchSelect
            options={allIds
              .filter(i => !(f.deps || []).includes(i) && !(f.softDeps || []).includes(i))
              .map(i => ({ id: i, label: findById(i)?.name || '' }))}
            onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])}
            placeholder={`+ ${t('qe.predecessors')}`}
            showIds
          />
        </div>
      </div>

      {(() => {
        const succs = (tree || []).filter(
          r => r.id !== node.id && ((r.deps || []).includes(node.id) || (r.softDeps || []).includes(node.id)),
        );
        if (!succs.length) return null;
        return (
          <div className="field">
            <label>{t('qe.successors')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {succs.map(r => {
                return (
                  <div key={'succ_' + r.id} className="dep-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>
                        {r.id}
                      </span>
                      {r.name && (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--tx2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {r.name}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      {onNavigate && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          aria-label={t('nm.fullEditTip')}
                          data-htip={t('nm.fullEditTip')}
                          style={{ padding: '0 3px', color: 'var(--ac)' }}
                          onClick={() => handleNavigate(r.id)}
                        >
                          <Icon name="link" size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </>
  );
}
