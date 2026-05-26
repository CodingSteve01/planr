import { useMemo } from 'react';
import {
  describeEvent,
  effectiveDateOfEvent,
  sortEventsByEffectiveDate,
} from '../../utils/historyView.js';

// Simple read-only version-history list for one item. Heavy editing happens
// elsewhere (global Time-Travel mode + raw delete here). Per-item tab is a
// quiet timeline of what happened to this leaf, sorted by effective date.
export function ItemHistoryTimeline({ item, events = [], onEventsChange }) {
  const itemEvents = useMemo(
    () => sortEventsByEffectiveDate((events || []).filter(e => e.id === item?.id)),
    [events, item?.id],
  );

  const removeAt = (idx) => {
    if (!onEventsChange) return;
    let count = -1;
    const next = (events || []).filter(e => {
      if (e.id !== item?.id) return true;
      count += 1;
      return count !== idx;
    });
    onEventsChange(next);
  };

  return (
    <div data-testid="item-history" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ padding: '8px 10px', border: '1px solid var(--b)', borderRadius: 6, background: 'var(--bg3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', fontWeight: 700 }}>{item?.id || '-'}</span>
          <span style={{ color: 'var(--tx)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name || ''}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{itemEvents.length} events</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
          Version history for this item. Use the global Time-Travel mode in the header to back-date or replay changes across the whole plan.
        </div>
      </div>

      <div style={{ border: '1px solid var(--b)', borderRadius: 6, overflow: 'hidden' }}>
        {itemEvents.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>No history for this item.</div>
        ) : itemEvents.map((ev, idx) => (
          <div data-testid="item-history-row" key={`${ev.ts}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 28px', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--b)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx2)' }}>{effectiveDateOfEvent(ev) || '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--tx)' }}>{describeEvent(ev)}</span>
            <button
              className="btn btn-ghost btn-xs"
              disabled={!onEventsChange}
              onClick={() => removeAt(idx)}
              data-htip="Delete this version entry"
              style={{ color: 'var(--re)', padding: '0 4px', fontSize: 14 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
