// The plan probe cache under overlapping reads: only the newest read of a path
// may write its verdict, `forget` discards a running read, a read slot is handed
// over directly, and a JSON file is not parsed when its head rules it out.

import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { probeCacheOf, jsonIsPlan, READ_LIMIT } from '../src/planLike.js';

const file = path => new TFile(path);
const JSON_PLAN = '{\n  "meta": { "name": "Invoices" },\n  "members": [],\n  "tree": []\n}';
const NOT_PLAN = '{"items":[]}';
const JSON_PARSE_CAP = 8 * 1024 * 1024;
const flush = () => new Promise(r => setTimeout(r, 0));

// Every cachedRead call parks until the test hands it its text.
function deferredApp() {
  const calls = []; // { path, resolve }
  const stats = { inFlight: 0, max: 0 };
  const app = {
    vault: {
      getFiles: () => [],
      cachedRead: f =>
        new Promise(resolve => {
          stats.inFlight++;
          stats.max = Math.max(stats.max, stats.inFlight);
          calls.push({
            path: f.path,
            resolve: text => {
              stats.inFlight--;
              resolve(text);
            },
          });
        }),
    },
    metadataCache: { getFileCache: () => null },
  };
  return { app, calls, stats };
}

describe('overlapping reads of one path', () => {
  it('an older read finishing late does not overwrite the newest verdict', async () => {
    const { app, calls } = deferredApp();
    const f = file('d/a.json');
    const cache = probeCacheOf(app);
    cache.probe(f); // read 0
    const second = cache.refresh(f); // read 1, a modify
    await flush();
    expect(calls).toHaveLength(2);
    calls[1].resolve(JSON_PLAN);
    await second;
    calls[0].resolve(NOT_PLAN);
    await flush();
    expect(cache.probe(f)).toEqual({ plan: true });
  });
  it('two quick modifies end with the verdict of the last one', async () => {
    const { app, calls } = deferredApp();
    const f = file('d/a.json');
    const cache = probeCacheOf(app);
    const a = cache.refresh(f);
    const b = cache.refresh(f);
    await flush();
    calls[1].resolve(NOT_PLAN);
    await b;
    calls[0].resolve(JSON_PLAN);
    await a;
    expect(cache.probe(f)).toEqual({ plan: false });
  });
  it('ensure during a refresh waits for that read instead of starting another', async () => {
    const { app, calls } = deferredApp();
    const f = file('d/a.json');
    const cache = probeCacheOf(app);
    const refreshing = cache.refresh(f);
    const ensured = cache.ensureAll([f]);
    await flush();
    expect(calls).toHaveLength(1);
    calls[0].resolve(JSON_PLAN);
    await Promise.all([refreshing, ensured]);
    expect(cache.probe(f)).toEqual({ plan: true });
  });
  it('forget discards a read that is still running', async () => {
    const { app, calls } = deferredApp();
    const f = file('d/a.json');
    const cache = probeCacheOf(app);
    cache.probe(f);
    await flush();
    cache.forget(f.path);
    calls[0].resolve(JSON_PLAN);
    await flush();
    expect(cache.probe(f)).toEqual({}); // unknown again, and a new read is queued
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe('read slots', () => {
  it.each(Array.from({ length: 8 }, (_, n) => n))(
    'never runs more than READ_LIMIT reads when a slot() lands after a release (+%i ticks)',
    async ticks => {
      const { app, calls, stats } = deferredApp();
      const cache = probeCacheOf(app);
      const files = Array.from({ length: READ_LIMIT + 1 }, (_, i) => file(`d/f${i}.json`));
      files.forEach(f => cache.probe(f)); // the last one waits for a slot
      await flush();
      expect(calls).toHaveLength(READ_LIMIT);
      calls[0].resolve(NOT_PLAN);
      for (let i = 0; i < ticks; i++) await Promise.resolve();
      cache.probe(file('d/late.json')); // arrives while the slot changes hands
      await flush();
      expect(stats.max).toBeLessThanOrEqual(READ_LIMIT);
    },
  );
});

describe('cheap JSON check', () => {
  const padding = 'x'.repeat(JSON_PARSE_CAP);
  const large = obj => JSON.stringify(obj, null, 2);

  it('does not parse a file whose head has no "meta"', () => {
    const spy = vi.spyOn(JSON, 'parse');
    const text = JSON.stringify({ items: [{ note: 'Anna Noor '.repeat(2000) }] }, null, 2);
    expect(jsonIsPlan(text)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('still parses when the head has "meta"', () => {
    expect(jsonIsPlan(JSON_PLAN)).toBe(true);
    expect(jsonIsPlan('{\n  "meta": 1,\n  "tree": []\n}')).toBe(false); // meta is no object
  });
  it('large file: accepts a top-level tree after the padding', () => {
    const text = large({ meta: { name: 'Big' }, pad: padding, tree: [] });
    expect(text.length).toBeGreaterThan(JSON_PARSE_CAP);
    expect(jsonIsPlan(text)).toBe(true);
  });
  it('large file: ignores a tree nested one level down', () => {
    expect(jsonIsPlan(large({ meta: { name: 'Big' }, pad: padding, teams: { tree: 1 } }))).toBe(false);
    expect(jsonIsPlan(large({ meta: {}, pad: padding, members: [{ tree: 1 }] }))).toBe(false);
  });
  it('large compact one-line file is decided by a top-level parse', () => {
    const plan = JSON.stringify({ meta: { name: 'Big' }, pad: padding, tree: [] });
    const nested = JSON.stringify({ meta: { name: 'Big' }, pad: padding, teams: { tree: 1 } });
    expect(jsonIsPlan(plan)).toBe(true);
    expect(jsonIsPlan(nested)).toBe(false);
  });
});
