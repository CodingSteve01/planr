import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { useT } from '../../i18n.jsx';
import { usePortalRoot } from '../../utils/embedHost.js';
import { describeChanges } from '../../utils/scenario.js';
import { projectDiffers, teamDiffers, teamStory } from '../../utils/scenarioCompare.js';

// The surface of scenarios: where you are (the switch), that you are not in
// the plan (the bar), what just happened (the notice), and what the
// difference comes to (the comparison).
//
// A scenario is a state of the whole document, not a place in it, so none of
// this is a view in the tab row and none of it edits anything: the tree, the
// resources and the holidays are edited exactly as always, and what they
// change is the scenario because that is what is on screen. The one thing
// that must never be in doubt is WHICH truth is on screen — hence a bar that
// cannot be scrolled away and a frame over the whole app in the scenario's
// own colour, which nothing else in Planr uses.

const MENU_WIDTH = 300;
export const SCENARIO_NEW_EVENT = 'planr:scenario-new';

// ── formatting ──────────────────────────────────────────────────────────────

function useFmt() {
  const { t, lang } = useT();
  return useMemo(() => {
    const locale = lang === 'de' ? 'de-DE' : 'en-GB';
    const date = d => {
      if (!d) return '—';
      // A bare ISO day is a local day; `new Date('2026-03-01')` would be UTC.
      const m = typeof d === 'string' ? d.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
      const value = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
      return Number.isNaN(+value) ? String(d) : value.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
    };
    const shift = n => formatShift(t, n);
    const pt = n => `${Math.round(n * 10) / 10} ${t('pt')}`;
    return { date, shift, pt };
  }, [t, lang]);
}

// A shift in calendar days as text. Days while a week still reads as days,
// weeks beyond that: "+38 d" makes you divide, "+5 wk" does not. Shared with
// the views that mark what a scenario moves.
export function formatShift(t, n) {
  if (n == null) return '—';
  if (!n) return '±0';
  const sign = n > 0 ? '+' : '−';
  const abs = Math.abs(n);
  return abs <= 20 ? t('scn.days', `${sign}${abs}`) : t('scn.weeks', `${sign}${Math.round(abs / 7)}`);
}

export const changeCountLabel = (t, n) => (!n ? t('scn.noChanges') : n === 1 ? t('scn.oneChange') : t('scn.nChanges', n));
const conflictLabel = (t, n) => (n === 1 ? t('scn.oneConflict') : t('scn.conflicts', n));

// How many things a stored patch touches, without applying it. Only the
// fallback for scenarios saved before the count was kept on the entry.
export function patchSize(patch) {
  if (!patch) return 0;
  let n = 0;
  for (const key of ['tree', 'members', 'teams']) {
    const d = patch[key];
    if (!d) continue;
    const ids = new Set([...(d.add || []).map(e => e.id), ...(d.del || []), ...Object.keys(d.set || {}), ...Object.keys(d.unset || {})]);
    n += ids.size;
  }
  for (const key of ['vacations', 'holidays']) n += (patch[key]?.add?.length || 0) + (patch[key]?.del?.length || 0);
  n += Object.keys(patch.queues?.set || {}).length + (patch.queues?.del?.length || 0);
  n += Object.keys(patch.meta?.set || {}).length + (patch.meta?.del?.length || 0);
  n += Object.keys(patch.top || {}).length + (patch.topDel?.length || 0);
  return n;
}
const storedCount = s => (Number.isFinite(s.changes) ? s.changes : patchSize(s.patch));

// A popover that closes on an outside click and on Escape — but an Escape
// typed into one of its own text fields belongs to that field first.
function usePopover(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (e.target?.tagName === 'INPUT' && ref.current?.contains(e.target)) return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, setOpen, ref]);
}

// ── the switch in the top bar ───────────────────────────────────────────────

