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
