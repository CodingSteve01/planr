// Changes that take effect on a date.
//
// "From March, Noah works 60 %." "From Q2 the dev stand-up is twice a week."
// Until now that was a list inside each person's dialog (`capChanges`,
// `meetingChanges`) — one editor per field, for people only, and a scheduler
// that lost every meeting plan after the first dated meeting change. This is
// the one mechanism instead, and it is the scenarios' mechanism turned
// through ninety degrees: a scenario is a patch beside the plan, a dated
// change is a patch along it.
//
//   data.changes = [{ from: 'YYYY-MM-DD', patch }]      ascending by `from`
//
// `patch` uses the scenarios' shape (utils/scenario.js) and only its `set`
// part, on the fields listed in DATED below — the ones whose value can
// honestly differ by date. Everything else about a person, a team or a
// meeting plan is timeless and is edited as always. Joining and leaving are
// not in here either: they are `start` and `end` on the person, which is what
// they always were.
//
// Three readers:
//   resourcesAsOf(data, date)   what the resources look like on a date — the
//                               lens the Resources view shows and edits through
//   foldEdit(...)               an edit made through that lens, put where it
//                               belongs: into the change at that date, or into
//                               the base
//   compileMembers(data)        the people as the scheduler needs them: the
//                               whole timeline flattened into the per-person
//                               `capChanges` / `meetingChanges` it already
//                               understands, with every meeting plan resolved
import { FTE_HOURS, resolveMemberMeetings } from './capacity.js';
import { deepEqual } from './scenario.js';

// Which fields of which list can carry a date.
export const DATED = {
  members: ['cap', 'weeklyHours', 'meetings', 'meetingPlanIds'],
  teams: ['meetingPlanIds'],
  meetingPlans: ['meetings'],
};
const LISTS = Object.keys(DATED);

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const dayOf = d => {
  if (isDay(d)) return d;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+x)) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + n));
};

const sorted = changes => [...(changes || [])].filter(c => c && isDay(c.from)).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
const isEmpty = o => !o || Object.keys(o).length === 0;

function applySet(list, set) {
  if (!Array.isArray(list) || isEmpty(set)) return list || [];
  return list.map(e => (set[e.id] ? { ...e, ...set[e.id] } : e));
}

// The resources as they are on `date`: the base with every change up to and
// including that day applied, oldest first. `before: true` stops one day
// short — what a change AT that date is measured against.
export function resourcesAsOf(data, date, { before = false } = {}) {
  const day = dayOf(date);
  const out = { members: data?.members || [], teams: data?.teams || [], meetingPlans: data?.meetingPlans || [] };
  if (!day) return out;
  for (const c of sorted(data?.changes)) {
    if (before ? c.from >= day : c.from > day) break;
    for (const key of LISTS) out[key] = applySet(out[key], c.patch?.[key]?.set);
  }
  return out;
}

// Every date something changes on, ascending — with how many things change.
export function changeDates(data) {
  return sorted(data?.changes).map(c => ({
    from: c.from,
    count: LISTS.reduce((n, key) => n + Object.keys(c.patch?.[key]?.set || {}).length, 0),
  })).filter(c => c.count > 0);
}

function withChange(changes, from, patch) {
  const rest = (changes || []).filter(c => c.from !== from);
  const clean = {};
  for (const key of LISTS) {
    const set = Object.fromEntries(Object.entries(patch?.[key]?.set || {}).filter(([, v]) => !isEmpty(v)));
    if (!isEmpty(set)) clean[key] = { set };
  }
  return sorted(isEmpty(clean) ? rest : [...rest, { from, patch: clean }]);
}

const splitFields = (kind, entity) => {
  const dated = {}, timeless = {};
  for (const [k, v] of Object.entries(entity || {})) (DATED[kind].includes(k) ? dated : timeless)[k] = v;
  return { dated, timeless };
};

