import { useEffect } from 'react';
import { fieldPatchForKey } from '../../../utils/treeEdit.js';

function startEdit(c, id) {
  const { tree, setEditing } = c;
  const node = tree.find(r => r.id === id);
  if (!node) return;
  setEditing({ id, draft: node.name || '', isNew: false });
}

// The mouse mirror of ⇧Enter / Enter-at-the-end. Both hand the new row
// straight to the inline editor, so creating an item is one click and then
// typing — never a placeholder name to go back and fix. Same callbacks the
// keyboard uses; no second write path (principle 2).
function startNewSibling(c, afterIdVal) {
  const { onInsertAfter, setEditing, onSelect, visibleIds } = c;
  if (!onInsertAfter) return;
  const newId = onInsertAfter(afterIdVal);
  if (!newId) return;
  setEditing({ id: newId, draft: '', isNew: true, fromId: afterIdVal });
  onSelect({ id: newId }, {}, visibleIds);
}

function startNewChild(c, parentIdVal) {
  const { onInsertChild, setEditing, onSelect, visibleIds } = c;
  if (!onInsertChild) return;
  const newId = onInsertChild(parentIdVal);
  if (!newId) return;
  setEditing({ id: newId, draft: '', isNew: true, fromId: parentIdVal });
  onSelect({ id: newId }, {}, visibleIds);
}

// Enter (from inside the inline editor) — save the row. On a row this
// session just added, Enter carries on and starts the NEXT row — the
// outliner rhythm of typing a list — and ⇧Enter starts a child from any
// row. Renaming an existing row with Enter or F2 is one edit, though: it
// saves and hands the keyboard back to the tree, instead of conjuring an
// empty row under something you only meant to correct. An empty
// commit on a row this session itself just created removes it again
// instead of leaving a nameless row (so Enter-Enter never litters the
// tree); an empty commit on a pre-existing row is left alone — clearing
// an established item's name isn't something a stray Enter should do.
function commitEdit(c, advance) {
  const { editing, suppressBlurRef, onDelete, setEditing, tree, onTaskUpdate, onInsertChild, onInsertAfter, onSelect, visibleIds } = c;
  if (!editing) return;
  const { id, draft, isNew } = editing;
  const name = draft.trim();
  suppressBlurRef.current = true;
  if (!name) {
    if (isNew) onDelete?.(id);
    setEditing(null);
    return;
  }
  const node = tree.find(r => r.id === id);
  if (node && node.name !== name) onTaskUpdate?.({ ...node, name });
  // 'next' (⌘↵, or Tab off the last field) always goes on to a new row.
  if (advance === 'sibling' && !isNew) {
    setEditing(null);
    return;
  }
  const inserter = advance === 'child' ? onInsertChild : onInsertAfter; // 'sibling' | 'next'
  const newId = inserter?.(id);
  if (newId) {
    setEditing({ id: newId, draft: '', isNew: true, fromId: id });
    onSelect({ id: newId }, {}, visibleIds);
    return;
  }
  setEditing(null);
}

// Esc — leaves an existing row's name untouched (nothing was ever written
// to it; only the local draft is discarded). A row still-new from this
// same session is removed, same as an empty Enter-commit, so backing out
// of an accidental new row doesn't litter the tree either.
function cancelEdit(c) {
  const { editing, suppressBlurRef, onDelete, filt, onSelect, visibleIds, setEditing } = c;
  if (!editing) return;
  suppressBlurRef.current = true;
  if (editing.isNew) {
    onDelete?.(editing.id);
    // The row the cursor was on is about to be deleted, so put it back
    // where the new row came from — otherwise backing out of an accidental
    // ⇧Enter leaves you with no cursor at all and a mouse trip to recover.
    const origin = editing.fromId && filt.find(r => r.id === editing.fromId);
    if (origin)
      onSelect(
        origin,
        {},
        visibleIds.filter(id => id !== editing.id),
      );
  }
  setEditing(null);
}

// Close the editor, keeping whatever was typed. An empty row this session
// created is removed again rather than left nameless — the same rule Enter
// and Escape follow.
function finishEditing(c) {
  const { editing, suppressBlurRef, onDelete, tree, onTaskUpdate, setEditing } = c;
  if (!editing) return;
  const { id, draft, isNew } = editing;
  const name = draft.trim();
  suppressBlurRef.current = true;
  if (!name) {
    if (isNew) onDelete?.(id);
  } else {
    const node = tree.find(r => r.id === id);
    if (node && node.name !== name) onTaskUpdate?.({ ...node, name });
  }
  setEditing(null);
}

function handleEditBlur(c) {
  const { suppressBlurRef } = c;
  if (suppressBlurRef.current) {
    suppressBlurRef.current = false;
    return;
  }
  finishEditing(c);
}

