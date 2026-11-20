// The tree's selection and its keyboard-only structure and creation paths.
// Every one of these is a thin wrapper around the same mutate()-backed
// primitives the mouse-driven controls already use (see nodeEdits.js).
// Same context convention as nodeEdits.js; `ctx.act` is the node actions.
import { nextChildId, parentId } from '../../utils/scheduler.js';
import { buildPasteNodes } from '../../utils/treeEdit.js';
import { applyTreeCommandMany, dropRows } from '../../utils/treeMove.js';

// Standard list-selection (Finder / Explorer / VS Code):
//   plain         → single select, clear multi, anchor = clicked
//   shift         → replace the previous shift-range with [anchor..click];
//                   manually pinned items (added via cmd+click) survive
//   cmd|ctrl      → toggle clicked, anchor moves, previous range forgotten
//   cmd|ctrl+shift→ unconditional add of [anchor..click] to selection
export function onTreeSelect(ctx, node, e, visibleIds) {
  const { selected, setMultiSel, setSel, lastShiftRangeRef } = ctx;
  const ctrlLike = !!(e?.ctrlKey || e?.metaKey);
  if (e?.shiftKey && selected && visibleIds) {
    const ai = visibleIds.indexOf(selected.id),
      bi = visibleIds.indexOf(node.id);
    if (ai >= 0 && bi >= 0) {
      const range = visibleIds.slice(Math.min(ai, bi), Math.max(ai, bi) + 1);
      const newRange = new Set(range);
      setMultiSel(prev => {
        const next = new Set(prev);
        if (!ctrlLike && lastShiftRangeRef.current) {
          lastShiftRangeRef.current.forEach(x => next.delete(x));
        }
        newRange.forEach(x => next.add(x));
        return next;
      });
      lastShiftRangeRef.current = newRange;
    }
  } else if (ctrlLike) {
    // The first ⌘-click starts a selection FROM the row the cursor is on:
    // click A, ⌘-click B is A and B — the rule every file list has, and
    // the one the Work order view already had. It used to be B alone, so
    // a move then took one row while two looked meant.
    setMultiSel(s => {
      const n = new Set(s.size ? s : selected?.id && selected.id !== node.id ? [selected.id] : []);
      n.has(node.id) ? n.delete(node.id) : n.add(node.id);
      return n;
    });
    if (!selected) setSel(node);
    lastShiftRangeRef.current = null;
  } else {
    setSel(node);
    setMultiSel(new Set());
    lastShiftRangeRef.current = null;
  }
}

// The same two, for a multi-selection: it moves as a block (utils/
// treeMove.js). One mutate, so one ⌘Z undoes the whole move, and the
// selection follows the rows to their new ids.
export function onTreeCommandMany(ctx, ids, command, visibleIds) {
  const { tree, mutate, setMultiSel, selected, setSel } = ctx;
  const planned = applyTreeCommandMany(tree, [...ids], command, visibleIds);
  if (!planned) return null;
  mutate(d => ({ ...d, tree: applyTreeCommandMany(d.tree || [], [...ids], command, visibleIds)?.tree || d.tree }));
  setMultiSel(new Set(planned.ids));
  if (selected?.id && planned.idMap[selected.id]) setSel({ id: planned.idMap[selected.id] });
  return planned;
}

// A drop in the tree: next to any row, or into a package — across parents
// too (utils/treeMove.js `dropRows`). One mutate, so one ⌘Z; the dragged
// rows stay selected at their new ids, and the cursor goes with them.
export function onTreeDropRows(ctx, ids, target, visibleIds) {
  const { tree, mutate, setMultiSel, selected, setSel } = ctx;
  const planned = dropRows(tree, [...ids], target, visibleIds);
  if (!planned) return null;
  mutate(d => ({ ...d, tree: dropRows(d.tree || [], [...ids], target, visibleIds)?.tree || d.tree }));
  if (planned.ids.length > 1) {
    setMultiSel(new Set(planned.ids));
    if (selected?.id && planned.idMap[selected.id]) setSel({ id: planned.idMap[selected.id] });
  } else {
    setMultiSel(new Set());
    setSel({ id: planned.ids[0] });
  }
  return planned;
}

// ⌘A in the tree: every row on screen, which is what the filters left.
export function onTreeSelectAll(ctx, ids) {
  const { setMultiSel, selected, setSel } = ctx;
  if (!ids?.length) return;
  setMultiSel(new Set(ids));
  if (!selected || !ids.includes(selected.id)) setSel({ id: ids[0] });
}

// ── Tree editor (Phase 4) — keyboard-only structure/creation paths ──────
// Every one of these is a thin wrapper around the SAME mutate()-backed
// primitives the mouse-driven controls already use (moveNode, addNode,
// reorderSibling) — see docs/principles.md principle 2. Nothing here is a
// new write path; it's the existing ones, reachable without a modal.

// Tab / ⇧Tab re-parent — moveNode renumbers the moved subtree and every
// dependency reference to it, then hands back the node's new id (it
// changes on every re-parent); the cursor (selected) follows it so the
// next keypress still targets the right row.
export function onTreeMove(ctx, id, newParentId) {
  const { act, setSel } = ctx;
  const newId = act.moveNode(id, newParentId);
  if (newId) setSel({ id: newId });
  return newId; // the inline editor follows the row to its new id
}

