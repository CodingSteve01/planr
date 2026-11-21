import { Icon } from '../../shared/Icon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { useT } from '../../../i18n.jsx';

export function SuccessorsField({ allIds, directSuccessors, node, onAddDep, onRemoveDep, setSuccAddKind, succAddKind, tree }) {
  const { t } = useT();
  return (
    <div className="field">
      <label>{t('qe.successors')}</label>
      {directSuccessors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
          {directSuccessors.map(s => (
            <div key={s.id} className="dep-row" style={{ opacity: s.soft ? 0.85 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span
                  title={s.soft ? 'Soft' : 'Hard'}
                  style={{
                    fontSize: 10,
                    color: s.soft ? 'var(--tx3)' : 'var(--am)',
                    flexShrink: 0,
                    fontWeight: 700,
                    letterSpacing: '.05em',
                  }}
                >
                  {s.soft ? 'S' : 'H'}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: s.soft ? 'var(--tx3)' : 'var(--ac)',
                    flexShrink: 0,
                    fontWeight: 600,
                    fontStyle: s.soft ? 'italic' : 'normal',
                  }}
                >
                  {s.id}
                </span>
                {s.name && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--tx2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      fontStyle: s.soft ? 'italic' : 'normal',
                    }}
                  >
                    {s.name}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                {onAddDep && onRemoveDep && (
                  <span
                    title={s.soft ? t('qe.dep.convertToHard') : t('qe.dep.convertToSoft')}
                    style={{
                      cursor: 'pointer',
                      opacity: 0.7,
                      fontSize: 10,
                      color: s.soft ? 'var(--am)' : 'var(--tx3)',
                      fontFamily: 'var(--mono)',
                    }}
                    onClick={() => {
                      onRemoveDep(s.id, node.id);
                      onAddDep(s.id, node.id, s.soft ? 'hard' : 'soft');
                    }}
                  >
                    {s.soft ? '→H' : '→S'}
                  </span>
                )}
                {onRemoveDep && (
                  <span
                    className="tag-x"
                    title={t('qe.dep.removeSuccessor')}
                    style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12, color: 'var(--tx3)' }}
                    onClick={() => onRemoveDep(s.id, node.id)}
                  >
                    <Icon name="x" size={9} />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {onAddDep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <SearchSelect
            options={allIds
              .filter(i => i !== node.id && !directSuccessors.some(s => s.id === i))
              .map(i => {
                const entry = tree.find(row => row.id === i);
                return { id: i, label: entry?.name || '' };
              })}
            onSelect={id => onAddDep(id, node.id, succAddKind)}
            placeholder={`+ ${succAddKind === 'hard' ? 'Hard' : 'Soft'} ${t('qe.successors')}`}
            showIds
          />
          <div style={{ display: 'flex', flexShrink: 0 }}>
            <button
              type="button"
              className={`btn btn-xs ${succAddKind === 'hard' ? 'btn-pri' : 'btn-sec'}`}
              style={{ padding: '2px 6px', fontSize: 10 }}
              onClick={() => setSuccAddKind('hard')}
              title={t('qe.dep.hard')}
            >
              H
            </button>
            <button
              type="button"
              className={`btn btn-xs ${succAddKind === 'soft' ? 'btn-pri' : 'btn-sec'}`}
              style={{ padding: '2px 6px', fontSize: 10 }}
              onClick={() => setSuccAddKind('soft')}
              title={t('qe.dep.soft')}
            >
              S
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
