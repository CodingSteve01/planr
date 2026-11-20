// Edits to single nodes and their place in the tree. Every function takes the
// context its hook builds (`ctx`) first; `ctx.act` is the hook's own result,
// for the functions that call each other. All writes go through `ctx.mutate`
// (the undo gateway) or, where the original did, through `setData` plus an
// explicit history push.
import { pendingDate } from '../../utils/history.js';
import { computeDisplayOrder, applyDisplayOrder } from '../../utils/displayOrder.js';
import { nextChildId } from '../../utils/scheduler.js';
import { moveSubtree, placeAmongSiblings, applyTreeCommand } from '../../utils/treeMove.js';
import { push as pushHistory } from '../../utils/undo.js';

export function setD(ctx, k, v) {
  const { mutate } = ctx;
  mutate(d => ({ ...d, [k]: v }));
}

// Functional update so callbacks fired in rapid succession always see the LATEST tree state,
// not a closure-captured snapshot. Prevents the second of two fast edits from overwriting the
// first (e.g. deleting two dependency arrows in the Gantt within the same tick).
// `opts.asOf` dates a status or progress change to an earlier day. The date
// is kept in the document (`asOfPending`) until the next save reads it, so
// an undo takes it back together with the change, a later edit of the item
// from anywhere voids it, and the save's diff stays
// the one place that writes history (utils/history.js `stampPendingDates`).
export function updateNode(ctx, u, opts = {}) {
  const { mutate, scnRef, meta } = ctx;
  const pending = opts.asOf && !scnRef.current ? pendingDate(opts.asOf, u) : null;
  const dated = d => (pending ? { ...d, asOfPending: { ...(d.asOfPending || {}), [u.id]: pending } } : d);
  // Auto-extend viewStart if the user pins a task before the current visual horizon.
  if (u.pinnedStart) {
    const vs = meta.viewStart || meta.planStart;
    if (vs && u.pinnedStart < vs) {
      // Extend viewStart 2 weeks before the pin so the bar isn't flush at the left edge.
      const pinD = new Date(u.pinnedStart);
      const extended = new Date(pinD);
      extended.setDate(extended.getDate() - 14);
      const extStr = extended.toISOString().slice(0, 10);
      mutate(d =>
        dated({
          ...d,
          meta: { ...d.meta, viewStart: extStr },
          tree: (d.tree || []).map(r => (r.id === u.id ? u : r)),
        }),
      );
      return;
    }
  }
  mutate(d => dated({ ...d, tree: (d.tree || []).map(r => (r.id === u.id ? u : r)) }));
}

// Targeted dep mutations: read current tree state and touch ONLY the deps field.
// Avoids the stale-closure overwrite pattern where `{...oldNode, deps: newDeps}` wipes
// out unrelated field changes that happened after the callback was created.
// Remove a dep edge — checks both hard and soft buckets so the caller
// can stay agnostic ("delete this connection") without knowing the
// kind. Returns the node to either bucket if it lives there.
export function removeDep(ctx, fromId, depId) {
  const { mutate } = ctx;
  mutate(d => {
    const tree = d.tree || [];
    const mutated = tree.map(r => {
      if (r.id !== fromId) return r;
      const next = { ...r, deps: (r.deps || []).filter(x => x !== depId) };
      // Strip any lingering softDeps too — legacy field that's no longer
      // emitted, but old plans might still carry it on the in-memory node.
      if (r.softDeps?.length) next.softDeps = r.softDeps.filter(x => x !== depId);
      return next;
    });
    return { ...d, tree: applyDisplayOrder(mutated, computeDisplayOrder(mutated)) };
  });
}

