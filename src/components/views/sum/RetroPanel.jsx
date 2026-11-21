import { useT } from '../../../i18n.jsx';
import { aggregateSollIst } from '../../../utils/sollIst.js';

// Retro panel — only when the diff window is on. Aggregates Soll/Ist
// across leaves that completed in the window so the review tells
// the planning-accuracy story alongside the raw movement banner.
export function RetroPanel({ diff, holidayIso, onOpenItem, tree, workDays }) {
  const { t } = useT();
  const doneInWindow = (diff.doneInWindowIds || []).map(id => tree.find(r => r.id === id)).filter(Boolean);
  if (!doneInWindow.length) return null;
  const agg = aggregateSollIst(doneInWindow, { workDays, holidayIso });
  if (!agg.count) return null;
  const tone = agg.ratio == null ? 'var(--tx3)' : agg.ratio > 1.2 ? 'var(--re)' : agg.ratio < 0.8 ? 'var(--gr)' : 'var(--am)';
  const ratioStr = agg.ratio != null ? `${agg.ratio.toFixed(2)}×` : '—';
  const hitPct = agg.hitRate != null ? Math.round(agg.hitRate * 100) : null;
  const topOverruns = agg.overruns.slice(0, 3);
  const topUnderruns = agg.underruns.slice(0, 3);
  return (
    <div
      style={{
        marginBottom: 12,
        padding: '8px 10px',
        background: 'rgba(59,130,246,.06)',
        border: '1px solid rgba(59,130,246,.30)',
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: topOverruns.length || topUnderruns.length ? 6 : 0,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--ac)', fontFamily: 'var(--mono)' }}>{t('retro.title')}</span>
        <span style={{ color: 'var(--tx2)' }}>·</span>
        <span data-htip={t('retro.sumTip', agg.count)}>{t('retro.sum', agg.sollSum.toFixed(0), agg.istSum.toFixed(0))}</span>
        <span style={{ color: 'var(--tx2)' }}>·</span>
        <span style={{ color: tone, fontWeight: 700 }} data-htip={t('retro.ratioTip')}>
          {t('retro.ratio', ratioStr)}
        </span>
        {hitPct != null && (
          <>
            <span style={{ color: 'var(--tx2)' }}>·</span>
            <span data-htip={t('retro.hitRateTip')}>{t('retro.hitRate', hitPct, agg.hits, agg.count)}</span>
          </>
        )}
      </div>
      {(topOverruns.length || topUnderruns.length) > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {topOverruns.length > 0 && (
            <div style={{ flex: '1 1 200px', minWidth: 200 }}>
              <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
                {t('retro.topOver')}
              </div>
              {topOverruns.map(e => (
                <div
                  key={e.id}
                  style={{ display: 'flex', gap: 6, fontSize: 11, padding: '1px 0', cursor: 'pointer' }}
                  onClick={() => onOpenItem?.(e.id)}
                >
                  <span style={{ color: 'var(--re)', fontWeight: 700, fontFamily: 'var(--mono)', minWidth: 48 }}>+{e.delta.percent}%</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', minWidth: 70 }}>{e.id}</span>
                  <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                </div>
              ))}
            </div>
          )}
          {topUnderruns.length > 0 && (
            <div style={{ flex: '1 1 200px', minWidth: 200 }}>
              <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
                {t('retro.topUnder')}
              </div>
              {topUnderruns.map(e => (
                <div
                  key={e.id}
                  style={{ display: 'flex', gap: 6, fontSize: 11, padding: '1px 0', cursor: 'pointer' }}
                  onClick={() => onOpenItem?.(e.id)}
                >
                  <span style={{ color: 'var(--gr)', fontWeight: 700, fontFamily: 'var(--mono)', minWidth: 48 }}>{e.delta.percent}%</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', minWidth: 70 }}>{e.id}</span>
                  <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
