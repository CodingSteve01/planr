import { localDate, diffDays } from '../../../utils/date.js';
import { fmtDateFull } from '../../../utils/briefing/briefingDates.js';
import { useT } from '../../../i18n.jsx';

export function MilestonesSection({ milestones, now, stats, onOpenItem }) {
  const { t } = useT();
  return (
    <>
      <div className="section-h">{t('bv.milestones')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        {milestones.map(m => {
          const dl = localDate(m.date);
          const daysLeft = diffDays(now, dl);
          const st = stats?.[m.id];
          const projEndOk = st?._endD ? st._endD <= dl : true;
          return (
            <div
              key={m.id}
              style={{
                background: 'var(--bg2)',
                border: `1px solid ${projEndOk ? 'var(--b)' : 'var(--re)'}`,
                borderRadius: 'var(--r)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
              onClick={() => onOpenItem?.(m.id)}
            >
              <span style={{ fontWeight: 700, flex: 1 }}>{m.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx2)' }}>{fmtDateFull(dl)}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: daysLeft <= 7 ? 'var(--re)' : 'var(--tx3)' }}>
                {daysLeft === 0 ? t('bv.today') : `${daysLeft}d`}
              </span>
              {!projEndOk && <span className="badge bc">{t('s.atRisk')}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
