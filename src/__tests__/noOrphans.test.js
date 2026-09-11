// Nothing in src/components may sit there with no importer.
//
// Phase 8 removed five such files. Three — DLModal, TemplatesModal, DLView —
// no longer rendered anywhere. Two more, DiffPicker and HorizonPicker, were
// superseded by ViewFilters, which absorbed both filters; they were nearly
// kept, because a hand-written grep for the name found "three references
// each" that turned out to be comments *mentioning* them. This test exists
// because that is the mistake a human makes and a machine does not: it
// matches the import specifier, not the word.
//
// This is deliberately a *structural* rule, not a judgement call. A file
// with no importer cannot be reached by a user, so keeping it cannot be
// justified by "we might need it" — git remembers it either way.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';

const SRC = join(__dirname, '..');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(jsx?|mjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const ALL = walk(SRC);
// The two entry points are reached by the bundler and index.html, not by an
// import from inside src — they can never have an importer here.
const ENTRY_POINTS = new Set(['App.jsx', 'main.jsx']);

describe('no component file is left without an importer', () => {
  const components = ALL.filter(f => f.includes(`${'/'}components${'/'}`));

  it('finds a meaningful number of components to check', () => {
    // Guards the guard: a broken walk would make every assertion below pass.
    expect(components.length).toBeGreaterThan(15);
  });

  it.each(components.map(f => [f.slice(SRC.length + 1), f]))('%s is imported somewhere', (_rel, file) => {
    const name = basename(file, extname(file));
    if (ENTRY_POINTS.has(basename(file))) return;
    // Count references from every OTHER source file. A file mentioning its
    // own name (a component referring to itself recursively, a string) is
    // not an importer.
    const importers = ALL.filter(other => other !== file)
      .filter(other => {
        const src = readFileSync(other, 'utf8');
        // `from '.../Name.jsx'` or `from '.../Name'` — the import specifier,
        // not a coincidental mention of the word in a comment.
        return new RegExp(`from\\s+['"][^'"]*/${name}(\\.jsx?)?['"]`).test(src);
      });
    expect(importers.length, `${name} has no importer — dead file, remove it`).toBeGreaterThan(0);
  });

  it('has no module left importing a file that was removed', () => {
    // The other half: a stale import path fails the build, but only once
    // that code path is reached by a bundler. Catch it here instead.
    const missing = [];
    for (const file of ALL) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const spec = m[1];
        const resolved = join(file, '..', spec);
        const candidates = [resolved, `${resolved}.js`, `${resolved}.jsx`, join(resolved, 'index.js')];
        if (!candidates.some(c => { try { return statSync(c).isFile(); } catch { return false; } })) {
          missing.push(`${file.slice(SRC.length + 1)} → ${spec}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the removed files stay removed', () => {
  // Named explicitly so a revert reads as a decision, not an accident. Each
  // was dead AND its capability survives elsewhere — that is what made the
  // removal legitimate under "subtractive means fewer paths, never fewer
  // capabilities".
  const REMOVED = {
    'components/modals/DLModal.jsx': 'goal type/severity/date/description are edited in QuickEdit and NodeModal',
    'components/modals/TemplatesModal.jsx': 'task templates are edited in SettingsModal',
    'components/views/DLView.jsx': 'goals and deadlines are shown in SumView, BriefingView, GanttView and the report',
    'components/shared/DiffPicker.jsx': 'the "since" filter lives in ViewFilters',
    'components/shared/HorizonPicker.jsx': 'the planning-horizon filter lives in ViewFilters',
  };

  it.each(Object.entries(REMOVED))('%s is gone (%s)', rel => {
    let exists = true;
    try { statSync(join(SRC, rel)); } catch { exists = false; }
    expect(exists).toBe(false);
  });
});