// An entity as it was edited through the lens of `date`, folded back into the
// plan: its timeless fields go to the base entry; its dated fields go into the
// change at that date, as far as they differ from what held the day before.
// A dated field set back to that earlier value leaves the change again, so
// "undo by hand" really is an undo.
//
// `date` null means "no date chosen": the edit is about now. Then the dated
// fields are written to the base, and any change up to today that set them is
// cleared of them — otherwise the edit would be overruled by an older change
// and appear to do nothing. Changes in the future stay as planned.
export function foldEdit(data, kind, edited, date, today = new Date()) {
  if (!data || !DATED[kind] || !edited?.id) return data;
  const baseList = data[kind] || [];
  const base = baseList.find(e => e.id === edited.id);
  if (!base) return data;
  const { dated, timeless } = splitFields(kind, edited);
  const day = date ? dayOf(date) : '';
  if (!day) {
    const now = dayOf(today);
    const lens = resourcesAsOf(data, now)[kind].find(e => e.id === edited.id) || base;
    const touched = DATED[kind].filter(k => !deepEqual(dated[k], lens[k]));
    let changes = data.changes || [];
    if (touched.length) {
      changes = sorted(changes).map(c => {
        if (c.from > now) return c;
        const set = c.patch?.[kind]?.set?.[edited.id];
        if (!set || !touched.some(k => k in set)) return c;
        const nextSet = Object.fromEntries(Object.entries(set).filter(([k]) => !touched.includes(k)));
        return { ...c, patch: { ...c.patch, [kind]: { set: { ...c.patch[kind].set, [edited.id]: nextSet } } } };
      });
      changes = changes.reduce((acc, c) => withChange(acc, c.from, c.patch), []);
    }
    // Fields not touched keep their BASE value, not the lens's: the lens value
    // may come from a change, and copying it down would make it timeless.
    const nextBase = { ...timeless };
    for (const k of DATED[kind]) {
      const v = touched.includes(k) ? dated[k] : base[k];
      if (v !== undefined) nextBase[k] = v;
    }
    return finish(data, kind, baseList.map(e => (e.id === edited.id ? nextBase : e)), changes);
  }
  const prior = resourcesAsOf(data, day, { before: true })[kind].find(e => e.id === edited.id) || base;
  // A field cleared at a date ("back to the default from then on") is a value
  // too: it is stored as null, which every reader treats as "not set".
  const set = {};
  for (const k of DATED[kind]) {
    const next = dated[k] === undefined ? null : dated[k];
    if (!deepEqual(next, prior[k] === undefined ? null : prior[k])) set[k] = next;
  }
  const existing = (data.changes || []).find(c => c.from === day);
  const patch = { ...(existing?.patch || {}) };
  patch[kind] = { set: { ...(patch[kind]?.set || {}), [edited.id]: set } };
  const nextBase = { ...timeless };
  for (const k of DATED[kind]) if (base[k] !== undefined) nextBase[k] = base[k];
  return finish(data, kind, baseList.map(e => (e.id === edited.id ? nextBase : e)), withChange(data.changes, day, patch));
}

function finish(data, kind, list, changes) {
  const out = { ...data, [kind]: list };
  if (changes.length) out.changes = changes; else delete out.changes;
  return out;
}

// Take every dated value for one entity out of the change at `from`.
export function dropChange(data, from, kind = null, id = null) {
  const c = (data?.changes || []).find(x => x.from === from);
  if (!c) return data;
  let patch = {};
  if (kind && id) {
    patch = { ...c.patch };
    const set = { ...(patch[kind]?.set || {}) };
    delete set[id];
    patch[kind] = { set };
  }
  const changes = withChange(data.changes, from, patch);
  const out = { ...data };
  if (changes.length) out.changes = changes; else delete out.changes;
  return out;
}

// A change that names somebody the plan no longer has does nothing; drop it
// so it cannot come back to life when an id is reused.
export function pruneChanges(data) {
  if (!data?.changes?.length) return data;
  const ids = Object.fromEntries(LISTS.map(key => [key, new Set((data[key] || []).map(e => e.id))]));
  let dirty = false;
  const changes = sorted(data.changes).reduce((acc, c) => {
    const patch = {};
    for (const key of LISTS) {
      const set = Object.fromEntries(Object.entries(c.patch?.[key]?.set || {}).filter(([id]) => ids[key].has(id)));
      if (Object.keys(set).length !== Object.keys(c.patch?.[key]?.set || {}).length) dirty = true;
      if (!isEmpty(set)) patch[key] = { set };
    }
    return withChange(acc, c.from, patch);
  }, []);
  if (!dirty && changes.length === data.changes.length) return data;
  const out = { ...data };
  if (changes.length) out.changes = changes; else delete out.changes;
  return out;
}

