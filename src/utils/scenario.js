// Scenarios: a second truth beside the plan.
//
// A scenario is not a copy of the plan. It is the list of things that are
// different in it — a patch — and the scenario you look at is the plan with
// that patch applied. That is the whole design, and it is what makes a
// scenario worth keeping for longer than an afternoon: progress you record in
// the real plan next week is in the scenario too, because the scenario never
// had an opinion about it. A copy would have gone stale the first time
// somebody finished a task.
//
// Everything here is pure. App.jsx holds the plan aside while a scenario is on
// screen (`base`), edits the applied result like any other document, and asks
// `diffPlan(base, work)` what the scenario now consists of whenever it has to
// write the file. See docs/scenarios.md.

// Keys a scenario has no say over. `scenarios` is the list itself;
// `historyEvents` is the record of what really happened, which a what-if must
// never write; `roadmapAssignment` is derived layout the app re-merges on its
// own.
export const SCENARIO_IGNORED_KEYS = new Set(['scenarios', 'historyEvents', 'roadmapAssignment', 'asOfPending', 'dayLog']);

// Lists whose entries carry an `id`: compared entry by entry, field by field.
const ID_LISTS = ['tree', 'members', 'teams'];
// Lists whose entries are their own identity: an entry is there or it is not.
const VALUE_LISTS = {
  vacations: v => `${v?.person || ''}|${v?.from || v?.week || ''}|${v?.to || ''}|${v?.note || ''}`,
  holidays: h => `${h?.date || ''}|${h?.name || ''}`,
};

