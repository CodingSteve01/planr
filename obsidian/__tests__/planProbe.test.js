// Follow-ups to "Open in Planr only for plan files": large JSON plans, one
// Markdown rule for both paths, and one bounded read path shared by the
// picker and the file menu.

import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { probeCacheOf, isPlanLike, listPlanFiles } from '../src/planLike.js';

const file = path => new TFile(path);

const JSON_PLAN = '{\n  "meta": { "name": "Invoices" },\n  "members": [],\n  "tree": []\n}';

// What the writer emits: meta, teams, members, tree — so with many members the
// tree starts far beyond the first few KB.
function bigJsonPlan(members = 400) {
  const list = Array.from({ length: members }, (_, i) => ({ id: `m${i}`, name: `Member ${i}`, team: 'Backend' }));
  return JSON.stringify({ meta: { name: 'Big' }, teams: [{ name: 'Frontend' }, { name: 'Ops' }], members: list, tree: [] }, null, 2);
}

describe('large JSON plans', () => {
  it('recognises a plan whose tree starts after byte 8192', () => {
    const text = bigJsonPlan();
    expect(text.indexOf('"tree"')).toBeGreaterThan(8192);
    expect(isPlanLike(file('data/big.json'), { text: text })).toBe(true);
  });
  it('the picker and the menu cache both offer a big plan read from the vault', async () => {
    const big = file('data/big.json');
    const app = {
      vault: { getFiles: () => [big], cachedRead: async () => bigJsonPlan() },
      metadataCache: { getFileCache: () => null },
    };
    expect(await listPlanFiles(app)).toEqual([big]);
    const cache = probeCacheOf(app);
    await cache.warm();
    expect(isPlanLike(big, cache.probe(big))).toBe(true);
  });
  it('still rejects a big JSON file without the plan keys', () => {
    const text = JSON.stringify({ items: Array.from({ length: 800 }, (_, i) => ({ n: i, name: 'Anna Noor' })) }, null, 2);
    expect(isPlanLike(file('data/big.json'), { text: text })).toBe(false);
  });
  it('ignores a nested "tree" key', () => {
    const text = JSON.stringify({ meta: {}, members: [{ tree: 1 }] }, null, 2);
    expect(isPlanLike(file('data/x.json'), { text: text })).toBe(false);
  });
});

describe('one Markdown rule for both paths', () => {
  const variants = [
    ['## Work Tree', 'Work Tree'],
    ['### work tree', 'work tree'],
    ['# WORK TREE', 'WORK TREE'],
    ['## Work Tree  ', 'Work Tree'],
  ];
  it.each(variants)('headings and text agree on %j', (heading, title) => {
    const text = `# Title\n\n${heading}\n- **1** Login\n`;
    expect(isPlanLike(file('n.md'), { text: text })).toBe(true);
    expect(isPlanLike(file('n.md'), { headings: ['Title', title] })).toBe(true);
  });
  it('both reject a heading that merely contains the words', () => {
    expect(isPlanLike(file('n.md'), { text: '## My Work Tree notes\n' })).toBe(false);
    expect(isPlanLike(file('n.md'), { headings: ['My Work Tree notes'] })).toBe(false);
  });
  it('finds the heading deep in a long note', () => {
    const text = `# T\n\n${'filler line\n'.repeat(2000)}## Work Tree\n- **1** A\n`;
    expect(isPlanLike(file('n.md'), { text: text })).toBe(true);
  });
});

describe('picker and menu share one read path', () => {
  function makeApp(count = 20) {
    const files = Array.from({ length: count }, (_, i) => file(`d/f${i}.json`));
    const stats = { reads: 0, inFlight: 0, max: 0 };
    const app = {
      vault: {
        getFiles: () => files,
        cachedRead: async () => {
          stats.reads++;
          stats.inFlight++;
          stats.max = Math.max(stats.max, stats.inFlight);
          await new Promise(r => setTimeout(r, 2));
          stats.inFlight--;
          return JSON_PLAN;
        },
      },
      metadataCache: { getFileCache: () => null },
    };
    return { app, stats, files };
  }

  it('a second picker open reads nothing new', async () => {
    const { app, stats, files } = makeApp();
    expect(await listPlanFiles(app)).toHaveLength(files.length);
    const first = stats.reads;
    await listPlanFiles(app);
    expect(stats.reads).toBe(first);
  });
  it('the picker does not re-read what the menu cache already knows', async () => {
    const { app, stats, files } = makeApp(5);
    await probeCacheOf(app).warm();
    expect(stats.reads).toBe(files.length);
    await listPlanFiles(app);
    expect(stats.reads).toBe(files.length);
  });
  it('never reads more than 8 files at once', async () => {
    const { app, stats } = makeApp(40);
    await listPlanFiles(app);
    expect(stats.max).toBeLessThanOrEqual(8);
    expect(stats.max).toBeGreaterThan(1);
  });
  it('warm and a racing probe read each file once', async () => {
    const { app, stats, files } = makeApp(3);
    const cache = probeCacheOf(app);
    const warming = cache.warm();
    files.forEach(f => cache.probe(f));
    await warming;
    expect(stats.reads).toBe(files.length);
  });
  it('probe of an unknown path queues a read, so the next probe knows', async () => {
    const { app, files } = makeApp(1);
    const cache = probeCacheOf(app);
    expect(isPlanLike(files[0], cache.probe(files[0]))).toBe(false);
    await new Promise(r => setTimeout(r, 20));
    expect(isPlanLike(files[0], cache.probe(files[0]))).toBe(true);
  });
});