// Add a hard dep edge. Soft deps were removed — every link is a hard
// dependency now ("X must finish before Y"). Drag-link, NodeModal picker,
// and selection "Reihenfolge linken" all go through this single path.
export function addDep(ctx, fromId, depId) {
  const { mutate } = ctx;
  if (fromId === depId) return;
  mutate(d => {
    const mutated = (d.tree || []).map(r => {
      if (r.id !== fromId) return r;
      const merged = new Set([...(r.deps || []), ...(r.softDeps || [])]);
      if (merged.has(depId)) {
        // Already linked (possibly as legacy soft); ensure it lives in deps
        // and drop any stale softDeps reference.
        const next = { ...r, deps: [...new Set([...(r.deps || []), depId])] };
        if (r.softDeps?.length) next.softDeps = r.softDeps.filter(x => x !== depId);
        return next;
      }
      return { ...r, deps: [...(r.deps || []), depId] };
    });
    return { ...d, tree: applyDisplayOrder(mutated, computeDisplayOrder(mutated)) };
  });
}

// Functional, and prefix-safe. Two bugs lived in the one-liner this
// replaces, both harmless while deleting was a mouse trip behind a confirm
// and both reachable now that ⌫ deletes in one keystroke:
//   * it read `tree` from the render closure, so a delete chained after
//     another edit in the same tick overwrote that edit,
//   * `startsWith(id)` is not a subtree test — deleting "P1" also deleted
//     "P10" and "P12". Only `id` itself and `id + '.'` are descendants.
export function deleteNode(ctx, id) {
  const { mutate, setSel } = ctx;
  mutate(d => ({ ...d, tree: (d.tree || []).filter(r => r.id !== id && !r.id.startsWith(id + '.')) }));
  setSel(null);
}

// Functional for the same reason as every other mutator here: the tree
// editor commits a rename and inserts the next row inside ONE keypress, and
// reading `tree` from the render closure made the insert write back a
// snapshot taken before the rename — silently throwing the typed name away.
// That is the exact failure the comments on updateNode and removeDep warn
// about; it just took a single-keystroke workflow to make it reachable.
export function addNode(ctx, node) {
  const { mutate } = ctx;
  const pid = node.id.split('.').slice(0, -1).join('.');
  mutate(d => {
    const nt = [...(d.tree || [])];
    if (!pid) {
      nt.push(node);
      return { ...d, tree: nt };
    }
    let ins = -1;
    for (let i = nt.length - 1; i >= 0; i--) {
      if (nt[i].id === pid || nt[i].id.startsWith(pid + '.')) {
        ins = i + 1;
        break;
      }
    }
    if (ins >= 0) nt.splice(ins, 0, node);
    else nt.push(node);
    return { ...d, tree: nt };
  });
}

// Compute an ID map for moving/duplicating a subtree rooted at `nodeId` under `newParentId`.
// Returns: { [oldId]: newId } for the node and every descendant.
function computeIdMap(tree, nodeId, newParentId) {
  const subtreeIds = [nodeId, ...tree.filter(r => r.id.startsWith(nodeId + '.')).map(r => r.id)];
  const newBase = nextChildId(tree, newParentId);
  const map = { [nodeId]: newBase };
  subtreeIds.slice(1).forEach(old => {
    map[old] = newBase + old.slice(nodeId.length);
  });
  return map;
}

// Duplicate a node + its entire subtree. Deps pointing INSIDE the subtree are remapped;
// deps pointing OUTSIDE are preserved. Returns the new root node id.
export function duplicateNode(ctx, nodeId) {
  const { tree, act } = ctx;
  const node = tree.find(r => r.id === nodeId);
  if (!node) return null;
  const parentOfNode = nodeId.split('.').slice(0, -1).join('.'); // stays under same parent
  const idMap = computeIdMap(tree, nodeId, parentOfNode);
  const copies = [nodeId, ...tree.filter(r => r.id.startsWith(nodeId + '.')).map(r => r.id)].map(oldId => {
    const orig = tree.find(r => r.id === oldId);
    const copy = { ...orig, id: idMap[oldId] };
    // Remap deps that point within the subtree, keep deps pointing outside
    copy.deps = (orig.deps || []).map(d => idMap[d] || d);
    // Preserve _depLabels but remap keys
    if (orig._depLabels) {
      copy._depLabels = {};
      Object.entries(orig._depLabels).forEach(([k, v]) => {
        copy._depLabels[idMap[k] || k] = v;
      });
    }
    // Reset progress/status for fresh copy (user decides)
    delete copy.pinnedStart;
    if (copy.phases) {
      copy.phases = copy.phases.map(p => ({
        ...p,
        id: 'ph' + Date.now() + Math.random().toString(36).slice(2, 6),
        status: 'open',
        assign: [],
      }));
    }
    return copy;
  });
  act.setD('tree', [...tree, ...copies]);
  return idMap[nodeId];
}

