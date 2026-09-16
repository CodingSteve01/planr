// Planr as an Obsidian plugin.
//
// The whole app is the unchanged React app from src/ — this file only mounts
// it into a workspace leaf and points its file I/O at the vault. Everything
// Planr-specific (scheduling, CPM, Gantt, exports) is imported, not
// reimplemented: when src/ moves, the plugin moves with it.

import { ItemView, Notice, Plugin, addIcon } from 'obsidian';
import { createRoot } from 'react-dom/client';
import App from '../../src/App.jsx';
import { I18nProvider, ThemeProvider } from '../../src/i18n.jsx';
import '../../src/App.css';
import {
  PLAN_FILE_RE,
  installFileSystemAccessShim,
  pickOpenFile,
  setMountedPath,
  setVaultApp,
  uninstallFileSystemAccessShim,
} from './vaultFs.js';

export const VIEW_TYPE_PLANR = 'planr-view';

const PLANR_ICON = `<g transform="scale(3.125)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
<rect x="5" y="5" width="22" height="22" rx="4"/>
<line x1="9" y1="11" x2="23" y2="11"/>
<line x1="9" y1="16" x2="19" y2="16"/>
<line x1="9" y1="21" x2="21" y2="21"/>
</g>`;

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
  }

  getViewType() { return VIEW_TYPE_PLANR; }
  getDisplayText() { return 'Planr'; }
  getIcon() { return 'planr'; }

  async onOpen() {
    this.mount();
  }

  mount() {
    const host = this.contentEl;
    this.unmount();
    host.empty();
    host.addClass('planr-view');
    // Modals and dropdown popups portal out of their own subtree to escape
    // overflow clipping. On the web that means document.body; here it has to
    // stay inside the scoped stylesheet, so point them at this container.
    window.__planrPortalHost = host;
    this.root = createRoot(host);
    this.root.render(
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>,
    );
  }

  unmount() {
    // React 18 warns when unmount() runs inside its own render/commit, and
    // Obsidian can close a leaf from a click handler we are inside of.
    const root = this.root;
    this.root = null;
    if (root) window.setTimeout(() => root.unmount(), 0);
    if (window.__planrPortalHost === this.contentEl) delete window.__planrPortalHost;
  }

  async onClose() {
    this.unmount();
  }
}

export default class PlanrPlugin extends Plugin {
  async onload() {
    shimGlobals();
    setVaultApp(this.app);
    addIcon('planr', PLANR_ICON);

    this.registerView(VIEW_TYPE_PLANR, leaf => new PlanrView(leaf, this));

    this.addRibbonIcon('planr', 'Planr', () => this.activateView());

    this.addCommand({
      id: 'open',
      name: 'Open Planr',
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

    // Right-click any .json/.md in the file explorer → open it as a plan.
    // Registering the extensions themselves is not an option: Planr files are
    // ordinary .json and .md, and hijacking those for the whole vault would be
    // rude to every other note.
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!file?.name || !PLAN_FILE_RE.test(file.name)) return;
      menu.addItem(item => item
        .setTitle('Open in Planr')
        .setIcon('planr')
        .onClick(() => this.openPlan(file.path)));
    }));
  }

  onunload() {
    uninstallFileSystemAccessShim();
  }

  /** Mount `path` as the active plan and bring the view up. */
  async openPlan(path) {
    setMountedPath(path);
    const view = await this.activateView();
    // The app reads the mounted file once, at boot — remount so a second
    // "Open in Planr" on a different file actually switches plans.
    view?.mount();
  }

  async activateView() {
    installFileSystemAccessShim();
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_PLANR)[0];
    const leaf = existing ?? workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_PLANR, active: true });
    workspace.revealLeaf(leaf);
    return leaf.view instanceof PlanrView ? leaf.view : null;
  }
}
