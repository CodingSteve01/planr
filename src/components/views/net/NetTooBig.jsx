import { Icon } from '../../shared/Icon.jsx';
import { useT } from '../../../i18n.jsx';

// Too big to draw is not the same as too big to use: say so, and offer the
// project filter instead of a dust cloud.
export function NetTooBig({ itemCount, onPickRoot, roots, setShowAll }) {
  const { t } = useT();
  return (
    <div className="pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <span style={{ color: 'var(--tx3)' }}>
          <Icon name="network" size={32} strokeWidth={1.4} />
        </span>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>{t('ng.tooBigTitle', itemCount)}</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.5 }}>{t('ng.tooBigBody')}</div>
        {onPickRoot && roots.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
            {roots.map(root => (
              <button key={root.id} type="button" className="btn btn-sec btn-sm" onClick={() => onPickRoot(root.id)}>
                {root.name || root.id}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-xs" style={{ marginTop: 2 }} onClick={() => setShowAll(true)}>
          {t('ng.tooBigAnyway')}
        </button>
      </div>
    </div>
  );
}
