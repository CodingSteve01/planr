import { useMemo } from 'react';
import { buildChildrenByParent } from '../../../utils/gantt/items.js';
import { EMPTY_ARR } from '../../../utils/gantt/helpers.js';

// Orderings of the task tree: display order and children per parent.
export function useGanttTree({ tree }) {
  const ordMap = useMemo(() => {
    const m = {};
    (tree || []).forEach((r, idx) => {
      m[r.id] = { idx, ord: typeof r.displayOrder === 'number' ? r.displayOrder : null };
    });
    return m;
  }, [tree]);
  const childrenByParent = useMemo(() => buildChildrenByParent({ tree, ordMap }), [tree, ordMap]);
  const rootIds = useMemo(() => childrenByParent[''] || EMPTY_ARR, [childrenByParent]);
  return { ordMap, childrenByParent, rootIds };
}
