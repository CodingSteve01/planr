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
export const SCOPES = ['global', 'tree', 'treeEdit', 'gantt', 'dialog'];

export const SHORTCUTS = [
  // ── Global — live everywhere, handled in App.jsx ──────────────────────
  { id: 'open', scope: 'global', keys: [`${MOD}O`], labelKey: 'sc.open' },
  { id: 'save', scope: 'global', keys: [`${MOD}S`], labelKey: 'sc.save' },
  { id: 'saveAs', scope: 'global', keys: [`⇧${MOD}S`], labelKey: 'sc.saveAs' },
  { id: 'export', scope: 'global', keys: [`${MOD}E`], labelKey: 'sc.export' },
  { id: 'settings', scope: 'global', keys: [`${MOD},`], labelKey: 'sc.settings' },
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
  { id: 'rename', scope: 'tree', keys: ['↵', 'F2'], labelKey: 'sc.rename' },
  { id: 'fullEdit', scope: 'tree', keys: ['E'], labelKey: 'sc.fullEdit' },
  { id: 'newRow', scope: 'tree', keys: [`${MOD}↵`], labelKey: 'sc.newRow' },
  { id: 'newChild', scope: 'tree', keys: ['⇧↵'], labelKey: 'sc.newChild' },
  // The four structural commands, one arrow each under ⌘⇧ (Ctrl⇧ off the
  // Mac). The ⌥ spelling and Tab/⇧Tab are the same commands, kept because
  // the tree answered to them first. None of them work while a field has
  // the keyboard — there they would be a word jump or a selection.
  { id: 'moveUp', scope: 'tree', keys: [`${MOD}⇧↑`, `${ALT}↑`], labelKey: 'sc.moveUp' },
  { id: 'moveDown', scope: 'tree', keys: [`${MOD}⇧↓`, `${ALT}↓`], labelKey: 'sc.moveDown' },
  { id: 'reorderEnds', scope: 'tree', keys: [`${ALT}⇧↑`, `${ALT}⇧↓`], labelKey: 'sc.reorderEnds' },
  { id: 'indent', scope: 'tree', keys: [`${MOD}⇧→`, `${ALT}→`, '⇥'], labelKey: 'sc.indent' },
  { id: 'outdent', scope: 'tree', keys: [`${MOD}⇧←`, `${ALT}←`, '⇧⇥'], labelKey: 'sc.outdent' },
  { id: 'cursorEnds', scope: 'tree', keys: ['Home', 'End'], labelKey: 'sc.cursorEnds' },
  { id: 'collapseAll', scope: 'tree', keys: ['⇧←'], labelKey: 'sc.collapseAll' },
  { id: 'expandAll', scope: 'tree', keys: ['⇧→'], labelKey: 'sc.expandAll' },
  { id: 'prio', scope: 'tree', keys: ['1', '2', '3', '4'], labelKey: 'sc.prio' },
  { id: 'drop', scope: 'tree', keys: ['0'], labelKey: 'sc.drop' },
  { id: 'size', scope: 'tree', keys: ['S', 'M', 'L', 'X'], labelKey: 'sc.size' },
  { id: 'status', scope: 'tree', keys: ['Space', '⇧Space'], labelKey: 'sc.status' },
  { id: 'delete', scope: 'tree', keys: [DEL], labelKey: 'sc.delete' },
  { id: 'pasteRows', scope: 'tree', keys: [`${MOD}V`], labelKey: 'sc.pasteRows' },

  // ── Work tree, WHILE typing a name ───────────────────────────────────
  // Everything here works without leaving the field. Before, the editor was
  // all-or-nothing: you could type a name and that was it — any other key
  // either went into the text or threw you out.
  { id: 'editNext', scope: 'treeEdit', keys: ['↵'], labelKey: 'sc.editNext' },
  { id: 'editNextRow', scope: 'treeEdit', keys: [`${MOD}↵`], labelKey: 'sc.editNextRow' },
  { id: 'editChild', scope: 'treeEdit', keys: ['⇧↵'], labelKey: 'sc.editChild' },
  { id: 'editCancel', scope: 'treeEdit', keys: ['Esc'], labelKey: 'sc.editCancel' },
  { id: 'editMove', scope: 'treeEdit', keys: ['↑', '↓'], labelKey: 'sc.editMove' },
  { id: 'editFields', scope: 'treeEdit', keys: ['⇥', '⇧⇥'], labelKey: 'sc.editFields' },
  { id: 'editPrio', scope: 'treeEdit', keys: [`${ALT}1`, `${ALT}4`], labelKey: 'sc.editPrio' },
  { id: 'editSize', scope: 'treeEdit', keys: [`${ALT}S`, `${ALT}X`], labelKey: 'sc.editSize' },
  { id: 'editTeam', scope: 'treeEdit', keys: [`${ALT}T`], labelKey: 'sc.editTeam' },
  { id: 'editStatus', scope: 'treeEdit', keys: [`${ALT}Space`, `${ALT}⇧Space`], labelKey: 'sc.editStatus' },

  // ── Schedule ─────────────────────────────────────────────────────────
  // Deliberately the tree's keys. The schedule is where you SEE that
  // something sits too early, so it has to be somewhere you can say so —
  // with the same gesture, not a second vocabulary.
  { id: 'ganttCursor', scope: 'gantt', keys: ['↑', '↓'], labelKey: 'sc.ganttCursor' },
  { id: 'ganttOpen', scope: 'gantt', keys: ['E', '↵'], labelKey: 'sc.ganttOpen' },
  { id: 'ganttReorder', scope: 'gantt', keys: [`${ALT}↑`, `${ALT}↓`], labelKey: 'sc.ganttReorder' },
  { id: 'ganttReorderEnds', scope: 'gantt', keys: [`${ALT}⇧↑`, `${ALT}⇧↓`], labelKey: 'sc.ganttReorderEnds' },
  { id: 'ganttSelectAll', scope: 'gantt', keys: [`${MOD}A`], labelKey: 'sc.ganttSelectAll' },
  { id: 'ganttClear', scope: 'gantt', keys: ['Esc'], labelKey: 'sc.ganttClear' },

  // ── Item dialog (NodeModal) — opened with E ─────────────────────────
  { id: 'dialogTab', scope: 'dialog', keys: [`${ALT}1`, `${ALT}7`], labelKey: 'sc.dialogTab' },
  { id: 'dialogTabBar', scope: 'dialog', keys: ['←', '→'], labelKey: 'sc.dialogTabBar' },
  { id: 'dialogSections', scope: 'dialog', keys: ['⇥', '↵'], labelKey: 'sc.dialogSections' },
  { id: 'dialogSave', scope: 'dialog', keys: [`${MOD}↵`], labelKey: 'sc.dialogSave' },
  { id: 'dialogClose', scope: 'dialog', keys: ['Esc'], labelKey: 'sc.dialogClose' },
];

