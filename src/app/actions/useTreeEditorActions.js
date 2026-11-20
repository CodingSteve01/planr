import { useRef } from 'react';
import { useStableCallback } from '../useStableCallback.js';
import { bindActions } from './bindActions.js';
import * as edits from './treeEditorEdits.js';

// The tree's selection and its keyboard-only structure / creation paths (see
// docs/principles.md principle 2: nothing here is a new write path).
// Takes one object — `tree`, `selected`, `mutate`, `setSel`, `setMultiSel`,
// the filter and search setters the reveal clears, and `act` (the node
// actions) — and returns one object of stable callbacks.
export function useTreeEditorActions(args) {
  const lastShiftRangeRef = useRef(null);
  const b = bindActions({ ...args, lastShiftRangeRef }, edits);
  return {
    onTreeSelect: useStableCallback(b.onTreeSelect),
    onTreeDelete: useStableCallback((...a) => args.act.deleteNode(...a)),
    onTreeCommandMany: useStableCallback(b.onTreeCommandMany),
    onTreeDropRows: useStableCallback(b.onTreeDropRows),
    onTreeSelectAll: useStableCallback(b.onTreeSelectAll),
    onTreeMove: useStableCallback(b.onTreeMove),
    onTreeCommand: useStableCallback(b.onTreeCommand),
    onTreeRevealHidden: useStableCallback(b.onTreeRevealHidden),
    onTreeInsertAfter: useStableCallback(b.onTreeInsertAfter),
    onTreeInsertChild: useStableCallback(b.onTreeInsertChild),
    onTreeBulkDelete: useStableCallback(b.onTreeBulkDelete),
    onTreePasteRows: useStableCallback(b.onTreePasteRows),
  };
}
