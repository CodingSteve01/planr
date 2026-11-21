import { hasChildren } from '../../../utils/scheduler.js';
import { fieldPatchForKey } from '../../../utils/treeEdit.js';
import { depth, isTypingTarget } from '../../../utils/tree/layout.js';

// ⇧↵ a child, ⌘↵ the next row, plain ↵ saves (and carries on only on a
// row that was just added — see commitEdit).
export const enterAdvance = e => (e.shiftKey ? 'child' : e.metaKey || e.ctrlKey ? 'next' : 'sibling');

const stopEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};

// Every try… function below returns true when it consumed the key (whether or
// not it did anything), so the caller stops at the first match — the same
// order of checks and early returns as one long if-chain.

// ── The inline name input ───────────────────────────────────────────────

function tryEditNavigation(c, e, alt) {
  const { cancelEdit, commitEdit, commitAndEditNeighbour } = c;
  if (e.key === 'Escape') {
    stopEvent(e);
    cancelEdit();
    return true;
  }
  if (e.key === 'Enter' && !alt) {
    stopEvent(e);
    commitEdit(enterAdvance(e));
    return true;
  }
  // Tab walks the row's fields — name → priority → size → status → team —
  // which is what Tab means inside a field everywhere else. The only edges
  // worth owning are the two ends: ⇧Tab off the name goes back to the LAST
  // field of the row above, Tab off the last field on to the name of the row
  // below (see handleFieldKey).
  if (e.key === 'Tab' && e.shiftKey && !alt) {
    stopEvent(e);
    commitAndEditNeighbour(-1, { at: 'last' });
    return true;
  }
  if (e.key === 'Tab') return true; // let the browser move to the next field
  // No structural gestures in here: ⌥←/⌥→ and ⌘⇧+arrows mean word jumps and
  // selections inside a text field. Plain ↑/↓ commits and edits the neighbour.
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    stopEvent(e);
    commitAndEditNeighbour(e.key === 'ArrowDown' ? 1 : -1);
    return true;
  }
  return false;
}

function tryEditAltField(c, e) {
  const { applyFieldWhileEditing, teamSelRef } = c;
  // ⌥+digit/letter reports a DIFFERENT e.key on macOS (⌥1 is "¡", ⌥s is
  // "ß"), so the physical key is the only reliable read here.
  const digit = /^Digit([1-4])$/.exec(e.code || '');
  if (digit) {
    stopEvent(e);
    applyFieldWhileEditing(digit[1]);
    return;
  }
  const letter = /^Key([SMLX])$/.exec(e.code || '');
  if (letter) {
    stopEvent(e);
    applyFieldWhileEditing(letter[1]);
    return;
  }
  if (e.code === 'Space') {
    stopEvent(e);
    applyFieldWhileEditing(' ', { back: e.shiftKey });
    return;
  }
  if (e.code === 'KeyT') {
    stopEvent(e);
    teamSelRef.current?.focus();
  }
}

export function handleEditKey(c, e) {
  const alt = e.altKey && !e.ctrlKey && !e.metaKey;
  if (tryEditNavigation(c, e, alt)) return;
  if (!alt) return;
  tryEditAltField(c, e);
}

// ── The dropdowns ───────────────────────────────────────────────────────

// The dropdowns' own key handling. Plain ↑/↓ and Home/End are the select's
// business (that is how you pick a value), so only the row-level gestures
// are intercepted here.
export function handleFieldKey(c, e, isLast) {
  const { cancelEdit, commitEdit, commitAndEditNeighbour, editing, visibleIds } = c;
  if (e.key === 'Escape') {
    stopEvent(e);
    cancelEdit();
    return;
  }
  if (e.key === 'Enter') {
    stopEvent(e);
    commitEdit(enterAdvance(e));
    return;
  }
  // Tab off the last field finishes this row and goes on, so a whole item is
  // one uninterrupted run of Tabs: on to the NEXT ROW when there is one, a
  // new row after a new row or the last row (typing a plan top to bottom).
  if (e.key === 'Tab' && !e.shiftKey && isLast) {
    stopEvent(e);
    const at = editing ? visibleIds.indexOf(editing.id) : -1;
    if (editing && !editing.isNew && at >= 0 && at < visibleIds.length - 1) commitAndEditNeighbour(1);
    else commitEdit('next');
  }
  // Everything else is the field's own: ↑/↓ picks a value, and there are
  // no structural gestures while a control owns the keyboard.
}

