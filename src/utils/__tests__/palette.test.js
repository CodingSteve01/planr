import { describe, test, expect } from 'vitest';
import { filterCommands } from '../palette.js';

const commands = [
  { id: 'load', label: 'Load file…' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'saveAs', label: 'Save as…' },
  { id: 'export', label: 'Export…' },
  { id: 'exportDialog', label: 'Export… (dialog)' },
  { id: 'newProject', label: 'New project' },
  { id: 'help', label: 'Help' },
  { id: 'mode.build', label: 'Build' },
  { id: 'view.tree', label: 'Work Tree' },
];

describe('filterCommands', () => {
  test('empty query returns every command, unchanged order', () => {
    expect(filterCommands(commands, '')).toEqual(commands);
    expect(filterCommands(commands, '   ')).toEqual(commands);
  });

  test('substring match is case-insensitive', () => {
    const result = filterCommands(commands, 'export');
    expect(result.map(c => c.id)).toEqual(['export', 'exportDialog']);
  });

  test('substring hits rank before fuzzy-only hits', () => {
    // "sh" is a substring of nothing here except via fuzzy match on
    // "Save as…" (s..h? no) — use a query that is both a real substring of
    // one label and a fuzzy subsequence of another to prove ordering.
    const cmds = [
      { id: 'fuzzyOnly', label: 'Sandbox History' }, // "sh" as subsequence (S...H)
      { id: 'substr', label: 'shell' },               // "sh" as substring
    ];
    const result = filterCommands(cmds, 'sh');
    expect(result.map(c => c.id)).toEqual(['substr', 'fuzzyOnly']);
  });

  test('fuzzy subsequence match finds "expt" in "Export…"', () => {
    const result = filterCommands(commands, 'expt');
    expect(result.map(c => c.id)).toContain('export');
  });

  test('no match returns an empty list', () => {
    expect(filterCommands(commands, 'zzzzz')).toEqual([]);
  });

  test('handles a missing/undefined commands array gracefully', () => {
    expect(filterCommands(undefined, 'x')).toEqual([]);
  });
});

// The word you reach for is not always the word on the button.
//
// "Urlaub eintragen…" is what the command says in German; somebody who thinks
// in English types "vacation" and finds nothing. The same in reverse, and the
// same for a job whose label is a sentence ("Take somebody on…") while the
// word in your head is one noun ("onboard"). Keywords are a second, invisible
// set of names — they never outrank a real label match, they only stop the
// palette coming up empty.
describe('keywords', () => {
  const cmds = [
    { id: 'vacation', label: 'Urlaub eintragen…', keywords: ['vacation', 'holiday', 'urlaub'] },
    { id: 'export', label: 'Export…' },
  ];

  test('finds a command by a word that is not in its label', () => {
    expect(filterCommands(cmds, 'vacation').map(c => c.id)).toEqual(['vacation']);
  });

  test('still ranks a label match above a keyword match', () => {
    const list = [
      { id: 'byKeyword', label: 'Something else', keywords: ['export'] },
      { id: 'byLabel', label: 'Export…' },
    ];
    expect(filterCommands(list, 'export').map(c => c.id)).toEqual(['byLabel', 'byKeyword']);
  });

  test('leaves a command without keywords exactly as it was', () => {
    expect(filterCommands(cmds, 'expo').map(c => c.id)).toEqual(['export']);
  });
});
