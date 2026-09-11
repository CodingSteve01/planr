// Every keyboard shortcut in the app, declared once.
//
// Two consumers read this, and that is the whole point:
//
//   1. `KeyboardMap.jsx` renders it as the app-wide reference (press `?`).
//   2. Every button that also has a key appends `keyHint(id)` to its
//      tooltip, so the shortcut is learned at the control it belongs to.
//
// What this replaces is a dense hint line printed above the tree — a wall of
// glyphs you had to read before you could start, teaching keys for controls
// you could not see yet. A shortcut belongs next to its button; the complete
// list belongs one keypress away, not permanently on screen (principle 4:
// tier 1 is what you need now, tier 2 is one reach).
//
// The handlers themselves are NOT generated from this table. They live where
// they are handled (App.jsx's window listener, TreeView's container and edit
// handlers, GanttView's own). This is the label layer: if a key changes, the
// row here changes with it, and `shortcuts.test.js` checks that every id a
// tooltip asks for actually exists.

const isMac = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

export const MOD = isMac ? '⌘' : 'Ctrl';
export const ALT = isMac ? '⌥' : 'Alt';
export const DEL = isMac ? '⌫' : 'Del';

// scope: which surface the key is live on. `treeEdit` is the row editor —
// the keys that work WHILE a name is being typed, which is exactly where
// they were missing.
export const SCOPES = ['global', 'tree', 'treeEdit', 'gantt'];

