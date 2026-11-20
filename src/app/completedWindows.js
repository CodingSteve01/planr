import { useEffect } from 'react';
import { iso } from '../utils/date.js';
import { isLeafNode } from '../utils/scheduler.js';
import { deriveCompletedWindow, inferCompletedAt, inferCompletedPersonId } from '../utils/completion.js';

// Persist the last visible schedule window for completed tasks so they stay visible
// in the Gantt after being marked done, without reintroducing them into future planning.
//
// The effect is as it stood in the app component, line for line. It is longer
// and more branched than a function here should be; it is also the code that
// decides what a finished task remembers, and it has no tests of its own yet.
// Splitting it is a change to make with those tests, not in a move.
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
    const prevTree = prevTreeRef.current || [];
    const prevTreeMap = new Map(prevTree.map(r => [r.id, r]));
    const prevScheduledMap = new Map((prevScheduledRef.current || []).map(s => [s.id, s]));
    const currentScheduledMap = new Map((scheduled || []).map(s => [s.id, s]));
    const patches = new Map();
    const todayIso = iso(new Date());

    tree.forEach(r => {
      if (!isLeafNode(tree, r.id)) return;
      const hasCompletionMeta = !!(
        r.completedAt ||
        r.completedStart ||
        r.completedEnd ||
        r.completedPersonId ||
        r.completedPerson ||
        r.completedAutoAssigned ||
        r.plannedStart ||
        r.plannedEnd
      );
      const prev = prevTreeMap.get(r.id);
      const snap = prevScheduledMap.get(r.id);

      if (r.status === 'done') {
        const completedPersonId = inferCompletedPersonId(r, members, snap);
        const completedAt =
          prev?.status !== 'done' && !r.completedAt
            ? todayIso
            : inferCompletedAt({
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
        if (!completedAt) return;
        // Persisted done-window takes precedence over re-inference. The user
        // may reconstruct history by editing done-start/done-end directly, so
        // do not recalculate that window just because completedAt changed in
        // the same edit. Refresh only when no window exists, when a task is
        // newly completed, or when the cached window is clearly stale.
        const hasExistingWindow = !!r.completedStart && !!r.completedEnd;
        const windowWasEdited = !!prev && (prev.completedStart !== r.completedStart || prev.completedEnd !== r.completedEnd);
        const completedAtChanged = !!prev && prev.completedAt !== completedAt;
        const windowMatchesCompletedAt = hasExistingWindow && r.completedEnd === completedAt;
        const shouldRefreshWindow =
          !hasExistingWindow ||
          (prev && prev.status !== 'done') ||
          (completedAtChanged && !windowWasEdited && !windowMatchesCompletedAt) ||
          (prev && prev.completedPersonId !== completedPersonId && !windowWasEdited);
        const window = shouldRefreshWindow
          ? deriveCompletedWindow({ item: r, completedAt, completedPersonId, members, vacations, hm, workDays })
          : { completedStart: r.completedStart, completedEnd: r.completedEnd };
        const completedPerson =
          r.completedPerson ||
          (completedPersonId ? members.find(m => m.id === completedPersonId)?.name || completedPersonId : snap?.person || '');
        const plannedStart = r.plannedStart || (snap?.startD ? iso(snap.startD) : '');
        const plannedEnd = r.plannedEnd || (snap?.endD ? iso(snap.endD) : '');
        const patch = {
          completedAt,
          completedStart: window.completedStart,
          completedEnd: window.completedEnd,
        };
        if (completedPersonId) patch.completedPersonId = completedPersonId;
        if (completedPerson) patch.completedPerson = completedPerson;
        if (snap?.autoAssigned || r.completedAutoAssigned) patch.completedAutoAssigned = true;
        if (plannedStart) patch.plannedStart = plannedStart;
        if (plannedEnd) patch.plannedEnd = plannedEnd;
        const needsPatch = Object.entries(patch).some(([key, value]) => r[key] !== value);
        if (!needsPatch) return;
        patches.set(r.id, patch);
        return;
      }
      if (hasCompletionMeta) patches.set(r.id, { _clearCompletedWindow: true });
    });

    prevTreeRef.current = tree;
    prevScheduledRef.current = scheduled;

    if (!patches.size) return;

    let didChange = false;
    setData(d => {
      if (!d?.tree?.length) return d;
      const nextTree = d.tree.map(r => {
        const patch = patches.get(r.id);
        if (!patch) return r;
        if (patch._clearCompletedWindow) {
          const {
            completedAt,
            completedStart,
            completedEnd,
            completedPersonId,
            completedPerson,
            completedAutoAssigned,
            plannedStart,
            plannedEnd,
            ...rest
          } = r;
          if (
            completedAt == null &&
            completedStart == null &&
            completedEnd == null &&
            completedPersonId == null &&
            completedPerson == null &&
            completedAutoAssigned == null &&
            plannedStart == null &&
            plannedEnd == null
          )
            return r;
          didChange = true;
          return rest;
        }
        const alreadyApplied = Object.entries(patch).every(([k, v]) => r[k] === v);
        if (alreadyApplied) return r;
        didChange = true;
        return { ...r, ...patch };
      });
      return didChange ? { ...d, tree: nextTree } : d;
    });
    setSaved(false);
  }, [tree, scheduled, members, vacations, hm, workDays, planStart]);
}
