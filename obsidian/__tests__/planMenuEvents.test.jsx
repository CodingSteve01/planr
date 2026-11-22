// What the vault handlers of the "Open in Planr" menu do to the verdict cache:
// modify refreshes, delete forgets, rename moves, and a read that overlaps
// these events still ends with the right verdict.

import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('react-dom/client', () => ({ createRoot: () => ({ render() {}, unmount() {} }) }));

const { default: PlanrPlugin } = await import('../src/main.jsx');

const PLAN = '{\n  "meta": { "name": "Invoices" },\n  "tree": []\n}';
const NOTE = '{"items":[]}';
const flush = () => new Promise(r => setTimeout(r, 0));

// A vault whose reads park until the test answers them (or answer at once
// from `texts` when `manual` is off).
function setup() {
  const texts = new Map();
  const parked = []; // { path, resolve }
  const reads = [];
  const handlers = {};
  let manual = false;
  const app = {
    vault: {
      on: (name, fn) => {
        handlers[name] = fn;
        return { name };
      },
      getFiles: () => [],
      cachedRead: f => {
        reads.push(f.path);
        if (!manual) return Promise.resolve(texts.get(f.path) ?? '');
        return new Promise(resolve => parked.push({ path: f.path, resolve }));
      },
    },
    workspace: {
      on: (name, fn) => {
        handlers[name] = fn;
        return { name };
      },
      onLayoutReady: fn => fn(),
    },
    metadataCache: { getFileCache: () => null },
  };
  const plugin = { app, registerEvent: vi.fn() };
  PlanrPlugin.prototype.registerPlanMenu.call(plugin);
  const offered = f => {
    let added = false;
    handlers['file-menu']({ addItem: () => (added = true) }, f);
    return added;
  };
  return {
    texts,
    parked,
    reads,
    handlers,
    offered,
    park: () => (manual = true),
  };
}

describe('vault events and the plan verdict', () => {
  it('modify judges the file again', async () => {
    const { texts, handlers, offered } = setup();
    const f = new TFile('d/a.json');
    texts.set(f.path, PLAN);
    await handlers.create(f);
    expect(offered(f)).toBe(true);
    texts.set(f.path, NOTE);
    await handlers.modify(f);
    expect(offered(f)).toBe(false);
    texts.set(f.path, PLAN);
    await handlers.modify(f);
    expect(offered(f)).toBe(true);
  });
  it('delete forgets the path, so a file created there later is read afresh', async () => {
    const { texts, reads, handlers, offered } = setup();
    const f = new TFile('d/a.json');
    texts.set(f.path, PLAN);
    await handlers.create(f);
    expect(offered(f)).toBe(true);
    handlers.delete(f);
    texts.set(f.path, NOTE);
    expect(offered(f)).toBe(false); // unknown: not offered, read queued
    await flush();
    expect(reads).toEqual([f.path, f.path]);
    expect(offered(f)).toBe(false);
  });
  it('rename drops the old path and judges the new one', async () => {
    const { texts, reads, handlers, offered } = setup();
    const oldFile = new TFile('d/old.json');
    texts.set(oldFile.path, PLAN);
    await handlers.create(oldFile);
    const moved = new TFile('d/new.json');
    texts.set(moved.path, PLAN);
    await handlers.rename(moved, oldFile.path);
    expect(offered(moved)).toBe(true);
    const before = reads.length;
    texts.set(oldFile.path, NOTE);
    expect(offered(oldFile)).toBe(false); // the old verdict is gone
    await flush();
    expect(reads.length).toBe(before + 1);
    expect(offered(oldFile)).toBe(false);
  });
});

describe('a read that overlaps vault events', () => {
  it('a modify during a running read decides, not the older read', async () => {
    const { parked, handlers, offered, park } = setup();
    park();
    const f = new TFile('d/a.json');
    expect(offered(f)).toBe(false); // queues read 0 (menu opened on an unknown file)
    await flush();
    const modified = handlers.modify(f); // read 1
    await flush();
    parked[1].resolve(PLAN);
    await modified;
    parked[0].resolve(NOTE); // the older read finishes last
    await flush();
    expect(offered(f)).toBe(true);
  });
  it('a delete during a running read leaves nothing behind', async () => {
    const { parked, reads, handlers, offered, park } = setup();
    park();
    const f = new TFile('d/a.json');
    offered(f);
    await flush();
    handlers.delete(f);
    parked[0].resolve(PLAN);
    await flush();
    offered(f); // still unknown, so it reads again instead of using the stale verdict
    await flush();
    expect(reads).toHaveLength(2);
  });
  it('a rename during a running read of the old path does not keep its verdict', async () => {
    const { parked, reads, handlers, offered, park } = setup();
    park();
    const oldFile = new TFile('d/old.json');
    offered(oldFile);
    await flush();
    const moved = new TFile('d/new.json');
    const renamed = handlers.rename(moved, oldFile.path);
    await flush();
    parked[1].resolve(PLAN); // the new path's read
    await renamed;
    parked[0].resolve(PLAN); // the old path's late read must be dropped
    await flush();
    expect(offered(moved)).toBe(true);
    offered(oldFile);
    await flush();
    expect(reads.filter(p => p === oldFile.path)).toHaveLength(2);
  });
});
