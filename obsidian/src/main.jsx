// Planr as an Obsidian plugin.
//
// The whole app is the unchanged React app from src/ — this file only mounts
// it into a workspace leaf and points its file I/O at the vault. Everything
// Planr-specific (scheduling, CPM, Gantt, exports) is imported, not
// reimplemented: when src/ moves, the plugin moves with it.
//
// The view is a FileView, not an ItemView: one leaf, one plan, the same way a
// Markdown tab is one note. Obsidian then handles what an editor is expected
// to do — a tab per file, the file's name in the header, back and forward,
// "open in new pane", a restored workspace that reopens the right plans.

import { FileView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, addIcon } from 'obsidian';
import { createRoot } from 'react-dom/client';
import App from '../../src/App.jsx';
import { I18nProvider, ThemeProvider } from '../../src/i18n.jsx';
import { PortalRootContext } from '../../src/utils/embedHost.js';
import '../../src/App.css';
import { handleForPath, pickOpenFile, setLastPlanFolder, setVaultApp } from './vaultFs.js';

export const VIEW_TYPE_PLANR = 'planr-view';

// Two ways a file says "I am a plan". `.planr` is ours outright and gets
// registered as an extension. `.planr.md` is a normal note — Obsidian reads
// its extension as `md`, so it cannot be registered without taking every note
// in the vault away from the Markdown editor; it is recognised by name, and
// the leaf that is about to open it is redirected before the Markdown editor
// is ever built.
export const PLAN_EXTENSION = 'planr';
export const PLAN_NOTE_SUFFIX = '.planr.md';

const DEFAULT_SETTINGS = { openPlanNotes: true };

const PLANR_ICON = `<g transform="scale(3.125)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
<rect x="5" y="5" width="22" height="22" rx="4"/>
<line x1="9" y1="11" x2="23" y2="11"/>
<line x1="9" y1="16" x2="19" y2="16"/>
<line x1="9" y1="21" x2="21" y2="21"/>
</g>`;

export function isPlanNotePath(path) {
  return typeof path === 'string' && path.endsWith(PLAN_NOTE_SUFFIX);
}

export function isPlanFile(file) {
  if (!file?.name) return false;
  return file.extension === PLAN_EXTENSION || file.name.endsWith(PLAN_NOTE_SUFFIX);
}

/** The plan's name, without the machinery: "2026-09-10 venneker.planr.md" → "2026-09-10 venneker". */
function planTitle(path) {
  const name = path.split('/').pop();
  return name.replace(/\.planr\.md$/, '').replace(/\.planr$/, '').replace(/\.planr\.json$/, '');
}

// The turbodocx browser bundle reads `global` and `process` at top level —
// index.html sets them up before the app script runs, and so must we.
function shimGlobals() {
  if (typeof window.global === 'undefined') window.global = window;
  if (typeof window.process === 'undefined') window.process = { env: {} };
}

