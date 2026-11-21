import { iso } from '../../../utils/date.js';
import { horizonLabel } from '../../../utils/horizon.js';
import { useT } from '../../../i18n.jsx';

// The figures that are not the headline: delivered, open, items, end, scope.
export function SumKpis({ done, doneR, latE, lvs, now, open, scopeDelta, tR, wip }) {
  const { t, lang } = useT();
  const isDe = lang === 'de';
  return (
    <>
      {/* The figures that are NOT the headline: different quantities, so they
        get their own row of cards rather than a line of chips beside it.
        Label above, value below, everything in mono so the column of numbers
        scans down. */}
      <div className="sum-kpis">
        <div className="sum-kpi" data-htip={t('s.donePtTip', Math.round(doneR), Math.round(tR))}>
          <span className="sum-kpi-l">{t('s.kpiDelivered')}</span>
          <span className="sum-kpi-v">{Math.round(doneR)} PT</span>
        </div>
        <div className="sum-kpi">
          <span className="sum-kpi-l">{t('s.kpiOpen')}</span>
          <span className="sum-kpi-v">{Math.max(0, Math.round(tR - doneR))} PT</span>
        </div>
        <div className="sum-kpi" data-htip={t('s.doneOf', done, wip, open, lvs.length)}>
          <span className="sum-kpi-l">{t('s.kpiItems')}</span>
          <span className="sum-kpi-v">
            {done}
            <span className="sum-kpi-sub">/{lvs.length}</span>
          </span>
        </div>
        {latE && (
          <div className="sum-kpi" data-htip={iso(latE)}>
            <span className="sum-kpi-l">{t('s.kpiEnd')}</span>
            <span className="sum-kpi-v sm">{horizonLabel(latE, null, isDe, now)}</span>
          </div>
        )}
        {scopeDelta != null && Math.abs(scopeDelta) >= 1 && (
          <div className="sum-kpi" data-htip={t('s.scopeDeltaTip')}>
            <span className="sum-kpi-l">{t('s.kpiScope')}</span>
            <span className="sum-kpi-v" style={{ color: scopeDelta >= 0 ? 'var(--st-wip)' : 'var(--st-done)' }}>
              {(scopeDelta >= 0 ? '+' : '') + Math.round(scopeDelta)} PT
            </span>
          </div>
        )}
      </div>
    </>
  );
}
