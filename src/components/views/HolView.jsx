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

  const list = holidays || [];
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const byYear = sorted.reduce((acc, h) => {
    const y = (h.date || '').slice(0, 4) || '—';
    (acc[y] ||= []).push(h);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  function importNRW() {
    const nrw = computeNRW(planYears);
    const ex = new Set(list.map(h => h.date));
    onUpdate([...list, ...nrw.filter(h => !ex.has(h.date))].sort((a, b) => a.date.localeCompare(b.date)));
  }

  function upd(idx, k, v) {
    onUpdate(list.map((h, i) => i === idx ? { ...h, [k]: v, auto: false } : h));
  }

  function del(idx) {
    onUpdate(list.filter((_, i) => i !== idx));
  }

  const aC = list.filter(h => h.auto).length;
  const mC = list.filter(h => !h.auto).length;

  const smallInput = { background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 4, color: 'var(--tx)', fontSize: 11, padding: '2px 6px', fontFamily: 'var(--mono)', outline: 'none' };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-pri btn-sm" onClick={importNRW}>{t('hv.importNRW')} ({planYears.join(', ')})</button>
        <button className="btn btn-sec btn-sm" onClick={() => onUpdate([...list, { date: iso(new Date()), name: '', auto: false }])}>{t('hv.addManual')}</button>
        {list.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(t('hv.confirmClear'))) onUpdate([]); }}>{t('hv.clearAll')}</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{t('hv.stats').replace('{0}', aC).replace('{1}', mC)}</span>
      </div>

      <p className="helper" style={{ marginBottom: 10 }}>{t('hv.desc')}</p>

      {!list.length && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>📆</div>
          <div style={{ fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>{t('hv.empty')}</div>
          <button className="btn btn-pri" onClick={importNRW}>{t('hv.emptyBtn')}</button>
        </div>
      )}

      {years.map(y => (
        <div key={y} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--b)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx2)' }}>{y}</span>
            <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{byYear[y].length}</span>
          </div>
          <div className="res-row res-row-hol res-row-header">
            <span>Tag</span>
            <span>Datum</span>
            <span>Name</span>
            <span>Quelle</span>
            <span />
          </div>
          <ul className="res-list">
            {byYear[y].map(h => {
              const gi = list.indexOf(h);
              const dt = new Date(h.date);
              const dow = DOW_DE[dt.getDay()];
              return (
                <li key={h.date + gi} className="res-row res-row-hol" style={{ cursor: 'default' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{dow}</span>
                  {h.auto
                    ? <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{h.date}</span>
                    : <LazyInput type="date" value={h.date} onCommit={v => upd(gi, 'date', v)}
                        style={smallInput} />
                  }
                  {h.auto
                    ? <span className="res-row-name">{h.name}</span>
                    : <LazyInput value={h.name} onCommit={v => upd(gi, 'name', v)}
                        style={{ ...smallInput, fontFamily: 'var(--font)', fontSize: 12 }}
                        placeholder={t('hv.name')} />
                  }
                  <span className={`badge ${h.auto ? 'bo' : 'bw'}`} style={{ fontSize: 9, justifySelf: 'start' }}>
                    {h.auto ? t('hv.srcNRW') : t('hv.srcCustom')}
                  </span>
                  <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }} onClick={() => del(gi)}>×</button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
