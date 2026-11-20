import { useState, useRef, useMemo, useEffect } from 'react';
import { isOnScreen } from '../../../utils/onScreen.js';

// Selection and keyboard cursor of the Gantt bars: click / shift / cmd
// selection, the ordered list of selected and visible task ids, and the
// window key handler that moves the cursor.
export function useGanttSelection({ visibleRows, bR, onReorderSibling, onBarClick }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Anchor + most-recent shift-range track standard list semantics:
  //   click           → anchor = clicked, clears multi
  //   shift+click     → replace the most-recent range [anchor..lastEnd] with
  //                     the new range [anchor..click] — other manually pinned
  //                     items (added via cmd+click) survive. Anchor stays.
  //   cmd+click       → toggle clicked, anchor moves, prevRange reset
  //   cmd+shift+click → like shift but unconditional add (never wipes prev)
  const lastSelectAnchorRef = useRef(null);
  const lastShiftRangeRef = useRef(null); // Set of ids touched by the most recent shift-range
  const handleSelectClick = (e, id) => {
    if (!id) return false;
    const ctrlLike = e.metaKey || e.ctrlKey;
    if (e.shiftKey) {
      const ids = visibleTaskIds;
      const anchor = lastSelectAnchorRef.current && ids.includes(lastSelectAnchorRef.current) ? lastSelectAnchorRef.current : ids[0];
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a < 0 || b < 0) return false;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const newRange = new Set(ids.slice(lo, hi + 1));
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (!ctrlLike && lastShiftRangeRef.current) {
          // Replace just the previous shift-range; other pinned ids stay.
          lastShiftRangeRef.current.forEach(x => next.delete(x));
        }
        newRange.forEach(x => next.add(x));
        return next;
      });
      lastShiftRangeRef.current = newRange;
      // Anchor unchanged — user can keep extending from the original point.
      return true;
    }
    if (ctrlLike) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastSelectAnchorRef.current = id;
      lastShiftRangeRef.current = null;
      return true;
    }
    lastSelectAnchorRef.current = id;
    lastShiftRangeRef.current = null;
    return false;
  };
  const selectedTaskIds = useMemo(() => {
    const ordered = [];
    const seen = new Set();
    visibleRows.forEach(row => {
      if (row.type !== 'task') return;
      const id = row.s?.treeId || row.s?.id;
      if (!id || seen.has(id) || !selectedIds.has(id)) return;
      seen.add(id);
      ordered.push(id);
    });
    return ordered;
  }, [selectedIds, visibleRows]);
  const visibleTaskIds = useMemo(() => {
    const ids = [];
    const seen = new Set();
    visibleRows.forEach(row => {
      if (row.type !== 'task') return;
      const id = row.s?.treeId || row.s?.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return ids;
  }, [visibleRows]);
  // A cursor, so the schedule can be worked without a mouse.
  //
  // The tree had ↑↓ to move, Enter to edit, ⌥↑↓ to reorder; every other
  // surface had a click and nothing else. That is a problem of its own, and
  // it became a bigger one when the order of the work moved into the tree:
  // the Gantt is where you SEE that something sits too early, so it has to be
  // somewhere you can also say so. The keys are the tree's keys deliberately
  // — the same gesture in both places beats two vocabularies.
  const [cursorId, setCursorId] = useState(null);
  // A cursor pointing at a row that has been filtered away is a cursor
  // pointing at nothing; drop it rather than leave it dangling.
  useEffect(() => {
    if (cursorId && !visibleTaskIds.includes(cursorId)) setCursorId(null);
  }, [visibleTaskIds, cursorId]);
  useEffect(() => {
    const h = e => {
      // The Gantt stays mounted after you leave it, and this listener is on
      // the window. Without this it kept answering on every other tab: ⌘A
      // selected invisible bars, ↑/↓ stopped scrolling the Overview, and ⌥↑
      // or E in the tree also reordered or opened the Gantt's old cursor row.
      if (!isOnScreen(bR.current)) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const editingText = ['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable;
      if (editingText) return;
      // A dialog on top owns the keyboard — otherwise ↓ scrolls the bars
      // behind whatever the user is actually reading.
      if (document.querySelector('.modal-back, [data-testid="node-modal"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (mod && String(key || '').toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(visibleTaskIds));
        return;
      }
      if (mod || !visibleTaskIds.length) return;

      if ((key === 'ArrowDown' || key === 'ArrowUp') && e.altKey) {
        if (!cursorId) return;
        e.preventDefault();
        const dir = e.shiftKey ? (key === 'ArrowDown' ? 'last' : 'first') : key === 'ArrowDown' ? 'down' : 'up';
        onReorderSibling?.(cursorId, dir);
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        const at = cursorId ? visibleTaskIds.indexOf(cursorId) : -1;
        const next = key === 'ArrowDown' ? Math.min(visibleTaskIds.length - 1, at + 1) : Math.max(0, at <= 0 ? 0 : at - 1);
        const id = visibleTaskIds[next];
        setCursorId(id);
        setSelectedIds(e.shiftKey && cursorId ? new Set([...selectedIds, id]) : new Set([id]));
        return;
      }
      if ((key === 'e' || key === 'E' || key === 'Enter') && cursorId) {
        e.preventDefault();
        // onBarClick takes the scheduled row, not an id — it reads `treeId`
        // off it to find the tree node behind a handoff shadow.
        onBarClick?.({ id: cursorId });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visibleTaskIds, cursorId, selectedIds, onReorderSibling, onBarClick]);
  return { selectedIds, setSelectedIds, handleSelectClick, selectedTaskIds, visibleTaskIds, cursorId };
}
