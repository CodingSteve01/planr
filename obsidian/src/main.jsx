// Planr as an Obsidian plugin.
//
// The whole app is the unchanged React app from src/ — this file only mounts
// it into a workspace leaf and points its file I/O at the vault. Everything
// Planr-specific (scheduling, CPM, Gantt, exports) is imported, not
// reimplemented: when src/ moves, the plugin moves with it.

import { ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, addIcon } from 'obsidian';
import { createRoot } from 'react-dom/client';
import App from '../../src/App.jsx';
import { I18nProvider, ThemeProvider } from '../../src/i18n.jsx';
import '../../src/App.css';
import { getMountedPath, pickOpenFile, setMountedPath, setVaultApp } from './vaultFs.js';

export const VIEW_TYPE_PLANR = 'planr-view';

// Two ways a file says "I am a plan". `.planr` is ours outright and gets
// registered as an extension. `.planr.md` is a normal note — Obsidian reads
// its extension as `md`, so it cannot be registered without taking every note
// in the vault away from the Markdown editor; it is recognised by name and
// swapped into a Planr view after Obsidian opens it.
export const PLAN_EXTENSION = 'planr';
export const PLAN_NOTE_SUFFIX = '.planr.md';

const DEFAULT_SETTINGS = { openPlanNotes: true };

const PLANR_ICON = `<g transform="scale(3.125)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
<rect x="5" y="5" width="22" height="22" rx="4"/>
<line x1="9" y1="11" x2="23" y2="11"/>
<line x1="9" y1="16" x2="19" y2="16"/>
<line x1="9" y1="21" x2="21" y2="21"/>
</g>`;

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

class PlanrView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.root = null;
    this.filePath = null;
  }

  getViewType() { return VIEW_TYPE_PLANR; }
  getIcon() { return 'planr'; }
  getDisplayText() { return this.filePath ? planTitle(this.filePath) : 'Planr'; }

  // Workspace state, so a Planr tab survives a restart pointing at the same
  // plan instead of at whatever was last mounted.
  getState() {
    return { ...super.getState(), file: this.filePath ?? getMountedPath() ?? undefined };
  }

  async setState(state, result) {
    const file = state?.file ?? null;
    if (file && file !== this.filePath) {
      this.filePath = file;
      setMountedPath(file);
      // The app reads the mounted file once, at boot — a different plan is a
      // different document, so it gets a fresh mount rather than a prop.
      if (this.root) this.mount();
    }
    await super.setState(state, result);
  }

  async onOpen() {
    if (!this.root) {
      this.filePath ??= getMountedPath();
      this.mount();
    }
  }

  mount() {
    const host = this.contentEl;
    this.unmount();
    host.empty();
    host.addClass('planr-view');
    // What the app may ask of the window it lives in: where popups go, and
    // what "Auto" theme means. See src/utils/embedHost.js.
    window.__planrHost = {
      portalRoot: host,
      theme: () => (document.body.classList.contains('theme-dark') ? 'dark' : 'light'),
      onThemeChange: callback => {
        const observer = new MutationObserver(callback);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
      },
    };
    this.root = createRoot(host);
    this.root.render(
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>,
    );
    this.leaf.updateHeader?.();
  }

  unmount() {
    // React 18 warns when unmount() runs inside its own render/commit, and
    // Obsidian can close a leaf from a click handler we are inside of.
    const root = this.root;
    this.root = null;
    if (root) window.setTimeout(() => root.unmount(), 0);
    if (window.__planrHost?.portalRoot === this.contentEl) delete window.__planrHost;
  }

  async onClose() {
    this.unmount();
  }

  onPaneMenu(menu, source) {
    super.onPaneMenu(menu, source);
    if (!this.filePath?.endsWith(PLAN_NOTE_SUFFIX)) return;
    menu.addItem(item => item
      .setTitle('Open as Markdown')
      .setIcon('file-text')
      .onClick(() => this.leaf.setViewState({
        type: 'markdown',
        state: { file: this.filePath, mode: 'source' },
        active: true,
      })));
  }
}

export default class PlanrPlugin extends Plugin {
  async onload() {
    shimGlobals();
    setVaultApp(this.app);
    addIcon('planr', PLANR_ICON);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(VIEW_TYPE_PLANR, leaf => new PlanrView(leaf, this));
    // Nobody else claims `.planr`, and without this Obsidian will not even
    // show such a file in the explorer.
    this.registerExtensions([PLAN_EXTENSION], VIEW_TYPE_PLANR);
    this.addSettingTab(new PlanrSettingTab(this.app, this));

    this.addRibbonIcon('planr', 'Planr', () => this.activateView());

    this.addCommand({
      id: 'open',
      name: 'Open',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'open-plan-file',
      name: 'Open plan file…',
      callback: async () => {
        try {
          const handle = await pickOpenFile();
          await this.openPlan(handle.path);
        } catch (e) {
          if (e?.name !== 'AbortError') new Notice(`Planr: ${e.message}`);
        }
      },
    });

    // A `.planr.md` is a note as far as Obsidian is concerned, so it opens in
    // the Markdown editor first and is swapped here. Not a hijack of `.md`:
    // only files the user named `…planr.md` are touched, and the setting
    // turns it off.
    this.registerEvent(this.app.workspace.on('file-open', file => {
      if (!this.settings.openPlanNotes || !file?.name?.endsWith(PLAN_NOTE_SUFFIX)) return;
      // Whichever leaf the user was looking at keeps the focus afterwards.
      const active = this.app.workspace.getActiveViewOfType(MarkdownView);
      for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
        if (leaf.view?.file?.path !== file.path) continue;
        leaf.setViewState({
          type: VIEW_TYPE_PLANR,
          state: { file: file.path },
          active: leaf.view === active,
        });
      }
    }));

    // …and for everything else — a `.json` plan, or a `.planr.md` with the
    // setting off — the file explorer's context menu.
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!file?.name || !/\.(json|md|planr)$/i.test(file.name)) return;
      menu.addItem(item => item
        .setTitle('Open in Planr')
        .setIcon('planr')
        .onClick(() => this.openPlan(file.path)));
    }));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** Mount `path` as the active plan and bring the view up. */
  async openPlan(path) {
    setMountedPath(path);
    const leaf = await this.activateView();
    await leaf?.setViewState({ type: VIEW_TYPE_PLANR, state: { file: path }, active: true });
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_PLANR)[0];
    const leaf = existing ?? workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_PLANR, active: true });
    workspace.revealLeaf(leaf);
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
        'A plan saved as Markdown is still a note, so Obsidian opens it in the editor. '
        + 'With this on, files ending in .planr.md switch to the Planr view instead. '
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
