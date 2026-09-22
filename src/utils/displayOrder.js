// Compute an optimised display order for the work tree: within each parent's
// children, run a topological sort over the union of hard + soft deps so a
// task that's a dependency of a sibling renders BEFORE that sibling. Result
// is a map { id → integer } the consumer can store as `node.displayOrder`
// and the TreeView/Gantt will use as the primary sort key (falling back to
// id-numeric order when displayOrder is absent).
//
// Stable: ties (no dep relationship) preserve the original id-numeric
// ordering so reorganising a plan that's already sorted is a no-op for
// indifferent siblings.

const idNum = (id) => {
  const last = id.split('.').pop();
  const n = parseInt(last.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

function parentOf(id) {
  const parts = id.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : '';
}

/**
 * Every node's position in the order the tree actually shows it, as a rank
 * you can compare across the whole plan: 0, 1, 2 … depth-first, children
 * directly under their parent.
 *
 * `displayOrder` on its own cannot answer "does A come before B" unless A and
 * B are siblings — it counts 1..N inside each parent, so the third child of
 * the first project and the third child of the last project both say "3".
 * Walking the tree turns that sibling-local number into a global one, which
 * is what anything ordering work across projects needs. The scheduler is the
 * caller that matters: the sequence in the tree is the sequence of the work
 * (docs/scheduler.md, "Order").
 */
export function treeOrderRank(tree) {
  const ranks = new Map();
  if (!Array.isArray(tree)) return ranks;

  const known = new Set(tree.map(r => r.id));
  const byParent = new Map();
  for (const r of tree) {
    // A node whose parent is missing is a root here rather than nowhere: an
    // orphan that sorted last would quietly schedule last.
    const p = parentOf(r.id);
    const key = p && known.has(p) ? p : '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(r);
  }
  for (const sibs of byParent.values()) {
    sibs.sort((a, b) => (
      (a.displayOrder ?? idNum(a.id)) - (b.displayOrder ?? idNum(b.id))
      || idNum(a.id) - idNum(b.id)
      || a.id.localeCompare(b.id)
    ));
  }

  let next = 0;
  const walk = id => {
    for (const child of byParent.get(id) || []) {
      if (ranks.has(child.id)) continue;   // a cycle in dotted ids cannot happen, but cheap
      ranks.set(child.id, next++);
      walk(child.id);
    }
  };
  walk('');
  return ranks;
}

export function computeDisplayOrder(tree) {
  if (!Array.isArray(tree)) return {};
  const byParent = new Map();
  for (const r of tree) {
    const p = parentOf(r.id);
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(r);
  }
  // For each sibling group, topologically order by deps + softDeps.
  // Edges are only counted when both endpoints are in the SAME sibling
  // group (a dep on a cousin doesn't affect local ordering).
  const result = {};
  for (const [, sibs] of byParent) {
    if (sibs.length <= 1) {
      if (sibs.length === 1) result[sibs[0].id] = 1;
      continue;
    }
    const ids = sibs.map(s => s.id);
    const idSet = new Set(ids);
    const incoming = new Map(ids.map(i => [i, 0]));
    const succs = new Map(ids.map(i => [i, []]));
    for (const s of sibs) {
      const allDeps = [...(s.deps || []), ...(s.softDeps || [])];
      for (const d of allDeps) {
        // dep target may be a leaf deeper in someone else's subtree —
        // walk up until we hit a sibling of `s` (or run out).
        let cur = d;
        while (cur && !idSet.has(cur)) {
          const p = parentOf(cur);
          if (!p) { cur = null; break; }
          cur = p;
        }
        if (cur && cur !== s.id && idSet.has(cur)) {
          // cur is the sibling-level predecessor of s
          succs.get(cur).push(s.id);
          incoming.set(s.id, (incoming.get(s.id) || 0) + 1);
        }
      }
    }
    // Kahn's algorithm with id-numeric stable tiebreak.
    const queue = ids.filter(i => incoming.get(i) === 0).sort((a, b) => idNum(a) - idNum(b));
    const out = [];
    while (queue.length) {
      const id = queue.shift();
      out.push(id);
      for (const next of (succs.get(id) || [])) {
        incoming.set(next, incoming.get(next) - 1);
        if (incoming.get(next) === 0) {
          // insert preserving id-numeric tiebreak
          const n = idNum(next);
          let pos = queue.length;
          for (let k = 0; k < queue.length; k++) {
            if (idNum(queue[k]) > n) { pos = k; break; }
          }
          queue.splice(pos, 0, next);
        }
      }
    }
    // Fallback if cycle leftovers — append in id order.
    for (const i of ids) if (!out.includes(i)) out.push(i);
    out.forEach((id, idx) => { result[id] = idx + 1; });
  }
  return result;
}

// Apply a display-order map to a tree, returning a new tree array with
// `displayOrder` set on each node that has an entry. Preserves identity
// for nodes that don't change.
export function applyDisplayOrder(tree, orderMap) {
  if (!orderMap) return tree;
  return tree.map(r => {
    const v = orderMap[r.id];
    if (v == null) return r;
    if (r.displayOrder === v) return r;
    return { ...r, displayOrder: v };
  });
}
