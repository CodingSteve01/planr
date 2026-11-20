import { useMemo } from 'react';
import { buildChildrenByParent } from '../../../utils/gantt/items.js';
import { EMPTY_ARR } from '../../../utils/gantt/helpers.js';

// Orderings of the task tree: display order, earliest start per node, children per parent.
export function useGanttTree({ tree, scheduled }) {
  const ordMap = useMemo(() => {
    const m = {};
    (tree || []).forEach((r, idx) => {
      m[r.id] = { idx, ord: typeof r.displayOrder === 'number' ? r.displayOrder : null };
    });
    return m;
  }, [tree]);
  // Earliest scheduled startWi per node — primary sort key so siblings cascade
  // top-to-bottom by time, minimizing edge crossings ("spider web" → top-down flow).
  // For a parent: min startWi across all leaves in its subtree.
  const earliestStartByNode = useMemo(() => {
    const sMap = {};
    for (const s of scheduled || []) {
      if (typeof s.startWi === 'number' && s.startWi >= 0) {
        if (sMap[s.id] == null || s.startWi < sMap[s.id]) sMap[s.id] = s.startWi;
      }
    }
    const out = {};
    for (const r of tree || []) {
      const own = sMap[r.id];
      if (own != null) out[r.id] = own;
    }
    // Propagate min from descendants up to ancestors (id prefix relationship).
    const ids = (tree || []).map(r => r.id);
    for (const id of ids) {
      const own = sMap[id];
      if (own == null) continue;
      const parts = id.split('.');
      while (parts.length > 1) {
        parts.pop();
        const p = parts.join('.');
        if (out[p] == null || own < out[p]) out[p] = own;
      }
    }
    return out;
  }, [tree, scheduled]);
  const childrenByParent = useMemo(() => buildChildrenByParent({ tree, ordMap }), [tree, ordMap]);
  // treeOrder = flattened depth-first traversal so cross-parent ordering also follows displayOrder.
  const treeOrder = useMemo(() => {
    const out = {};
    let i = 0;
    const walk = pid => {
      const kids = childrenByParent[pid] || [];
      for (const id of kids) {
        out[id] = i++;
        walk(id);
      }
    };
    walk('');
    return out;
  }, [childrenByParent]);
  const rootIds = useMemo(() => childrenByParent[''] || EMPTY_ARR, [childrenByParent]);
  return { ordMap, earliestStartByNode, childrenByParent, treeOrder, rootIds };
}
