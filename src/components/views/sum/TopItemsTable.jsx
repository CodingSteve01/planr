import { useT } from '../../../i18n.jsx';
import { aggregateProgressPct, progressPctLabel } from '../../../utils/progress.js';

// Project breakdown
export function TopItemsTable({ lvs, onNavigate, stats, timelineById, tree }) {
  const { t } = useT();
  return (
    <>
      <div className="section-h">{t('s.topItems')}</div>
      <table className="tree-tbl">
        <thead>
          <tr>
            <th>{t('col.item')}</th>
            <th className="r">{t('s.effort')}</th>
            <th className="r">{t('s.progress')}</th>
            <th>{t('s.projected')}</th>
          </tr>
        </thead>
        <tbody>
          {tree
            .filter(r => r.lvl === 1)
            .map(r => {
              const s = stats[r.id] || r;
              const timeline = timelineById[r.id];
              const leaves = lvs.filter(c => c.id === r.id || c.id.startsWith(r.id + '.'));
              const done = leaves.filter(l => l.status === 'done').length;
              const prog = aggregateProgressPct(leaves);
              return (
                <tr key={r.id} className="tr l1" style={{ cursor: 'pointer' }} onClick={() => onNavigate?.(r.id, 'tree')}>
                  <td>
                    <span className="tid">{r.id}</span>
                    <span style={{ marginLeft: 8 }}>{r.name}</span>
                  </td>
                  <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {s._r > 0 ? s._r.toFixed(0) + 'd' : ''}
                  </td>
                  <td className="nc">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 5, background: 'var(--bg4)', borderRadius: 3, minWidth: 40 }}>
                        <div
                          style={{
                            width: `${prog}%`,
                            height: '100%',
                            background: prog >= 99.95 ? 'var(--gr)' : 'var(--ac)',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <span
                        style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--tx3)', whiteSpace: 'nowrap' }}
                        data-htip={t('s.progressTip', progressPctLabel(prog))}
                      >
                        {progressPctLabel(prog)}% · {done}/{leaves.length}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: timeline?.period?.end ? 'var(--tx)' : 'var(--tx3)' }}>
                    {timeline?.period?.end
                      ? timeline.period.end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                    {timeline?.deadline?.end && (
                      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                        {t('qe.affectsDeadline')}:{' '}
                        {timeline.deadline.end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </>
  );
}