// Toolbar buttons and structural shortcuts both land here — the one path
// for move up/down, indent and outdent. The cursor follows the row: a
// re-parent renumbers it, and the next keypress has to find it again.
export function onTreeCommand(ctx, id, command, visibleIds) {
  const { act, setSel } = ctx;
  const res = act.runTreeCommand(id, command, visibleIds);
  if (res && res.id !== id) setSel({ id: res.id });
  return res;
}

// The tree calls this when the row it just moved is not on screen any more.
//
// Re-parenting out a level renumbers the subtree into a project of its own
// — P1.1 becomes P4 — and every filter keyed on where a row USED to be then
// excludes it: the project filter above all, a search over ids, a review
// window it is no longer part of. The row is in the plan and nowhere on the
// screen, which reads as losing it.
//
// So the view widens to where the row went. Everything that narrows the
// tree comes off at once rather than guessing which one did it; the guard
// on the other side only fires when the row really has vanished, and the
// filter chips going quiet is itself the notice that they were dropped.
export function onTreeRevealHidden(ctx) {
  const { setRootFilter, setTeamFilter, setPersonFilter, setSearch, setHideDone, setDiffOnlyChanged, setHorizonOnlyPlanned } = ctx;
  setRootFilter('');
  setTeamFilter('');
  setPersonFilter('');
  setSearch('');
  setHideDone(false);
  setDiffOnlyChanged(false);
  setHorizonOnlyPlanned(false);
}

// Enter, mid-edit: create an empty sibling directly after `afterId` (same
// parent) and hand back its id so TreeView can immediately edit it. Empty
// on purpose — see onTreeBulkDelete's neighbour, commitEdit in
// TreeView.jsx, for why an empty commit on a still-new row deletes it
// again instead of littering the tree.
export function onTreeInsertAfter(ctx, afterId) {
  const { tree, act } = ctx;
  const pid = parentId(afterId);
  const id = nextChildId(tree, pid);
  // No priority — see buildPasteNodes in utils/treeEdit.js. The team IS
  // inherited from the sibling: adding a row next to a Backend item almost
  // always means another Backend item, and that is a fact about where you
  // are, not a guess about what you meant.
  const sibling = tree.find(r => r.id === afterId);
  act.addNode({
    id,
    name: '',
    status: 'open',
    team: sibling?.team || '',
    best: 0,
    factor: 1.5,
    deps: [],
    note: '',
    assign: [],
    lvl: pid ? pid.split('.').length + 1 : 1,
  });
  act.reorderSibling(id, { targetId: afterId, position: 'after' });
  return id;
}

// ⇧Enter: create an empty child under `parentIdArg` (mirrors onTreeQuickAdd
// above, but with an empty name — see onTreeInsertAfter).
export function onTreeInsertChild(ctx, parentIdArg) {
  const { tree, act } = ctx;
  const id = nextChildId(tree, parentIdArg);
  const parentNode = tree.find(r => r.id === parentIdArg);
  act.addNode({
    id,
    name: '',
    status: 'open',
    team: parentNode?.team || '',
    best: 0,
    factor: 1.5,
    deps: [],
    note: '',
    assign: [],
    lvl: parentIdArg ? parentIdArg.split('.').length + 1 : 1,
  });
  return id;
}

// ⌫/Delete on a multi-selection: deleteNode's `setD('tree', tree.filter(...))`
// reads `tree` from the render closure, so looping it per id inside one
// keypress would have each call overwrite the previous one's result — the
// "do not loop single updates" case principle 5's brief calls out. This is
// the one batched callback: a single functional mutate() over the whole
// id set, so it's correct AND one undo step.
export function onTreeBulkDelete(ctx, ids) {
  const { mutate, setSel, setMultiSel } = ctx;
  if (!ids?.length) return;
  // `startsWith(id)` alone is not a subtree test: it also matches P10 when
  // deleting P1 (the bug just fixed in deleteNode). A node is in the set if
  // it IS one of the ids, or sits strictly below one of them.
  mutate(d => ({ ...d, tree: (d.tree || []).filter(r => !ids.some(id => r.id === id || r.id.startsWith(id + '.'))) }));
  setSel(null);
  setMultiSel(new Set());
}

// Paste a list: parse → build the whole batch of new nodes against a
// local working copy of the tree (utils/treeEdit.js buildPasteNodes, so
// ids don't collide within the pasted block itself) → splice them in with
// ONE mutate() call, right after the active row's own subtree.
export function onTreePasteRows(ctx, afterId, rows) {
  const { mutate } = ctx;
  if (!rows?.length) return;
  const pid = parentId(afterId);
  mutate(d => {
    const currentTree = d.tree || [];
    const newNodes = buildPasteNodes(currentTree, pid, rows);
    const next = currentTree.slice();
    let insertAt = next.length;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].id === afterId || next[i].id.startsWith(afterId + '.')) {
        insertAt = i + 1;
        break;
      }
    }
    next.splice(insertAt, 0, ...newNodes);
    return { ...d, tree: next };
  });
}
