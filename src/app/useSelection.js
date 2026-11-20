import { useState } from 'react';

// What is picked in the tree and which tab of the side pane is open. Only the
// selected node's ID is stored; `App` derives the node from the tree.
// This ensures `selected` always reflects the latest tree state — fixes a bug
// where QuickEdit would overwrite changes (e.g. assign) made via NodeModal,
// because the old code held a stale node object in state.
export function useSelection() {
  const [sideTab, setSideTab] = useState('insights');
  const [selId, setSelId] = useState(null);
  const setSel = n => setSelId(n == null ? null : typeof n === 'string' ? n : n.id);
  const [multiSel, setMultiSel] = useState(new Set());
  // `setSelId` stays in here: `setSel` is the way in, and it takes a node or an id.
  return { sideTab, setSideTab, selId, setSel, multiSel, setMultiSel };
}