// The lists people used to keep per person, moved into the one timeline.
// Idempotent: a member without `capChanges` / `meetingChanges` is left alone.
export function migrateLegacyChanges(data) {
  const members = data?.members;
  if (!Array.isArray(members) || !members.some(m => m?.capChanges?.length || m?.meetingChanges?.length)) return data;
  let changes = sorted(data.changes);
  const put = (from, id, fields) => {
    if (!isDay(from) || isEmpty(fields)) return;
    const existing = changes.find(c => c.from === from);
    const patch = { ...(existing?.patch || {}) };
    // A dated change already recorded wins over the legacy list for the same field.
    patch.members = { set: { ...(patch.members?.set || {}), [id]: { ...fields, ...(patch.members?.set?.[id] || {}) } } };
    changes = withChange(changes, from, patch);
  };
  const next = members.map(m => {
    if (!m?.capChanges?.length && !m?.meetingChanges?.length) return m;
    for (const c of m.capChanges || []) {
      put(c.from || c.date, m.id, { ...(typeof c.cap === 'number' ? { cap: c.cap } : {}), ...(typeof c.weeklyHours === 'number' ? { weeklyHours: c.weeklyHours } : {}) });
    }
    for (const c of m.meetingChanges || []) {
      put(c.from || c.date, m.id, { ...(Array.isArray(c.meetings) ? { meetings: c.meetings } : {}), ...(Array.isArray(c.meetingPlanIds) ? { meetingPlanIds: c.meetingPlanIds } : {}) });
    }
    const { capChanges: _c, meetingChanges: _m, ...rest } = m;
    return rest;
  });
  const out = { ...data, members: next };
  if (changes.length) out.changes = changes; else delete out.changes;
  return out;
}

// The people as the scheduler reads them.
//
// The scheduler knows one way for a person to differ by date: per-person
// `capChanges` and `meetingChanges`, read through `memberAtDate`. So the whole
// timeline is flattened into exactly that, per person, at every date on which
// anything that reaches them changes — their own values, the plans of a team
// they are in, or the content of a plan they attend. Each entry carries the
// meetings already resolved (team plans + own plans + own meetings): the
// scheduler has no plan catalogue to look anything up in, which is how a
// dated meeting change used to make every plan meeting disappear.
export function compileMembers(source) {
  // A plan that has not been through the loader yet (the demo project, a test
  // fixture) may still carry the per-person lists; they count all the same.
  const data = migrateLegacyChanges(source);
  const base = { members: data?.members || [], teams: data?.teams || [], meetingPlans: data?.meetingPlans || [] };
  const dates = sorted(data?.changes).map(c => c.from);
  const resolve = (m, state) => resolveMemberMeetings(m, { plans: state.meetingPlans, teams: state.teams });
  const states = dates.map(from => ({ from, state: resourcesAsOf(data, from) }));
  return base.members.map(m => {
    const first = { ...m, meetings: resolve(m, base), meetingPlanIds: [] };
    let prev = { cap: m.cap, weeklyHours: m.weeklyHours, meetings: first.meetings };
    const capChanges = [], meetingChanges = [];
    for (const { from, state } of states) {
      const at = state.members.find(x => x.id === m.id);
      if (!at) continue;
      const meetings = resolve(at, state);
      if (at.cap !== prev.cap || at.weeklyHours !== prev.weeklyHours) {
        // Always both, and a cleared value as its default: `memberAtDate`
        // keeps whatever an entry does not mention, so leaving one out would
        // let an earlier figure live on past the day it was cleared.
        capChanges.push({ from, cap: typeof at.cap === 'number' ? at.cap : 1, weeklyHours: typeof at.weeklyHours === 'number' ? at.weeklyHours : FTE_HOURS });
      }
      if (!deepEqual(meetings, prev.meetings)) meetingChanges.push({ from, meetings, meetingPlanIds: [] });
      prev = { cap: at.cap, weeklyHours: at.weeklyHours, meetings };
    }
    if (capChanges.length) first.capChanges = capChanges; else delete first.capChanges;
    if (meetingChanges.length) first.meetingChanges = meetingChanges; else delete first.meetingChanges;
    return first;
  });
}

// The same day of the month before, or that month's last day when it is shorter.
export const monthAgo = today => { const last = new Date(today.getFullYear(), today.getMonth(), 0).getDate(); return dayOf(new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), last))); };
