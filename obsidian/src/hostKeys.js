// Planr's chords, claimed from Obsidian while a plan has focus.
//
// Obsidian runs its hotkeys from a keydown listener on the window in the
// capture phase. When one matches it calls preventDefault AND stopPropagation
// there, so the app's own listeners — on the window, bubbling — never hear the
// key at all. ⌘F was the one noticed (Obsidian's "Search current file"), but
// every chord in the keyboard map was exposed to the same thing.
//
// A view may carry its own Scope, which Obsidian asks first while the view is
// active. Registering a chord there and answering `true` ends Obsidian's
// lookup — the vault's hotkey for that chord is not run — without the
// preventDefault/stopPropagation that only an answer of `false` triggers. The
// event then travels on to Planr exactly as it does on the web.
//
// The chords come from utils/shortcuts.js, the table the keyboard map is drawn
// from, so a key added there is claimed here without anyone remembering to.
// Only chords: a bare key is no Obsidian hotkey, and claiming plain letters
// would buy nothing.

import { SHORTCUTS } from '../../src/utils/shortcuts.js';

const GLYPH_KEY = { '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight', '↵': 'Enter', '⇥': 'Tab', '⌫': 'Backspace' };
const PREFIX = [['⌘', 'Mod'], ['Ctrl', 'Mod'], ['⇧', 'Shift'], ['⌥', 'Alt'], ['Alt', 'Alt']];

/** "⇧⌘S" → { modifiers: ['Mod', 'Shift'], key: 'S' }; null for a bare key. */
export function parseChord(label) {
  const modifiers = new Set();
  let rest = label;
  for (let hit = true; hit;) {
    hit = false;
    for (const [glyph, mod] of PREFIX) {
      if (rest.startsWith(glyph) && rest.length > glyph.length) {
        modifiers.add(mod); rest = rest.slice(glyph.length); hit = true;
      }
    }
  }
  if (!modifiers.has('Mod') && !modifiers.has('Alt')) return null;
  const key = GLYPH_KEY[rest] || (rest === 'Space' ? ' ' : rest);
  return { modifiers: [...modifiers].sort(), key };
}

/** Every distinct chord in the keyboard map. */
export function planrChords(shortcuts = SHORTCUTS) {
  const seen = new Map();
  for (const s of shortcuts) {
    for (const label of s.keys) {
      const chord = parseChord(label);
      if (chord) seen.set(`${chord.modifiers.join('+')}+${chord.key}`, chord);
    }
  }
  return [...seen.values()];
}

/** Claim every chord on `scope` (an Obsidian Scope) for the app. */
export function claimPlanrKeys(scope, shortcuts = SHORTCUTS) {
  for (const { modifiers, key } of planrChords(shortcuts)) scope.register(modifiers, key, () => true);
  return scope;
}
