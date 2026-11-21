import { parentId } from './taskBasics.js';

// ── Tree index ────────────────────────────────────────────────────────────
// The four helpers below are called from inside loops all over the app —
// treeStats, the roadmap model, CPM, the tree grid, every detail panel. Each
// one used to re-scan the whole array (`isLeafNode` → `tree.some`, and
// `leafNodes` → n × that), which made a single recompute of a 250-item plan
// cost seconds: treeStats alone was O(n³) because it rebuilt the leaf list
// once per parent node.
//
// So derive the structure once per tree array and cache it by array identity.
// Every mutation in this app produces a NEW array (functional setData +
// map/filter), so identity is a sound cache key: a changed tree can never hit
// a stale entry, and a WeakMap lets old trees be collected. The parser in
// App.jsx does push into a local array, but only before that array becomes
// state — nothing reads an index off a half-built tree.
const treeIndexCache = new WeakMap();
const EMPTY_INDEX = {
  byId: new Map(),
  childIds: new Map(),
  leaves: [],
  liveLeaves: [],
  droppedIds: new Set(),
  leafIds: new Set(),
  descLeaves: new Map(),
};

// An item nobody is going to do.
//
// Not a fourth status, deliberately: roughly thirty modules ask "is this
// done?" and every one keeps the answer it had. This is a separate fact —
// whether the item is still part of the plan at all — and what it changes is
// the arithmetic. A dropped item leaves BOTH sides of every fraction, because
// the alternative (the workaround it replaces) was marking it done at 0 %,
// which counts it as delivered AND drags the percentage down: two lies in
// opposite directions.
//
// Dropping a package drops everything under it. Saying "we are not doing this"
// about a parent and then still scheduling its children would be the app
// arguing with the user.
// The person whose departure cut a task short. The scheduler appends an
// "(unassigned)" ghost segment for the remainder, so the leaver is the last
// segment that names a real person — taking segments[length - 2] blindly
// produced `undefined` whenever there was no ghost to skip over, and that
// `undefined` was printed verbatim in the risk list.
export function lastRealSegment(segments) {
  const segs = segments || [];
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i]?.personId && !segs[i].unscheduled) return segs[i];
  }
  return segs[segs.length - 1] || null;
}

export function isDropped(node) {
  return !!node?.dropped;
}

export function treeIndex(tree) {
  if (!Array.isArray(tree) || !tree.length) return EMPTY_INDEX;
  const cached = treeIndexCache.get(tree);
  if (cached) return cached;
  const byId = new Map();
  const childIds = new Map();
  for (const node of tree) {
    if (!node?.id) continue;
    byId.set(node.id, node);
  }
  for (const node of tree) {
    if (!node?.id) continue;
    const pid = parentId(node.id);
    const list = childIds.get(pid);
    if (list) list.push(node.id);
    else childIds.set(pid, [node.id]);
  }
  const leaves = tree.filter(node => node?.id && !childIds.has(node.id));
  // Dropped, or under something dropped. Walked once here rather than
  // re-derived at every call site.
  const droppedIds = new Set();
  for (const node of tree) {
    if (!node?.id) continue;
    if (isDropped(node)) {
      droppedIds.add(node.id);
      continue;
    }
    let pid = parentId(node.id);
    while (pid) {
      if (isDropped(byId.get(pid))) {
        droppedIds.add(node.id);
        break;
      }
      pid = parentId(pid);
    }
  }
  const index = {
    byId,
    childIds,
    leaves,
    // What the plan is actually made of. `leaves` stays structural — the tree
    // still has to render a dropped row so you can see it and take it back.
    liveLeaves: droppedIds.size ? leaves.filter(node => !droppedIds.has(node.id)) : leaves,
    droppedIds,
    leafIds: new Set(leaves.map(node => node.id)),
    descLeaves: new Map(),
  };
  treeIndexCache.set(tree, index);
  return index;
}

export function directChildren(tree, id) {
  const index = treeIndex(tree);
  const ids = index.childIds.get(id);
  if (!ids) return [];
  return ids.map(childId => index.byId.get(childId)).filter(Boolean);
}

export function hasChildren(tree, id) {
  return treeIndex(tree).childIds.has(id);
}

export function isLeafNode(tree, nodeOrId) {
  const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
  if (!id) return false;
  const index = treeIndex(tree);
  // An id that isn't in this tree at all counts as a leaf, matching the old
  // "nothing claims it as a parent" behaviour.
  return !index.childIds.has(id);
}

export function leafNodes(tree) {
  return treeIndex(tree).liveLeaves;
}

// Leaves strictly below `id`, in tree order — memoized per node, so the
// callers that ask for it once per rendered row stay linear overall.
// Prefix-filters the leaf list rather than walking children, so the result
// order matches the tree array exactly, as the old implementation did.
export function descendantLeaves(tree, id) {
  if (!id) return [];
  const index = treeIndex(tree);
  const cached = index.descLeaves.get(id);
  if (cached) return cached;
  const prefix = id + '.';
  // liveLeaves, not leaves: a package's numbers are about the work it still
  // holds. A dropped child is not work it holds.
  const out = index.liveLeaves.filter(leaf => leaf.id.startsWith(prefix));
  index.descLeaves.set(id, out);
  return out;
}

export function resolveToLeafIds(tree, id) {
  const item = typeof id === 'string' ? treeIndex(tree).byId.get(id) : id;
  if (!item) return [];
  if (isLeafNode(tree, item.id)) return [item.id];
  return descendantLeaves(tree, item.id).map(leaf => leaf.id);
}

// Whether every dependency of `node` is satisfied — its own `deps` plus every
// ancestor's `deps` (deps are inherited down the tree, so a parent's
// predecessor blocks its children too), each resolved to leaves and checked
// against `doneIds`. Shared by PlanReview's "ready to start" grouping and Run
// mode's attention list (utils/attention.js) — one definition of "blocked" for
// both, rather than the two subtly-different copies this replaced. `doneIds`
// is caller-supplied rather than derived here, since PlanReview scopes it to
// the currently filtered view while the attention list scopes it to the whole
// plan; only the traversal is shared.
export function isDepsReady(tree, doneIds, node) {
  if (!node) return true;
  const index = treeIndex(tree);
  const allDeps = new Set(node.deps || []);
  let pid = parentId(node.id || '');
  while (pid) {
    const ancestor = index.byId.get(pid);
    (ancestor?.deps || []).forEach(dep => allDeps.add(dep));
    pid = parentId(pid);
  }
  for (const dep of allDeps) {
    if (!resolveToLeafIds(tree, dep).every(leafId => doneIds.has(leafId))) return false;
  }
  return true;
}
