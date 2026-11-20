import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '../../utils/date.js';
import { searchOrders } from '../../utils/orderSearch.js';
import { useT } from '../../i18n.jsx';

// "Work out the order" in the planning review: runs utils/orderSearch.js on
// demand, shows how far it got, and lists the best orders with what each one
// gains AND costs. Nothing changes until "Apply" — the decision stays with
// whoever plans.
export function OrderSearch({ tree, reschedule, onApplyOrder, onOpenItem }) {
  const { t } = useT();
  const [state, setState] = useState(null); // last snapshot from the search
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => () => { stopRef.current = true; }, []);
  // A changed plan makes old answers wrong; drop them rather than show them.
  useEffect(() => { stopRef.current = true; setState(null); setRunning(false); }, [tree]);

  const start = async () => {
    stopRef.current = false;
    setRunning(true);
    setState(null);
    for await (const snap of searchOrders({ tree, reschedule })) {
      if (stopRef.current) break;
      setState(snap);
    }
    setRunning(false);
  };

  const name = id => tree.find(n => n.id === id)?.name || id;
  const moveText = m => (m.before ? t('or.moveBefore', m.id, m.before) : t('or.moveAfter', m.id, m.after));

  return <div data-testid="order-search">
    <p className="helper" style={{ fontSize: 11, margin: '0 0 10px' }}>{t('or.help')}</p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      {!running && <button className="btn btn-sec btn-xs" onClick={start} data-testid="order-search-start">{t('or.start')}</button>}
      {running && <button className="btn btn-sec btn-xs" onClick={() => { stopRef.current = true; setRunning(false); }}>{t('or.stop')}</button>}
      {state && <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
        {state.done ? t('or.doneRuns', state.runs) : t('or.progress', state.runs, state.maxRuns)}
      </span>}
    </div>
    {state?.done && !state.alternatives.length && <div style={{ fontSize: 12, color: 'var(--tx3)' }} data-testid="order-search-none">{t('or.none')}</div>}
    {(state?.alternatives || []).map((alt, i) => <div key={alt.order.join('|')} className="or-alt" data-or-alt={i}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{alt.moves.map(moveText).join(' · ')}</span>
        <span style={{ fontSize: 11, color: alt.missedAfter < alt.missedBefore ? 'var(--gr)' : 'var(--tx3)' }}>
          {t('or.missed', alt.missedBefore, alt.missedAfter)}
        </span>
        {state.done && <button className="btn btn-sec btn-xs" onClick={() => onApplyOrder?.(alt.order)}>{t('or.apply')}</button>}
      </div>
      {alt.order.map(id => {
        const e = alt.ends[id];
        if (!e?.before || !e?.after) return null;
        const col = e.deltaDays < 0 ? 'var(--gr)' : e.deltaDays > 0 ? 'var(--re)' : 'var(--tx3)';
        return <div key={id} className="or-row" data-or-row={id}>
          <button className="pw-link" onClick={() => onOpenItem?.(id)}>{id}</button>
          <span className="or-row-name">{name(id)}</span>
          <span className="or-row-when">{fmtDate(e.before)} → {fmtDate(e.after)}</span>
          <span className="or-row-delta" style={{ color: col }}>
            {e.deltaDays === 0 ? t('or.same') : t(e.deltaDays < 0 ? 'or.earlier' : 'or.later', Math.abs(e.deltaDays))}
          </span>
        </div>;
      })}
    </div>)}
  </div>;
}
