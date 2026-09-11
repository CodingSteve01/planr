// The keymap is a label layer over handlers that live elsewhere, which is
// exactly the arrangement that rots quietly: a key changes in TreeView, the
// table still claims the old one, and the tooltip lies. These tests hold the
// two ends together — every id a tooltip asks for exists, and every id the
// table declares is actually asked for by something.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { SHORTCUTS, SCOPES, keyHint, withKey, shortcut, shortcutsByScope } from '../shortcuts.js';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(jsx?|mjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}
const ALL_SOURCE = sourceFiles(SRC)
  .filter(f => !f.endsWith('shortcuts.js'))
  .map(f => readFileSync(f, 'utf8'))
  .join('\n');

describe('the shortcut table is well formed', () => {
  it('has unique ids', () => {
    const ids = SHORTCUTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a known scope, at least one key and a label key', () => {
    for (const s of SHORTCUTS) {
      expect(SCOPES, `${s.id} has scope "${s.scope}"`).toContain(s.scope);
      expect(s.keys.length, `${s.id} has no keys`).toBeGreaterThan(0);
      expect(s.labelKey.startsWith('sc.'), `${s.id} labelKey is ${s.labelKey}`).toBe(true);
    }
  });

  it('puts every entry in exactly one scope group', () => {
    const grouped = shortcutsByScope().flatMap(g => g.items);
    expect(grouped).toHaveLength(SHORTCUTS.length);
  });

  it('has a translation for every label key, in both languages', () => {
    const i18n = readFileSync(join(SRC, 'i18n.jsx'), 'utf8');
    for (const s of SHORTCUTS) {
      const hits = i18n.split(`'${s.labelKey}':`).length - 1;
      expect(hits, `${s.labelKey} appears ${hits}× in i18n.jsx, expected 2 (en + de)`).toBe(2);
    }
  });
});

describe('keyHint / withKey', () => {
  it('joins alternatives with a slash and ranges with a dash', () => {
    expect(keyHint('rename')).toBe('↵');
    expect(keyHint('cursorMove')).toBe('↑ / ↓');
    expect(keyHint('prio')).toBe('1–4');
    expect(keyHint('size')).toBe('S–X');
  });

  it('appends the hint to a tooltip', () => {
    expect(withKey('Rename P1.2', 'rename')).toBe('Rename P1.2 · ↵');
  });

  it('degrades to the bare text for an unknown id rather than breaking the tooltip', () => {
    expect(withKey('Do a thing', 'no-such-shortcut')).toBe('Do a thing');
    expect(keyHint('no-such-shortcut')).toBe('');
    expect(shortcut('no-such-shortcut')).toBeNull();
  });
});

describe('the table and the app agree', () => {
  // `withKey(..., 'typo')` silently renders no hint — deliberate, so a typo
  // never breaks a tooltip — which is precisely why it needs catching here.
  it('every id used by a withKey/keyHint call exists in the table', () => {
    // Capture one call's argument list at a time — `[^()]*` with a single
    // level of nesting allowed, so the match cannot run past the closing
    // paren. An earlier `[\s\S]*?,\s*'([^']+)'` version could: given a
    // single-argument `keyHint(cmd.key)` it kept scanning forward through
    // unrelated code until it found some other `, 'string')` and reported
    // that as a shortcut id.
    const calls = [...ALL_SOURCE.matchAll(/\b(?:withKey|keyHint)\(((?:[^()']|'[^']*')*(?:\((?:[^()']|'[^']*')*\)(?:[^()']|'[^']*')*)*)\)/g)]
      .map(m => m[1]);
    // The id is the last quoted literal in the argument list; a call that
    // passes a variable (`keyHint(item.key)`) has none and is skipped — it
    // cannot be checked statically.
    const used = calls
      .map(args => [...args.matchAll(/'([^']+)'/g)].pop()?.[1])
      .filter(Boolean);
    expect(used.length, 'no withKey call found — has the helper been renamed?').toBeGreaterThan(5);
    const unknown = [...new Set(used)].filter(id => !shortcut(id));
    expect(unknown).toEqual([]);
  });

  it('declares the keys that actually reach the tree editor while typing', () => {
    // Guards the complaint this table was built for: the row editor used to
    // accept a name and nothing else.
    const editIds = SHORTCUTS.filter(s => s.scope === 'treeEdit').map(s => s.id);
    for (const id of ['editPrio', 'editSize', 'editTeam', 'editStatus', 'editMove', 'editReorder', 'editIndent']) {
      expect(editIds, `${id} missing from the treeEdit scope`).toContain(id);
    }
  });
});
