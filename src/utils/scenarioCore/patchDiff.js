// Keys a scenario has no say over. `scenarios` is the list itself;
// `historyEvents` is the record of what really happened, which a what-if must
// never write; `roadmapAssignment` is derived layout the app re-merges on its
// own.
export const SCENARIO_IGNORED_KEYS = new Set(['scenarios', 'historyEvents', 'roadmapAssignment', 'asOfPending', 'dayLog']);

// Lists whose entries carry an `id`: compared entry by entry, field by field.
const ID_LISTS = ['tree', 'members', 'teams'];
// Lists whose entries are their own identity: an entry is there or it is not.
export const VALUE_LISTS = {
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

export const isEmptyObj = o => !o || Object.keys(o).length === 0;

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
