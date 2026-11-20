// Saving and loading is the part of the plugin that can lose someone's work,
// and the part nobody notices is broken until it is. The app's own save path
// is untouched — it still calls getFile()/createWritable() on a handle — so
// what has to hold is that those handles behave like the browser's do on top
// of a vault that is only pretending.

import { beforeEach, describe, expect, it } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { handleForPath, lastPlanPath, setLastPlanFolder, setVaultApp } from '../src/vaultFs.js';

/** The slice of Obsidian's App that vaultFs.js actually touches. */
function fakeApp(files = {}) {
  const store = new Map(Object.entries(files));
  const folders = new Set();
  const local = new Map();
  let clock = 1000;

  const app = {
    created: [],
    modified: [],
    vault: {
      getAbstractFileByPath(path) {
        if (store.has(path)) return store.get(path).file;
        if (folders.has(path)) return new TFolder(path);
        return null;
      },
      async read(file) { return store.get(file.path).text; },
      async modify(file, text) {
        app.modified.push(file.path);
        store.set(file.path, { file: new TFile(file.path, { mtime: ++clock, size: text.length }), text });
      },
      async create(path, text) {
        app.created.push(path);
        store.set(path, { file: new TFile(path, { mtime: ++clock, size: text.length }), text });
      },
      async createFolder(path) { folders.add(path); },
      getFiles() { return [...store.values()].map(v => v.file); },
    },
    loadLocalStorage: key => local.get(key) ?? null,
    saveLocalStorage: (key, value) => local.set(key, value),
    read: path => store.get(path)?.text,
    has: path => store.has(path),
  };
  return app;
}

function withFile(path, text, stat) {
  return { [path]: { file: new TFile(path, stat), text } };
}

let app;

beforeEach(() => {
  app = fakeApp(withFile('Projekte/plan.planr.json', '{"tree":[]}', { mtime: 4242 }));
  setVaultApp(app);
  setLastPlanFolder(null);
});

describe('a vault-backed file handle', () => {
  it('reads the file the way the app expects a File to read', async () => {
    const file = await handleForPath('Projekte/plan.planr.json').getFile();
    expect(await file.text()).toBe('{"tree":[]}');
    // The external-change poll compares this against its own last write.
    expect(file.lastModified).toBe(4242);
  });

  it('reports a name the app can tell .md from .json by', () => {
    expect(handleForPath('Projekte/plan.planr.md').name).toBe('plan.planr.md');
  });

  it('writes through to an existing file', async () => {
    const writable = await handleForPath('Projekte/plan.planr.json').createWritable();
    await writable.write('{"tree":[1]}');
    await writable.close();
    expect(app.read('Projekte/plan.planr.json')).toBe('{"tree":[1]}');
    expect(app.created).toEqual([]);
  });

  it('creates the file, and its folder, on a first save', async () => {
    const writable = await handleForPath('Plans/2027/new.planr.json').createWritable();
    await writable.write('{}');
    await writable.close();
    expect(app.created).toEqual(['Plans/2027/new.planr.json']);
    expect(app.read('Plans/2027/new.planr.json')).toBe('{}');
  });

  it('writes nothing until close, so a failed compose cannot truncate a plan', async () => {
    const writable = await handleForPath('Projekte/plan.planr.json').createWritable();
    await writable.write('{"tree"');
    expect(app.read('Projekte/plan.planr.json')).toBe('{"tree":[]}');
    await writable.abort();
    expect(app.modified).toEqual([]);
  });

  it('raises NotFoundError for a file that is gone, which is the app cue to offer Save As', async () => {
    await expect(handleForPath('Projekte/deleted.planr.json').getFile())
      .rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('what the plugin remembers between sessions', () => {
  // Which plan a tab is editing is the tab's business now — Obsidian hands the
  // view its file and restores it with the workspace. The one thing worth
  // keeping is where the last plan lived, so a second one is offered a home
  // beside the first instead of at the vault root.
  it('keeps the last plan\'s path, which is where Save As starts', () => {
    setLastPlanFolder('Projekte/plan.planr.json');
    expect(lastPlanPath()).toBe('Projekte/plan.planr.json');
    setLastPlanFolder(null);
    expect(lastPlanPath()).toBeNull();
  });

  it('hands the app no remembered mount at all — the host supplies the file', async () => {
    const store = await import('../src/fileHandleStore.js');
    await store.persistMountedFileHandle(handleForPath('Projekte/plan.planr.json'));
    expect(await store.loadMountedFileHandle()).toBeNull();
  });

  it('needs no permission grant — the vault is already open', async () => {
    const store = await import('../src/fileHandleStore.js');
    expect(await store.queryHandlePermission()).toBe('granted');
    expect(await store.requestHandlePermission()).toBe('granted');
  });
});
