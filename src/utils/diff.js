// Project-wide diff computation: replay the history event stream up to a
// chosen cutoff and compare against the current tree. Produces a single bag
// of ids/maps the various views (Roadmap, TreeView, Timetable, Gantt, Network)
// consume to highlight what changed in the window.
//
// Keep this pure so it composes cleanly into useMemo. Views are expected to
// pre-filter their tree (e.g. NetGraph already drops descendants of collapsed
// nodes) and look up ids in the returned sets.
import { stateAsOf } from './history.js';
import { re } from './scheduler.js';

export function computeDiff({ tree, historyEvents, sinceDate }) {
  if (!sinceDate || !Array.isArray(historyEvents) || !historyEvents.length || !Array.isArray(tree)) {
    return null;
  }
  const pastLeafState = stateAsOf(historyEvents, sinceDate);
  const cutoffIso = sinceDate instanceof Date ? sinceDate.toISOString() : new Date(sinceDate).toISOString();

  const doneInWindowIds = new Set();
  const progressedInWindowIds = new Set();

  // Pass 1: walk events strictly after the cutoff. A status=done event is
  // counted only when the prior state was NOT done (real transition). A
  // progress event counts when it's an increase and the task wasn't already
  // done. `kind=added` after the cutoff marks an actual new leaf.
  for (const ev of historyEvents) {
    if (ev.ts <= cutoffIso) continue;
    const past = pastLeafState.get(ev.id);
    if (ev.status === 'done' && past?.status !== 'done') {
      doneInWindowIds.add(ev.id);
    } else if (typeof ev.progress === 'number' && past && ev.progress > (past.progress || 0) && past.status !== 'done') {
      progressedInWindowIds.add(ev.id);
    } else if (ev.kind === 'added' && !past) {
      progressedInWindowIds.add(ev.id);
    }
  }

  // Pass 2: catch unsaved current-tree edits. If the live tree shows a leaf
  // as done/progressed but no post-cutoff event has been written yet, still
  // count it. Restricted to leaves so parent rows don't get false hits.
  for (const r of tree) {
    const isLeaf = !tree.some(o => o.id !== r.id && o.id.startsWith(r.id + '.'));
    if (!isLeaf) continue;
    const past = pastLeafState.get(r.id);
    const nowStatus = r.status || 'open';
    const nowProg = typeof r.progress === 'number' ? r.progress : (nowStatus === 'done' ? 100 : nowStatus === 'wip' ? 50 : 0);
    if (nowStatus === 'done' && past?.status !== 'done') {
      doneInWindowIds.add(r.id);
    } else if (past && nowStatus !== 'done' && nowProg > (past.progress || 0)) {
      progressedInWindowIds.add(r.id);
    } else if (!past) {
      progressedInWindowIds.add(r.id);
    }
  }

  // Anything that progressed AND is now done already sits in doneInWindowIds.
  for (const id of doneInWindowIds) progressedInWindowIds.delete(id);
  const changedInWindowIds = new Set([...doneInWindowIds, ...progressedInWindowIds]);

  // Per-root past progress (effort-weighted). Used by the Roadmap to render
  // the ghost-train marker. Roots are top-level rows (no dot in the id).
  const roots = tree.filter(r => !r.id.includes('.'));
  const pastProgressByRootId = {};
  const newRootIds = [];
  for (const root of roots) {
    const subtreeLeaves = tree
      .filter(n => n.id === root.id || n.id.startsWith(root.id + '.'))
      .filter(n => !tree.some(other => other.id !== n.id && other.id.startsWith(n.id + '.')));
    let totalEff = 0, doneEff = 0;
    let anyPastLeaf = false;
    for (const lf of subtreeLeaves) {
      const eff = re(lf.best || 0, lf.factor || 1.5) || 1;
      totalEff += eff;
      const past = pastLeafState.get(lf.id);
      if (past) anyPastLeaf = true;
      const pastDone = past?.status === 'done';
      const pastProg = past ? (past.progress || 0) / 100 : 0;
      doneEff += eff * (pastDone ? 1 : pastProg);
    }
    pastProgressByRootId[root.id] = totalEff > 0 ? doneEff / totalEff : 0;
    if (!anyPastLeaf && subtreeLeaves.length > 0) newRootIds.push(root.id);
  }

  // Banner counts: tasks (leaves) newly done and total effort burnt.
  let doneCount = 0, effortInWindow = 0;
  for (const id of doneInWindowIds) {
    const node = tree.find(r => r.id === id);
    if (!node) continue;
    doneCount++;
    effortInWindow += re(node.best || 0, node.factor || 1.5) || 0;
  }

  return {
    sinceDate,
    pastLeafState,
    pastProgressByRootId,
    newRootIds,
    doneInWindowIds: [...doneInWindowIds],
    progressedInWindowIds: [...progressedInWindowIds],
    changedInWindowIds: [...changedInWindowIds],
    doneCount,
    effortInWindow,
  };
}

// Convenience: parse a localStorage-style "since" string ("", "7", "14", "30",
// or "YYYY-MM-DD") into a JS Date. Shared by every view so they interpret the
// global picker value the same way.
export function parseSinceValue(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(val + 'T23:59:59');
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d;
}
