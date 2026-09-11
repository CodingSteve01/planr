// Guard rail for the bug class that just shipped: new user-visible text added
// straight into JSX, or added to one language only.
//
// It is invisible in development — `t()` falls back to the English dictionary
// and then to the key itself, and a German label hardcoded in JSX renders
// perfectly for whoever wrote it. It only surfaces for the other language, or
// on a screen nobody re-read. The export cards sat like that inside a modal
// for months and became obvious the moment they were promoted to a full
// screen (Report mode).
//
// Two checks, both cheap:
//   1. the two dictionaries carry the same keys — no language is a subset,
//   2. the surfaces built during the rebuild carry no hardcoded display text.
//
// The second list is deliberately a short allowlist rather than "all
// components": the older views are full of literals, and a test that fails
// everywhere teaches nothing. Add a file here when you rework it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const i18nSource = readFileSync(join(SRC, 'i18n.jsx'), 'utf8');

// The two dictionaries are plain object literals: `const en = { … };` at the
// top level. Slice them apart on those markers rather than importing the
// module (it pulls in React context for nothing).
function keysOfDictionary(name) {
  const start = i18nSource.indexOf(`const ${name} = {`);
  expect(start, `dictionary "${name}" not found`).toBeGreaterThan(-1);
  const end = i18nSource.indexOf('\n};', start);
  const body = i18nSource.slice(start, end);
  return new Set([...body.matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]));
}

describe('both languages carry the same keys', () => {
  const en = keysOfDictionary('en');
  const de = keysOfDictionary('de');

  it('has a substantial dictionary in both languages', () => {
    expect(en.size).toBeGreaterThan(400);
    expect(de.size).toBeGreaterThan(400);
  });

  it('has no key that exists only in English', () => {
    // These would silently render English inside a German session.
    expect([...en].filter(k => !de.has(k))).toEqual([]);
  });

  it('has no key that exists only in German', () => {
    // These fall back to English via `en[key] ?? key`, so they render the key
    // itself in an English session — visible as raw dotted text like
    // "ex.summary.desc" on screen.
    expect([...de].filter(k => !en.has(k))).toEqual([]);
  });
});

// Files reworked during the rebuild. Everything a user reads in these must
// come from i18n.
const TRANSLATED_FILES = [
  'components/shared/ExportCards.jsx',
  'components/shared/CommandPalette.jsx',
  'components/views/ReportView.jsx',
  'utils/modes.js',
];

// A JSX text node or a title/desc/placeholder attribute holding prose — two
// or more words, starting with a letter. Single words (PDF, DOCX, Dialog) and
// anything already inside `t(...)` are not prose.
const PROSE_ATTR = /(?:title|desc|placeholder|label)="([A-Za-zÄÖÜäöüß][^"{}]*\s[^"{}]*)"/g;
const PROSE_NODE = />\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-Za-zÄÖÜäöüß][^<>{}]*)+)\s*</g;

describe('the reworked surfaces have no hardcoded display text', () => {
  it.each(TRANSLATED_FILES)('%s', file => {
    const src = readFileSync(join(SRC, file), 'utf8');
    const found = [
      ...[...src.matchAll(PROSE_ATTR)].map(m => m[1]),
      ...[...src.matchAll(PROSE_NODE)].map(m => m[1]),
    ].filter(text => !/^https?:/.test(text));

    expect(found).toEqual([]);
  });
});

describe('German is not leaking into English keys', () => {
  const en = keysOfDictionary('en');
  const start = i18nSource.indexOf('const en = {');
  const body = i18nSource.slice(start, i18nSource.indexOf('\n};', start));
  const values = [...body.matchAll(/^\s*'[^']+':\s*'((?:[^'\\]|\\.)*)'/gm)].map(m => m[1]);

  it('has as many readable values as keys', () => {
    // Sanity check on the parse itself before asserting anything about it.
    expect(values.length).toBeGreaterThan(en.size * 0.8);
  });

  it('has no obviously German word in an English value', () => {
    // Not a language detector — just the words that actually slipped through
    // before (UI labels quoted from the German locale).
    const GERMAN = /\b(Kennzahlen|Terminübersicht|Aufgaben je|reimportierbar|verfügbar|Vollständiges|Nahfristige|Hochauflösendes|Konfigurierbarer|übernehmen|einfügen|ausblenden|erledigt|Projekte|Personen)\b/;
    expect(values.filter(v => GERMAN.test(v))).toEqual([]);
  });
});
