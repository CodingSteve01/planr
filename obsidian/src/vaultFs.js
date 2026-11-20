// File System Access API, reimplemented on top of the Obsidian vault.
//
// Planr saves and loads through a file picker and the handle objects it hands
// back. Rather than teaching the app a second storage backend, the build swaps
// src/utils/filePickers.js for a version that asks the vault — see
// obsidian/src/filePickers.js. The app keeps its own code path (pick a handle,
// `getFile()`, `createWritable()`) and the bytes land in the vault, where
// Obsidian Sync picks them up and notes can link to them.
//
// Not a patched `window.showSaveFilePicker`: a plugin that redefines a browser
// global changes what every other plugin in the app sees.
//
// What a handle has to provide, taken from the call sites in src/App.jsx:
//   handle.name                      · shown in the topbar, decides .md vs .json
//   handle.getFile() → { text(), lastModified }   · load + external-change poll
//   handle.createWritable() → { write(), close() }
// Permission methods are deliberately absent: utils/fileHandleStore.js treats
// a handle without them as permanently granted, which is exactly right for a
// file the user already has open in their own vault.

import { FuzzySuggestModal, Modal, Setting, TFile, TFolder, normalizePath } from 'obsidian';

let _app = null;

export function setVaultApp(app) { _app = app; }

// ── Where the last plan lived ─────────────────────────────────────────────
// Not a mount: which plan a tab is editing is the tab's business, and
// Obsidian restores that with the workspace. This is only the folder the Save
// dialog opens in, so a second plan lands beside the first instead of at the
// vault root. Per-vault local storage, same lifetime as the workspace.
const LAST_FOLDER_KEY = 'planr-last-plan-path';

export function lastPlanPath() {
  try { return _app?.loadLocalStorage(LAST_FOLDER_KEY) || null; } catch { return null; }
}

export function setLastPlanFolder(path) {
  try { _app?.saveLocalStorage(LAST_FOLDER_KEY, path || null); } catch { /* ignore */ }
}

// ── Errors the app already knows how to handle ────────────────────────────
// `AbortError` is how the app recognises "user closed the picker" and stays
// quiet; `NotFoundError` triggers its Save-As fallback.
function abortError() {
  const e = new Error('The user aborted a request.');
  e.name = 'AbortError';
  return e;
}

function notFoundError(message) {
  const e = new Error(message);
  e.name = 'NotFoundError';
  return e;
}

export const PLAN_FILE_RE = /\.(json|md)$/i;

function fileAt(path) {
  const f = _app.vault.getAbstractFileByPath(normalizePath(path));
  return f instanceof TFile ? f : null;
}

async function ensureFolder(path) {
  const dir = normalizePath(path).split('/').slice(0, -1).join('/');
  if (!dir) return;
  if (_app.vault.getAbstractFileByPath(dir) instanceof TFolder) return;
  try { await _app.vault.createFolder(dir); } catch { /* raced or already there */ }
}

async function writeVaultFile(path, content) {
  const existing = fileAt(path);
  if (existing) { await _app.vault.modify(existing, content); return; }
  await ensureFolder(path);
  await _app.vault.create(normalizePath(path), content);
}

async function asText(chunk) {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Blob) return chunk.text();
  if (chunk && typeof chunk === 'object' && 'data' in chunk) return asText(chunk.data);
  if (chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk)) return new TextDecoder().decode(chunk);
  return String(chunk ?? '');
}

/** A FileSystemFileHandle-shaped view of one vault file. */
export function handleForPath(path) {
  const p = normalizePath(path);
  return {
    kind: 'file',
    path: p,
    name: p.split('/').pop(),

    async getFile() {
      const f = fileAt(p);
      if (!f) throw notFoundError(`Not in this vault: ${p}`);
      // vault.read, not cachedRead — the external-change poll exists precisely
      // to notice what another app (or Obsidian Sync) wrote behind our back.
      const text = await _app.vault.read(f);
      return {
        name: f.name,
        size: f.stat.size,
        lastModified: f.stat.mtime,
        text: async () => text,
      };
    },

    async createWritable() {
      let buf = '';
      return {
        async write(chunk) { buf += await asText(chunk); },
        async close() { await writeVaultFile(p, buf); },
        async abort() { buf = ''; },
      };
    },

    async isSameEntry(other) { return other?.path === p; },
  };
}

