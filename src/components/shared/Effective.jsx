import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { useT } from '../../i18n.jsx';
import { usePortalRoot } from '../../utils/embedHost.js';
import { addDays, dayOf, monthAgo } from '../../utils/effective.js';

// "From which day on?" — the surface of dated changes.
//
// Built on the scenarios' pattern because it is the same kind of thing: not a
// place in the app but a state of what you are editing. A switch in the top
// bar says which day you are working on (quiet while it is today), a bar says
// so again where it cannot be missed, and the editing itself is the ordinary
// editing — a person's dialog, a team's, a meeting plan's. What differs is
// where the edit goes: into the change at that date instead of into the plan
// as it always was (utils/effective.js).
//
// The colour is the accent, not the scenario's violet: a scenario is another
// truth, this is the same truth further along.

const MENU_WIDTH = 300;

// What the Resources dialogs need to know, without threading it through every
// row and modal in between.
const EffectiveContext = createContext({ date: '', changes: [], onGo: null, onDrop: null });
export const EffectiveProvider = EffectiveContext.Provider;
export const useEffective = () => useContext(EffectiveContext);

export function useDayFormat() {
  const { lang } = useT();
  return useMemo(() => day => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  }, [lang]);
}

const firstOfNextMonth = today => { const d = new Date(today.getFullYear(), today.getMonth() + 1, 1); return dayOf(d); };
const firstOfNextQuarter = today => { const q = Math.floor(today.getMonth() / 3) + 1; return dayOf(new Date(today.getFullYear(), q * 3, 1)); };
const firstOfNextYear = today => dayOf(new Date(today.getFullYear() + 1, 0, 1));

// ── the switch in the top bar ───────────────────────────────────────────────

