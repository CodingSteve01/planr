import { useRef } from 'react';
import { canTreeCommand, canTreeCommandMany, remapIds } from '../../../utils/treeMove.js';
import { rowAfterDeleting } from '../../../utils/tree/rows.js';

function moveCursor(c, dir, extend) {
  const { visibleIds, selected, filt, onSelect, shiftCursorRef } = c;
  if (!visibleIds.length) return;
  const fromId = extend ? shiftCursorRef.current || selected?.id : selected?.id;
  const curIdx = fromId ? visibleIds.indexOf(fromId) : -1;
  let nextIdx;
  if (curIdx < 0) nextIdx = dir === 'down' ? 0 : visibleIds.length - 1;
  else nextIdx = Math.max(0, Math.min(visibleIds.length - 1, curIdx + (dir === 'down' ? 1 : -1)));
  const nextRow = filt[nextIdx];
  if (!nextRow) return;
  shiftCursorRef.current = extend ? nextRow.id : null;
  onSelect(nextRow, { shiftKey: !!extend }, visibleIds);
}

// Applies a field patch to the active row, or to the whole multi-selection
// when there is one — same "loop onTaskUpdate" path the selection bar's
// own status buttons already use below. App.jsx's mutate() coalesces
// same-tick pushes (see utils/undo.js), so N calls here still cost the
// user exactly one ⌘Z.
// `opts` reaches fieldPatchForKey — today only { back }, for ⇧Space.
function applyToTargets(c, patchOf) {
  const { onTaskUpdate, hasSelection, multiSel, selected, tree } = c;
  if (!onTaskUpdate) return;
  const ids = hasSelection ? multiSel : selected?.id ? new Set([selected.id]) : null;
  if (!ids || !ids.size) return;
  tree.forEach(node => {
    if (!ids.has(node.id)) return;
    const patch = patchOf(node);
    if (patch) onTaskUpdate({ ...node, ...patch });
  });
}

// ── Structure: move up / down, indent, outdent ─────────────────────────
// Four explicit commands (utils/treeMove.js), decided against the rows on
// screen. Toolbar and keyboard both call `runCommand`, and the toolbar's
// disabled state is `canRun` — the same check the command itself makes,
// so a button is never enabled for a press that does nothing.
//
// Up/down used to carry on past the end of a sibling run by stepping out
// a level. That made the arrow a re-parent in disguise; it is a reorder
// and nothing else now, and changing the level is indent / outdent.
// With several rows selected the commands take all of them, as a block
// (utils/treeMove.js, applyTreeCommandMany) — they used to take only the
// row clicked last.
function canRun(c, id, command) {
  const { multiMove, tree, visibleIds, multiSel, onCommand } = c;
  return multiMove
    ? canTreeCommandMany(tree, visibleIds, [...multiSel], command)
    : !!onCommand && !!id && canTreeCommand(visibleIds, id, command);
}

function runCommand(c, command, id = c.selected?.id) {
  const { multiMove, multiSel, onCommand, onCommandMany, visibleIds, setCollapsed, revealRef, containerRef } = c;
  if (!canRun(c, id, command)) return;
  const res = multiMove ? onCommandMany([...multiSel], command, visibleIds) : onCommand(id, command, visibleIds);
  if (!res) return;
  // A re-parent renumbers the row and its subtree. The cursor follows in
  // App; the fold state of the moved branch has to follow here.
  if (res.idMap && Object.keys(res.idMap).length) setCollapsed(c => remapIds(c, res.idMap));
  revealRef.current = res.id || res.ids?.[0];
  // Keep the keyboard on the tree. After a toolbar click focus sits on the
  // button, which may just have become disabled — and a disabled button
  // drops focus to the page, where the next ⌘⇧↑ goes nowhere.
  if (containerRef.current && document.activeElement !== containerRef.current) containerRef.current.focus();
}

function doDelete(c) {
  const { hasSelection, multiSel, selected, tree, visibleIds, filt, onBulkDelete, onDelete, onSelect } = c;
  const ids = hasSelection ? [...multiSel] : selected?.id ? [selected.id] : [];
  if (!ids.length) return;
  // Descendants disappear with their parent, so they count as gone too.
  const alsoGone = tree.filter(r => ids.some(id => r.id.startsWith(id + '.'))).map(r => r.id);
  const next = rowAfterDeleting(visibleIds, filt, [...ids, ...alsoGone]);
  if (hasSelection) onBulkDelete?.(ids);
  else onDelete?.(ids[0]);
  // After App's own setSel(null) — so this wins, and the cursor stays put.
  if (next)
    onSelect(
      next,
      {},
      visibleIds.filter(id => !ids.includes(id)),
    );
}

// The commands that act on the cursor row or the whole selection. Each module
// function above takes the render's values as `c`; the hook binds them, so the
// view and the key handler call them the way they called the closures.
export function useTreeCommands(args) {
  // Tracks the row the cursor last moved to during a Shift+↑/↓ run. Needed
  // because onSelect's shift-extend (shared with mouse shift-click) keeps
  // `selected` pinned at the ANCHOR the whole time — without this, a second
  // Shift+↓ would compute "one past the anchor" again instead of extending
  // one row further. Not new user-visible state, just where the next arrow
  // press should count from; `selected` stays the one cursor the user sees.
  const shiftCursorRef = useRef(null);
  const multiMove = !!args.onCommandMany && args.multiSel && args.multiSel.size > 1;
  const c = { ...args, shiftCursorRef, multiMove };
  return {
    multiMove,
    moveCursor: (dir, extend) => moveCursor(c, dir, extend),
    applyToTargets: patchOf => applyToTargets(c, patchOf),
    canRun: (id, command) => canRun(c, id, command),
    runCommand: (command, id) => runCommand(c, command, id),
    doDelete: () => doDelete(c),
  };
}