export function ScenarioSwitch({ scenarios, activeId, activeChanges, onSwitch, onCreate, onRename, onDelete, onDuplicate }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // name of the scenario being created
  const [renaming, setRenaming] = useState(null); // { id, name }
  const ref = useRef(null);
  const portalRoot = usePortalRoot();
  const [flipped, setFlipped] = useState(false);
  const active = scenarios.find(s => s.id === activeId) || null;
  usePopover(open, setOpen, ref);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setRenaming(null);
      return;
    }
    // Nothing to choose between yet: opening the menu IS starting a scenario.
    if (!scenarios.length) setDraft(d => (d == null ? '' : d));
  }, [open, scenarios.length]);
  // Same measuring as the file menu: room up to the edge of the app's own box.
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
  // The palette's "New scenario…" opens this menu with the name field ready.
  useEffect(() => {
    const h = () => {
      setOpen(true);
      setDraft('');
    };
    window.addEventListener(SCENARIO_NEW_EVENT, h);
    return () => window.removeEventListener(SCENARIO_NEW_EVENT, h);
  }, []);

  const pick = id => {
    setOpen(false);
    onSwitch(id);
  };
  const create = () => {
    const name = draft;
    setOpen(false);
    onCreate(name || '');
  };
  const commitRename = () => {
    if (renaming?.name.trim()) onRename(renaming.id, renaming.name);
    setRenaming(null);
  };

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={`btn btn-xs scn-switch${active ? ' in' : ''}${open ? ' on' : ''}`}
        data-testid="scenario-switch"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? t('scn.switchLabelIn', active.name) : t('scn.switchLabel')}
        onClick={() => setOpen(o => !o)}
        data-htip={active ? t('scn.switchTipIn', active.name) : t('scn.switchTip')}
      >
        <Icon name="branch" size={13} />
        <span className="scn-switch-name">{active ? active.name : t('scn.plan')}</span>
        {!active && scenarios.length > 0 && <span className="scn-switch-count">{scenarios.length}</span>}
        <Icon name="chevronDown" size={11} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('scn.menuLabel')}
          data-testid="scenario-menu"
          className="layer-popover scn-menu"
          style={flipped ? { right: 0 } : { left: 0 }}
        >
          <button
            type="button"
            aria-pressed={!active}
            className={`scn-menu-row${!active ? ' on' : ''}`}
            data-testid="scenario-pick-plan"
            onClick={() => pick(null)}
          >
            <span className="scn-menu-check">{!active && <Icon name="check" size={13} />}</span>
            <span className="scn-menu-text">
              <span className="scn-menu-name">{t('scn.plan')}</span>
              <span className="scn-menu-sub">{t('scn.planSub')}</span>
            </span>
          </button>
          {scenarios.length > 0 && <div className="scn-menu-head">{t('scn.scenarios')}</div>}
          {scenarios.map(s => {
            const isActive = s.id === activeId;
            const count = isActive ? activeChanges : storedCount(s);
            if (renaming?.id === s.id) {
              return (
                <div key={s.id} className="scn-menu-row editing">
                  <span className="scn-menu-check" />
                  <input
                    autoFocus
                    className="scn-menu-input"
                    value={renaming.name}
                    data-testid="scenario-rename-input"
                    aria-label={t('scn.rename')}
                    onChange={e => setRenaming({ id: s.id, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    // Clicking away is not "save": a half-typed name stays unsaved.
                    onBlur={() => setRenaming(null)}
                  />
                  <button type="button" className="btn btn-pri btn-xs" onMouseDown={e => e.preventDefault()} onClick={commitRename}>
                    {t('save')}
                  </button>
                </div>
              );
            }
            return (
              <div key={s.id} className={`scn-menu-row${isActive ? ' on' : ''}`}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  className="scn-menu-main"
                  data-testid={`scenario-pick-${s.id}`}
                  onClick={() => pick(s.id)}
                >
                  <span className="scn-menu-check">{isActive && <Icon name="check" size={13} />}</span>
                  <span className="scn-menu-text">
                    <span className="scn-menu-name">{s.name}</span>
                    <span className="scn-menu-sub">
                      {changeCountLabel(t, count)}
                      {s.lost ? ` · ${conflictLabel(t, s.lost)}` : ''}
                    </span>
                  </span>
                </button>
                <span className="scn-menu-actions">
                  <button
                    type="button"
                    className="scn-icon-btn"
                    aria-label={`${t('scn.rename')}: ${s.name}`}
                    data-htip={t('scn.rename')}
                    data-testid={`scenario-rename-${s.id}`}
                    onClick={() => setRenaming({ id: s.id, name: s.name })}
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                  <button
                    type="button"
                    className="scn-icon-btn"
                    aria-label={`${t('scn.duplicate')}: ${s.name}`}
                    data-htip={t('scn.duplicate')}
                    data-testid={`scenario-duplicate-${s.id}`}
                    onClick={() => {
                      setOpen(false);
                      onDuplicate(s.id);
                    }}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                  {/* The scenario on screen is deleted from its own bar, where what
                that means (you leave it) is visible. */}
                  {!isActive && (
                    <button
                      type="button"
                      className="scn-icon-btn"
                      aria-label={`${t('scn.delete')}: ${s.name}`}
                      data-htip={t('scn.deleteTip')}
                      data-testid={`scenario-delete-${s.id}`}
                      onClick={() => onDelete(s.id)}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <div className="scn-menu-foot">
            {scenarios.length === 0 && <p className="scn-menu-hint">{t('scn.hint')}</p>}
            {draft == null ? (
              <button type="button" className="scn-menu-row add" data-testid="scenario-new" onClick={() => setDraft('')}>
                <span className="scn-menu-check">
                  <Icon name="plus" size={13} />
                </span>
                <span className="scn-menu-text">
                  <span className="scn-menu-name">{t('scn.new')}</span>
                  <span className="scn-menu-sub">{active ? t('scn.newSubIn') : t('scn.newSub')}</span>
                </span>
              </button>
            ) : (
              <div className="scn-menu-row editing">
                <span className="scn-menu-check">
                  <Icon name="plus" size={13} />
                </span>
                <input
                  autoFocus
                  className="scn-menu-input"
                  value={draft}
                  placeholder={t('scn.namePlaceholder')}
                  data-testid="scenario-new-input"
                  aria-label={t('scn.new')}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') create();
                    if (e.key === 'Escape') {
                      if (scenarios.length) setDraft(null);
                      else setOpen(false);
                    }
                  }}
                />
                <button type="button" className="btn btn-pri btn-xs" data-testid="scenario-new-ok" onClick={create}>
                  {t('scn.create')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

// ── the bar that says you are not in the plan ───────────────────────────────

export function scenarioHeadline(t, fmt, totals, changeCount) {
  if (!changeCount) return t('scn.barEmpty');
  if (!totals) return '';
  const ends = [];
  if (totals.later) ends.push(t('scn.barLater', totals.later, fmt.shift(totals.maxLater)));
  if (totals.earlier) ends.push(t('scn.barEarlier', totals.earlier, fmt.shift(totals.maxEarlier)));
  const parts = [];
  // First how wide it reaches, then how far: a project whose end holds while
  // half its tasks slip is affected, and the bar must not read as if it were not.
  if (totals.affected > (totals.later || 0) + (totals.earlier || 0)) parts.push(t('scn.barAffected', totals.affected));
  if (ends.length) parts.push(`${t('scn.barEnds')} ${ends.join(', ')}`);
  if (totals.newlyLate) parts.push(t('scn.barNewlyLate', totals.newlyLate));
  if (totals.rescued) parts.push(t('scn.barRescued', totals.rescued));
  if (!parts.length) parts.push(totals.itemsMoved ? t('scn.barItemsOnly', totals.itemsMoved) : t('scn.barNoShift'));
  return parts.join(' · ');
}

export function ScenarioBar({
  scenario,
  changeCount,
  comparison,
  conflicts,
  onRename,
  onDuplicate,
  onCompare,
  onApply,
  onDelete,
  onLeave,
}) {
  const { t } = useT();
  const fmt = useFmt();
  const [editing, setEditing] = useState(null);
  const [more, setMore] = useState(false);
  const moreRef = useRef(null);
  usePopover(more, setMore, moreRef);
  if (!scenario) return null;
  const totals = comparison?.totals;
  const commit = () => {
    if (editing != null && editing.trim() && editing.trim() !== scenario.name) onRename(scenario.id, editing);
    setEditing(null);
  };
  const tone = totals?.newlyLate ? 'var(--st-risk)' : undefined;
  const menuItem = (id, icon, label, run, danger) => (
    <button
      type="button"
      className={`scn-more-item${danger ? ' danger' : ''}`}
      data-testid={`scenario-${id}`}
      onClick={() => {
        setMore(false);
        run();
      }}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
  // The wrapper is the size container: an Obsidian pane is narrow while the
  // window is wide, so the bar answers to its own width, not the viewport's.
  return (
    <div className="scn-bar-wrap">
      <div className="scn-bar" data-testid="scenario-bar" role="region" aria-label={t('scn.label')}>
        <span className="scn-bar-tag">
          <Icon name="branch" size={13} />
          {t('scn.label')}
        </span>
        {editing == null ? (
          <button
            type="button"
            className="scn-bar-name"
            data-testid="scenario-bar-name"
            onClick={() => setEditing(scenario.name)}
            aria-label={`${t('scn.renameTip')}: ${scenario.name}`}
            data-htip={t('scn.renameTip')}
          >
            {scenario.name}
          </button>
        ) : (
          <input
            autoFocus
            className="scn-bar-input"
            value={editing}
            aria-label={t('scn.rename')}
            data-testid="scenario-bar-input"
            onChange={e => setEditing(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(null);
              }
            }}
          />
        )}
        <button
          type="button"
          className="scn-bar-summary"
          data-testid="scenario-bar-summary"
          onClick={onCompare}
          data-htip={t('scn.compareTip')}
          aria-live="polite"
        >
          <span className="scn-bar-count">{changeCountLabel(t, changeCount)}</span>
          <span className="scn-bar-impact" style={tone ? { color: tone } : undefined}>
            {scenarioHeadline(t, fmt, totals, changeCount)}
          </span>
        </button>
        {conflicts > 0 && (
          <button
            type="button"
            className="scn-bar-warn"
            data-testid="scenario-bar-conflicts"
            onClick={onCompare}
            data-htip={t('scn.conflictTip')}
          >
            <Icon name="alert" size={12} />
            {conflictLabel(t, conflicts)}
          </button>
        )}
        <span className="sp" />
        <button type="button" className="btn btn-sec btn-xs scn-wide" data-testid="scenario-compare" onClick={onCompare}>
          {t('scn.compare')}
        </button>
        <button
          type="button"
          className="btn btn-xs scn-apply"
          data-testid="scenario-apply"
          disabled={!changeCount}
          onClick={onApply}
          data-htip={t('scn.applyTip')}
        >
          <span className="scn-wide">{t('scn.apply')}</span>
          <span className="scn-narrow">{t('scn.applyShort')}</span>
        </button>
        <span className="vsep" />
        {/* The way out is never the control that gets clipped: it keeps its place
        and its label at every width. */}
        <button type="button" className="btn btn-sec btn-xs" data-testid="scenario-leave" onClick={onLeave} data-htip={t('scn.leaveTip')}>
          {t('scn.leave')}
        </button>
        <span ref={moreRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            className={`btn btn-ghost btn-xs${more ? ' on' : ''}`}
            data-testid="scenario-more"
            aria-haspopup="menu"
            aria-expanded={more}
            aria-label={t('scn.more')}
            data-htip={t('scn.more')}
            onClick={() => setMore(m => !m)}
          >
            <Icon name="more" size={14} />
          </button>
          {more && (
            <div className="layer-popover scn-more" data-testid="scenario-more-menu">
              {menuItem('rename', 'pencil', t('scn.rename'), () => setEditing(scenario.name))}
              {menuItem('duplicate', 'copy', t('scn.duplicate'), () => onDuplicate(scenario.id))}
              {menuItem('discard', 'trash', t('scn.deleteThis'), () => onDelete(scenario.id), true)}
            </div>
          )}
        </span>
      </div>
    </div>
  );
}

// What just happened, where the bar was, with the way back.
export function ScenarioNotice({ notice, onUndo, onClose }) {
  const { t } = useT();
  if (!notice) return null;
  const text =
    notice.kind === 'applied'
      ? t('scn.noticeApplied', notice.name, changeCountLabel(t, notice.changes))
      : t('scn.noticeDeleted', notice.name);
  return (
    <div className="scn-notice-bar" data-testid="scenario-notice" role="status">
      <Icon name={notice.kind === 'applied' ? 'check' : 'trash'} size={13} />
      <span className="scn-notice-text">{text}</span>
      <button type="button" className="btn btn-sec btn-xs" data-testid="scenario-notice-undo" onClick={onUndo}>
        {t('scn.noticeUndo')}
      </button>
      <span className="sp" />
      <button type="button" className="scn-icon-btn" aria-label={t('close')} onClick={onClose}>
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

// ── the comparison ──────────────────────────────────────────────────────────

const FIELD_LABELS = {
  name: 'scn.f.name',
  assign: 'scn.f.assign',
  team: 'scn.f.team',
  best: 'scn.f.best',
  factor: 'scn.f.factor',
  prio: 'scn.f.prio',
  status: 'scn.f.status',
  progress: 'scn.f.progress',
  deps: 'scn.f.deps',
  softDeps: 'scn.f.softDeps',
  pinnedStart: 'scn.f.pinnedStart',
  decideBy: 'scn.f.decideBy',
  date: 'scn.f.date',
  dropped: 'scn.f.dropped',
  displayOrder: 'scn.f.order',
  note: 'scn.f.note',
  description: 'scn.f.description',
  phases: 'scn.f.phases',
  cap: 'scn.f.cap',
  start: 'scn.f.start',
  end: 'scn.f.end',
  vac: 'scn.f.vac',
  teams: 'scn.f.teams',
  role: 'scn.f.role',
  weeklyHours: 'scn.f.weeklyHours',
  capMode: 'scn.f.capMode',
  meetings: 'scn.f.meetings',
  capChanges: 'scn.f.capChanges',
  meetingChanges: 'scn.f.meetingChanges',
  meetingPlanIds: 'scn.f.meetingPlans',
  teamLock: 'scn.f.teamLock',
  confidence: 'scn.f.confidence',
  handoffPlan: 'scn.f.handoff',
  color: 'scn.f.color',
  order: 'scn.f.order',
  planStart: 'scn.f.planStart',
  planEnd: 'scn.f.planEnd',
  workDays: 'scn.f.workDays',
  severity: 'scn.f.severity',
  type: 'scn.f.type',
  customValues: 'scn.f.custom',
  fixedDays: 'scn.f.fixedDays',
  due: 'scn.f.due',
};
// Fields whose value is a structure: saying THAT it changed is the honest
// amount of detail for one line.
const OPAQUE = new Set([
  'phases',
  'meetings',
  'capChanges',
  'meetingChanges',
  'meetingPlanIds',
  'handoffPlan',
  'customValues',
  'note',
  'description',
  'order',
  'displayOrder',
  'workDays',
]);
const DATE_FIELDS = new Set(['pinnedStart', 'decideBy', 'date', 'start', 'end', 'planStart', 'planEnd', 'due']);
const PRIO_KEYS = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };

function useFieldText(base, work, fmt) {
  const { t } = useT();
  return useMemo(() => {
    const members = new Map([...(base?.members || []), ...(work?.members || [])].map(m => [m.id, m.name || m.id]));
    const teams = new Map([...(base?.teams || []), ...(work?.teams || [])].map(tm => [tm.id, tm.name || tm.id]));
    const items = new Map([...(base?.tree || []), ...(work?.tree || [])].map(n => [n.id, n.name || '']));
    const none = '—';
    const value = (key, v) => {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return none;
      if (key === 'assign') return v.map(id => members.get(id) || id).join(', ');
      if (key === 'team') return teams.get(v) || v;
      if (key === 'teams') return v.map(id => teams.get(id) || id).join(', ');
      if (key === 'deps' || key === 'softDeps') return v.map(id => (items.get(id) ? `${id} ${items.get(id)}` : id)).join(', ');
      if (key === 'status' || key === 'severity' || key === 'type') return t(v);
      if (key === 'prio') return PRIO_KEYS[v] ? t(PRIO_KEYS[v]) : String(v);
      if (key === 'confidence') return t(`conf.${v}`);
      if (key === 'capMode') return t(v === 'derived' ? 'scn.capDerived' : 'scn.capManual');
      if (DATE_FIELDS.has(key)) return fmt.date(v);
      if (key === 'best' || key === 'fixedDays') return `${v} ${t('pt')}`;
      if (key === 'factor') return `×${v}`;
      if (key === 'progress') return `${v} %`;
      if (key === 'cap') return `${Math.round(v * 100)} %`;
      if (key === 'weeklyHours') return `${v} h`;
      if (key === 'dropped' || key === 'teamLock') return v ? t('yes') : t('no');
      if (Array.isArray(v)) return v.join(', ');
      if (typeof v === 'object') return '…';
      return String(v);
    };
    // Fields without a name the user would recognise are counted, not shown:
    // a raw key in a list you are about to apply reads as a bug.
    const fields = list => {
      const known = list.filter(f => FIELD_LABELS[f.key]);
      const parts = known.map(f =>
        OPAQUE.has(f.key) ? t(FIELD_LABELS[f.key]) : `${t(FIELD_LABELS[f.key])}: ${value(f.key, f.from)} → ${value(f.key, f.to)}`,
      );
      const other = list.length - known.length;
      if (other) parts.push(other === 1 ? t('scn.otherField') : t('scn.otherFields', other));
      return parts.join(' · ');
    };
    const person = id => members.get(id) || id;
    const owner = key => (key.startsWith('team:') ? teams.get(key.slice(5)) || key.slice(5) : members.get(key) || key);
    return { fields, person, owner };
  }, [base, work, t, fmt]);
}

function changeTitle(c, t, text, fmt) {
  if (c.kind === 'item') return { id: c.id, title: c.name || c.id };
  if (c.kind === 'person' || c.kind === 'team') return { title: c.name || c.id };
  if (c.kind === 'absence')
    return { title: `${text.person(c.person)} · ${fmt.date(c.from)} – ${fmt.date(c.to)}${c.note ? ` · ${c.note}` : ''}` };
  if (c.kind === 'holiday') return { title: `${fmt.date(c.date)}${c.name ? ` · ${c.name}` : ''}` };
  if (c.kind === 'order') return { title: text.owner(c.id) };
  const setKey = `scn.set.${c.name}`;
  return { title: FIELD_LABELS[c.name] ? t(FIELD_LABELS[c.name]) : t(setKey) === setKey ? t('scn.set.other') : t(setKey) };
}

const KIND_ORDER = ['item', 'person', 'absence', 'order', 'team', 'holiday', 'setting'];

// One predicate per table, used for the tab's count AND the rows under it —
// a number that changes when you look at it costs trust in all the others.
const personDiffers = p => !!p.effortShift || !!p.untilShift || p.presence !== 'both' || p.baseTasks !== p.workTasks;

// Red and green are for a target date crossed, in either direction. A bar
// that merely moves is neither good nor bad, so it has no colour of its own.
const projectTone = p =>
  p.workLate && !p.baseLate
    ? 'var(--st-risk)'
    : p.baseLate && !p.workLate && p.presence === 'both'
      ? 'var(--st-done)'
      : p.shift
        ? 'var(--tx)'
        : 'var(--tx3)';
const plainTone = n => (n ? 'var(--tx)' : 'var(--tx3)');

function Tile({ label, figures, sub, testid, onClick }) {
  const body = (
    <>
      <div className="scn-tile-label">{label}</div>
      <div className="scn-tile-figures">
        {figures.map((f, i) => (
          <span key={i} className="scn-figure">
            <span className="scn-figure-n" style={f.tone ? { color: f.tone } : undefined}>
              {f.n}
            </span>
            {f.label && <span className="scn-figure-label">{f.label}</span>}
          </span>
        ))}
      </div>
      {sub && <div className="scn-tile-sub">{sub}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className="scn-tile" data-testid={testid} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="scn-tile" data-testid={testid}>
      {body}
    </div>
  );
}

// A shift as a bar from the centre line: left is earlier, right is later, and
// the longest bar in the table is the scale for all of them.
function ShiftBar({ shift, max, tone }) {
  if (!shift || !max)
    return (
      <span className="scn-shiftbar" aria-hidden="true">
        <i />
      </span>
    );
  const pct = Math.max(4, Math.round((Math.abs(shift) / max) * 50));
  return (
    <span className="scn-shiftbar" aria-hidden="true">
      <i />
      <b style={{ width: `${pct}%`, ...(shift > 0 ? { left: '50%' } : { right: '50%' }), ...(tone ? { background: tone } : {}) }} />
    </span>
  );
}

const TAB_IDS = ['projects', 'teams', 'people', 'items', 'changes'];

const capPct = n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)} %`;

// What the changes mean, a sentence per affected team (the facts come from
// utils/scenarioCompare.js, `teamStory`). Shared by the dialog and the PDF.
function storyLines(t, fmt, teams) {
  return teamStory(teams).map(f => {
    const parts = [];
    const cap = f.capNew ? t('scn.story.capNew') : f.capPct ? t('scn.story.cap', capPct(f.capPct)) : '';
    if (f.people) parts.push(`${t('scn.story.people', f.people[0], f.people[1])}${cap ? ` (${cap})` : ''}`);
    else if (cap) parts.push(cap);
    if (f.moved > 0)
      parts.push(f.movedProjects > 1 ? t('scn.story.movedIn', f.moved, f.total, f.movedProjects) : t('scn.story.moved', f.moved, f.total));
    if (f.gone > 0) parts.push(t('scn.story.gone', f.gone));
    if (f.added > 0) parts.push(t('scn.story.added', f.added));
    if (f.end === 'later') parts.push(t('scn.story.later', fmt.shift(f.shift).replace('+', '')));
    else if (f.end === 'earlier') parts.push(t('scn.story.earlier', fmt.shift(f.shift).replace('−', '')));
    else if (f.end === 'same') parts.push(t('scn.story.sameEnd'));
    return { id: f.id, name: f.name, text: parts.map(p => `${p}.`).join(' ') };
  });
}

// "20 of 59 · up to +13 wk", for a project or a team.
function movedText(t, fmt, x) {
  const parts = [t('scn.ofTotal', x.moved, x.total)];
  if (x.maxItemLater > 0) parts.push(t('scn.upTo', fmt.shift(x.maxItemLater)));
  if (x.maxItemEarlier < 0) parts.push(t('scn.upTo', fmt.shift(x.maxItemEarlier)));
  if (x.gone > 0) parts.push(t('scn.nGone', x.gone));
  if (x.added > 0) parts.push(t('scn.nAdded', x.added));
  return parts.join(' · ');
}

const REPORT_TASK_LIMIT = 40;

// The comparison as a document: the same figures and the same words as the
// dialog, as plain rows a PDF can lay out (utils/scenarioReport.js). Built
// here, beside the dialog, so the two cannot drift — a report that says
// something else than the screen it was exported from is worse than none.
// Returns a function; nothing is computed until somebody asks for the PDF.
export function useScenarioReport({ scenario, planName, base, work, comparison, changes, conflicts }) {
  const { t, lang } = useT();
  const fmt = useFmt();
  const text = useFieldText(base, work, fmt);
  return useMemo(() => {
    if (!scenario || !comparison) return null;
    return () => {
      const totals = comparison.totals || {};
      const list = changes || [];
      const bold = (value, tone) => ({ text: value, bold: true, ...(tone ? { tone } : {}) });
      const projectState = p => {
        if (p.workLate && !p.baseLate) return { text: t('scn.nowLate'), tone: 'risk', bold: true };
        if (p.baseLate && !p.workLate && p.presence === 'both') return { text: t('scn.nowOnTime'), tone: 'done', bold: true };
        if (p.presence === 'added') return t('scn.added');
        if (p.presence === 'removed') return t('scn.removed');
        // Both can be true and both matter: late in the plan already, and
        // the end is not what moves.
        return [p.workLate ? t('scn.stillLate') : '', !p.shift && p.moved > 0 ? t('scn.endHeld') : ''].filter(Boolean).join(' · ');
      };
      const presenceOf = x =>
        x.presence === 'added'
          ? ` (${t('scn.added')})`
          : x.presence === 'removed'
            ? ` (${t('scn.removed')})`
            : x.presence === 'dropped'
              ? ` (${t('scn.droppedBadge')})`
              : x.presence === 'unscheduled'
                ? ` (${t('scn.unscheduled')})`
                : x.presence === 'scheduled'
                  ? ` (${t('scn.newlyScheduled')})`
                  : '';
      const projects = (comparison.projects || []).filter(projectDiffers);
      const teams = (comparison.teams || []).filter(teamDiffers);
      const people = (comparison.people || []).filter(personDiffers);
      const items = comparison.items || [];
      const opMark = c => (c.op === 'add' ? '+' : c.op === 'remove' ? '−' : '~');
      const sections = [
        {
          id: 'changes',
          title: t('scn.report.assumptions'),
          empty: t('scn.empty.changes'),
          headers: ['', t('scn.col.kind'), t('scn.col.what'), t('scn.col.detail')],
          widths: [10, 95, 230, '*'],
          rows: KIND_ORDER.flatMap(kind =>
            list
              .filter(c => c.kind === kind)
              .map(c => {
                const head = changeTitle(c, t, text, fmt);
                const detail =
                  c.op === 'add'
                    ? t('scn.added')
                    : c.op === 'remove'
                      ? t('scn.removed')
                      : c.kind === 'order'
                        ? t('scn.f.order')
                        : text.fields(c.fields);
                return [opMark(c), t(`scn.kind.${kind}`), `${head.id ? `${head.id}  ` : ''}${head.title}`, detail];
              }),
          ),
        },
        {
          id: 'projects',
          title: t('scn.tab.projects'),
          empty: t('scn.empty.projects'),
          headers: [
            t('scn.col.project'),
            t('scn.col.deadline'),
            t('scn.col.planEnd'),
            t('scn.col.scnEnd'),
            t('scn.col.shift'),
            t('scn.col.movedTasks'),
            '',
          ],
          widths: ['*', 52, 56, 62, 72, 150, 110],
          rows: projects.map(p => [
            `${p.id}  ${p.name}`,
            p.date ? fmt.date(p.date) : '—',
            fmt.date(p.baseEnd),
            fmt.date(p.workEnd),
            bold(fmt.shift(p.shift), p.workLate && !p.baseLate ? 'risk' : p.baseLate && !p.workLate ? 'done' : null),
            movedText(t, fmt, p),
            projectState(p),
          ]),
        },
        {
          id: 'teams',
          title: t('scn.tab.teams'),
          empty: t('scn.empty.teams'),
          headers: [
            t('scn.col.team'),
            t('scn.col.people'),
            t('scn.col.capacity'),
            t('scn.col.movedTasks'),
            t('scn.col.teamEnd'),
            t('scn.col.shift'),
          ],
          widths: ['*', 70, 70, 170, 130, 70],
          rows: teams.map(tm => [
            `${tm.name}${presenceOf(tm)}`,
            tm.basePeople === tm.workPeople ? String(tm.workPeople) : bold(`${tm.basePeople} → ${tm.workPeople}`),
            tm.capNew ? bold(t('scn.capNew')) : tm.capShiftPct ? bold(capPct(tm.capShiftPct)) : '±0',
            movedText(t, fmt, tm),
            `${fmt.date(tm.baseUntil)} → ${fmt.date(tm.workUntil)}`,
            bold(fmt.shift(tm.untilShift)),
          ]),
        },
        {
          id: 'people',
          title: t('scn.tab.people'),
          empty: t('scn.empty.people'),
          headers: [t('scn.col.person'), t('scn.col.load'), t('scn.col.loadShift'), t('scn.col.busyUntil'), t('scn.col.shift')],
          widths: ['*', 150, 80, 150, 70],
          rows: people.map(p => [
            `${p.name}${presenceOf(p)}`,
            `${fmt.pt(p.baseEffort)} → ${fmt.pt(p.workEffort)}`,
            p.effortShift ? bold(`${p.effortShift > 0 ? '+' : '−'}${fmt.pt(Math.abs(p.effortShift))}`) : '±0',
            `${fmt.date(p.baseUntil)} → ${fmt.date(p.workUntil)}`,
            bold(fmt.shift(p.untilShift)),
          ]),
        },
        {
          id: 'items',
          title: t('scn.report.tasks'),
          empty: t('scn.empty.items'),
          headers: [t('scn.col.item'), t('scn.col.plan'), t('scn.col.scenario'), t('scn.col.who'), t('scn.col.shift')],
          widths: ['*', 105, 105, 150, 72],
          rows: items
            .slice(0, REPORT_TASK_LIMIT)
            .map(i => [
              `${i.id}  ${i.name}${presenceOf(i)}`,
              i.baseStart ? `${fmt.date(i.baseStart)} – ${fmt.date(i.baseEnd)}` : '—',
              i.workStart ? `${fmt.date(i.workStart)} – ${fmt.date(i.workEnd)}` : '—',
              i.peopleChanged
                ? `${i.basePeople.map(text.person).join(', ') || '—'} → ${i.workPeople.map(text.person).join(', ') || '—'}`
                : (i.workPeople.length ? i.workPeople : i.basePeople).map(text.person).join(', '),
              bold(fmt.shift(i.endShift)),
            ]),
          note: items.length > REPORT_TASK_LIMIT ? t('scn.moreItems', items.length - REPORT_TASK_LIMIT) : '',
        },
      ];
      return {
        lang,
        planName: planName || '',
        scenarioName: scenario.name || '',
        // The line on every page's footer, in the language's own quotation marks.
        footerName: t('scn.exportSuffix', planName || '', scenario.name || ''),
        kind: t('scn.report.kind'),
        title: t('scn.report.title'),
        subtitle: t('scn.report.sub', planName || '', scenario.name || '', fmt.date(new Date())),
        lede: t('scn.compareLede'),
        story: storyLines(t, fmt, comparison.teams || []).map(l => ({ name: l.name, text: l.text })),
        conflict: conflicts > 0 ? (conflicts === 1 ? t('scn.conflictNoteOne') : t('scn.conflictNote', conflicts)) : '',
        kpis: [
          {
            label: t('scn.kpi.dates'),
            sub: t('scn.kpi.datesSub'),
            figures: [
              { n: String(totals.newlyLate || 0), label: t('scn.kpi.newlyLate'), tone: totals.newlyLate ? 'risk' : null },
              { n: String(totals.rescued || 0), label: t('scn.kpi.rescued'), tone: totals.rescued ? 'done' : null },
            ],
          },
          {
            label: t('scn.kpi.projects'),
            sub: t('scn.kpi.projectsSub', (comparison.projects || []).length),
            figures: [
              { n: String(totals.affected || 0), label: t('scn.kpi.affected') },
              { n: String(totals.later || 0), label: t('scn.kpi.endLater') },
              { n: String(totals.earlier || 0), label: t('scn.kpi.endEarlier') },
            ],
          },
          {
            label: t('scn.kpi.end'),
            sub: totals.baseEnd || totals.workEnd ? `${fmt.date(totals.baseEnd)} → ${fmt.date(totals.workEnd)}` : '',
            figures: [{ n: fmt.shift(totals.endShift) }],
          },
          { label: t('scn.tab.changes'), sub: t('scn.kpi.itemsSub', totals.itemsMoved || 0), figures: [{ n: String(list.length) }] },
        ],
        sections,
        foot: t('scn.report.foot'),
      };
    };
  }, [scenario, planName, comparison, changes, conflicts, t, lang, fmt, text]);
}

// `memory` is a plain object the App keeps for the length of a scenario
// visit: which tab was open, whether "only what differs" was on. Jumping to a
// task and coming back lands where you left, not on the first tab.
export function ScenarioCompare({
  scenario,
  base,
  work,
  comparison,
  changes,
  conflicts,
  memory,
  onClose,
  onApply,
  onRevert,
  onOpenItem,
  onExport,
}) {
  const { t } = useT();
  const fmt = useFmt();
  const text = useFieldText(base, work, fmt);
  const [tab, setTabState] = useState(() => (TAB_IDS.includes(memory?.tab) ? memory.tab : 'projects'));
  const [onlyMoved, setOnlyMovedState] = useState(() => memory?.onlyMoved !== false);
  const setTab = id => {
    setTabState(id);
    if (memory) memory.tab = id;
  };
  const setOnlyMoved = v => {
    setOnlyMovedState(v);
    if (memory) memory.onlyMoved = v;
  };
  const [exporting, setExporting] = useState(false);
  const dialogRef = useRef(null);
  // A dialog: focus goes in, Tab stays in, and on close focus returns to
  // whatever opened it.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus?.();
    return () => {
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input, [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const list = changes || describeChanges(base, work);
  const totals = comparison?.totals || {};
  const projects = comparison?.projects || [];
  const people = comparison?.people || [];
  const items = comparison?.items || [];
  const differingProjects = projects.filter(projectDiffers);
  const teams = comparison?.teams || [];
  const differingTeams = teams.filter(teamDiffers);
  const shownTeams = onlyMoved ? differingTeams : teams;
  const maxTeamShift = Math.max(0, ...teams.map(tm => Math.abs(tm.untilShift || 0)));
  // What the changes mean, in a sentence per team: the step from "one person
  // is out" to "this team has less, so all of its work moves". Teams whose
  // people or capacity changed come first, then by how far their work moves.
  const story = storyLines(t, fmt, teams);
  const differingPeople = people.filter(personDiffers);
  const shownProjects = onlyMoved ? differingProjects : projects;
  const shownPeople = onlyMoved ? differingPeople : people;
  const maxProjectShift = Math.max(0, ...projects.map(p => Math.abs(p.shift || 0)));
  const maxItemShift = Math.max(0, ...items.map(i => Math.abs(i.endShift || 0)));
  const maxPersonShift = Math.max(0, ...people.map(p => Math.abs(p.untilShift || 0)));
  const ITEM_LIMIT = 150;
  const grouped = KIND_ORDER.map(kind => [kind, list.filter(c => c.kind === kind)]).filter(([, l]) => l.length);
  const tabs = [
    ['projects', t('scn.tab.projects'), differingProjects.length],
    ['teams', t('scn.tab.teams'), differingTeams.length],
    ['people', t('scn.tab.people'), differingPeople.length],
    ['items', t('scn.tab.items'), items.length],
    ['changes', t('scn.tab.changes'), list.length],
  ];
  const onTabKey = e => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = TAB_IDS[(TAB_IDS.indexOf(tab) + dir + TAB_IDS.length) % TAB_IDS.length];
    setTab(next);
    dialogRef.current?.querySelector(`[data-testid="scn-tab-${next}"]`)?.focus();
  };
  const stateBadge = p => {
    if (p.workLate && !p.baseLate) return <span className="scn-badge risk">{t('scn.nowLate')}</span>;
    if (p.baseLate && !p.workLate && p.presence === 'both') return <span className="scn-badge good">{t('scn.nowOnTime')}</span>;
    if (p.workLate) return <span className="scn-badge muted">{t('scn.stillLate')}</span>;
    return null;
  };
  const presence = p =>
    p.presence === 'added' ? (
      <span className="scn-badge new">{t('scn.added')}</span>
    ) : p.presence === 'removed' ? (
      <span className="scn-badge muted">{t('scn.removed')}</span>
    ) : p.presence === 'dropped' ? (
      <span className="scn-badge muted">{t('scn.droppedBadge')}</span>
    ) : p.presence === 'unscheduled' ? (
      <span className="scn-badge muted">{t('scn.unscheduled')}</span>
    ) : p.presence === 'scheduled' ? (
      <span className="scn-badge new">{t('scn.newlyScheduled')}</span>
    ) : null;
  const empty = msg => <div className="scn-empty">{msg}</div>;
  const title = t('scn.compareTitle', scenario?.name || '');

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal scn-compare"
        data-testid="scenario-compare-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <div className="scn-compare-head">
          <h2>
            <Icon name="branch" size={15} />
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-xs" aria-label={t('close')} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <p className="scn-compare-lede">{t('scn.compareLede')}</p>
        {story.length > 0 && (
          <ul className="scn-story" data-testid="scn-story">
            {story.map(line => (
              <li key={line.id}>
                <button type="button" className="scn-link" onClick={() => setTab('teams')}>
                  <b>{line.name}:</b>
                </button>{' '}
                {line.text}
              </li>
            ))}
          </ul>
        )}

        <div className="scn-tiles">
          <Tile
            testid="scn-tile-dates"
            label={t('scn.kpi.dates')}
            onClick={() => setTab('projects')}
            sub={t('scn.kpi.datesSub')}
            figures={[
              { n: totals.newlyLate || 0, label: t('scn.kpi.newlyLate'), tone: totals.newlyLate ? 'var(--st-risk)' : 'var(--tx3)' },
              { n: totals.rescued || 0, label: t('scn.kpi.rescued'), tone: totals.rescued ? 'var(--st-done)' : 'var(--tx3)' },
            ]}
          />
          <Tile
            testid="scn-tile-projects"
            label={t('scn.kpi.projects')}
            onClick={() => setTab('projects')}
            sub={t('scn.kpi.projectsSub', projects.length)}
            figures={[
              { n: totals.affected || 0, label: t('scn.kpi.affected'), tone: plainTone(totals.affected) },
              { n: totals.later || 0, label: t('scn.kpi.endLater'), tone: plainTone(totals.later) },
              { n: totals.earlier || 0, label: t('scn.kpi.endEarlier'), tone: plainTone(totals.earlier) },
            ]}
          />
          <Tile
            testid="scn-tile-end"
            label={t('scn.kpi.end')}
            figures={[{ n: fmt.shift(totals.endShift), tone: plainTone(totals.endShift) }]}
            sub={totals.baseEnd || totals.workEnd ? `${fmt.date(totals.baseEnd)} → ${fmt.date(totals.workEnd)}` : null}
          />
          <Tile
            testid="scn-tile-changes"
            label={t('scn.tab.changes')}
            onClick={() => setTab('changes')}
            figures={[{ n: list.length, tone: plainTone(list.length) }]}
            sub={t('scn.kpi.itemsSub', totals.itemsMoved || 0)}
          />
        </div>
        {conflicts > 0 && (
          <div className="scn-notice" data-testid="scn-conflict-note">
            <Icon name="alert" size={13} />
            {conflicts === 1 ? t('scn.conflictNoteOne') : t('scn.conflictNote', conflicts)}
          </div>
        )}

        <div className="scn-tabs" role="tablist" onKeyDown={onTabKey}>
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="scn-panel"
              tabIndex={tab === id ? 0 : -1}
              className={`scn-tab${tab === id ? ' on' : ''}`}
              data-testid={`scn-tab-${id}`}
              onClick={() => setTab(id)}
            >
              {label}
              <span className="scn-tab-n">{n}</span>
            </button>
          ))}
          <span className="sp" />
          {(tab === 'projects' || tab === 'teams' || tab === 'people') && (
            <label className="scn-only">
              <input type="checkbox" checked={onlyMoved} onChange={e => setOnlyMoved(e.target.checked)} />
              {t('scn.onlyMoved')}
            </label>
          )}
        </div>

        <div className="scn-body" id="scn-panel" role="tabpanel">
          {tab === 'projects' &&
            (shownProjects.length === 0 ? (
              empty(t('scn.empty.projects'))
            ) : (
              <table className="scn-table" data-testid="scn-projects">
                <thead>
                  <tr>
                    <th>{t('scn.col.project')}</th>
                    <th>{t('scn.col.deadline')}</th>
                    <th>{t('scn.col.planEnd')}</th>
                    <th>{t('scn.col.scnEnd')}</th>
                    <th className="num">{t('scn.col.shift')}</th>
                    <th />
                    <th className="num">{t('scn.col.movedTasks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownProjects.map(p => (
                    <tr key={p.id} data-testid={`scn-project-${p.id}`}>
                      <td>
                        <button type="button" className="scn-link" onClick={() => onOpenItem(p.id)}>
                          <span className="scn-id">{p.id}</span>
                          {p.name}
                        </button>{' '}
                        {presence(p)} {stateBadge(p)}
                        {!p.shift && p.moved > 0 && (
                          <span className="scn-badge muted" data-htip={t('scn.endHeldTip')}>
                            {t('scn.endHeld')}
                          </span>
                        )}
                      </td>
                      <td>{p.date ? fmt.date(p.date) : '—'}</td>
                      <td>{fmt.date(p.baseEnd)}</td>
                      <td>{fmt.date(p.workEnd)}</td>
                      <td className="num" style={{ color: projectTone(p), fontWeight: p.shift ? 600 : 400 }}>
                        {fmt.shift(p.shift)}
                      </td>
                      <td className="bar">
                        <ShiftBar shift={p.shift} max={maxProjectShift} tone={p.workLate !== p.baseLate ? projectTone(p) : null} />
                      </td>
                      <td className="num" style={{ color: plainTone(p.moved || p.gone || p.added) }}>
                        {movedText(t, fmt, p)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'teams' &&
            (shownTeams.length === 0 ? (
              empty(t('scn.empty.teams'))
            ) : (
              <table className="scn-table" data-testid="scn-teams">
                <thead>
                  <tr>
                    <th>{t('scn.col.team')}</th>
                    <th className="num">{t('scn.col.people')}</th>
                    <th className="num">{t('scn.col.capacity')}</th>
                    <th className="num">{t('scn.col.movedTasks')}</th>
                    <th>{t('scn.col.teamEnd')}</th>
                    <th className="num">{t('scn.col.shift')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shownTeams.map(tm => (
                    <tr key={tm.id} data-testid={`scn-team-${tm.id}`}>
                      <td>
                        {tm.name} {presence(tm)}
                      </td>
                      <td
                        className="num"
                        style={{
                          color: plainTone(tm.basePeople !== tm.workPeople),
                          fontWeight: tm.basePeople !== tm.workPeople ? 600 : 400,
                        }}
                      >
                        {tm.basePeople === tm.workPeople ? tm.workPeople : `${tm.basePeople} → ${tm.workPeople}`}
                      </td>
                      <td
                        className="num"
                        style={{ color: plainTone(tm.capShiftPct || tm.capNew), fontWeight: tm.capShiftPct || tm.capNew ? 600 : 400 }}
                      >
                        {tm.capNew ? t('scn.capNew') : tm.capShiftPct ? capPct(tm.capShiftPct) : '±0'}
                      </td>
                      <td className="num" style={{ color: plainTone(tm.moved || tm.gone || tm.added) }}>
                        {movedText(t, fmt, tm)}
                      </td>
                      <td>
                        {fmt.date(tm.baseUntil)} → {fmt.date(tm.workUntil)}
                      </td>
                      <td className="num" style={{ color: plainTone(tm.untilShift), fontWeight: tm.untilShift ? 600 : 400 }}>
                        {fmt.shift(tm.untilShift)}
                      </td>
                      <td className="bar">
                        <ShiftBar shift={tm.untilShift} max={maxTeamShift} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'people' &&
            (shownPeople.length === 0 ? (
              empty(t('scn.empty.people'))
            ) : (
              <table className="scn-table" data-testid="scn-people">
                <thead>
                  <tr>
                    <th>{t('scn.col.person')}</th>
                    <th className="num">{t('scn.col.load')}</th>
                    <th className="num">{t('scn.col.loadShift')}</th>
                    <th>{t('scn.col.busyUntil')}</th>
                    <th className="num">{t('scn.col.shift')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shownPeople.map(p => (
                    <tr key={p.id} data-testid={`scn-person-${p.id}`}>
                      <td>
                        {p.name} {presence(p)}
                      </td>
                      <td className="num">
                        {fmt.pt(p.baseEffort)} → {fmt.pt(p.workEffort)}
                      </td>
                      <td className="num" style={{ color: plainTone(p.effortShift), fontWeight: p.effortShift ? 600 : 400 }}>
                        {p.effortShift ? `${p.effortShift > 0 ? '+' : '−'}${fmt.pt(Math.abs(p.effortShift))}` : '±0'}
                      </td>
                      <td>
                        {fmt.date(p.baseUntil)} → {fmt.date(p.workUntil)}
                      </td>
                      {/* No colour: a person free earlier is not "good", it is
                  capacity nobody has planned yet. */}
                      <td className="num" style={{ color: plainTone(p.untilShift), fontWeight: p.untilShift ? 600 : 400 }}>
                        {fmt.shift(p.untilShift)}
                      </td>
                      <td className="bar">
                        <ShiftBar shift={p.untilShift} max={maxPersonShift} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'items' &&
            (items.length === 0 ? (
              empty(t('scn.empty.items'))
            ) : (
              <>
                <table className="scn-table" data-testid="scn-items">
                  <thead>
                    <tr>
                      <th>{t('scn.col.item')}</th>
                      <th>{t('scn.col.plan')}</th>
                      <th>{t('scn.col.scenario')}</th>
                      <th>{t('scn.col.who')}</th>
                      <th className="num">{t('scn.col.shift')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, ITEM_LIMIT).map(i => (
                      <tr key={i.id}>
                        <td>
                          <button type="button" className="scn-link" onClick={() => onOpenItem(i.id)}>
                            <span className="scn-id">{i.id}</span>
                            {i.name}
                          </button>{' '}
                          {presence(i)}
                        </td>
                        <td>{i.baseStart ? `${fmt.date(i.baseStart)} – ${fmt.date(i.baseEnd)}` : '—'}</td>
                        <td>{i.workStart ? `${fmt.date(i.workStart)} – ${fmt.date(i.workEnd)}` : '—'}</td>
                        <td>
                          {i.peopleChanged
                            ? `${i.basePeople.map(text.person).join(', ') || '—'} → ${i.workPeople.map(text.person).join(', ') || '—'}`
                            : (i.workPeople.length ? i.workPeople : i.basePeople).map(text.person).join(', ')}
                        </td>
                        <td className="num" style={{ color: plainTone(i.endShift), fontWeight: i.endShift ? 600 : 400 }}>
                          {fmt.shift(i.endShift)}
                        </td>
                        <td className="bar">
                          <ShiftBar shift={i.endShift} max={maxItemShift} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length > ITEM_LIMIT && <div className="scn-more-rows">{t('scn.moreItems', items.length - ITEM_LIMIT)}</div>}
              </>
            ))}

          {tab === 'changes' &&
            (list.length === 0 ? (
              empty(t('scn.empty.changes'))
            ) : (
              <div data-testid="scn-changes">
                {grouped.map(([kind, entries]) => (
                  <div key={kind} className="scn-group">
                    <div className="scn-group-head">
                      {t(`scn.kind.${kind}`)}
                      <span className="scn-tab-n">{entries.length}</span>
                    </div>
                    {entries.map(c => {
                      const head = changeTitle(c, t, text, fmt);
                      const revertTip = c.fields.length > 1 ? t('scn.revertTipMany', c.fields.length) : t('scn.revertTip');
                      return (
                        <div key={`${c.kind}:${c.op}:${c.id}`} className="scn-change" data-testid={`scn-change-${c.kind}-${c.id}`}>
                          <span className="scn-op" aria-hidden="true">
                            {c.op === 'add' ? '+' : c.op === 'remove' ? '−' : '~'}
                          </span>
                          <span className="scn-change-text">
                            <span className="scn-change-title">
                              {c.kind === 'item' && c.op !== 'remove' ? (
                                <button type="button" className="scn-link" onClick={() => onOpenItem(c.id)}>
                                  <span className="scn-id">{head.id}</span>
                                  {head.title}
                                </button>
                              ) : (
                                <>
                                  {head.id && <span className="scn-id">{head.id}</span>}
                                  {head.title}
                                </>
                              )}
                              {c.op === 'add' && <span className="scn-badge new">{t('scn.added')}</span>}
                              {c.op === 'remove' && <span className="scn-badge muted">{t('scn.removed')}</span>}
                            </span>
                            {c.fields.length > 0 && c.kind !== 'order' && (
                              <span className="scn-change-fields">{text.fields(c.fields)}</span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="scn-revert"
                            aria-label={`${t('scn.revert')}: ${head.title}`}
                            data-htip={revertTip}
                            data-testid={`scn-revert-${c.kind}-${c.id}`}
                            onClick={() => onRevert(c)}
                          >
                            {t('scn.revert')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
        </div>

        <div className="scn-compare-foot">
          <span className="scn-foot-hint">{t('scn.footHint')}</span>
          <span className="sp" />
          {onExport && (
            <button
              type="button"
              className="btn btn-sec btn-sm"
              data-testid="scenario-export-pdf"
              disabled={exporting}
              data-htip={t('scn.pdfTip')}
              onClick={async () => {
                setExporting(true);
                try {
                  await onExport();
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? '…' : t('scn.pdf')}
            </button>
          )}
          <button type="button" className="btn btn-sec btn-sm" onClick={onClose}>
            {t('close')}
          </button>
          <button
            type="button"
            className="btn btn-sm scn-apply"
            data-testid="scenario-apply-modal"
            disabled={!list.length}
            onClick={onApply}
          >
            {t('scn.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