export class PlanrView extends FileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.root = null;
    // The path the mounted React tree is editing. Usually `this.file.path`;
    // they part company for one beat after a Save As, when the app has already
    // moved to the new file and the leaf is being told to follow.
    this.appPath = null;
    this.mountEl = null;
    this.allowNoFile = false;
    this.navigation = true;
  }

  getViewType() { return VIEW_TYPE_PLANR; }
  getIcon() { return 'planr'; }
  getDisplayText() { return this.file ? planTitle(this.file.path) : 'Planr'; }

  canAcceptExtension(extension) {
    // Only the extension Planr owns outright. This used to answer yes for
    // 'md' and 'json' as well, and Obsidian keeps the current view whenever it
    // can accept the new file's extension — so opening any ordinary note while
    // a plan had focus loaded that note INTO the plan's tab.
    //
    // The other two ways in do not need this. A `.planr.md` is redirected in
    // patchLeafViewState, which rewrites the requested type before the leaf
    // acts on it, and a `.json` plan arrives through "Open in Planr", which
    // sets the view state explicitly. Both name the view type themselves.
    return extension === PLAN_EXTENSION;
  }

  async onLoadFile(file) {
    // Belt and braces for the same thing: should a foreign file reach this
    // view anyway, hand it back rather than mounting the app against a note.
    if (!isPlanFile(file) && !/\.json$/i.test(file?.name || '')) {
      delete this.plugin.fileModes[this.leaf.id];
      this.leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source' }, active: true });
      return;
    }
    return this.onLoadPlanFile(file);
  }

  async onLoadPlanFile(file) {
    // Already showing this plan — a Save As that the leaf is only now catching
    // up with. Remounting would throw away the session (undo stack, open tab,
    // selection) to load a file the app just wrote itself.
    if (this.root && this.appPath === file.path) {
      this.leaf.updateHeader?.();
      return;
    }
    setLastPlanFolder(file.path);
    this.mount(file.path);
  }

  async onUnloadFile() {
    this.unmount();
  }

  mount(path) {
    this.unmount();
    // A fresh element every time, never `contentEl` itself. React's unmount is
    // deferred a tick (see below) and clears the container it ran in — mounting
    // the next plan into that same element meant the outgoing root wiped the
    // incoming one's DOM a moment later, and the tab went black. The container
    // also carries `.planr-view`, so the scoped stylesheet and the design
    // tokens reach the app and everything it portals into itself.
    const host = this.contentEl.createDiv({ cls: 'planr-view' });
    this.mountEl = host;
    this.appPath = path;
    this.root = createRoot(host);
    this.root.render(
      // Where this instance's popups go. One per view, deliberately: a global
      // would send a dropdown from the left pane into the right pane's DOM.
      <PortalRootContext.Provider value={host}>
        <ThemeProvider>
          <I18nProvider>
            <App mount={handleForPath(path)} onFileChange={h => this.onAppFileChange(h)} />
          </I18nProvider>
        </ThemeProvider>
      </PortalRootContext.Provider>,
    );
    this.leaf.updateHeader?.();
  }

  /** Save As inside the app moved the document; the tab follows it. */
  onAppFileChange(handle) {
    this.appPath = handle?.path ?? null;
    if (!handle?.path || handle.path === this.file?.path) return;
    const next = this.app.vault.getAbstractFileByPath(handle.path);
    if (!(next instanceof TFile)) return;
    setLastPlanFolder(handle.path);
    this.plugin.fileModes[this.leaf.id] = VIEW_TYPE_PLANR;
    this.leaf.setViewState({ type: VIEW_TYPE_PLANR, state: { file: handle.path }, active: false });
  }

  unmount() {
    // React 18 warns when unmount() runs inside its own render/commit, and
    // Obsidian can close a leaf from a click handler we are inside of. So the
    // element leaves the document now and React is told a tick later, by which
    // time it is tearing down something nobody can see.
    const root = this.root;
    const el = this.mountEl;
    this.root = null;
    this.mountEl = null;
    this.appPath = null;
    if (el) el.remove();
    if (root) window.setTimeout(() => root.unmount(), 0);
  }

  async onClose() {
    this.unmount();
    delete this.plugin.fileModes[this.leaf.id];
  }

  onPaneMenu(menu, source) {
    super.onPaneMenu(menu, source);
    if (!isPlanNotePath(this.file?.path)) return;
    menu.addItem(item => item
      .setTitle('Open as Markdown')
      .setIcon('file-text')
      .onClick(() => {
        // Remembered per leaf, or the redirect below would turn it straight
        // back into a Planr view.
        this.plugin.fileModes[this.leaf.id] = 'markdown';
        this.leaf.setViewState({
          type: 'markdown',
          state: { file: this.file.path, mode: 'source' },
          active: true,
        });
      }));
  }
}