// ── Pickers ───────────────────────────────────────────────────────────────

class PlanFileSuggest extends FuzzySuggestModal {
  constructor(app, resolve, reject) {
    super(app);
    this.resolve = resolve;
    this.reject = reject;
    this.done = false;
    this.setPlaceholder('Open which plan file?');
  }

  getItems() {
    // .planr.json first — a vault is mostly notes, and the one file the user
    // means is almost never the one fuzzy-matching would surface.
    const files = this.app.vault.getFiles().filter(f => PLAN_FILE_RE.test(f.name));
    const rank = f => (f.name.endsWith('.planr.json') ? 0 : f.extension === 'json' ? 1 : 2);
    return files.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  }

  getItemText(file) { return file.path; }

  onChooseItem(file) {
    this.done = true;
    this.resolve(handleForPath(file.path));
  }

  onClose() {
    super.onClose();
    // Obsidian closes the suggester *before* it calls onChooseItem, so "was
    // anything picked?" is only answerable one tick later.
    window.setTimeout(() => { if (!this.done) this.reject(abortError()); }, 0);
  }
}

class SavePathModal extends Modal {
  constructor(app, suggested, resolve, reject) {
    super(app);
    this.value = suggested;
    this.resolve = resolve;
    this.reject = reject;
    this.done = false;
  }

  onOpen() {
    this.titleEl.setText('Save plan to vault');
    const submit = async () => {
      const path = normalizePath(this.value.trim());
      if (!path) return;
      if (fileAt(path) && !window.confirm(`${path} already exists. Overwrite it?`)) return;
      this.done = true;
      this.close();
      // Create it now, empty: the app writes through the handle right after,
      // but the "is it in the vault yet" question should already be settled.
      if (!fileAt(path)) await writeVaultFile(path, '');
      this.resolve(handleForPath(path));
    };

    new Setting(this.contentEl)
      .setName('Path in vault')
      .setDesc('Relative to the vault root. .planr.json keeps everything, .md stays readable as a note.')
      .addText(text => {
        text.setValue(this.value).onChange(v => { this.value = v; });
        text.inputEl.style.width = '100%';
        text.inputEl.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        window.setTimeout(() => {
          text.inputEl.focus();
          // Select the basename, keep the extension — renaming is the common case.
          const dot = this.value.lastIndexOf('.planr.json') >= 0
            ? this.value.lastIndexOf('.planr.json')
            : this.value.lastIndexOf('.');
          text.inputEl.setSelectionRange(this.value.lastIndexOf('/') + 1, dot > 0 ? dot : this.value.length);
        }, 0);
      });

    new Setting(this.contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setButtonText('Save').setCta().onClick(submit));
  }

  onClose() {
    this.contentEl.empty();
    if (!this.done) this.reject(abortError());
  }
}

function defaultFolder() {
  const last = lastPlanPath();
  if (last && last.includes('/')) return last.split('/').slice(0, -1).join('/') + '/';
  const configured = _app?.vault.getConfig?.('newFileFolderPath');
  return configured && configured !== '/' ? `${configured}/` : '';
}

export function pickOpenFile() {
  return new Promise((resolve, reject) => new PlanFileSuggest(_app, resolve, reject).open());
}

export function pickSaveFile(options = {}) {
  const suggested = options.suggestedName || 'project.planr.json';
  const start = suggested.includes('/') ? suggested : defaultFolder() + suggested;
  return new Promise((resolve, reject) => new SavePathModal(_app, start, resolve, reject).open());
}
