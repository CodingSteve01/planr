import { deepEqual } from './patchDiff.js';

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
