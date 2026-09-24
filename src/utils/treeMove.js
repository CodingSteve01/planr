// The four structural commands of the work tree — move up, move down,
// indent, outdent — as pure functions on a flat tree.
//
// Why a module of its own: the commands used to be assembled in TreeView out
// of two App callbacks (moveNode, then reorderSibling), each writing its own
// state update. That made "outdent and land right after the old parent" two
// undo steps and two renders, and it let ⌥↑/⌥↓ quietly turn into a re-parent
// at the end of a sibling run. Reordering and re-parenting are separate
// commands now, and each one is a single transformation of the tree:
//
//   moveUp / moveDown   reorder among siblings. The parent never changes.
//   indent              the row becomes the LAST child of its previous sibling.
//   outdent             the row becomes the sibling immediately AFTER its
//                       parent.
//
// Toolbar, keyboard and App all go through `planTreeCommand` (can it run, and
// what exactly will it do) and `applyTreeCommand` (do it). Nothing here
// touches React.
//
// A node always moves with its whole subtree. Ids are hierarchical (P1.2.3),
// so a re-parent renumbers the node and every descendant, and remaps every
// dependency that pointed at them; `applyTreeCommand` returns the id map so
// the caller can carry selection and fold state across.
import { nextChildId } from './scheduler.js';
import { compareSiblings, sortTree } from './treeEdit.js';

export const TREE_COMMANDS = ['moveUp', 'moveDown', 'moveFirst', 'moveLast', 'indent', 'outdent'];

const parentOf = id => id.split('.').slice(0, -1).join('.');

// ── Planning ─────────────────────────────────────────────────────────────
// `visibleIds` is the on-screen row order. Every command is decided against
// what the user can SEE: a step that swapped the row with a hidden sibling
// (a finished task, an archived project, a collapsed branch) would look like
// nothing happened, and indenting under an invisible row would put it
// somewhere nobody chose.
//
// Returns null when the command cannot run from here — that is the one
// answer the toolbar's disabled state and the keyboard's no-op share — or
//   { parentId?, place }
// where `parentId` (present only for indent/outdent) is the new parent ('' for
// the top level) and `place` is where the row lands among its siblings:
// 'first' | 'last' | { targetId, position: 'before' | 'after' }.
export function planTreeCommand(visibleIds, id, command) {
  if (!id || !visibleIds?.includes(id)) return null;
  const parent = parentOf(id);
  const run = visibleIds.filter(v => parentOf(v) === parent);
  const idx = run.indexOf(id);

  switch (command) {
    case 'moveUp':
      return idx > 0 ? { place: { targetId: run[idx - 1], position: 'before' } } : null;
    case 'moveDown':
      return idx >= 0 && idx < run.length - 1 ? { place: { targetId: run[idx + 1], position: 'after' } } : null;
    // All the way in one press. Still expressed against a visible row, so
    // the end of the run is the end you can see.
    case 'moveFirst':
      return idx > 0 ? { place: { targetId: run[0], position: 'before' } } : null;
    case 'moveLast':
      return idx >= 0 && idx < run.length - 1 ? { place: { targetId: run[run.length - 1], position: 'after' } } : null;
    case 'indent':
      // No previous sibling, nothing to become a child of.
      return idx > 0 ? { parentId: run[idx - 1], place: 'last' } : null;
    case 'outdent':
      // A top-level row is already as far out as it goes.
      return parent ? { parentId: parentOf(parent), place: { targetId: parent, position: 'after' } } : null;
    default:
      return null;
  }
}

export function canTreeCommand(visibleIds, id, command) {
  return planTreeCommand(visibleIds, id, command) !== null;
}

// ── Primitives ───────────────────────────────────────────────────────────
// Where each id of a subtree goes when its root moves under `newParentId`.
export function subtreeIdMap(tree, nodeId, newParentId) {
  const newBase = nextChildId(tree, newParentId);
  const map = { [nodeId]: newBase };
  tree.forEach(r => { if (r.id.startsWith(nodeId + '.')) map[r.id] = newBase + r.id.slice(nodeId.length); });
  return map;
}

