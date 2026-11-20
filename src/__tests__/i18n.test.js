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
import { readFileSync, readdirSync } from 'fs';
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
  // Every key on the line, not just the first. Many lines pack several
  // (`'open': 'Open', 'wip': 'In Progress', 'done': '✓ Done',`), and matching
  // only line-leading keys quietly excluded most of them from the parity
  // check for as long as it has existed.
  return new Set([...body.matchAll(/'([a-zA-Z][\w.]*)'\s*:/g)].map(m => m[1]));
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
  'components/views/BriefingView.jsx',
  'utils/modes.js',
  'components/shared/RoadmapLens.jsx',
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

// Files where the tooltip attributes (data-htip / title / placeholder) were
// swept for hardcoded prose and routed through t(). Narrower than
// TRANSLATED_FILES above: these files still carry pre-existing hardcoded
// JSX text elsewhere (visible labels, not tooltips) that is out of scope for
// this pass, so the full PROSE_NODE check would fail on them for reasons
// unrelated to what this guard is for. Add a file here whenever its
// tooltips get swept.
const TOOLTIP_TRANSLATED_FILES = [
  'App.jsx',
  'components/views/GanttView.jsx',
  'components/views/QuickEdit.jsx',
  'components/views/ResView.jsx',
  'components/views/TreeView.jsx',
  'components/views/SumView.jsx',
  'components/views/NetGraph.jsx',
  'components/shared/TaskInsights.jsx',
  'components/shared/SearchBox.jsx',
  'components/shared/HandoffPlanEditor.jsx',
  'components/shared/CustomFieldInput.jsx',
  'components/shared/ResourceLoadMatrix.jsx',
  'components/shared/SelectionActionBar.jsx',
  'components/shared/ItemHistoryTimeline.jsx',
  'components/modals/AddModal.jsx',
  'components/modals/SnapshotModal.jsx',
  'components/modals/SettingsModal.jsx',
  'components/modals/EstimationWizard.jsx',
  'components/modals/AssignModal.jsx',
  'components/modals/NewProjModal.jsx',
  'components/modals/NodeModal.jsx',
];

// A literal string — not a t(...) call — sitting directly in one of the
// three tooltip attributes, as either `attr="text"` or `attr={'text'}`.
// This is the exact regression the tooltip pass exists to prevent: someone
// typing `data-htip="New tooltip"` instead of `data-htip={t('x.y')}`. It
// won't catch every possible form (a hardcoded template literal or ternary
// branch slips through, same limitation PROSE_ATTR already has above), but
// it catches the common case cheaply.
const PROSE_TOOLTIP_ATTR = /(?:data-htip|title|placeholder)=(?:"([A-Za-zÄÖÜäöüß][^"{}]*\s[^"{}]*)"|\{'([A-Za-zÄÖÜäöüß][^'{}]*\s[^'{}]*)'\})/g;

describe('the translated tooltips have no hardcoded display text', () => {
  it.each(TOOLTIP_TRANSLATED_FILES)('%s', file => {
    const src = readFileSync(join(SRC, file), 'utf8');
    const found = [...src.matchAll(PROSE_TOOLTIP_ATTR)]
      .map(m => m[1] || m[2])
      .filter(text => !/^https?:/.test(text));

    expect(found).toEqual([]);
  });
});

describe('German is not leaking into English keys', () => {
  const en = keysOfDictionary('en');
  const start = i18nSource.indexOf('const en = {');
  const body = i18nSource.slice(start, i18nSource.indexOf('\n};', start));
  // Same "several keys per line" correction as keysOfDictionary above.
  const values = [...body.matchAll(/'[a-zA-Z][\w.]*'\s*:\s*'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);

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

// ── Every key a component asks for actually exists ─────────────────────────
// The parity check above compares the two dictionaries with each other, so a
// key missing from BOTH passes it. `t()` returns the key itself when it finds
// nothing, and a `t('x') || 'fallback'` never reaches its fallback because the
// key string is truthy — so the Auslastung view shipped with `rv.loadSortBy:`
// and three bare key names printed as its own labels.
describe('every key the code asks for is in the dictionary', () => {
  const en = keysOfDictionary('en');

  function sourceFiles(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, acc);
      else if (/\.jsx?$/.test(entry.name) && entry.name !== 'i18n.jsx') acc.push(full);
    }
    return acc;
  }

  it('resolves every literal passed to t()', () => {
    const missing = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      // The report/export layer has its own `t(english, german)` helper that
      // takes two literal sentences, not a dictionary key. Same name, other
      // job — checking those against the dictionary would be nonsense.
      if (text.includes('buildReportModel')) continue;
      // Only literal single-argument keys — a computed key (`t('s.' + x)`)
      // cannot be checked from here and is skipped by the pattern.
      for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'\s*[,)]/g)) {
        if (!en.has(m[1])) missing.push(`${file.slice(SRC.length + 1)}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)], `keys used in code but absent from the dictionary:\n${missing.join('\n')}`).toEqual([]);
  });
});