const BY_ID = new Map(SHORTCUTS.map(s => [s.id, s]));

export function shortcut(id) { return BY_ID.get(id) || null; }

// The ⌘⇧ chord of a structural command in aria-keyshortcuts syntax
// ("Meta+Shift+ArrowUp"), for the buttons that run it.
const ARIA_CHORD = { moveUp: 'ArrowUp', moveDown: 'ArrowDown', indent: 'ArrowRight', outdent: 'ArrowLeft' };
export function ariaChord(id) {
  const arrow = ARIA_CHORD[id];
  return arrow ? `${isMac ? 'Meta' : 'Control'}+Shift+${arrow}` : undefined;
}

// One key as it should read on this platform. The table is written in Mac
// glyphs; off the Mac they become the words printed on the keys, joined with
// "+" the way Windows writes a chord: "Ctrl⇧↑" → "Ctrl+Shift+↑",
// "⇧↵" → "Shift+Enter", "⇥" → "Tab". `mac` is a parameter so tests can ask
// for either platform.
const KEY_WORD = { '⇧': 'Shift', '↵': 'Enter', '⇥': 'Tab', '⌘': 'Ctrl', '⌥': 'Alt' };
const MOD_ORDER = ['Ctrl', 'Alt', 'Shift'];
export function formatKey(key, mac = isMac) {
  if (mac) return key;
  const mods = [];
  let rest = key;
  for (;;) {
    const m = /^(Ctrl|Alt|⇧|⌘|⌥)/.exec(rest);
    if (!m || m[0] === rest) break;   // a lone modifier is the key itself
    mods.push(KEY_WORD[m[0]] || m[0]);
    rest = rest.slice(m[0].length);
  }
  const main = KEY_WORD[rest] || rest;
  // Windows writes modifiers in one fixed order — Ctrl+Alt+Shift+Key — so
  // the Mac's "⇧⌘S" reads Ctrl+Shift+S, not Shift+Ctrl+S.
  mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...mods, main].join('+');
}

// The display string for a shortcut: "⌥↑ / ⌥↓", "1–4", "⌘S" — or, off the
// Mac, "Alt+↑ / Alt+↓", "Ctrl+S".
// Ranges (prio, size) are declared as first/last and joined with an en dash,
// everything else with a slash.
export function keyHint(id, mac = isMac) {
  const s = BY_ID.get(id);
  if (!s) return '';
  const keys = s.keys.map(k => formatKey(k, mac));
  const range = ['prio', 'size', 'editPrio', 'editSize', 'dialogTab'].includes(id);
  if (range) return `${keys[0]}–${keys[keys.length - 1]}`;
  return keys.join(' / ');
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