// Re-parents `nodeId` and its whole subtree. Renumbers the moved ids and
// remaps every dependency (and its label) that referred to them, anywhere in
// the plan. Returns { tree, idMap, id } or null for an impossible move: into
// itself or its own subtree, or to the parent it already has.
export function moveSubtree(tree, nodeId, newParentId) {
  if (!tree.some(r => r.id === nodeId)) return null;
  if (newParentId === nodeId || (newParentId && newParentId.startsWith(nodeId + '.'))) return null;
  if (parentOf(nodeId) === newParentId) return null;
  const idMap = subtreeIdMap(tree, nodeId, newParentId);
  const remapLabels = labels => {
    if (!labels) return labels;
    const out = {};
    Object.entries(labels).forEach(([k, v]) => { out[idMap[k] || k] = v; });
    return out;
  };
  const renamed = tree.map(r => {
    const deps = (r.deps || []).map(d => idMap[d] || d);
    const depsChanged = deps.some((d, i) => d !== (r.deps || [])[i]);
    if (idMap[r.id] == null && !depsChanged) return r;
    const next = { ...r, deps };
    if (idMap[r.id] != null) next.id = idMap[r.id];
    if (r._depLabels) next._depLabels = remapLabels(r._depLabels);
    return next;
  });
  // Parent-then-children, by id — the storage order the rest of the app
  // (and the markdown writer) expects. Screen order is sortTree's business.
  renamed.sort((a, b) => {
    const ap = a.id.split('.'), bp = b.id.split('.');
    for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
      if (ap[i] !== bp[i]) {
        const an = parseInt(ap[i].replace(/\D/g, '')) || 0, bn = parseInt(bp[i].replace(/\D/g, '')) || 0;
        return an !== bn ? an - bn : ap[i].localeCompare(bp[i]);
      }
    }
    return ap.length - bp.length;
  });
  return { tree: renamed, idMap, id: idMap[nodeId] };
}

// Moves `nodeId` within its sibling list by writing displayOrder 1..n over
// the whole list. Ids and dependencies stay as they are. Every root is a
// sibling of every other root — which is how sortTree lays them out.
//
// `where`: 'up' | 'down' | 'first' | 'last' | { targetId, position }.
// Returns the new tree, or null when the row would stay where it is.
//
// `force` writes the order even then. A re-parent needs it: the moved row
// arrives with the displayOrder it had among its OLD siblings, and a list
// where only some rows carry one sorts by two different rules at once.
export function placeAmongSiblings(tree, nodeId, where, { force = false } = {}) {
  if (!tree.some(r => r.id === nodeId)) return null;
  const parent = parentOf(nodeId);
  const siblings = tree
    .filter(r => (parent ? parentOf(r.id) === parent : !r.id.includes('.')))
    // compareSiblings, the SAME order sortTree puts on screen — otherwise the
    // indices below refer to a list the user never saw.
    .sort(compareSiblings);
  const fromIdx = siblings.findIndex(s => s.id === nodeId);
  if (fromIdx < 0) return null;
  let toIdx = fromIdx;
  if (where === 'up') toIdx = fromIdx - 1;
  else if (where === 'down') toIdx = fromIdx + 1;
  else if (where === 'first') toIdx = 0;
  else if (where === 'last') toIdx = siblings.length - 1;
  else if (where && typeof where === 'object' && where.targetId) {
    if (where.targetId === nodeId) return null;
    const without = siblings.filter(s => s.id !== nodeId);
    const targetIdx = without.findIndex(s => s.id === where.targetId);
    if (targetIdx < 0) return null;
    toIdx = targetIdx + (where.position === 'after' ? 1 : 0);
  }
  toIdx = Math.max(0, Math.min(siblings.length - 1, toIdx));
  const reordered = siblings.slice();
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  const order = new Map(reordered.map((s, i) => [s.id, i + 1]));
  let changed = false;
  const next = tree.map(r => {
    if (!order.has(r.id) || r.displayOrder === order.get(r.id)) return r;
    changed = true;
    return { ...r, displayOrder: order.get(r.id) };
  });
  // Writing displayOrder onto a list that had none can be a real change even
  // when the row keeps its index — but it is not one the user can see, so it
  // does not count as a move unless asked to.
  if (!changed) return null;
  return force || toIdx !== fromIdx ? next : null;
}

// ── The commands ─────────────────────────────────────────────────────────
// Runs one command on the tree. Returns { tree, id, idMap } — `id` is where
// the row lives afterwards (unchanged for a reorder, renumbered for a
// re-parent) — or null when the command cannot run.
//
// `visibleIds` defaults to the whole tree in screen order, which is what a
// caller without filters sees.
export function applyTreeCommand(tree, id, command, visibleIds = sortTree(tree).map(r => r.id)) {
  const plan = planTreeCommand(visibleIds, id, command);
  if (!plan) return null;
  let next = tree;
  let newId = id;
  let idMap = {};
  if (plan.parentId !== undefined) {
    const moved = moveSubtree(next, id, plan.parentId);
    if (!moved) return null;
    ({ tree: next, id: newId, idMap } = moved);
  }
  // The anchor of an outdent is the old parent, which is never inside the
  // moved subtree, so its id holds. Map it anyway rather than rely on that.
  const place = typeof plan.place === 'object'
    ? { ...plan.place, targetId: idMap[plan.place.targetId] || plan.place.targetId }
    : plan.place;
  const placed = placeAmongSiblings(next, newId, place, { force: plan.parentId !== undefined });
  if (placed) next = placed;
  else if (plan.parentId === undefined) return null;   // a reorder that moved nothing
  return { tree: next, id: newId, idMap };
}

// Carries a set of ids (fold state, a multi-selection) across a re-parent.
export function remapIds(ids, idMap) {
  if (!idMap || !Object.keys(idMap).length) return ids;
  return new Set([...ids].map(x => idMap[x] || x));
}
