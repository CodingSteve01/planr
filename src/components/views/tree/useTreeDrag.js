import { useRef } from 'react';
import { isLeafNode } from '../../../utils/scheduler.js';
import { dropRows, remapIds } from '../../../utils/treeMove.js';
import { setDragBadge } from '../../../utils/dragBadge.js';

// Drag and drop, the Work order's way: the whole row is the handle, the
// rows in the hand dim, and a mark says where they land. It used to be a
// grip-only drag that could only reorder among siblings — dropping on any
// other package's rows did nothing, with nothing to say so.
//
// Where a drop lands comes from the pointer's height in the row: the top
// or bottom edge is before / after it, and the middle of a PACKAGE row is
// into it. A task row has no middle — dropping into a task would quietly
// turn it into a package. Whether a place is possible at all is decided by
// running the drop (utils/treeMove.js `dropRows`), once per row and zone,
// so the mark never promises something the drop then refuses.
//
// The handlers read the drag through a ref, not the render's closure: rows
// are cached (see the row signature below), and a cached row keeps the
// handlers of the render it was built in — where no drag had started yet,
// so dragover never saw one.
export function useTreeDrag({ orderDrop, setOrderDrop, filt, tree, multiSel, onDropRows, setCollapsed, t }) {
  const dragLive = useRef({});
  dragLive.current = { orderDrop, filt, tree, multiSel };
  const dragIdsFor = id => {
    const { multiSel: sel, filt: rows } = dragLive.current;
    return sel?.size > 1 && sel.has(id) ? rows.map(x => x.id).filter(x => sel.has(x)) : [id];
  };
  const dropZone = (e, targetId) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
    if (!isLeafNode(dragLive.current.tree, targetId) && y > 0.3 && y < 0.7) return 'inside';
    return y < 0.5 ? 'before' : 'after';
  };
  const onRowDragStart = (e, r) => {
    if (!onDropRows) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
      e.preventDefault();
      return;
    }
    const dragIds = dragIdsFor(r.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData?.('text/plain', dragIds.join(','));
    }
    if (dragIds.length > 1) setDragBadge(e, t('tv.dragRows', dragIds.length));
    const start = { dragIds, targetId: null, position: null, valid: false };
    dragLive.current.orderDrop = start;
    setOrderDrop(start);
  };
  const onOrderDragOver = (e, targetId) => {
    const { orderDrop: live, tree: liveTree, filt: rows } = dragLive.current;
    if (!onDropRows || !live?.dragIds) return;
    const position = dropZone(e, targetId);
    let valid = live.valid;
    if (live.targetId !== targetId || live.position !== position) {
      valid = !!dropRows(
        liveTree,
        live.dragIds,
        { targetId, position },
        rows.map(x => x.id),
      );
      const next = { ...live, targetId, position, valid };
      dragLive.current.orderDrop = next;
      setOrderDrop(next);
    }
    if (valid) e.preventDefault(); // no preventDefault = the browser's "not here" cursor
  };
  const onOrderDrop = (e, targetId) => {
    const { orderDrop: live, filt: rows } = dragLive.current;
    if (!onDropRows || !live?.dragIds || live.targetId !== targetId || !live.valid) return;
    e.preventDefault();
    const res = onDropRows(
      live.dragIds,
      { targetId, position: live.position },
      rows.map(x => x.id),
    );
    if (res?.idMap) {
      setCollapsed(c => {
        const n = remapIds(c, res.idMap);
        // Dropped into a folded package: open it, or the rows just vanish.
        if (live.position === 'inside') n.delete(targetId);
        return n;
      });
    }
    setOrderDrop(null);
  };
  return { onRowDragStart, onOrderDragOver, onOrderDrop };
}
