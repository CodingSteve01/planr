import { useEffect, useMemo, useState } from 'react';
import { stateAsOf } from '../../utils/history.js';
import {
  dateTimeLocalToIso,
  describeEvent,
  effectiveDateOfEvent,
  patchEventEffectiveDate,
  recordedDateTimeLocal,
  sortEventsByEffectiveDate,
} from '../../utils/historyView.js';

const STATUS_OPTIONS = ['', 'open', 'wip', 'done'];
const KIND_OPTIONS = ['', 'added', 'removed'];

const inputStyle = {
  background: 'var(--bg3)',
  color: 'var(--tx)',
  border: '1px solid var(--b2)',
  borderRadius: 5,
  padding: '5px 7px',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  outline: 'none',
};

function todayIso() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rowFromEvent(event, index) {
  return {
    _key: `${index}:${event.ts || ''}:${event.id || ''}:${event.completedAt || event.effectiveAt || ''}`,
    ...event,
  };
}

function stripUiFields(row) {
  const { _key, ...event } = row;
  const clean = {};
  Object.entries(event).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (key === 'progress') clean[key] = Math.max(0, Math.min(100, Number(value) || 0));
    else clean[key] = value;
  });
  return clean;
}

function stateLabel(state) {
  if (!state) return 'not present';
  const parts = [state.status || 'open', `${state.progress ?? 0}%`];
  if (state.completedAt) parts.push(`done ${state.completedAt}`);
  return parts.join(' · ');
}

export function ItemHistoryTimeline({ item, events = [], onEventsChange }) {
  const [rows, setRows] = useState(() => events.map(rowFromEvent));
  const [playDate, setPlayDate] = useState(todayIso());
  const [draft, setDraft] = useState({
    date: todayIso(),
    status: item?.status || 'wip',
    progress: item?.progress ?? (item?.status === 'done' ? 100 : item?.status === 'wip' ? 50 : 0),
    kind: '',
  });

  useEffect(() => {
    setRows(events.map(rowFromEvent));
  }, [events]);

  useEffect(() => {
    setDraft(current => ({
      ...current,
      status: item?.status || current.status || 'wip',
      progress: item?.progress ?? current.progress ?? 0,
    }));
  }, [item?.id]);

  const eventsForSave = useMemo(() => sortEventsByEffectiveDate(rows.map(stripUiFields)), [rows]);
  const originalForCompare = useMemo(() => sortEventsByEffectiveDate(events), [events]);
  const isDirty = useMemo(
    () => JSON.stringify(eventsForSave) !== JSON.stringify(originalForCompare),
    [eventsForSave, originalForCompare],
  );
  const itemRows = useMemo(
    () => sortEventsByEffectiveDate(rows.filter(row => row.id === item?.id)),
    [rows, item?.id],
  );
  const replayState = useMemo(() => {
    if (!item?.id || !playDate) return null;
    return stateAsOf(eventsForSave, `${playDate}T23:59:59`).get(item.id) || null;
  }, [eventsForSave, item?.id, playDate]);

  const patchRow = (key, patch) => setRows(current => current.map(row => row._key === key ? { ...row, ...patch } : row));
  const patchEffectiveDate = (key, date) => setRows(current => current.map(row => row._key === key ? patchEventEffectiveDate(row, date) : row));
  const removeRow = key => setRows(current => current.filter(row => row._key !== key));
  const addDraftEvent = () => {
    if (!item?.id || !draft.date) return;
    const event = {
      ts: new Date().toISOString(),
      id: item.id,
      ...(draft.kind ? { kind: draft.kind } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.progress !== '' && draft.progress != null ? { progress: +draft.progress } : {}),
    };
    const withDate = patchEventEffectiveDate(event, draft.date);
    setRows(current => [...current, rowFromEvent(withDate, `new-${Date.now()}`)]);
  };
  const apply = () => onEventsChange?.(eventsForSave);

  return (
    <div data-testid="item-history" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px', gap: 10, alignItems: 'end' }}>
        <div style={{ padding: 10, border: '1px solid var(--b)', borderRadius: 6, background: 'var(--bg3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', fontWeight: 700 }}>{item?.id || '-'}</span>
            <span style={{ color: 'var(--tx)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name || ''}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--tx2)', fontFamily: 'var(--mono)', fontSize: 11 }}>{stateLabel(replayState)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 5 }}>
            Timeline for this item. Effective dates drive replay, Subway diffs, and historical progress.
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Replay as of</label>
          <input data-testid="item-history-replay-date" type="date" value={playDate} onChange={e => setPlayDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '130px 90px 82px 88px auto', gap: 6, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Action date</label>
          <input data-testid="item-history-draft-date" type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Status</label>
          <select data-testid="item-history-draft-status" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
            {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt || '-'}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Progress</label>
          <input data-testid="item-history-draft-progress" type="number" min="0" max="100" value={draft.progress} onChange={e => setDraft(d => ({ ...d, progress: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Kind</label>
          <select data-testid="item-history-draft-kind" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
            {KIND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt || '-'}</option>)}
          </select>
        </div>
        <button data-testid="item-history-add" className="btn btn-sec btn-sm" disabled={!item?.id} onClick={addDraftEvent}>Add event</button>
      </div>

      <div style={{ border: '1px solid var(--b)', borderRadius: 6, overflow: 'hidden' }}>
        {itemRows.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>No history for this item.</div>
        ) : itemRows.map(row => (
          <div data-testid="item-history-row" key={row._key} style={{ display: 'grid', gridTemplateColumns: '124px 86px 74px 84px 150px 1fr 28px', gap: 6, alignItems: 'center', padding: '7px 8px', borderBottom: '1px solid var(--b)' }}>
            <input type="date" value={effectiveDateOfEvent(row)} onChange={e => patchEffectiveDate(row._key, e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            <select value={row.status || ''} onChange={e => patchRow(row._key, { status: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
              {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt || '-'}</option>)}
            </select>
            <input type="number" min="0" max="100" value={row.progress ?? ''} onChange={e => patchRow(row._key, { progress: e.target.value === '' ? '' : +e.target.value })} style={{ ...inputStyle, width: '100%' }} />
            <select value={row.kind || ''} onChange={e => patchRow(row._key, { kind: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
              {KIND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt || '-'}</option>)}
            </select>
            <input type="datetime-local" value={recordedDateTimeLocal(row)} onChange={e => patchRow(row._key, { ts: dateTimeLocalToIso(e.target.value) })} style={{ ...inputStyle, width: '100%' }} />
            <span style={{ color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{describeEvent(row)}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => removeRow(row._key)}>x</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: isDirty ? 'var(--am)' : 'var(--tx3)' }}>
          {isDirty ? 'History has unapplied changes.' : `${itemRows.length} events for this item.`}
        </span>
        <button data-testid="item-history-apply" className="btn btn-pri btn-sm" disabled={!isDirty || !onEventsChange} onClick={apply}>Apply history</button>
      </div>
    </div>
  );
}