export default class PlanrPlugin extends Plugin {
  async onload() {
    shimGlobals();
    setVaultApp(this.app);
    addIcon('planr', PLANR_ICON);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Which view a leaf is currently showing a plan note in. Only "markdown"
    // is interesting: it is the one answer the redirect has to respect.
    this.fileModes = {};

    // What the app may ask of the window it lives in. Theme only — where a
    // popup goes is per view and travels down the React tree, because two
    // Planr panes can be open at once.
    window.__planrHost = {
      theme: () => (document.body.classList.contains('theme-dark') ? 'dark' : 'light'),
      onThemeChange: callback => {
        const observer = new MutationObserver(callback);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
      },
    };
    this.register(() => { delete window.__planrHost; });

    this.registerView(VIEW_TYPE_PLANR, leaf => new PlanrView(leaf, this));
    // Nobody else claims `.planr`, and without this Obsidian will not even
    // show such a file in the explorer.
    this.registerExtensions([PLAN_EXTENSION], VIEW_TYPE_PLANR);
    this.addSettingTab(new PlanrSettingTab(this.app, this));
    this.patchLeafViewState();

    this.addRibbonIcon('planr', 'Planr', () => this.openPlanPrompt());

    this.addCommand({ id: 'open', name: 'Open plan file…', callback: () => this.openPlanPrompt() });

    // A `.json` plan, or a `.planr.md` with the redirect switched off.
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!file?.name || !/\.(json|md|planr)$/i.test(file.name)) return;
      menu.addItem(item => item
        .setTitle('Open in Planr')
        .setIcon('planr')
        .onClick(() => this.openPlan(file.path, { newLeaf: 'tab' })));
    }));
  }

  /**
   * Open a `.planr.md` in the Planr view instead of the Markdown editor.
   *
   * The obvious implementation — listen for `file-open` and swap the leaf
   * afterwards — is what this replaces, and it is why switching between two
   * plan tabs flashed the raw Markdown first: by the time the event fires the
   * Markdown editor is already built and painted. Rewriting the requested view
   * type before the leaf acts on it means the Markdown view is never created.
   * Same approach the Kanban and Excalidraw plugins take.
   */
  patchLeafViewState() {
    const plugin = this;
    const proto = WorkspaceLeaf.prototype;
    const original = proto.setViewState;
    const patched = function (state, ...rest) {
      const path = state?.state?.file;
      if (plugin.settings.openPlanNotes
        && state?.type === 'markdown'
        && isPlanNotePath(path)
        && plugin.fileModes[this.id] !== 'markdown') {
        plugin.fileModes[this.id] = VIEW_TYPE_PLANR;
        return original.apply(this, [{ ...state, type: VIEW_TYPE_PLANR }, ...rest]);
      }
      // Anything else this leaf opens forgets the override — "Open as
      // Markdown" applies to the plan you chose it for, not to the tab
      // forever.
      if (state?.type === 'markdown' && !isPlanNotePath(path)) delete plugin.fileModes[this.id];
      return original.apply(this, [state, ...rest]);
    };
    proto.setViewState = patched;
    this.register(() => {
      // Only ours to undo. A plugin that patched after us owns the chain now,
      // and handing it back the original would drop its work.
      if (proto.setViewState === patched) proto.setViewState = original;
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async openPlanPrompt() {
    try {
      const handle = await pickOpenFile();
      await this.openPlan(handle.path, { newLeaf: 'tab' });
    } catch (e) {
      if (e?.name !== 'AbortError') new Notice(`Planr: ${e.message}`);
    }
  }

  /** Open `path` as a plan, in its own tab unless told otherwise. */
  async openPlan(path, { newLeaf = false } = {}) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { new Notice(`Planr: not in this vault — ${path}`); return; }
    const leaf = this.app.workspace.getLeaf(newLeaf);
    this.fileModes[leaf.id] = VIEW_TYPE_PLANR;
    await leaf.setViewState({ type: VIEW_TYPE_PLANR, state: { file: file.path }, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
}

class PlanrSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Open .planr.md files in Planr')
      .setDesc(
        'A plan saved as Markdown is still a note, so Obsidian would open it in the editor. '
        + 'With this on, files ending in .planr.md open in the Planr view instead. '
        + 'The tab menu always offers "Open as Markdown".',
      )
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.openPlanNotes)
        .onChange(async value => {
          this.plugin.settings.openPlanNotes = value;
          await this.plugin.saveSettings();
        }));
  }
}
