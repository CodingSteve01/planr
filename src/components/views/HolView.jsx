import { iso } from '../../utils/date.js';
import { computeNRW } from '../../utils/holidays.js';
import { DOW_DE } from '../../constants.js';
import { LazyInput } from '../shared/LazyInput.jsx';
import { useT } from '../../i18n.jsx';

export function HolView({ holidays, planStart, planEnd, onUpdate }) {
  const { t } = useT();

  const planYears = [];
  const nowY = new Date().getFullYear();
  for (let y = Math.min(nowY - 1, new Date(planStart).getFullYear()); y <= Math.max(nowY + 2, new Date(planEnd).getFullYear()); y++)
    planYears.push(y);

  const sorted = [...(holidays || [])].sort((a, b) => a.date.localeCompare(b.date));

  function importNRW() {
    const nrw = computeNRW(planYears);
    const ex = new Set((holidays || []).map(h => h.date));
    onUpdate([...(holidays || []), ...nrw.filter(h => !ex.has(h.date))].sort((a, b) => a.date.localeCompare(b.date)));
  }

  function upd(idx, k, v) {
    onUpdate((holidays || []).map((h, i) => i === idx ? { ...h, [k]: v, auto: false } : h));
  }

  function del(idx) {
    onUpdate((holidays || []).filter((_, i) => i !== idx));
  }

  const aC = (holidays || []).filter(h => h.auto).length;
  const mC = (holidays || []).filter(h => !h.auto).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="section-h" style={{ margin: 0 }}>{t('hv.title')}</div>
        <button className="btn btn-pri btn-sm" onClick={importNRW}>{t('hv.importNRW')} ({planYears.join(', ')})</button>
        <button className="btn btn-sec btn-sm" onClick={() => onUpdate([...(holidays || []), { date: iso(new Date()), name: '', auto: false }])}>{t('hv.addManual')}</button>
        {(holidays || []).length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(t('hv.confirmClear'))) onUpdate([]); }}>{t('hv.clearAll')}</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{t('hv.stats').replace('{0}', aC).replace('{1}', mC)}</span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 14 }}>{t('hv.desc')}</p>

      {!(holidays || []).length && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>📆</div>
          <div style={{ fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>{t('hv.empty')}</div>
          <button className="btn btn-pri" onClick={importNRW}>{t('hv.emptyBtn')}</button>
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table className="tree-tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>{t('hv.day')}</th>
                <th style={{ width: 110 }}>{t('hv.date')}</th>
                <th>{t('hv.name')}</th>
                <th style={{ width: 70 }}>{t('hv.source')}</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(h => {
                const gi = (holidays || []).indexOf(h);
                const dt = new Date(h.date);
                const dow = DOW_DE[dt.getDay()];
                return (
                  <tr key={h.date + gi} className="tr">
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', padding: '6px 10px' }}>{dow}</td>
                    {h.auto
                      ? <td style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '6px 10px' }}>{h.date}</td>
                      : <td style={{ padding: '4px 6px' }}>
                          <LazyInput type="date" value={h.date} onCommit={v => upd(gi, 'date', v)}
                            style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx)', fontSize: 11, padding: '3px 6px', fontFamily: 'var(--mono)', width: 110, outline: 'none' }} />
                        </td>
                    }
                    {h.auto
                      ? <td style={{ fontSize: 12, padding: '6px 10px' }}>{h.name}</td>
                      : <td style={{ padding: '4px 6px' }}>
                          <LazyInput value={h.name} onCommit={v => upd(gi, 'name', v)}
                            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx)', fontSize: 12, padding: '3px 6px', outline: 'none' }}
                            placeholder={t('hv.name')} />
                        </td>
                    }
                    <td style={{ padding: '6px 10px' }}>
                      <span className={`badge ${h.auto ? 'bo' : 'bw'}`} style={{ fontSize: 9 }}>
                        {h.auto ? t('hv.srcNRW') : t('hv.srcCustom')}
                      </span>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }} onClick={() => del(gi)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
