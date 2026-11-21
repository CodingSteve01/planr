import { hasChildren } from '../../../utils/scheduler.js';
import { fieldPatchForKey } from '../../../utils/treeEdit.js';
import { depth, isTypingTarget } from '../../../utils/tree/layout.js';

// ⇧↵ a child, ⌘↵ the next row, plain ↵ saves (and carries on only on a
// row that was just added — see commitEdit).
export const enterAdvance = e => (e.shiftKey ? 'child' : e.metaKey || e.ctrlKey ? 'next' : 'sibling');

export function handleEditKey(c, e) {
  const { cancelEdit, commitEdit, commitAndEditNeighbour, applyFieldWhileEditing, teamSelRef } = c;
  const alt = e.altKey && !e.ctrlKey && !e.metaKey;
  const stop = () => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (e.key === 'Escape') {
    stop();
    cancelEdit();
    return;
  }
  if (e.key === 'Enter' && !alt) {
    stop();
    commitEdit(enterAdvance(e));
    return;
  }

  // Tab walks the row's fields — name → priority → size → status → team —
  // which is what Tab means inside a field everywhere else. Native focus
  // order does it; the only edges worth owning are the two ends:
  // ⇧Tab off the name goes back to the LAST field of the row above, Tab
  // off the last field on to the name of the row below (see
  // handleFieldKeyDown) — one path through every field of every row, in
  // either direction.
  if (e.key === 'Tab' && e.shiftKey && !alt) {
    stop();
    commitAndEditNeighbour(-1, { at: 'last' });
    return;
  }
  if (e.key === 'Tab') return; // let the browser move to the next field

  // No structural gestures in here. Moving or re-parenting a row happens
  // from the tree with the row selected — ⌥←/⌥→ and ⌘⇧+arrows mean
  // word jumps and selections inside a text field, and a keystroke that
  // quietly moved the item instead is not something to learn around.
  // Plain ↑/↓ is navigation: commit, and edit the row above or below.
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    stop();
    commitAndEditNeighbour(e.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  if (!alt) return;
  // ⌥+digit/letter reports a DIFFERENT e.key on macOS (⌥1 is "¡", ⌥s is
  // "ß"), so the physical key is the only reliable read here.
  const digit = /^Digit([1-4])$/.exec(e.code || '');
  if (digit) {
    stop();
    applyFieldWhileEditing(digit[1]);
    return;
  }
  const letter = /^Key([SMLX])$/.exec(e.code || '');
  if (letter) {
    stop();
    applyFieldWhileEditing(letter[1]);
    return;
  }
  if (e.code === 'Space') {
    stop();
    applyFieldWhileEditing(' ', { back: e.shiftKey });
    return;
  }
  if (e.code === 'KeyT') {
    stop();
    teamSelRef.current?.focus();
  }
}

// The dropdowns' own key handling. Plain ↑/↓ and Home/End are the select's
// business (that is how you pick a value), so only the row-level gestures
// are intercepted here.
export function handleFieldKey(c, e, isLast) {
  const { cancelEdit, commitEdit, commitAndEditNeighbour, editing, visibleIds } = c;
  const stop = () => {
    e.preventDefault();
    e.stopPropagation();
  };
  if (e.key === 'Escape') {
    stop();
    cancelEdit();
    return;
  }
  if (e.key === 'Enter') {
    stop();
    commitEdit(enterAdvance(e));
    return;
  }
  // Tab off the last field finishes this row and goes on, so a whole item
  // is one uninterrupted run of Tabs. On to the NEXT ROW when there is one
  // — the mirror of ⇧Tab off the name, which goes to the row above. It
  // always inserted a new empty row instead, so Tabbing through existing
  // items stopped at the first one with a blank row nobody asked for.
  // A new row, or the last row, still opens a new one: that is typing a
  // plan top to bottom.
  if (e.key === 'Tab' && !e.shiftKey && isLast) {
    stop();
    const at = editing ? visibleIds.indexOf(editing.id) : -1;
    if (editing && !editing.isNew && at >= 0 && at < visibleIds.length - 1) commitAndEditNeighbour(1);
    else commitEdit('next');
    return;
  }
  // Everything else is the field's own: ↑/↓ picks a value, and there are
  // no structural gestures while a control owns the keyboard.
}

export function handleContainerKey(c, e) {
  const {
    editing,
    selected,
    tree,
    filt,
    visibleIds,
    collapsed,
    sizes,
    onSelectAll,
    onFullEdit,
    onSelect,
    runCommand,
    moveCursor,
    collapseAll,
    expandAll,
    toggle,
    startEdit,
    startNewSibling,
    startNewChild,
    doDelete,
    applyToTargets,
  } = c;
  if (editing) return; // the inline <input> owns Enter/⇧Enter/Esc — see handleEditKeyDown
  // Anything typed into a field bubbles up to here, and `editing` only knows
  // about the inline name editor. Every other input inside the tree — the
  // search box, a custom field, whatever a row grows next — was handing its
  // keystrokes to the row shortcuts: one ⌥← while a caret was in a box and
  // the item moved. A key pressed inside a text entry belongs to that entry.
  if (isTypingTarget(e.target)) return;
  const key = e.key;
  const bare = !e.ctrlKey && !e.metaKey; // leave Cmd/Ctrl combos (save, undo, find…) alone
  // ⌘A — every row on screen, i.e. what the filters and folds left. The
  // start of any "all of these" edit: status, priority, the bulk editor, a
  // drag. Only from the grid itself; inside a field it is the field's.
  if (!bare && !e.shiftKey && !e.altKey && (key === 'a' || key === 'A') && onSelectAll) {
    e.preventDefault();
    e.stopPropagation();
    onSelectAll(filt.map(x => x.id));
    return;
  }
  const ARROW_COMMAND = { ArrowUp: 'moveUp', ArrowDown: 'moveDown', ArrowRight: 'indent', ArrowLeft: 'outdent' };

  // ⌘⇧+arrow (Ctrl⇧ elsewhere) — the four structural commands, one per
  // arrow: ↑/↓ reorder, →/← indent/outdent. ⌥+arrow is the same set, kept
  // because it is what this tree has always answered to.
  if (ARROW_COMMAND[key] && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
    e.preventDefault();
    runCommand(ARROW_COMMAND[key]);
    return;
  }
  if ((key === 'ArrowUp' || key === 'ArrowDown') && e.altKey && bare) {
    e.preventDefault();
    // ⇧ makes it the whole way: to the top or the bottom of the sibling
    // run, in one press, instead of holding the key down past everything
    // in between.
    runCommand(e.shiftKey ? (key === 'ArrowDown' ? 'moveLast' : 'moveFirst') : ARROW_COMMAND[key]);
    return;
  }
  if ((key === 'ArrowUp' || key === 'ArrowDown') && !e.altKey && bare) {
    e.preventDefault();
    moveCursor(key === 'ArrowDown' ? 'down' : 'up', e.shiftKey);
    return;
  }
  // ⌥←/⌥→ — outdent / indent, the SAME gesture as inside the editor. Tab
  // and ⇧Tab do it too (the outliner idiom, and free here because the grid
  // is not a form), but one gesture has to work in both places or you have
  // to remember which mode you are in.
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && e.altKey && bare) {
    e.preventDefault();
    runCommand(ARROW_COMMAND[key]);
    return;
  }
  // ⌘↵ — a new row under this one, open for typing. With plain ↵ now
  // meaning "edit this row", this is how a list gets started.
  if (key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    if (selected?.id) startNewSibling(selected.id);
    return;
  }
  // Home / End — the first and the last row on screen.
  if ((key === 'Home' || key === 'End') && bare && !e.altKey && !e.shiftKey) {
    const row = key === 'Home' ? filt[0] : filt[filt.length - 1];
    if (!row) return;
    e.preventDefault();
    onSelect(row, {}, visibleIds);
    return;
  }
  // ⇧←/⇧→ — the big version of ←/→: collapse or expand everything, or just
  // the selection when there is one, exactly like the two toolbar buttons.
  // Before the "needs a selected row" check below, because "everything" is
  // what it does with none — it used to do nothing until a row was picked.
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && e.shiftKey && bare && !e.altKey) {
    e.preventDefault();
    if (key === 'ArrowLeft') collapseAll();
    else expandAll();
    return;
  }
  if (!bare || e.altKey || !selected?.id) return;
  // ←/→ — the tree idiom every file browser and outliner shares: → opens a
  // closed branch and then steps into it, ← closes an open one and then
  // steps out to the parent. Structure navigation without leaving the
  // home row for the mouse.
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    e.preventDefault();
    const id = selected.id;
    const kids = hasChildren(tree, id);
    if (key === 'ArrowRight') {
      if (kids && collapsed.has(id)) {
        toggle(id);
        return;
      }
      const firstChild = filt.find(r => r.id.startsWith(id + '.') && depth(r.id) === depth(id) + 1);
      if (firstChild) onSelect(firstChild, {}, visibleIds);
      return;
    }
    if (kids && !collapsed.has(id)) {
      toggle(id);
      return;
    }
    const pid = id.split('.').slice(0, -1).join('.');
    const parentRow = pid ? filt.find(r => r.id === pid) : null;
    if (parentRow) onSelect(parentRow, {}, visibleIds);
    return;
  }
  if (key === 'Tab') {
    e.preventDefault();
    runCommand(e.shiftKey ? 'outdent' : 'indent');
    return;
  }
  // F2 — rename, the key every spreadsheet and file manager uses for it.
  if (key === 'F2') {
    e.preventDefault();
    startEdit(selected.id);
    return;
  }
  if (key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) startNewChild(selected.id);
    else startEdit(selected.id);
    return;
  }
  if (key === 'Delete' || key === 'Backspace') {
    e.preventDefault();
    doDelete();
    return;
  }
  // The full editor had a button and nothing else. Enter starts the inline
  // edit, which covers the name and the four fields beside it; everything
  // deeper — dependencies, phases, history, custom fields — was a click
  // away and only a click away, on the one surface that is otherwise
  // entirely keyboard-driven.
  if ((key === 'e' || key === 'E') && bare && !e.altKey && onFullEdit) {
    e.preventDefault();
    if (selected?.id) onFullEdit(selected);
    return;
  }
  if (key === ' ' || key === 'Spacebar') {
    e.preventDefault();
    // ⇧Space walks back. On a task with phases both step through the phase
    // list one at a time; on a task without, they are the status cycle in
    // its two directions.
    applyToTargets(node => fieldPatchForKey(node, ' ', sizes, { back: e.shiftKey }));
    return;
  }
  if (key === '0') {
    // Next to the priorities, and the opposite of them: 1–4 say how much
    // this matters, 0 says it is not going to happen. A separate field
    // rather than a status, so taking it back gives you the item you had
    // (utils/scheduler.js, `isDropped`).
    e.preventDefault();
    applyToTargets(node => ({ dropped: node.dropped ? undefined : true }));
    return;
  }
  if (['1', '2', '3', '4'].includes(key)) {
    e.preventDefault();
    applyToTargets(node => fieldPatchForKey(node, key, sizes));
    return;
  }
  if (key.length === 1 && /^[a-zA-Z]$/.test(key) && ['S', 'M', 'L', 'X'].includes(key.toUpperCase())) {
    e.preventDefault();
    const upper = key.toUpperCase();
    applyToTargets(node => fieldPatchForKey(node, upper, sizes));
  }
}