// ── The grid ────────────────────────────────────────────────────────────

const ARROW_COMMAND = { ArrowUp: 'moveUp', ArrowDown: 'moveDown', ArrowRight: 'indent', ArrowLeft: 'outdent' };
const isArrow = (key, a, b) => key === a || key === b;
const isVertical = key => isArrow(key, 'ArrowUp', 'ArrowDown');
const isHorizontal = key => isArrow(key, 'ArrowLeft', 'ArrowRight');
const isLetter = (key, a, b) => key === a || key === b;

// ⌘A — every row on screen, i.e. what the filters and folds left. Only from
// the grid itself; inside a field it is the field's.
function trySelectAll(c, e, key, bare) {
  if (bare || e.shiftKey || e.altKey || !isLetter(key, 'a', 'A') || !c.onSelectAll) return false;
  stopEvent(e);
  c.onSelectAll(c.filt.map(x => x.id));
  return true;
}

// ⌘⇧+arrow (Ctrl⇧ elsewhere) and ⌥+arrow — the structural commands: ↑/↓
// reorder (⇧ goes all the way), →/← indent/outdent.
function tryStructural(c, e, key, bare) {
  if (ARROW_COMMAND[key] && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
    e.preventDefault();
    c.runCommand(ARROW_COMMAND[key]);
    return true;
  }
  if (isVertical(key) && e.altKey && bare) {
    e.preventDefault();
    c.runCommand(e.shiftKey ? (key === 'ArrowDown' ? 'moveLast' : 'moveFirst') : ARROW_COMMAND[key]);
    return true;
  }
  return false;
}

function tryCursor(c, e, key, bare) {
  if (isVertical(key) && !e.altKey && bare) {
    e.preventDefault();
    c.moveCursor(key === 'ArrowDown' ? 'down' : 'up', e.shiftKey);
    return true;
  }
  // ⌥←/⌥→ — outdent / indent, the SAME gesture as inside the editor.
  if (isHorizontal(key) && e.altKey && bare) {
    e.preventDefault();
    c.runCommand(ARROW_COMMAND[key]);
    return true;
  }
  return false;
}