export const SHORTCUTS = [
  // ── Global — live everywhere, handled in App.jsx ──────────────────────
  { id: 'save', scope: 'global', keys: [`${MOD}S`], labelKey: 'sc.save' },
  { id: 'undo', scope: 'global', keys: [`${MOD}Z`], labelKey: 'sc.undo' },
  { id: 'redo', scope: 'global', keys: [`⇧${MOD}Z`], labelKey: 'sc.redo' },
  { id: 'palette', scope: 'global', keys: ['/', `${MOD}K`], labelKey: 'sc.palette' },
  { id: 'find', scope: 'global', keys: [`${MOD}F`], labelKey: 'sc.find' },
  { id: 'findNext', scope: 'global', keys: [`${MOD}↓`, `${MOD}↑`], labelKey: 'sc.findNext' },
  { id: 'keymap', scope: 'global', keys: ['?'], labelKey: 'sc.keymap' },
  { id: 'closeDialog', scope: 'global', keys: ['Esc'], labelKey: 'sc.closeDialog' },

  // ── Work tree, cursor on a row ───────────────────────────────────────
  { id: 'cursorMove', scope: 'tree', keys: ['↑', '↓'], labelKey: 'sc.cursorMove' },
  { id: 'cursorExtend', scope: 'tree', keys: ['⇧↑', '⇧↓'], labelKey: 'sc.cursorExtend' },
  { id: 'cursorInto', scope: 'tree', keys: ['→'], labelKey: 'sc.cursorInto' },
  { id: 'cursorOut', scope: 'tree', keys: ['←'], labelKey: 'sc.cursorOut' },
  { id: 'rename', scope: 'tree', keys: ['↵'], labelKey: 'sc.rename' },
  { id: 'newChild', scope: 'tree', keys: ['⇧↵'], labelKey: 'sc.newChild' },
  // Both spellings, deliberately: ⌥←/⌥→ is the one gesture that works in the
  // grid AND inside the row editor, where Tab belongs to the form.
  { id: 'indent', scope: 'tree', keys: [`${ALT}→`, '⇥'], labelKey: 'sc.indent' },
  { id: 'outdent', scope: 'tree', keys: [`${ALT}←`, '⇧⇥'], labelKey: 'sc.outdent' },
  { id: 'reorder', scope: 'tree', keys: [`${ALT}↑`, `${ALT}↓`], labelKey: 'sc.reorder' },
  { id: 'reorderEnds', scope: 'tree', keys: [`${ALT}⇧↑`, `${ALT}⇧↓`], labelKey: 'sc.reorderEnds' },
  { id: 'collapseAll', scope: 'tree', keys: ['⇧←'], labelKey: 'sc.collapseAll' },
  { id: 'expandAll', scope: 'tree', keys: ['⇧→'], labelKey: 'sc.expandAll' },
  { id: 'prio', scope: 'tree', keys: ['1', '2', '3', '4'], labelKey: 'sc.prio' },
  { id: 'size', scope: 'tree', keys: ['S', 'M', 'L', 'X'], labelKey: 'sc.size' },
  { id: 'status', scope: 'tree', keys: ['Space', '⇧Space'], labelKey: 'sc.status' },
  { id: 'delete', scope: 'tree', keys: [DEL], labelKey: 'sc.delete' },
  { id: 'pasteRows', scope: 'tree', keys: [`${MOD}V`], labelKey: 'sc.pasteRows' },

  // ── Work tree, WHILE typing a name ───────────────────────────────────
  // Everything here works without leaving the field. Before, the editor was
  // all-or-nothing: you could type a name and that was it — any other key
  // either went into the text or threw you out.
  { id: 'editNext', scope: 'treeEdit', keys: ['↵'], labelKey: 'sc.editNext' },
  { id: 'editChild', scope: 'treeEdit', keys: ['⇧↵'], labelKey: 'sc.editChild' },
  { id: 'editCancel', scope: 'treeEdit', keys: ['Esc'], labelKey: 'sc.editCancel' },
  { id: 'editMove', scope: 'treeEdit', keys: ['↑', '↓'], labelKey: 'sc.editMove' },
  { id: 'editReorder', scope: 'treeEdit', keys: [`${ALT}↑`, `${ALT}↓`], labelKey: 'sc.editReorder' },
  { id: 'editFields', scope: 'treeEdit', keys: ['⇥', '⇧⇥'], labelKey: 'sc.editFields' },
  { id: 'editIndent', scope: 'treeEdit', keys: [`${ALT}←`, `${ALT}→`], labelKey: 'sc.editIndent' },
  { id: 'editPrio', scope: 'treeEdit', keys: [`${ALT}1`, `${ALT}4`], labelKey: 'sc.editPrio' },
  { id: 'editSize', scope: 'treeEdit', keys: [`${ALT}S`, `${ALT}X`], labelKey: 'sc.editSize' },
  { id: 'editTeam', scope: 'treeEdit', keys: [`${ALT}T`], labelKey: 'sc.editTeam' },
  { id: 'editStatus', scope: 'treeEdit', keys: [`${ALT}Space`, `${ALT}⇧Space`], labelKey: 'sc.editStatus' },

  // ── Gantt ────────────────────────────────────────────────────────────
  { id: 'ganttSelectAll', scope: 'gantt', keys: [`${MOD}A`], labelKey: 'sc.ganttSelectAll' },
  { id: 'ganttClear', scope: 'gantt', keys: ['Esc'], labelKey: 'sc.ganttClear' },
];

const BY_ID = new Map(SHORTCUTS.map(s => [s.id, s]));

export function shortcut(id) { return BY_ID.get(id) || null; }

// The display string for a shortcut: "⌥↑ / ⌥↓", "1–4", "⌘S".
// Ranges (prio, size) are declared as first/last and joined with an en dash,
// everything else with a slash.
export function keyHint(id) {
  const s = BY_ID.get(id);
  if (!s) return '';
  const range = id === 'prio' || id === 'size' || id === 'editPrio' || id === 'editSize';
  if (range) return `${s.keys[0]}–${s.keys[s.keys.length - 1]}`;
  return s.keys.join(' / ');
}

// Appends the shortcut to a tooltip. `withKey('Rename P1.2', 'rename')`
// → "Rename P1.2 · ↵". Silently returns the text unchanged for an unknown
// id, so a typo degrades to "no hint" rather than breaking a tooltip —
// shortcuts.test.js is what catches the typo.
export function withKey(text, id) {
  const hint = keyHint(id);
  return hint ? `${text} · ${hint}` : text;
}

export function shortcutsByScope() {
  return SCOPES.map(scope => ({ scope, items: SHORTCUTS.filter(s => s.scope === scope) }));
}
