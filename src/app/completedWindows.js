import { useEffect } from 'react';
import { iso } from '../utils/date.js';
import { isLeafNode } from '../utils/scheduler.js';
import { deriveCompletedWindow, inferCompletedAt, inferCompletedPersonId } from '../utils/completion.js';

// What a finished item remembers about when and by whom it was done.
const COMPLETION_KEYS = [
  'completedAt',
  'completedStart',
  'completedEnd',
  'completedPersonId',
  'completedPerson',
  'completedAutoAssigned',
  'plannedStart',
  'plannedEnd',
];

// Persisted done-window takes precedence over re-inference. The user
// may reconstruct history by editing done-start/done-end directly, so
// do not recalculate that window just because completedAt changed in
// the same edit. Refresh only when no window exists, when a task is
// newly completed, or when the cached window is clearly stale.
function windowAfterEdit(r, prev, completedAt, completedPersonId, env) {
  const hasExistingWindow = !!r.completedStart && !!r.completedEnd;
  const windowWasEdited = !!prev && (prev.completedStart !== r.completedStart || prev.completedEnd !== r.completedEnd);
  const completedAtChanged = !!prev && prev.completedAt !== completedAt;
  const windowMatchesCompletedAt = hasExistingWindow && r.completedEnd === completedAt;
  const shouldRefreshWindow =
    !hasExistingWindow ||
    (prev && prev.status !== 'done') ||
    (completedAtChanged && !windowWasEdited && !windowMatchesCompletedAt) ||
    (prev && prev.completedPersonId !== completedPersonId && !windowWasEdited);
  if (!shouldRefreshWindow) return { completedStart: r.completedStart, completedEnd: r.completedEnd };
  const { members, vacations, hm, workDays } = env;
  return deriveCompletedWindow({ item: r, completedAt, completedPersonId, members, vacations, hm, workDays });
}

function completedAtOf(r, prev, completedPersonId, snap, env) {
  if (prev?.status !== 'done' && !r.completedAt) return env.todayIso;
  const { tree, currentScheduledMap, workDays, planStart, members, vacations, hm } = env;
  return inferCompletedAt({
    item: r,
    tree,
    scheduledMap: currentScheduledMap,
    scheduledSnap: snap,
    workDays,
    planStart,
    completedPersonId,
    members,
    vacations,
    hm,
  });
}

// Who did it: filled in only where known.
function personFields(r, snap, members, completedPersonId) {
  const out = {};
  const completedPerson =
    r.completedPerson ||
    (completedPersonId ? members.find(m => m.id === completedPersonId)?.name || completedPersonId : snap?.person || '');
  if (completedPersonId) out.completedPersonId = completedPersonId;
  if (completedPerson) out.completedPerson = completedPerson;
  if (snap?.autoAssigned || r.completedAutoAssigned) out.completedAutoAssigned = true;
  return out;
}

// What had been planned for it.
function plannedFields(r, snap) {
  const out = {};
  const plannedStart = r.plannedStart || (snap?.startD ? iso(snap.startD) : '');
  const plannedEnd = r.plannedEnd || (snap?.endD ? iso(snap.endD) : '');
  if (plannedStart) out.plannedStart = plannedStart;
  if (plannedEnd) out.plannedEnd = plannedEnd;
  return out;
}

// The fields a finished leaf should carry, or null when it already carries
// them (or nothing can be said about when it was done).
function donePatch(r, prev, snap, env) {
  const completedPersonId = inferCompletedPersonId(r, env.members, snap);
  const completedAt = completedAtOf(r, prev, completedPersonId, snap, env);
  if (!completedAt) return null;
  const doneWindow = windowAfterEdit(r, prev, completedAt, completedPersonId, env);
  const patch = {
    completedAt,
    completedStart: doneWindow.completedStart,
    completedEnd: doneWindow.completedEnd,
    ...personFields(r, snap, env.members, completedPersonId),
    ...plannedFields(r, snap),
  };
  return Object.entries(patch).some(([key, value]) => r[key] !== value) ? patch : null;
}

function leafPatch(r, prevTreeMap, prevScheduledMap, env) {
  if (r.status === 'done') return donePatch(r, prevTreeMap.get(r.id), prevScheduledMap.get(r.id), env);
  const hasCompletionMeta = COMPLETION_KEYS.some(k => r[k]);
  return hasCompletionMeta ? { _clearCompletedWindow: true } : null;
}

function collectPatches(prevTree, prevScheduled, env) {
  const prevTreeMap = new Map(prevTree.map(r => [r.id, r]));
  const prevScheduledMap = new Map(prevScheduled.map(s => [s.id, s]));
  const patches = new Map();
  env.tree.forEach(r => {
    if (!isLeafNode(env.tree, r.id)) return;
    const patch = leafPatch(r, prevTreeMap, prevScheduledMap, env);
    if (patch) patches.set(r.id, patch);
  });
  return patches;
}

// The item without any completion fields, or the item itself when it had none.
function withoutCompletion(r) {
  if (COMPLETION_KEYS.every(k => r[k] == null)) return r;
  const rest = { ...r };
  COMPLETION_KEYS.forEach(k => delete rest[k]);
  return rest;
}

function applyPatch(r, patch) {
  if (patch._clearCompletedWindow) return withoutCompletion(r);
  const alreadyApplied = Object.entries(patch).every(([k, v]) => r[k] === v);
  return alreadyApplied ? r : { ...r, ...patch };
}

function applyPatches(d, patches) {
  if (!d?.tree?.length) return d;
  let didChange = false;
  const nextTree = d.tree.map(r => {
    const patch = patches.get(r.id);
    if (!patch) return r;
    const next = applyPatch(r, patch);
    if (next !== r) didChange = true;
    return next;
  });
  return didChange ? { ...d, tree: nextTree } : d;
}

// Persist the last visible schedule window for completed tasks so they stay visible
// in the Gantt after being marked done, without reintroducing them into future planning.
// The two refs hold the previous render's tree and schedule between runs.
export function useCompletedWindows({
  tree,
  scheduled,
  members,
  vacations,
  hm,
  workDays,
  planStart,
  setData,
  setSaved,
  prevTreeRef,
  prevScheduledRef,
}) {
  useEffect(() => {
    const env = {
      tree,
      members,
      vacations,
      hm,
      workDays,
      planStart,
      todayIso: iso(new Date()),
      currentScheduledMap: new Map((scheduled || []).map(s => [s.id, s])),
    };
    const patches = collectPatches(prevTreeRef.current || [], prevScheduledRef.current || [], env);
    prevTreeRef.current = tree;
    prevScheduledRef.current = scheduled;
    if (!patches.size) return;
    setData(d => applyPatches(d, patches));
    setSaved(false);
  }, [tree, scheduled, members, vacations, hm, workDays, planStart]);
}
