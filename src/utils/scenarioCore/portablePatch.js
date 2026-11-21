import { isEmptyObj, isEmptyPatch } from './patchDiff.js';

// ── a patch that survives the Markdown file ─────────────────────────────────
//
// A Markdown plan has no ids for people, teams or meeting plans: they are
// written by name and get a fresh id every time the file is read. A patch that
// said "assign m1731…" would point at nobody after the next load. So on its
// way into a Markdown file every such id is swapped for a token built from the
// name, and swapped back against whatever ids the load just handed out.
// JSON plans keep their ids and skip all of this.

function tokenMaps(base, patch) {
  const mk = (list, sigil) => {
    const seen = new Map();
    const byId = new Map();
    for (const e of list) {
      if (!e || e.id == null || byId.has(e.id)) continue;
      const name = (e.name || '').trim();
      const n = (seen.get(name) || 0) + 1;
      seen.set(name, n);
      byId.set(e.id, `${sigil}${name}${n > 1 ? `~${n}` : ''}`);
    }
    return byId;
  };
  const members = mk([...(base.members || []), ...(patch?.members?.add || [])], '@');
  const teams = mk([...(base.teams || []), ...(patch?.teams?.add || [])], '#');
  const plans = mk([...(base.meetingPlans || []), ...(patch?.top?.meetingPlans || [])], '$');
  return { members, teams, plans };
}

function mapPatchRefs(patch, fn) {
  if (isEmptyPatch(patch)) return { patch: null, lost: 0 };
  const lost = { n: 0 };
  const one = (kind, v) => {
    if (typeof v !== 'string' || !v) return v;
    const r = fn(kind, v);
    if (r == null) {
      lost.n++;
      return null;
    }
    return r;
  };
  const many = (kind, arr) => (Array.isArray(arr) ? arr.map(v => one(kind, v)).filter(v => v != null) : arr);
  const queueKey = k => (k.startsWith('team:') ? (v => (v == null ? null : `team:${v}`))(one('team', k.slice(5))) : one('member', k));
  const node = n => {
    if (!n || typeof n !== 'object') return n;
    const o = { ...n };
    if ('assign' in o) o.assign = many('member', o.assign);
    if ('team' in o) o.team = one('team', o.team) ?? '';
    if ('completedPersonId' in o) o.completedPersonId = one('member', o.completedPersonId) ?? '';
    if (Array.isArray(o.phases)) {
      o.phases = o.phases.map(p => {
        const q = { ...p };
        if ('assign' in q) q.assign = many('member', q.assign);
        if ('teams' in q) q.teams = many('team', q.teams);
        if ('team' in q) q.team = one('team', q.team) ?? '';
        return q;
      });
    }
    if (Array.isArray(o.handoffPlan)) {
      o.handoffPlan = o.handoffPlan.map(s => {
        const q = { ...s };
        if ('assign' in q) q.assign = many('member', q.assign);
        if ('team' in q) q.team = one('team', q.team) ?? '';
        return q;
      });
    }
    return o;
  };
  const member = m => {
    if (!m || typeof m !== 'object') return m;
    const o = { ...m };
    if ('id' in o) o.id = one('member', o.id);
    if ('team' in o) o.team = one('team', o.team) ?? '';
    if ('teams' in o) o.teams = many('team', o.teams);
    if ('meetingPlanIds' in o) o.meetingPlanIds = many('plan', o.meetingPlanIds);
    if (Array.isArray(o.meetingChanges)) {
      o.meetingChanges = o.meetingChanges.map(c =>
        'meetingPlanIds' in (c || {}) ? { ...c, meetingPlanIds: many('plan', c.meetingPlanIds) } : c,
      );
    }
    return o;
  };
  const team = tm => {
    if (!tm || typeof tm !== 'object') return tm;
    const o = { ...tm };
    if ('id' in o) o.id = one('team', o.id);
    if ('meetingPlanIds' in o) o.meetingPlanIds = many('plan', o.meetingPlanIds);
    return o;
  };
  const idList = (d, kind, each) => {
    if (!d) return d;
    const o = {};
    if (d.add) o.add = d.add.map(each).filter(e => e.id != null);
    if (d.del) o.del = kind ? many(kind, d.del) : d.del;
    for (const part of ['set', 'unset']) {
      if (!d[part]) continue;
      const entries = [];
      for (const [id, v] of Object.entries(d[part])) {
        const key = kind ? one(kind, id) : id;
        if (key == null) continue;
        if (part === 'set') {
          const { id: _id, ...rest } = each({ ...v });
          entries.push([key, rest]);
        } else entries.push([key, v]);
      }
      if (entries.length) o[part] = Object.fromEntries(entries);
    }
    for (const k of ['add', 'del']) if (o[k] && !o[k].length) delete o[k];
    return isEmptyObj(o) ? null : o;
  };
  const out = { ...patch };
  const put = (key, value) => {
    if (value == null || isEmptyObj(value)) delete out[key];
    else out[key] = value;
  };
  if (patch.tree) put('tree', idList(patch.tree, null, node));
  if (patch.members) put('members', idList(patch.members, 'member', member));
  if (patch.teams) put('teams', idList(patch.teams, 'team', team));
  if (patch.vacations) {
    const v = {};
    for (const part of ['add', 'del']) {
      if (!patch.vacations[part]) continue;
      const list = patch.vacations[part].map(e => ({ ...e, person: one('member', e.person) })).filter(e => e.person != null);
      if (list.length) v[part] = list;
    }
    put('vacations', v);
  }
  if (patch.queues) {
    const q = {};
    if (patch.queues.set) {
      const entries = Object.entries(patch.queues.set)
        .map(([k, ids]) => [queueKey(k), ids])
        .filter(([k]) => k != null);
      if (entries.length) q.set = Object.fromEntries(entries);
    }
    if (patch.queues.del) {
      const del = patch.queues.del.map(queueKey).filter(k => k != null);
      if (del.length) q.del = del;
    }
    put('queues', q);
  }
  if (patch.top) {
    const top = { ...patch.top };
    if (Array.isArray(top.changes)) top.changes = mapChanges(top.changes, one, many);
    if (Array.isArray(top.meetingPlans))
      top.meetingPlans = top.meetingPlans.map(p => ({ ...p, id: one('plan', p.id) })).filter(p => p.id != null);
    if (Array.isArray(top.taskTemplates)) {
      top.taskTemplates = top.taskTemplates.map(tpl => ({
        ...tpl,
        phases: (tpl.phases || []).map(p => ({
          ...p,
          ...('teams' in p ? { teams: many('team', p.teams) } : {}),
          ...('team' in p ? { team: one('team', p.team) ?? '' } : {}),
        })),
      }));
    }
    out.top = top;
  }
  return { patch: isEmptyObj(out) ? null : out, lost: lost.n };
}