// Commit the draft WITHOUT closing the editor. Used by every in-editor
// action below, so the name you have already typed is never the price of
// reaching for a field. Returns the node as the store will have it.
function commitDraftInPlace(c) {
  const { editing, tree, onTaskUpdate } = c;
  if (!editing) return null;
  const node = tree.find(r => r.id === editing.id);
  const name = editing.draft.trim();
  if (node && name && node.name !== name) onTaskUpdate?.({ ...node, name });
  return node;
}

// ↑/↓ inside the editor: commit and carry the field to the neighbouring
// row. The spreadsheet gesture — editing follows the cursor instead of
// being a mode you leave and re-enter for every row.
// `at: 'last'` lands in the neighbour's last field instead of its name —
// what ⇧Tab needs to walk backwards through the fields without skipping.
function commitAndEditNeighbour(c, delta, { at } = {}) {
  const { editing, visibleIds, suppressBlurRef, onDelete, setEditing, filt, onSelect } = c;
  if (!editing) return;
  const { id, draft, isNew } = editing;
  const idx = visibleIds.indexOf(id);
  suppressBlurRef.current = true;
  if (!draft.trim()) {
    // An empty row this session created is removed, same rule Enter and
    // blur follow — and the row indices below it shift, so stop here.
    if (isNew) {
      onDelete?.(id);
      setEditing(null);
      return;
    }
  } else {
    commitDraftInPlace(c);
  }
  const nextRow = filt[idx + delta];
  if (!nextRow) {
    setEditing(null);
    return;
  }
  setEditing({ id: nextRow.id, draft: nextRow.name || '', isNew: false, ...(at ? { at } : {}) });
  onSelect(nextRow, {}, visibleIds);
}

// ⌥1–4, ⌥S/M/L/X, ⌥Space: set a field on the row being named, without
// leaving the field. `fieldPatchForKey` is the same helper the row-level
// shortcuts use, so "priority 2" means one thing in this app.
function applyFieldWhileEditing(c, fieldKey, opts) {
  const { editing, tree, sizes } = c;
  if (!editing) return;
  const node = tree.find(r => r.id === editing.id);
  if (!node) return;
  writeFieldWhileEditing(c, fieldPatchForKey(node, fieldKey, sizes, opts));
}

// One write carrying both the typed name and the field. Two calls in one
// tick would have the second overwrite the first — the same race addNode
// and moveNode each lost once.
function writeFieldWhileEditing(c, patch) {
  const { editing, tree, onTaskUpdate } = c;
  if (!editing || !patch) return;
  const node = tree.find(r => r.id === editing.id);
  if (!node) return;
  const name = editing.draft.trim();
  onTaskUpdate?.({ ...node, ...(name && name !== node.name ? { name } : {}), ...patch });
}

// Bound to the editing <tr>: focus moving between the row's own cells is
// not leaving the editor.
function handleEditorFocusOut(c, e) {
  const next = e.relatedTarget;
  if (next && e.currentTarget.contains(next)) return;
  // A field's dropdown renders into a portal on document.body, to escape
  // the table's overflow clipping — so reaching for an option looks like
  // leaving the editor. It is not.
  if (typeof document !== 'undefined' && document.querySelector('[data-searchselect-popup]')) return;
  handleEditBlur(c);
}

// The inline editor's commits, bound to this render's values. The module
// functions above take them as `c`; the effect is the one place that must run
// inside the view's own effect order.
export function useTreeEditing(c) {
  const { editing, selected } = c;
  // The row being named is always the row the cursor is on. Clicking another
  // row therefore ends edit mode and keeps what was typed. This is a rule,
  // not a focus side effect: relying on the <input> blurring did not survive
  // a click on a <tr>, which is not focusable and does not always take focus
  // away from the field.
  //
  // Safe against every internal advance (Enter, ⇧Enter, ↑/↓, Tab off the
  // last field, ⌥←/⌥→), because each of those sets `editing` and `selected`
  // to the same row in one tick — so this never sees them disagree.
  useEffect(() => {
    if (!editing || !selected?.id || selected.id === editing.id) return;
    finishEditing(c);
  }, [selected?.id]);
  return {
    startEdit: id => startEdit(c, id),
    startNewSibling: id => startNewSibling(c, id),
    startNewChild: id => startNewChild(c, id),
    commitEdit: advance => commitEdit(c, advance),
    cancelEdit: () => cancelEdit(c),
    finishEditing: () => finishEditing(c),
    commitAndEditNeighbour: (delta, opts) => commitAndEditNeighbour(c, delta, opts),
    applyFieldWhileEditing: (fieldKey, opts) => applyFieldWhileEditing(c, fieldKey, opts),
    writeFieldWhileEditing: patch => writeFieldWhileEditing(c, patch),
    handleEditorFocusOut: e => handleEditorFocusOut(c, e),
  };
}
