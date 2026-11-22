// "Open in Planr" used to be offered for every note and every JSON file in the
// vault. It is now offered for plans only: by name, or by what the file's
// start says. The decision is a pure function; the fake files below carry only
// the fields Obsidian's TFile / TFolder expose.

import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { isPlanLike, listPlanFiles } from '../src/planLike.js';

const file = path => new TFile(path);
const folder = name => ({ name, path: name, children: [] });

const MD_PLAN = '# Kundenbereich\n\n## Plan\n\n| Field | Value |\n\n## Work Tree\n- **1** Login\n';
const JSON_PLAN = '{\n  "meta": { "name": "Rechnungen" },\n  "members": [],\n  "tree": []\n}';

describe('isPlanLike', () => {
  it('accepts a .planr.md by name alone', () => {
    expect(isPlanLike(file('Plans/team.planr.md'))).toBe(true);
  });
  it('accepts a .planr.json by name alone', () => {
    expect(isPlanLike(file('team.planr.json'))).toBe(true);
  });
  it('rejects a plain note', () => {
    expect(isPlanLike(file('Notes/todo.md'), { text: '# Shopping\n\n- milk\n' })).toBe(false);
  });
  it('accepts a note whose start carries the plan marker', () => {
    expect(isPlanLike(file('Notes/export.md'), { text: MD_PLAN })).toBe(true);
  });
  it('accepts a note whose cached headings carry the plan marker', () => {
    expect(isPlanLike(file('Notes/export.md'), { headings: ['Kundenbereich', 'Work Tree'] })).toBe(true);
  });
  it('accepts a JSON file with the plan keys', () => {
    expect(isPlanLike(file('data/export.json'), { text: JSON_PLAN })).toBe(true);
  });
  it('rejects any other JSON file', () => {
    expect(isPlanLike(file('.obsidian/app.json'), { text: '{\n  "alwaysUpdateLinks": true\n}' })).toBe(false);
  });
  it('rejects a JSON file nothing is known about yet', () => {
    expect(isPlanLike(file('data/unknown.json'))).toBe(false);
  });
  it('rejects a folder, even one named like a plan', () => {
    expect(isPlanLike(folder('archive.planr.md'))).toBe(false);
    expect(isPlanLike(folder('archive'))).toBe(false);
  });
  it('rejects other file types that merely contain the marker', () => {
    expect(isPlanLike(file('notes.txt'), { text: MD_PLAN })).toBe(false);
  });
});

describe('listPlanFiles (the "Open plan file…" picker)', () => {
  const files = [file('a/todo.md'), file('a/export.md'), file('b/team.planr.json'), file('b/app.json'), file('b/data.json')];
  const heads = { 'a/todo.md': '# Shopping', 'a/export.md': MD_PLAN, 'b/app.json': '{"x":1}', 'b/data.json': JSON_PLAN };
  const app = {
    vault: { getFiles: () => files, cachedRead: async f => heads[f.path] || '' },
    metadataCache: { getFileCache: () => null },
  };

  it('lists plans only, .planr.json first', async () => {
    const out = await listPlanFiles(app);
    expect(out.map(f => f.path)).toEqual(['b/team.planr.json', 'b/data.json', 'a/export.md']);
  });

  it('accepts any extension case and lists .planr files with the .planr.json ones', async () => {
    const mixed = [file('c/NOTES.MD'), file('c/Team.PLANR'), file('c/Data.JSON'), file('c/a.planr.json'), file('c/photo.png')];
    const mixedHeads = { 'c/NOTES.MD': MD_PLAN, 'c/Data.JSON': JSON_PLAN };
    const mixedApp = {
      vault: { getFiles: () => mixed, cachedRead: async f => mixedHeads[f.path] || '' },
      metadataCache: { getFileCache: () => null },
    };
    const out = await listPlanFiles(mixedApp);
    expect(out.map(f => f.path)).toEqual(['c/a.planr.json', 'c/Team.PLANR', 'c/Data.JSON', 'c/NOTES.MD']);
  });
});