// Dated changes (utils/effective.js) name people, teams and meeting plans by
// id too — as the keys of each `set` and inside `meetingPlanIds`.
function mapChanges(changes, one, many) {
  const setOf = (set, kind, each) => {
    const entries = [];
    for (const [id, v] of Object.entries(set || {})) {
      const key = one(kind, id);
      if (key != null) entries.push([key, each ? each(v) : v]);
    }
    return entries.length ? { set: Object.fromEntries(entries) } : null;
  };
  const plans = v => ('meetingPlanIds' in (v || {}) ? { ...v, meetingPlanIds: many('plan', v.meetingPlanIds) } : v);
  const out = [];
  for (const c of changes || []) {
    const patch = {};
    const members = setOf(c.patch?.members?.set, 'member', plans);
    const teams = setOf(c.patch?.teams?.set, 'team', plans);
    const meetingPlans = setOf(c.patch?.meetingPlans?.set, 'plan', null);
    if (members) patch.members = members;
    if (teams) patch.teams = teams;
    if (meetingPlans) patch.meetingPlans = meetingPlans;
    if (!isEmptyObj(patch)) out.push({ ...c, patch });
  }
  return out;
}

// The plan's own dated changes, for the Markdown file: one JSON line per date.
export function formatChangesBlock(changes, base) {
  const { members, teams, plans } = tokenMaps(base || {}, null);
  const table = { member: members, team: teams, plan: plans };
  const one = (kind, id) => table[kind].get(id) ?? id;
  const many = (kind, arr) => (Array.isArray(arr) ? arr.map(v => one(kind, v)) : arr);
  return mapChanges(changes, one, many)
    .map(c => JSON.stringify({ from: c.from, patch: c.patch }))
    .join('\n');
}