export function EffectiveSwitch({ date, dates, onPick, onDropDate, travel = false, canTravel = true }) {
  const { t } = useT();
  const fmt = useDayFormat();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);
  const portalRoot = usePortalRoot();
  const [flipped, setFlipped] = useState(false);
  const today = new Date();

  useEffect(() => {
    if (!open) return undefined;
    setDraft(date || '');
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true); };
  }, [open, date]);
  useEffect(() => {
    if (!open) return;
    const box = ref.current?.getBoundingClientRect?.();
    if (!box) return;
    const root = portalRoot?.getBoundingClientRect ? portalRoot : null;
    const rootBox = root?.getBoundingClientRect();
    const rightEdge = Math.min(window.innerWidth || Infinity, rootBox?.width ? rootBox.right : Infinity);
    const scale = root?.offsetWidth ? rootBox.width / root.offsetWidth : 1;
    setFlipped(rightEdge - box.left < MENU_WIDTH * (scale > 0 ? scale : 1));
  }, [open, portalRoot]);
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(EFFECTIVE_OPEN_EVENT, h);
    return () => window.removeEventListener(EFFECTIVE_OPEN_EVENT, h);
  }, []);

  const pick = day => { setOpen(false); onPick(day || ''); };
  // In the last quarter "next quarter" and "next year" are the same day, and
  // in December all three are: one chip per day, the nearest name wins.
  const quick = [
    [t('eff.nextMonth'), firstOfNextMonth(today)],
    [t('eff.nextQuarter'), firstOfNextQuarter(today)],
    [t('eff.nextYear'), firstOfNextYear(today)],
  ].filter(([, day], i, all) => all.findIndex(([, other]) => other === day) === i);
  // Earlier days: the plan as it stood, to look at and to correct.
  const earlier = [
    [t('eff.yesterday'), addDays(dayOf(today), -1)],
    [t('eff.weekAgo'), addDays(dayOf(today), -7)],
    [t('eff.monthAgo'), monthAgo(today)],
  ];

  return <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
    <button type="button" className={`btn btn-xs eff-switch${date ? ' in' : ''}${open ? ' on' : ''}`} data-testid="effective-switch"
      aria-haspopup="dialog" aria-expanded={open} aria-label={date ? t('eff.switchLabelIn', fmt(date)) : t('eff.switchLabel')}
      data-htip={travel ? t('eff.switchTipPast', fmt(date)) : date ? t('eff.switchTipIn', fmt(date)) : t('eff.switchTip')} onClick={() => setOpen(o => !o)}>
      <Icon name="calendar" size={13} />
      <span className="eff-switch-name">{travel ? t('eff.on', fmt(date)) : date ? t('eff.from', fmt(date)) : t('eff.today')}</span>
      {!date && dates.length > 0 && <span className="eff-switch-count">{dates.length}</span>}
      <Icon name="chevronDown" size={11} />
    </button>
    {open && <div role="dialog" aria-label={t('eff.menuLabel')} data-testid="effective-menu" className="layer-popover scn-menu" style={flipped ? { right: 0 } : { left: 0 }}>
      <button type="button" aria-pressed={!date} className={`scn-menu-row${!date ? ' on' : ''}`} data-testid="effective-pick-today" onClick={() => pick('')}>
        <span className="scn-menu-check eff-check">{!date && <Icon name="check" size={13} />}</span>
        <span className="scn-menu-text"><span className="scn-menu-name">{t('eff.today')}</span><span className="scn-menu-sub">{t('eff.todaySub')}</span></span>
      </button>
      {dates.length > 0 && <div className="scn-menu-head">{t('eff.planned')}</div>}
      {dates.map(d => (
        <div key={d.from} className={`scn-menu-row${d.from === date ? ' on' : ''}`}>
          <button type="button" aria-pressed={d.from === date} className="scn-menu-main" data-testid={`effective-pick-${d.from}`} onClick={() => pick(d.from)}>
            <span className="scn-menu-check eff-check">{d.from === date && <Icon name="check" size={13} />}</span>
            <span className="scn-menu-text"><span className="scn-menu-name">{t('eff.from', fmt(d.from))}</span>
              <span className="scn-menu-sub">{d.count === 1 ? t('eff.oneChange') : t('eff.nChanges', d.count)}{d.from <= dayOf(today) ? ` · ${t('eff.inEffect')}` : ''}</span></span>
          </button>
          <span className="scn-menu-actions">
            <button type="button" className="scn-icon-btn" aria-label={`${t('eff.dropDate')}: ${fmt(d.from)}`} data-htip={t('eff.dropDateTip')}
              data-testid={`effective-drop-${d.from}`} onClick={() => onDropDate(d.from)}><Icon name="trash" size={12} /></button>
          </span>
        </div>
      ))}
      <div className="scn-menu-foot">
        <div className="scn-menu-head" style={{ paddingTop: 4 }}>{t('eff.newDate')}</div>
        <div className="scn-menu-row editing">
          <span className="scn-menu-check"><Icon name="plus" size={13} /></span>
          <input type="date" className="scn-menu-input" value={draft} data-testid="effective-date-input" aria-label={t('eff.newDate')}
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && draft) pick(draft); }} />
          <button type="button" className="btn btn-pri btn-xs" data-testid="effective-date-ok" disabled={!draft} onClick={() => pick(draft)}>{t('eff.go')}</button>
        </div>
        {canTravel && <div className="eff-quick" data-testid="effective-earlier">
          {earlier.map(([label, day]) => <button key={label} type="button" className="chip" data-testid={`effective-earlier-${day}`} onClick={() => pick(day)} data-htip={fmt(day)}>{label}</button>)}
        </div>}
        <div className="eff-quick">
          {quick.map(([label, day]) => <button key={label} type="button" className="chip" data-testid={`effective-quick-${day}`} onClick={() => pick(day)} data-htip={fmt(day)}>{label}</button>)}
        </div>
        {dates.length === 0 && <p className="scn-menu-hint">{t('eff.hint')}</p>}
        {canTravel && <p className="scn-menu-hint">{t('eff.hintPast')}</p>}
      </div>
    </div>}
  </span>;
}

export const EFFECTIVE_OPEN_EVENT = 'planr:effective-open';

// ── the bar ─────────────────────────────────────────────────────────────────

