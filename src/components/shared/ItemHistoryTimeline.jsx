import { useMemo, useState } from 'react';
import { effectiveDateOfEvent, patchEventEffectiveDate } from '../../utils/historyView.js';
import { eventReplayTimestamp } from '../../utils/history.js';
import { useT } from '../../i18n.jsx';
import { Icon } from './Icon.jsx';

// What happened to one item, newest first, in words.
//
// Each line says the change, not the stored event: "Open → In progress",
// "Progress 30 % → 63 %". The log stores states; a reader wants transitions,
// and the same state twice in a row is not a line at all (the log is cleaned
// of those on load — utils/history.js `compactHistory` — and anything that
// slips through is folded here too, so the list can never again be thirty
// rows of "added · wip · 63%").
//
// The list scrolls inside itself. A long history must not decide how tall the
// dialog is.
export function describeTransitions(events, t) {
  const status = s => t(s === 'wip' ? 'wip' : s === 'done' ? 'done' : 'open').replace(/^\u2713\s*/, '');
  const out = [];
  let prev = null;
  // The replay's own order (utils/history.js): what this list calls "before"
  // has to be what the review window and every replay had before, or a
  // same-day backdated entry reads as a transition that never happened.
  const ordered = (events || []).map((ev, i) => ({ ev, i, at: eventReplayTimestamp(ev) }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.i - b.i)).map(x => x.ev);
  ordered.forEach((ev, index) => {
    const date = effectiveDateOfEvent(ev);
    if (ev.kind === 'removed') {
      if (prev) out.push({ ev, index, date, parts: [t('hist.removed')] });
      prev = null;
      return;
    }
    const base = prev || { status: 'open', progress: 0 };
    const next = { status: ev.status ?? base.status, progress: ev.progress ?? base.progress };
    const parts = [];
    if (!prev) parts.push(t('hist.added', status(next.status)));
    else if (next.status !== base.status) parts.push(t('hist.status', status(base.status), status(next.status)));
    if (next.progress !== base.progress && next.status !== 'done' && (prev || next.progress > 0)) parts.push(t('hist.progress', base.progress, next.progress));
    if (ev.completedAt && next.status === 'done') parts.push(t('hist.doneOn', ev.completedAt));
    if (parts.length) out.push({ ev, index, date, parts, backdated: !!ev.effectiveAt && String(ev.ts || '').slice(0, 10) !== ev.effectiveAt });
    prev = next;
  });
  return out.reverse();
}

// A completion's day is the item's own field, and a removal has none to move.
const fixedDay = ev => !!ev.completedAt || ev.status === 'done' || ev.kind === 'removed';

// `viewDay`: an earlier day is on screen. Entries after it have not happened
// yet from there; they are shown, greyed, so it is plain what is to come.
export function ItemHistoryTimeline({ item, events = [], onEventsChange, viewDay = '' }) {
  const { t, lang } = useT();
  const itemEvents = useMemo(() => (events || []).filter(e => e.id === item?.id), [events, item?.id]);
  const lines = useMemo(() => describeTransitions(itemEvents, t), [itemEvents, t]);
  const fmt = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  };
  // Moving an entry to another day: the day it counts for changes, when it
  // was typed in stays. `editing` is the event whose date is open.
  const [editing, setEditing] = useState(null);
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const move = (ev, date) => {
    setEditing(null);
    if (!onEventsChange || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date === effectiveDateOfEvent(ev)) return;
    onEventsChange((events || []).map(e => (e === ev ? patchEventEffectiveDate(e, date) : e)));
  };
  const remove = ev => { if (onEventsChange) onEventsChange((events || []).filter(e => e !== ev)); };

  return (
    <div data-testid="item-history" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--tx3)', flex: 1, minWidth: 0 }}>{t('hist.lede')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{lines.length === 1 ? t('hist.oneEntry') : t('hist.entries', lines.length)}</span>
      </div>
      <div style={{ border: '1px solid var(--b)', borderRadius: 6, maxHeight: 'min(48vh, 420px)', overflowY: 'auto', overflowX: 'hidden' }}>
        {lines.length === 0 ? (
          <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>{t('hist.empty')}</div>
        ) : lines.map(line => (
          <div data-testid="item-history-row" key={`${line.ev.ts}-${line.index}`}
            data-later={viewDay && line.date > viewDay ? 'true' : undefined}
            data-htip={viewDay && line.date > viewDay ? t('hist.later') : undefined}
            style={{ opacity: viewDay && line.date > viewDay ? 0.45 : 1, display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) 24px', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--b)' }}>
            {editing === line.ev
              ? <input type="date" data-testid="item-history-date" autoFocus defaultValue={line.date} max={today}
                onBlur={e => move(line.ev, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); move(line.ev, e.target.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); } }}
                style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '1px 2px', width: '100%', minWidth: 0 }} />
              // A completion's day is the item's own field (Timing); moving
              // it here would leave the two saying different things.
              : <button type="button" className="btn btn-ghost btn-xs" data-testid="item-history-day" disabled={!onEventsChange || fixedDay(line.ev)}
                onClick={() => setEditing(line.ev)}
                data-htip={fixedDay(line.ev) && line.ev.kind !== 'removed' ? t('hist.moveDoneTip') : line.backdated ? `${t('hist.backdated', fmt(line.ev.ts))} · ${t('hist.moveTip')}` : t('hist.moveTip')}
                style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx2)', padding: '0 2px', justifyContent: 'flex-start' }}>{fmt(line.date)}</button>}
            <span style={{ fontSize: 12, color: 'var(--tx)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.parts.join(' · ')}</span>
            <button type="button" className="btn btn-ghost btn-xs" disabled={!onEventsChange} onClick={() => remove(line.ev)}
              data-htip={t('hist.deleteEntryTip')} aria-label={t('hist.deleteEntryTip')}
              style={{ color: 'var(--tx3)', padding: '0 4px' }}><Icon name="x" size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
