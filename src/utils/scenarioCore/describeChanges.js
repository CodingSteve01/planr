import { DERIVED_NODE_FIELDS, VALUE_LISTS, diffPlan, isEmptyObj, isEmptyPatch } from './patchDiff.js';

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
