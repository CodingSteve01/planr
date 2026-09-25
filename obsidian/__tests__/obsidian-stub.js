// Stands in for the `obsidian` module, which only exists inside the app.
// Tests that exercise the plugin's vault layer import it through the alias in
// vitest.config.js; nothing here pretends to be more than a shape.
export class Plugin {}
export class PluginSettingTab {}
export class ItemView {}
export class FileView {
  constructor(leaf) { this.leaf = leaf; this.file = null; }
}
export class MarkdownView {}
export class WorkspaceLeaf {
  setViewState() {}
}
export class Modal {}
export class Scope {
  constructor(parent) { this.parent = parent; this.keys = []; }
  register(modifiers, key, func) { const k = { modifiers, key, func }; this.keys.push(k); return k; }
}
export class Setting {}
export class FuzzySuggestModal {}
export class Notice {}
export class TFile {
  constructor(path = '', stat = {}) {
    this.path = path;
    this.name = path.split('/').pop();
    this.extension = this.name.split('.').pop();
    this.stat = { mtime: 0, size: 0, ...stat };
  }
}
export class TFolder {
  constructor(path = '') { this.path = path; }
}
export function addIcon() {}
export function normalizePath(path) {
  return String(path).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
