// "Wenn ich mehrere planr-Dateien in verschiedenen Tabs offen habe und dann
// zwischen den Tabs wechsle, wandelt er irgendwie automatisch die Tabs in ein
// Planr-Fenster um, die Dateien werden aber zuvor einfach in markdown
// geöffnet."
//
// A `.planr.md` is a note as far as Obsidian is concerned: extension `md`, so
// it cannot be registered without taking every note in the vault away from the
// Markdown editor. The first version watched for `file-open` and swapped the
// leaf afterwards — by which time the Markdown editor is built and painted,
// which is the flash. So the *request* is rewritten instead: the leaf is told
// to open a Planr view before it ever builds a Markdown one.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import PlanrPlugin, { VIEW_TYPE_PLANR } from '../src/main.jsx';

// The patch only needs `settings`, `fileModes` and `register`; building a real
// plugin would mean stubbing half of Obsidian's API for no extra coverage.
// Obsidian's own setViewState is replaced by a recorder underneath the patch,
// so what each leaf is *finally* asked for is what the assertions read.
function patchedPlugin(settings = { openPlanNotes: true }) {
  WorkspaceLeaf.prototype.setViewState = function (state) { this.asked.push(state); };
  const plugin = { settings, fileModes: {}, cleanups: [], register(fn) { this.cleanups.push(fn); } };
  PlanrPlugin.prototype.patchLeafViewState.call(plugin);
  return plugin;
}

function leaf(id) {
  const l = new WorkspaceLeaf();
  l.id = id;
  l.asked = [];
  return l;
}

let original;

beforeEach(() => { original = WorkspaceLeaf.prototype.setViewState; });
afterEach(() => { WorkspaceLeaf.prototype.setViewState = original; });

describe('opening a plan note', () => {
  it('never builds the Markdown view', () => {
    const plugin = patchedPlugin();
    const l = leaf('leaf-1');

    l.setViewState({ type: 'markdown', state: { file: 'Projekte/venneker.planr.md', mode: 'source' } });

    expect(l.asked).toHaveLength(1);
    expect(l.asked[0].type).toBe(VIEW_TYPE_PLANR);
    // The rest of the request survives — the file above all.
    expect(l.asked[0].state.file).toBe('Projekte/venneker.planr.md');
  });

  it('leaves every other note alone', () => {
    const plugin = patchedPlugin();
    const l = leaf('leaf-1');

    l.setViewState({ type: 'markdown', state: { file: 'Notizen/einkaufen.md' } });

    expect(l.asked[0].type).toBe('markdown');
  });

  it('stands down when the setting is off', () => {
    const plugin = patchedPlugin({ openPlanNotes: false });
    const l = leaf('leaf-1');

    l.setViewState({ type: 'markdown', state: { file: 'Projekte/venneker.planr.md' } });

    expect(l.asked[0].type).toBe('markdown');
  });
});

describe('"Open as Markdown"', () => {
  it('holds for the tab that asked for it', () => {
    const plugin = patchedPlugin();
    const l = leaf('leaf-1');

    plugin.fileModes['leaf-1'] = 'markdown';
    l.setViewState({ type: 'markdown', state: { file: 'Projekte/venneker.planr.md' } });
    expect(l.asked[0].type).toBe('markdown');

    // …and not for the tab next to it.
    const other = leaf('leaf-2');
    other.setViewState({ type: 'markdown', state: { file: 'Projekte/venneker.planr.md' } });
    expect(other.asked[0].type).toBe(VIEW_TYPE_PLANR);
  });

  it('is forgotten once the tab moves on to an ordinary note', () => {
    const plugin = patchedPlugin();
    const l = leaf('leaf-1');

    plugin.fileModes['leaf-1'] = 'markdown';
    l.setViewState({ type: 'markdown', state: { file: 'Notizen/einkaufen.md' } });
    l.setViewState({ type: 'markdown', state: { file: 'Projekte/venneker.planr.md' } });

    expect(l.asked[1].type).toBe(VIEW_TYPE_PLANR);
  });
});

describe('unloading the plugin', () => {
  it('hands setViewState back', () => {
    const base = function () {};
    WorkspaceLeaf.prototype.setViewState = base;
    const plugin = { settings: { openPlanNotes: true }, fileModes: {}, cleanups: [], register(fn) { this.cleanups.push(fn); } };
    PlanrPlugin.prototype.patchLeafViewState.call(plugin);
    expect(WorkspaceLeaf.prototype.setViewState).not.toBe(base);

    plugin.cleanups.forEach(fn => fn());
    expect(WorkspaceLeaf.prototype.setViewState).toBe(base);
  });

  it('keeps its hands off a patch someone else applied on top', () => {
    const plugin = patchedPlugin();
    const theirs = function () {};
    WorkspaceLeaf.prototype.setViewState = theirs;
    plugin.cleanups.forEach(fn => fn());
    expect(WorkspaceLeaf.prototype.setViewState).toBe(theirs);
  });
});
