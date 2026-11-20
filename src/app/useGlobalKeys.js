import { useEffect } from 'react';
import { SEARCH_TABS, MATCH_STEP_TABS } from './shell.js';

// Global keyboard shortcuts. The file ones are the platform conventions
// people already have in their fingers — ⌘O open, ⌘S save, ⇧⌘S save as,
// ⌘E export, ⌘, settings — declared in utils/shortcuts.js so the keymap
// and the menus name exactly what is bound here.
//
// ⌘N (new) is deliberately NOT bound: browsers keep it for "new window"
// and never deliver it to the page, so binding it would look like a
// feature and do nothing. New project lives in the File menu and the
// palette instead.

// Never steal a file shortcut from a text field the user is typing in
// — except Save, which people expect to work from anywhere.
function isTypingInField() {
  const active = document.activeElement;
  const tag = active?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!active?.isContentEditable;
}

// Each handler returns true when it consumed the key and nothing after it may
// look at the event.
function fileShortcut(e, c, mod, key, typing) {
  if (mod && key === 's' && e.shiftKey) {
    e.preventDefault();
    c.saveToFile(true);
    return true;
  }
  if (mod && key === 'o' && !typing) {
    e.preventDefault();
    c.loadFromFile();
    return true;
  }
  if (mod && key === 'e' && !typing) {
    e.preventDefault();
    c.setTab('report');
    return true;
  }
  if (mod && e.key === ',' && !typing) {
    e.preventDefault();
    c.setModal('settings');
    return true;
  }
  if (mod && e.key === 's') {
    e.preventDefault();
    c.saveToFile();
    return true;
  }
  return false;
}

function focusSearchShortcut(e, c, mod) {
  if (!(mod && e.key === 'f')) return;
  // Only intercept when a searchable view is active
  if (SEARCH_TABS.has(c.tab)) {
    e.preventDefault();
    c.searchRef.current?.focus();
    c.searchRef.current?.select();
  }
}

// Cmd/Ctrl+Arrow Up/Down: cycle through search matches
// ⇧ is not ours: ⌘⇧↑/↓ moves a row in the tree.
// Not from a text field: the search box steps on its own (this used to
// step a second time, so each press skipped a match), and anywhere else
// ⌘↑/⌘↓ is the caret's jump to the start or end of the text.
function matchStepShortcut(e, c, mod, typing) {
  if (!mod || e.shiftKey || typing || !c.search || !MATCH_STEP_TABS.has(c.tab)) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  c.setSearchIdx(i => (e.key === 'ArrowDown' ? i + 1 : i - 1));
}

// Undo/redo — never while focus is in a text-editing control, so
// native text-field undo wins there instead of ours.
function undoShortcut(e, c, mod) {
  if (!(mod && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y'))) return;
  // No structure command can be issued from inside a field any more, so
  // there is never plan history hiding behind a text field's ⌘Z.
  if (isTypingInField()) return;
  const isRedo = e.key === 'y' || e.key === 'Y' || e.shiftKey;
  e.preventDefault();
  if (isRedo) c.handleRedo();
  else c.handleUndo();
}

function onKeyDown(e, c) {
  const mod = e.ctrlKey || e.metaKey;
  const key = (e.key || '').toLowerCase();
  const typing = isTypingInField();
  if (fileShortcut(e, c, mod, key, typing)) return;
  focusSearchShortcut(e, c, mod);
  matchStepShortcut(e, c, mod, typing);
  undoShortcut(e, c, mod);
}

// `ctx` is the latest render's values; the listener is re-attached every
// render, as the inline effect it came from was, so it never reads stale ones.
export function useGlobalKeys(ctx) {
  useEffect(() => {
    const h = e => onKeyDown(e, ctx);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
}