export function parseChangesBlock(text, base) {
  const sig = { member: '@', team: '#', plan: '$' };
  const invert = map => new Map([...map].map(([id, token]) => [token, id]));
  const maps = tokenMaps(base || {}, null);
  const known = { member: invert(maps.members), team: invert(maps.teams), plan: invert(maps.plans) };
  // A name the plan no longer has: the change has nobody to apply to.
  const one = (kind, token) => (typeof token === 'string' && token.startsWith(sig[kind]) ? (known[kind].get(token) ?? null) : token);
  const many = (kind, arr) => (Array.isArray(arr) ? arr.map(v => one(kind, v)).filter(v => v != null) : arr);
  const raw = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'v1') continue;
    let c;
    try {
      c = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (c && /^\d{4}-\d{2}-\d{2}$/.test(c.from || '') && c.patch) raw.push({ from: c.from, patch: c.patch });
  }
  return mapChanges(raw, one, many).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

// ids → name tokens, against the plan the patch was measured on.
export function toPortablePatch(patch, base) {
  if (isEmptyPatch(patch)) return null;
  const { members, teams, plans } = tokenMaps(base || {}, patch);
  const table = { member: members, team: teams, plan: plans };
  // An id nobody knows stays as it is: it was already dangling in the plan,
  // and inventing a token for it would only hide that.
  return mapPatchRefs(patch, (kind, id) => table[kind].get(id) ?? id).patch;
}

// name tokens → the ids this load gave those names. A token whose name is not
// in the plan any more is dropped from whatever referred to it, and counted.
export function fromPortablePatch(portable, base) {
  if (isEmptyPatch(portable)) return { patch: null, lost: 0 };
  const sig = { member: '@', team: '#', plan: '$' };
  const invert = map => new Map([...map].map(([id, token]) => [token, id]));
  const baseMaps = tokenMaps(base || {}, null);
  const known = { member: invert(baseMaps.members), team: invert(baseMaps.teams), plan: invert(baseMaps.plans) };
  // Names the scenario itself introduces get an id of their own, once.
  const fresh = { member: new Map(), team: new Map(), plan: new Map() };
  const introduced = {
    member: new Set((portable.members?.add || []).map(m => m.id)),
    team: new Set((portable.teams?.add || []).map(m => m.id)),
    plan: new Set((portable.top?.meetingPlans || []).map(m => m.id)),
  };
  let seq = 0;
  const stamp = Date.now();
  const prefix = { member: 'm', team: 'T', plan: 'mp_' };
  return mapPatchRefs(portable, (kind, token) => {
    if (!token.startsWith(sig[kind])) return token; // a raw id from a JSON plan
    if (known[kind].has(token)) return known[kind].get(token);
    if (introduced[kind].has(token)) {
      if (!fresh[kind].has(token)) fresh[kind].set(token, `${prefix[kind]}s${stamp}${seq++}`);
      return fresh[kind].get(token);
    }
    return null;
  });
}

// ── the fenced block in the Markdown file ───────────────────────────────────

// One scenario per line, as JSON: machine-written, human-skimmable, and a
// merge conflict stays inside the one scenario that caused it.
export function formatScenariosBlock(scenarios, base) {
  return (scenarios || [])
    .map(s =>
      JSON.stringify({
        id: s.id,
        name: s.name || '',
        ...(s.note ? { note: s.note } : {}),
        ...(s.createdAt ? { createdAt: s.createdAt } : {}),
        ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}),
        ...(Number.isFinite(s.changes) ? { changes: s.changes } : {}),
        patch: toPortablePatch(s.patch, base),
      }),
    )
    .join('\n');
}

export function parseScenariosBlock(text, base) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'v1') continue;
    let raw;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    const { patch, lost } = fromPortablePatch(raw.patch, base);
    out.push({
      id: String(raw.id),
      name: String(raw.name || ''),
      ...(raw.note ? { note: String(raw.note) } : {}),
      ...(raw.createdAt ? { createdAt: raw.createdAt } : {}),
      ...(raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
      ...(Number.isFinite(raw.changes) ? { changes: raw.changes } : {}),
      patch,
      ...(lost ? { lost } : {}),
    });
  }
  return out;
}
