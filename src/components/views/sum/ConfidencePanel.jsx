import { leafProgress, scheduleEffort } from '../../../utils/scheduler.js';
import { CONF_COLOR } from '../../../constants.js';
import { useT } from '../../../i18n.jsx';

// Planning confidence
export function ConfidencePanel({ confidence, lvs, onNavigate }) {
  const { t } = useT();
  const cc = { committed: 0, estimated: 0, exploratory: 0 };
  const ccPt = { committed: 0, estimated: 0, exploratory: 0 };
  lvs
    .filter(r => r.status !== 'done')
    .forEach(r => {
      const c = confidence[r.id] || 'committed';
      cc[c]++;
      // REMAINING effort, matching the exports: counting the whole of a
      // half-finished item made the three tiers sum past the open total.
      ccPt[c] += (scheduleEffort(r) || 0) * (1 - leafProgress(r) / 100);
    });
  const total = cc.committed + cc.estimated + cc.exploratory;
  const totalPtOpen = ccPt.committed + ccPt.estimated + ccPt.exploratory;
  if (!total || !totalPtOpen) return null;
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--b)',
        borderRadius: 'var(--r)',
        padding: '12px 16px',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>{t('s.planConfidence')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', cursor: 'pointer' }} onClick={() => onNavigate?.(null, 'plan')}>
          {t('s.openPlanReview')}
        </span>
      </div>
      {/* Split by EFFORT, not item count. A 45 PT rebuild and a 1 PT typo fix
            counted the same here, so the bar could sit green while most of the
            work in it was unscoped — the same reason the progress figure is
            effort-weighted. The ●/◐/○ marks are gone: the swatch says which
            tier a row is, and the glyph said it a second time. */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8, background: 'var(--bg4)' }}>
        {ccPt.committed > 0 && (
          <div style={{ width: `${(ccPt.committed / totalPtOpen) * 100}%`, background: CONF_COLOR.committed, transition: 'width .3s' }} />
        )}
        {ccPt.estimated > 0 && (
          <div style={{ width: `${(ccPt.estimated / totalPtOpen) * 100}%`, background: CONF_COLOR.estimated, transition: 'width .3s' }} />
        )}
        {ccPt.exploratory > 0 && (
          <div
            style={{
              width: `${(ccPt.exploratory / totalPtOpen) * 100}%`,
              background: CONF_COLOR.exploratory,
              transition: 'width .3s',
            }}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--tx2)', flexWrap: 'wrap' }}>
        {[
          ['committed', cc.committed, ccPt.committed],
          ['estimated', cc.estimated, ccPt.estimated],
          ['exploratory', cc.exploratory, ccPt.exploratory],
        ].map(([key, count, pt]) => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CONF_COLOR[key], flexShrink: 0 }} />
            {t('conf.' + key)}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
              {pt > 0 ? Math.round(pt) : '?'} PT · {count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