// ⌘↵ — a new row under this one, open for typing.
function tryNewSibling(c, e, key) {
  if (key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
  e.preventDefault();
  if (c.selected?.id) c.startNewSibling(c.selected.id);
  return true;
}

// Home / End — the first and the last row on screen.
function tryHomeEnd(c, e, key, bare) {
  if (!isArrow(key, 'Home', 'End') || !bare || e.altKey || e.shiftKey) return false;
  const row = key === 'Home' ? c.filt[0] : c.filt[c.filt.length - 1];
  if (!row) return true;
  e.preventDefault();
  c.onSelect(row, {}, c.visibleIds);
  return true;
}

// ⇧←/⇧→ — collapse or expand everything, exactly like the two toolbar
// buttons. Before the "needs a selected row" gate: it works with none.
function tryFoldAll(c, e, key, bare) {
  if (!isHorizontal(key) || !e.shiftKey || !bare || e.altKey) return false;
  e.preventDefault();
  if (key === 'ArrowLeft') c.collapseAll();
  else c.expandAll();
  return true;
}

// → opens a closed branch and then steps into it.
function stepRight(c, id, kids) {
  const { filt, collapsed, toggle, onSelect, visibleIds } = c;
  if (kids && collapsed.has(id)) {
    toggle(id);
    return;
  }
  const firstChild = filt.find(r => r.id.startsWith(id + '.') && depth(r.id) === depth(id) + 1);
  if (firstChild) onSelect(firstChild, {}, visibleIds);
}

// ← closes an open branch and then steps out to the parent.
function stepLeft(c, id, kids) {
  const { filt, collapsed, toggle, onSelect, visibleIds } = c;
  if (kids && !collapsed.has(id)) {
    toggle(id);
    return;
  }
  const pid = id.split('.').slice(0, -1).join('.');
  const parentRow = pid ? filt.find(r => r.id === pid) : null;
  if (parentRow) onSelect(parentRow, {}, visibleIds);
}

// ←/→ — the tree idiom every file browser and outliner shares.
function tryBranchNav(c, e, key) {
  if (!isHorizontal(key)) return false;
  e.preventDefault();
  const id = c.selected.id;
  const kids = hasChildren(c.tree, id);
  if (key === 'ArrowRight') stepRight(c, id, kids);
  else stepLeft(c, id, kids);
  return true;
}

// Tab / F2 / Enter / Delete / e — the row-level gestures on the selection.
function tryRowKeys(c, e, key, bare) {
  const { selected } = c;
  if (key === 'Tab') {
    e.preventDefault();
    c.runCommand(e.shiftKey ? 'outdent' : 'indent');
    return true;
  }
  // F2 — rename, the key every spreadsheet and file manager uses for it.
  if (key === 'F2') {
    e.preventDefault();
    c.startEdit(selected.id);
    return true;
  }
  if (key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) c.startNewChild(selected.id);
    else c.startEdit(selected.id);
    return true;
  }
  if (key === 'Delete' || key === 'Backspace') {
    e.preventDefault();
    c.doDelete();
    return true;
  }
  // The full editor, for everything deeper than the inline edit.
  if (isLetter(key, 'e', 'E') && bare && !e.altKey && c.onFullEdit) {
    e.preventDefault();
    if (selected?.id) c.onFullEdit(selected);
    return true;
  }
  return false;
}

// Space / 0 / 1–4 / S M L X — set a field on the selection or the targets.
function tryFieldKeys(c, e, key) {
  const { applyToTargets, sizes } = c;
  if (key === ' ' || key === 'Spacebar') {
    e.preventDefault();
    // ⇧Space walks back: through the phases of a task that has them, the
    // status cycle otherwise.
    applyToTargets(node => fieldPatchForKey(node, ' ', sizes, { back: e.shiftKey }));
    return true;
  }
  if (key === '0') {
    // The opposite of the priorities: 1–4 say how much this matters, 0 says
    // it is not going to happen (a separate field, so it can be taken back).
    e.preventDefault();
    applyToTargets(node => ({ dropped: node.dropped ? undefined : true }));
    return true;
  }
  if (['1', '2', '3', '4'].includes(key)) {
    e.preventDefault();
    applyToTargets(node => fieldPatchForKey(node, key, sizes));
    return true;
  }
  if (key.length === 1 && /^[a-zA-Z]$/.test(key) && ['S', 'M', 'L', 'X'].includes(key.toUpperCase())) {
    e.preventDefault();
    const upper = key.toUpperCase();
    applyToTargets(node => fieldPatchForKey(node, upper, sizes));
    return true;
  }
  return false;
}

const GRID_KEYS = [trySelectAll, tryStructural, tryCursor, tryNewSibling, tryHomeEnd, tryFoldAll];
const SELECTION_KEYS = [tryBranchNav, tryRowKeys, tryFieldKeys];

export function handleContainerKey(c, e) {
  if (c.editing) return; // the inline <input> owns Enter/⇧Enter/Esc — see handleEditKey
  // Anything typed into a field bubbles up to here, and `editing` only knows
  // about the inline name editor. A key pressed inside any other text entry
  // belongs to that entry.
  if (isTypingTarget(e.target)) return;
  const key = e.key;
  const bare = !e.ctrlKey && !e.metaKey; // leave Cmd/Ctrl combos (save, undo, find…) alone
  if (GRID_KEYS.some(fn => fn(c, e, key, bare))) return;
  if (!bare || e.altKey || !c.selected?.id) return;
  SELECTION_KEYS.some(fn => fn(c, e, key, bare));
}