// Fields the app writes on its own from other fields: a parent's status, the
// window a finished task occupied. They travel in the patch — the scenario is
// not correct without them — but nobody changed them, so the list of changes
// and its count leave them out.
export const DERIVED_NODE_FIELDS = new Set([
  'completedAt',
  'completedStart',
  'completedEnd',
  'completedPersonId',
  'completedPerson',
  'completedAutoAssigned',
  'plannedStart',
  'plannedEnd',
]);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter(k => a[k] !== undefined);
  const kb = Object.keys(b).filter(k => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

const isEmptyObj = o => !o || Object.keys(o).length === 0;

// ── diff ────────────────────────────────────────────────────────────────────

function diffIdList(baseList, workList) {
  const base = Array.isArray(baseList) ? baseList : [];
  const work = Array.isArray(workList) ? workList : [];
  if (base === work) return null;
  const baseById = new Map(base.map(e => [e.id, e]));
  const workIds = new Set();
  const out = { add: [], del: [], set: {}, unset: {} };
  for (const w of work) {
    if (!w || w.id == null) continue;
    workIds.add(w.id);
    const b = baseById.get(w.id);
    if (!b) {
      out.add.push(w);
      continue;
    }
    if (b === w) continue;
    const set = {},
      unset = [];
    for (const k of Object.keys(w)) {
      if (k === 'id' || w[k] === undefined) continue;
      if (!deepEqual(b[k], w[k])) set[k] = w[k];
    }
    for (const k of Object.keys(b)) {
      if (k === 'id' || b[k] === undefined) continue;
      if (w[k] === undefined) unset.push(k);
    }
    if (!isEmptyObj(set)) out.set[w.id] = set;
    if (unset.length) out.unset[w.id] = unset;
  }
  for (const b of base) if (b && b.id != null && !workIds.has(b.id)) out.del.push(b.id);
  if (!out.add.length) delete out.add;
  if (!out.del.length) delete out.del;
  if (isEmptyObj(out.set)) delete out.set;
  if (isEmptyObj(out.unset)) delete out.unset;
  return isEmptyObj(out) ? null : out;
}

function diffValueList(baseList, workList, keyOf) {
  const base = Array.isArray(baseList) ? baseList : [];
  const work = Array.isArray(workList) ? workList : [];
  if (base === work) return null;
  const baseKeys = new Set(base.map(keyOf));
  const workKeys = new Set(work.map(keyOf));
  const add = work.filter(e => !baseKeys.has(keyOf(e)));
  const del = base.filter(e => !workKeys.has(keyOf(e)));
  if (!add.length && !del.length) return null;
  return { ...(add.length ? { add } : {}), ...(del.length ? { del } : {}) };
}

function diffMap(baseMap, workMap) {
  const base = baseMap && typeof baseMap === 'object' ? baseMap : {};
  const work = workMap && typeof workMap === 'object' ? workMap : {};
  if (base === work) return null;
  const set = {},
    del = [];
  for (const k of Object.keys(work)) if (!deepEqual(base[k], work[k])) set[k] = work[k];
  for (const k of Object.keys(base)) if (!(k in work)) del.push(k);
  if (isEmptyObj(set) && !del.length) return null;
  return { ...(isEmptyObj(set) ? {} : { set }), ...(del.length ? { del } : {}) };
}

// What is different in `work`, measured against `base`. `null` when nothing is.
export function diffPlan(base, work) {
  if (!base || !work) return null;
  if (base === work) return null;
  const patch = {};
  for (const key of ID_LISTS) {
    const d = diffIdList(base[key], work[key]);
    if (d) patch[key] = d;
  }
  for (const [key, keyOf] of Object.entries(VALUE_LISTS)) {
    const d = diffValueList(base[key], work[key], keyOf);
    if (d) patch[key] = d;
  }
  const queues = diffMap(base.personQueues, work.personQueues);
  if (queues) patch.queues = queues;
  const meta = diffMap(base.meta, work.meta);
  if (meta) patch.meta = meta;
  const handled = new Set([...ID_LISTS, ...Object.keys(VALUE_LISTS), 'personQueues', 'meta']);
  const top = {},
    topDel = [];
  for (const k of Object.keys(work)) {
    if (handled.has(k) || SCENARIO_IGNORED_KEYS.has(k)) continue;
    if (!deepEqual(base[k], work[k])) top[k] = work[k];
  }
  for (const k of Object.keys(base)) {
    if (handled.has(k) || SCENARIO_IGNORED_KEYS.has(k)) continue;
    if (!(k in work) && base[k] !== undefined) topDel.push(k);
  }
  if (!isEmptyObj(top)) patch.top = top;
  if (topDel.length) patch.topDel = topDel;
  return isEmptyObj(patch) ? null : patch;
}

export const isEmptyPatch = patch => !patch || isEmptyObj(patch);

// ── apply ───────────────────────────────────────────────────────────────────

function applyIdList(baseList, d, kind, conflicts) {
  const base = Array.isArray(baseList) ? baseList : [];
  if (!d) return base;
  const del = new Set(d.del || []);
  const known = new Set(base.map(e => e.id));
  for (const id of del) if (!known.has(id)) conflicts.push({ kind, id, why: 'gone' });
  for (const id of Object.keys(d.set || {})) if (!known.has(id)) conflicts.push({ kind, id, why: 'gone' });
  const out = [];
  for (const b of base) {
    if (del.has(b.id)) continue;
    const set = d.set?.[b.id];
    const unset = d.unset?.[b.id];
    if (!set && !unset) {
      out.push(b);
      continue;
    }
    const next = { ...b, ...(set || {}) };
    for (const k of unset || []) delete next[k];
    out.push(next);
  }
  for (const a of d.add || []) {
    if (known.has(a.id) && !del.has(a.id)) {
      conflicts.push({ kind, id: a.id, why: 'taken' });
      continue;
    }
    out.push(a);
  }
  return out;
}

function applyValueList(baseList, d, keyOf) {
  const base = Array.isArray(baseList) ? baseList : [];
  if (!d) return base;
  const del = new Set((d.del || []).map(keyOf));
  const have = new Set(base.map(keyOf));
  const out = base.filter(e => !del.has(keyOf(e)));
  for (const a of d.add || []) if (!have.has(keyOf(a))) out.push(a);
  return out;
}

function applyMap(baseMap, d) {
  if (!d) return baseMap;
  const out = { ...(baseMap || {}), ...(d.set || {}) };
  for (const k of d.del || []) delete out[k];
  return out;
}

const idParent = id => String(id).split('.').slice(0, -1).join('.');

// A task the scenario added may meet a task the plan has added since under the
// same id. The plan's keeps the id; the scenario's moves to the next free one,
// with everything below it and every reference the scenario makes to it.
function renumberTakenAdds(patch, base) {
  const adds = patch?.tree?.add;
  if (!adds?.length) return patch;
  const del = new Set(patch.tree.del || []);
  const taken = new Set((base.tree || []).map(n => n.id).filter(id => !del.has(id)));
  const addedIds = new Set(adds.map(n => n.id));
  const map = new Map();
  for (const n of adds) {
    if (addedIds.has(idParent(n.id)) && idParent(n.id)) continue; // moves with its parent
    if (!taken.has(n.id)) continue;
    const parent = idParent(n.id);
    let next;
    if (parent) {
      let i = 1;
      do {
        next = `${parent}.${i++}`;
      } while (taken.has(next) || addedIds.has(next));
    } else {
      const m = String(n.id).match(/^(.*?)(\d+)$/);
      const stem = m ? m[1] : `${n.id}-`;
      let i = m ? parseInt(m[2], 10) + 1 : 2;
      do {
        next = `${stem}${i++}`;
      } while (taken.has(next) || addedIds.has(next));
    }
    map.set(n.id, next);
    taken.add(next);
  }
  if (!map.size) return patch;
  const remap = id => {
    if (typeof id !== 'string') return id;
    for (const [from, to] of map) {
      if (id === from) return to;
      if (id.startsWith(from + '.')) return to + id.slice(from.length);
    }
    return id;
  };
  const fixNode = n => {
    const out = { ...n };
    if (Array.isArray(out.deps)) out.deps = out.deps.map(remap);
    if (Array.isArray(out.softDeps)) out.softDeps = out.softDeps.map(remap);
    if (out._depLabels && typeof out._depLabels === 'object') {
      out._depLabels = Object.fromEntries(Object.entries(out._depLabels).map(([k, v]) => [remap(k), v]));
    }
    return out;
  };
  const tree = { ...patch.tree, add: adds.map(n => ({ ...fixNode(n), id: remap(n.id) })) };
  if (tree.set) tree.set = Object.fromEntries(Object.entries(tree.set).map(([id, s]) => [id, fixNode(s)]));
  const out = { ...patch, tree };
  if (patch.queues?.set) {
    out.queues = {
      ...patch.queues,
      set: Object.fromEntries(Object.entries(patch.queues.set).map(([k, ids]) => [k, Array.isArray(ids) ? ids.map(remap) : ids])),
    };
  }
  return out;
}

// The plan with the scenario's changes on it. `conflicts` lists the changes
// that no longer have anything to apply to — an item the plan has dropped in
// the meantime — so the surface can say that something did not carry over
// instead of quietly showing less than was saved.
export function applyPatch(base, patch) {
  if (!base) return { data: base, conflicts: [] };
  if (isEmptyPatch(patch)) return { data: base, conflicts: [] };
  const p = renumberTakenAdds(patch, base);
  const conflicts = [];
  const data = { ...base };
  for (const key of ID_LISTS) {
    if (p[key]) data[key] = applyIdList(base[key], p[key], key, conflicts);
  }
  for (const [key, keyOf] of Object.entries(VALUE_LISTS)) {
    if (p[key]) data[key] = applyValueList(base[key], p[key], keyOf);
  }
  if (p.queues) {
    const q = applyMap(base.personQueues, p.queues);
    if (isEmptyObj(q)) delete data.personQueues;
    else data.personQueues = q;
  }
  if (p.meta) data.meta = applyMap(base.meta, p.meta);
  for (const [k, v] of Object.entries(p.top || {})) data[k] = v;
  for (const k of p.topDel || []) delete data[k];
  return { data, conflicts };
}

// ── the list of scenarios ───────────────────────────────────────────────────

export function newScenarioId(existing = []) {
  const ids = new Set(existing.map(s => s.id));
  let i = existing.length + 1;
  while (ids.has(`s${i}`)) i++;
  return `s${i}`;
}

export function uniqueScenarioName(wanted, existing = [], exceptId = null) {
  const names = new Set(existing.filter(s => s.id !== exceptId).map(s => (s.name || '').trim().toLowerCase()));
  const base = (wanted || '').trim();
  if (!base) return base;
  if (!names.has(base.toLowerCase())) return base;
  let i = 2;
  while (names.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

// Put `patch` on scenario `id` in a list, leaving the others as they are.
// `changes` is how many things the user changed (describeChanges), kept on the
// entry so the menu can say the same number the bar will.
export function withScenarioPatch(scenarios, id, patch, changes = undefined, now = new Date()) {
  return (scenarios || []).map(s => {
    if (s.id !== id) return s;
    const count = changes === undefined ? s.changes : changes;
    if (deepEqual(s.patch || null, patch || null) && s.changes === count) return s;
    const { lost: _lost, ...rest } = s;
    return { ...rest, patch: patch || null, ...(count === undefined ? {} : { changes: count }), updatedAt: now.toISOString() };
  });
}

// An undo snapshot of the plan, taken before a visit to a scenario, brought up
// to date with what the visit did to the scenario list — so that undoing an
// edit to the plan does not also undo an afternoon's work in a scenario.
// `knownIds` is the list as it was when the visit began. Per scenario:
// - in the snapshot and still in the list: its place, its current content;
// - created during the visit: added;
// - there when the visit began and gone now: deleted DURING the visit, so it
//   is dropped — otherwise undoing an earlier edit to the plan would quietly
//   bring a deleted scenario back and write it to the file again;
// - in the snapshot but already gone when the visit began: deleted in the
//   plan before, by an edit this very stack can undo. It stays.
export function carryScenarioList(snapshot, list, knownIds) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const current = new Map((list || []).map(s => [s.id, s]));
  const own = snapshot.scenarios || [];
  const merged = own.filter(s => current.has(s.id) || !knownIds.has(s.id)).map(s => current.get(s.id) || s);
  for (const s of list || []) if (!knownIds.has(s.id) && !own.some(o => o.id === s.id)) merged.push(s);
  if (!merged.length) {
    if (!('scenarios' in snapshot)) return snapshot;
    const { scenarios: _gone, ...rest } = snapshot;
    return rest;
  }
  if (merged.length === own.length && merged.every((s, i) => s === own[i])) return snapshot;
  // (same length and same entries: nothing was dropped, added or refreshed)
  return { ...snapshot, scenarios: merged };
}

// ── what changed, in words a list can show ─────────────────────────────────

const nodeIsLeaf = (tree, id) => !tree.some(o => o.id !== id && o.id.startsWith(id + '.'));

// One entry per thing the user did, not per field the file stores. The UI
// formats `fields`; this only decides what counts as a change.
export function describeChanges(base, work, patch = diffPlan(base, work)) {
  const out = [];
  if (isEmptyPatch(patch) || !base || !work) return out;
  const baseTree = base.tree || [],
    workTree = work.tree || [];
  const baseNode = new Map(baseTree.map(n => [n.id, n]));
  const workNode = new Map(workTree.map(n => [n.id, n]));

  const t = patch.tree || {};
  for (const n of t.add || []) out.push({ kind: 'item', op: 'add', id: n.id, name: n.name || '', fields: [] });
  for (const id of t.del || []) out.push({ kind: 'item', op: 'remove', id, name: baseNode.get(id)?.name || '', fields: [] });
  const touched = new Set([...Object.keys(t.set || {}), ...Object.keys(t.unset || {})]);
  for (const id of touched) {
    const b = baseNode.get(id),
      w = workNode.get(id);
    if (!b || !w) continue;
    const keys = new Set([...Object.keys(t.set?.[id] || {}), ...(t.unset?.[id] || [])]);
    const fields = [];
    for (const key of keys) {
      if (DERIVED_NODE_FIELDS.has(key)) continue;
      // A parent's status and progress follow its children.
      if ((key === 'status' || key === 'progress') && !nodeIsLeaf(workTree, id)) continue;
      fields.push({ key, from: b[key], to: w[key] });
    }
    if (fields.length) out.push({ kind: 'item', op: 'change', id, name: w.name || b.name || '', fields });
  }

  for (const kind of ['members', 'teams']) {
    const d = patch[kind];
    if (!d) continue;
    const label = kind === 'members' ? 'person' : 'team';
    const bById = new Map((base[kind] || []).map(e => [e.id, e]));
    const wById = new Map((work[kind] || []).map(e => [e.id, e]));
    for (const e of d.add || []) out.push({ kind: label, op: 'add', id: e.id, name: e.name || '', fields: [] });
    for (const id of d.del || []) out.push({ kind: label, op: 'remove', id, name: bById.get(id)?.name || '', fields: [] });
    const ids = new Set([...Object.keys(d.set || {}), ...Object.keys(d.unset || {})]);
    for (const id of ids) {
      const b = bById.get(id),
        w = wById.get(id);
      if (!b || !w) continue;
      const keys = new Set([...Object.keys(d.set?.[id] || {}), ...(d.unset?.[id] || [])]);
      const fields = [...keys].map(key => ({ key, from: b[key], to: w[key] }));
      if (fields.length) out.push({ kind: label, op: 'change', id, name: w.name || b.name || '', fields });
    }
  }

  for (const v of patch.vacations?.add || [])
    out.push({
      kind: 'absence',
      op: 'add',
      id: VALUE_LISTS.vacations(v),
      person: v.person,
      from: v.from,
      to: v.to,
      note: v.note || '',
      fields: [],
    });
  for (const v of patch.vacations?.del || [])
    out.push({
      kind: 'absence',
      op: 'remove',
      id: VALUE_LISTS.vacations(v),
      person: v.person,
      from: v.from,
      to: v.to,
      note: v.note || '',
      fields: [],
    });
  for (const h of patch.holidays?.add || [])
    out.push({ kind: 'holiday', op: 'add', id: VALUE_LISTS.holidays(h), name: h.name || '', date: h.date, fields: [] });
  for (const h of patch.holidays?.del || [])
    out.push({ kind: 'holiday', op: 'remove', id: VALUE_LISTS.holidays(h), name: h.name || '', date: h.date, fields: [] });

  const queueKeys = new Set([...Object.keys(patch.queues?.set || {}), ...(patch.queues?.del || [])]);
  for (const key of queueKeys) {
    out.push({
      kind: 'order',
      op: 'change',
      id: key,
      fields: [{ key: 'order', from: base.personQueues?.[key] || null, to: work.personQueues?.[key] || null }],
    });
  }

  const metaKeys = new Set([...Object.keys(patch.meta?.set || {}), ...(patch.meta?.del || [])]);
  for (const key of metaKeys) {
    out.push({
      kind: 'setting',
      op: 'change',
      id: `meta.${key}`,
      name: key,
      fields: [{ key, from: base.meta?.[key], to: work.meta?.[key] }],
    });
  }
  for (const key of [...Object.keys(patch.top || {}), ...(patch.topDel || [])]) {
    out.push({ kind: 'setting', op: 'change', id: `top.${key}`, name: key, fields: [] });
  }
  return out;
}

// Take one change back out of a scenario: the patch without it.
export function revertChange(patch, change) {
  if (isEmptyPatch(patch) || !change) return patch;
  const out = { ...patch };
  // What goes with the entry depends on what was done to it. An item that was
  // ADDED takes the items added below it along (they have nowhere to hang
  // without it); one that was REMOVED brings its removed children back. One
  // that was merely CHANGED gives back its own fields and nothing else —
  // tasks added or removed under it are changes of their own, listed on
  // their own, and reverting a rename must not silently take them too.
  const dropFromIdList = (key, id) => {
    const d = out[key];
    if (!d) return;
    const below = other => key === 'tree' && String(other).startsWith(id + '.');
    const next = { ...d };
    if (change.op === 'add' && next.add) {
      next.add = next.add.filter(e => e.id !== id && !below(e.id));
      // Fields set on anything below an added parent belong to those adds.
      for (const part of ['set', 'unset']) {
        if (!next[part]) continue;
        next[part] = Object.fromEntries(Object.entries(next[part]).filter(([k]) => !below(k)));
      }
    }
    if (change.op === 'remove' && next.del) next.del = next.del.filter(x => x !== id && !below(x));
    if (next.set) {
      next.set = { ...next.set };
      delete next.set[id];
    }
    if (next.unset) {
      next.unset = { ...next.unset };
      delete next.unset[id];
    }
    for (const k of ['add', 'del']) if (next[k] && !next[k].length) delete next[k];
    for (const k of ['set', 'unset']) if (next[k] && isEmptyObj(next[k])) delete next[k];
    if (isEmptyObj(next)) delete out[key];
    else out[key] = next;
  };
  if (change.kind === 'item') dropFromIdList('tree', change.id);
  else if (change.kind === 'person') dropFromIdList('members', change.id);
  else if (change.kind === 'team') dropFromIdList('teams', change.id);
  else if (change.kind === 'absence' || change.kind === 'holiday') {
    const key = change.kind === 'absence' ? 'vacations' : 'holidays';
    const keyOf = VALUE_LISTS[key];
    const d = out[key];
    if (d) {
      const next = {
        ...(d.add ? { add: d.add.filter(e => keyOf(e) !== change.id) } : {}),
        ...(d.del ? { del: d.del.filter(e => keyOf(e) !== change.id) } : {}),
      };
      for (const k of ['add', 'del']) if (next[k] && !next[k].length) delete next[k];
      if (isEmptyObj(next)) delete out[key];
      else out[key] = next;
    }
  } else if (change.kind === 'order' && out.queues) {
    const next = { ...out.queues };
    if (next.set) {
      next.set = { ...next.set };
      delete next.set[change.id];
      if (isEmptyObj(next.set)) delete next.set;
    }
    if (next.del) {
      next.del = next.del.filter(k => k !== change.id);
      if (!next.del.length) delete next.del;
    }
    if (isEmptyObj(next)) delete out.queues;
    else out.queues = next;
  } else if (change.kind === 'setting') {
    if (change.id.startsWith('meta.') && out.meta) {
      const key = change.id.slice(5);
      const next = { ...out.meta };
      if (next.set) {
        next.set = { ...next.set };
        delete next.set[key];
        if (isEmptyObj(next.set)) delete next.set;
      }
      if (next.del) {
        next.del = next.del.filter(k => k !== key);
        if (!next.del.length) delete next.del;
      }
      if (isEmptyObj(next)) delete out.meta;
      else out.meta = next;
    } else if (change.id.startsWith('top.')) {
      const key = change.id.slice(4);
      if (out.top) {
        out.top = { ...out.top };
        delete out.top[key];
        if (isEmptyObj(out.top)) delete out.top;
      }
      if (out.topDel) {
        out.topDel = out.topDel.filter(k => k !== key);
        if (!out.topDel.length) delete out.topDel;
      }
    }
  }
  return isEmptyObj(out) ? null : out;
}

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