export function EffectiveBar({ date, count, onResources, showResources, onDropDate, onLeave, travel = false, logStart = null }) {
  const { t } = useT();
  const fmt = useDayFormat();
  if (!date) return null;
  // An earlier day: the whole plan is on screen as it stood then.
  if (travel) {
    const partial = !logStart || date < logStart;
    return <div className="scn-bar-wrap"><div className="scn-bar eff-bar" data-testid="effective-bar" data-travel="true" role="region" aria-label={t('eff.pastLabel')}>
      <span className="scn-bar-tag eff-tag"><Icon name="calendar" size={13} />{t('eff.pastLabel')}</span>
      <span className="eff-bar-date" data-testid="effective-bar-date">{fmt(date)}</span>
      <span className="scn-bar-summary eff-bar-summary" aria-live="polite">
        <span className="scn-bar-impact">{t('eff.pastHint')}{partial ? ` ${logStart ? t('eff.pastPartial', fmt(logStart)) : t('eff.pastPartialNone')}` : ''}</span>
      </span>
      <span className="sp" />
      <button type="button" className="btn btn-sec btn-xs" data-testid="effective-leave" onClick={onLeave} data-htip={t('eff.leaveTipPast')}>{t('eff.leave')}</button>
    </div></div>;
  }
  const past = date <= dayOf(new Date());
  return <div className="scn-bar-wrap"><div className="scn-bar eff-bar" data-testid="effective-bar" role="region" aria-label={t('eff.label')}>
    <span className="scn-bar-tag eff-tag"><Icon name="calendar" size={13} />{t('eff.label')}</span>
    <span className="eff-bar-date" data-testid="effective-bar-date">{t('eff.from', fmt(date))}</span>
    <span className="scn-bar-summary eff-bar-summary" aria-live="polite">
      <span className="scn-bar-count eff-count">{!count ? t('eff.noChanges') : count === 1 ? t('eff.oneChange') : t('eff.nChanges', count)}</span>
      <span className="scn-bar-impact">{past ? t('eff.barPast') : t('eff.barHint')}</span>
    </span>
    <span className="sp" />
    {showResources && <button type="button" className="btn btn-sec btn-xs scn-wide" data-testid="effective-resources" onClick={onResources}>{t('eff.toResources')}</button>}
    {count > 0 && <button type="button" className="btn btn-ghost btn-xs scn-wide" data-testid="effective-drop" onClick={() => onDropDate(date)} data-htip={t('eff.dropDateTip')}>{t('eff.dropDate')}</button>}
    <span className="vsep" />
    <button type="button" className="btn btn-sec btn-xs" data-testid="effective-leave" onClick={onLeave} data-htip={t('eff.leaveTip')}>{t('eff.leave')}</button>
  </div></div>;
}

// ── what is planned for one person, team or meeting plan ────────────────────
// Replaces the two list editors that used to sit in the person's dialog. It
// does not edit: it says what changes when, and takes you to that day, where
// the dialog you are already in is the editor.

export function PlannedChanges({ kind, id, describe }) {
  const { t } = useT();
  const fmt = useDayFormat();
  const { date, changes, onGo, onDrop } = useEffective();
  const rows = (changes || []).filter(c => c.patch?.[kind]?.set?.[id]).map(c => ({ from: c.from, set: c.patch[kind].set[id] }));
  const today = dayOf(new Date());
  return <div className="eff-planned" data-testid="planned-changes">
    <div className="eff-planned-head">
      <span className="eff-planned-title">{t('eff.plannedTitle')}</span>
      <span className="eff-planned-hint">{date ? t('eff.plannedHintIn', fmt(date)) : t('eff.plannedHint')}</span>
    </div>
    {rows.length === 0
      ? <div className="eff-planned-empty">{t('eff.plannedEmpty')}</div>
      : rows.map(r => (
        <div key={r.from} className={`eff-planned-row${r.from === date ? ' on' : ''}`} data-testid={`planned-${r.from}`}>
          <button type="button" className="scn-link eff-planned-date" onClick={() => onGo?.(r.from)} data-htip={t('eff.goTip')} disabled={r.from === date}>
            {t('eff.from', fmt(r.from))}
          </button>
          <span className="eff-planned-text">{describe(r.set)}{r.from <= today ? ` · ${t('eff.inEffect')}` : ''}</span>
          <button type="button" className="scn-icon-btn" aria-label={`${t('eff.dropOne')}: ${fmt(r.from)}`} data-htip={t('eff.dropOne')}
            data-testid={`planned-drop-${r.from}`} onClick={() => onDrop?.(r.from, kind, id)}><Icon name="x" size={12} /></button>
        </div>
      ))}
  </div>;
}

// The words for one dated set of values. Shared so the dialogs say it alike.
export function useDescribeChange(meetingPlans = []) {
  const { t } = useT();
  return useMemo(() => {
    const planName = pid => meetingPlans.find(p => p.id === pid)?.name || pid;
    return set => {
      const parts = [];
      if (typeof set.cap === 'number') parts.push(t('eff.d.cap', Math.round(set.cap * 100)));
      if (typeof set.weeklyHours === 'number') parts.push(t('eff.d.hours', set.weeklyHours));
      if (Array.isArray(set.meetingPlanIds)) parts.push(set.meetingPlanIds.length ? t('eff.d.plans', set.meetingPlanIds.map(planName).join(', ')) : t('eff.d.noPlans'));
      if (Array.isArray(set.meetings)) parts.push(set.meetings.length ? t('eff.d.meetings', set.meetings.map(m => m.name || '?').join(', ')) : t('eff.d.noMeetings'));
      return parts.join(' · ') || t('eff.d.other');
    };
  }, [meetingPlans, t]);
}

export { addDays, dayOf };
