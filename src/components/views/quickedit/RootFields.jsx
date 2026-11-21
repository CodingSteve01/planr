import { Icon } from '../../shared/Icon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { GT_ICON } from '../../../constants.js';
import { useT } from '../../../i18n.jsx';

// The settings only a project (a top-level item) has.
export function RootFields({ f, bufferNode, flushNode, patchNode }) {
  const { t } = useT();
  return (
    <>
      <div className="field">
        <label>{t('qe.focusType')}</label>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {['', 'goal', 'painpoint', 'deadline'].map(ft => (
            <button
              key={ft}
              className={`goal-type-btn${(f.type || '') === ft ? ' active' : ''}`}
              style={{ fontSize: 11, padding: '3px 7px' }}
              onClick={() => patchNode({ type: ft })}
            >
              {ft ? (
                <>
                  <Icon name={GT_ICON[ft]} size={12} />
                  {t(ft)}
                </>
              ) : (
                t('none')
              )}
            </button>
          ))}
        </div>
      </div>
      {f.type && (
        <div className="frow">
          <div className="field">
            <label>{t('qe.severity')}</label>
            <SearchSelect
              value={f.severity || 'high'}
              options={[
                { id: 'critical', label: t('critical') },
                { id: 'high', label: t('high') },
                { id: 'medium', label: t('medium') },
              ]}
              onSelect={value => patchNode({ severity: value })}
            />
          </div>
          {f.type === 'deadline' && (
            <div className="field">
              <label>{t('qe.date')}</label>
              <input type="date" value={f.date || ''} onChange={e => patchNode({ date: e.target.value })} />
            </div>
          )}
        </div>
      )}
      {f.type && (
        <div className="field">
          <label>{t('qe.description')}</label>
          <input
            value={f.description || ''}
            onChange={e => bufferNode({ description: e.target.value })}
            onBlur={flushNode}
            placeholder={t('qe.descPlaceholder')}
          />
        </div>
      )}
    </>
  );
}