// Move a node (and its subtree) under a new parent ('' for top-level).
// Updates IDs, dep references everywhere, and re-sorts so siblings are grouped.
export function moveNode(ctx, nodeId, newParentId) {
  const { tree, mutate } = ctx;
  if (nodeId === newParentId) return;
  // Prevent moving into own descendant (would create a cycle)
  if (newParentId && (newParentId === nodeId || newParentId.startsWith(nodeId + '.'))) {
    alert('Cannot move an item under itself or one of its descendants.');
    return;
  }
  // The id map depends on STRUCTURE only, so computing it from the render
  // closure is sound — but applying it must be functional, or a name
  // written in the same tick (Tab straight out of the inline editor) is
  // overwritten by this snapshot. That is exactly the bug addNode had.
  const planned = moveSubtree(tree, nodeId, newParentId);
  if (!planned) return; // no-op
  mutate(d => ({ ...d, tree: moveSubtree(d.tree || [], nodeId, newParentId)?.tree || d.tree }));
  return planned.id;
}

// The work tree's four structural commands — move up/down, indent,
// outdent (utils/treeMove.js). One command, one state update, one undo
// step: outdent used to be a re-parent followed by a separate reorder.
// Returns { id, idMap } — where the row lives now — or null when the
// command cannot run from here.
export function runTreeCommand(ctx, id, command, visibleIds) {
  const { tree, mutate } = ctx;
  const planned = applyTreeCommand(tree, id, command, visibleIds);
  if (!planned) return null;
  mutate(d => ({ ...d, tree: applyTreeCommand(d.tree || [], id, command, visibleIds)?.tree || d.tree }));
  return { id: planned.id, idMap: planned.idMap };
}

// Reorder a node within its sibling list by writing persistent displayOrder
// values. IDs and dependencies stay stable; the order round-trips as `ord:`.
// Direction: 'up'|'down'|'first'|'last' or { targetId, position:'before'|'after' }.
export function reorderSibling(ctx, nodeId, direction) {
  const { dataRef, setData, setHistory, setSaved } = ctx;
  let changed = false;
  // The snapshot undo will return to must be the state that is CURRENT, not
  // the one this render closed over — see mutate() above.
  const before = dataRef.current;
  setData(d => {
    const nextTree = placeAmongSiblings(d.tree || [], nodeId, direction);
    if (!nextTree) return d;
    changed = true;
    return { ...d, tree: nextTree };
  });
  if (changed) {
    setHistory(h => pushHistory(h, before, { coalesceMs: 300 }));
    setSaved(false);
  }
}

// Gantt drag callback. Accepts either a number (legacy seq update) or an object patch (e.g. {pinnedStart}).
export function onSeqUpdate(ctx, taskId, patch) {
  const { tree, act } = ctx;
  const update = typeof patch === 'object' && patch !== null ? patch : { seq: patch };
  act.setD(
    'tree',
    tree.map(r => (r.id === taskId ? { ...r, ...update } : r)),
  );
}

// Extend the plan start date backward so partially-done tasks that began before the
// current horizon fit naturally. Scheduler re-computes with the wider window; existing
// positions shift right by the added weeks.
// Extend the VISUAL start (viewStart) without touching the scheduling start (planStart).
// Pre-planStart weeks exist for display only — the scheduler still begins at planStart.
export function extendViewStart(ctx, newStart) {
  const { meta, mutate } = ctx;
  if (!newStart || newStart >= (meta.viewStart || meta.planStart || '9999')) return;
  mutate(d => ({ ...d, meta: { ...d.meta, viewStart: newStart } }));
}
