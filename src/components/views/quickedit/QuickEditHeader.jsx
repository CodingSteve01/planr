import { SBadge } from '../../shared/Badges.jsx';
import { CriticalPathBadge } from '../../shared/CriticalPathBadge.jsx';
import { SL } from '../../../constants.js';
import { useT } from '../../../i18n.jsx';

// The item's state badges and the row of tabs under them.
export function QuickEditHeader({ activateTab, activeTab, cpLabels, f, isCp, isLeaf, isRoot, node, onEstimate, phases, setTab, tabs }) {
  const { t } = useT();
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {isLeaf && <SBadge s={node.status} />}
        {!isLeaf && (
          <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 11 }}>
            {SL[f.status] || f.status} <span style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 400 }}>{t('qe.autoStatus')}</span>
          </span>
        )}
        {!isRoot && phases.length > 0 && (
          <span className="badge bo">
            {phases.length} {t('ph.phases').toLowerCase()}
          </span>
        )}
        {isCp && <CriticalPathBadge id={node.id} labels={cpLabels} />}
        {isLeaf && onEstimate && (
          <button className={`btn btn-pri${!f.best ? ' btn-cta' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => onEstimate(node)}>
            {t('qe.estimateNow')}
          </button>
        )}
      </div>

      <div className="qe-tabs" role="tablist">
        {tabs.map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={activeTab === item.id}
            className={`qe-tab${activeTab === item.id ? ' active' : ''}`}
            onMouseDown={e => activateTab(e, () => setTab(item.id))}
            onClick={e => {
              if (e.detail === 0) setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
