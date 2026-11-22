// The "Open in Planr" menu keeps a cache of JSON files. Obsidian fires
// `create` for every file while the vault loads, so the vault handlers must
// only be attached once the layout is ready — after the cache has warmed up —
// or every JSON file is read twice at startup.

import { describe, expect, it, vi } from 'vitest';

vi.mock('react-dom/client', () => ({ createRoot: () => ({ render() {}, unmount() {} }) }));

const { default: PlanrPlugin } = await import('../src/main.jsx');

function fakePlugin() {
  const vaultHandlers = [];
  const workspaceHandlers = [];
  const readyCallbacks = [];
  const plugin = {
    app: {
      vault: {
        on: name => {
          vaultHandlers.push(name);
          return { name };
        },
        getFiles: () => [],
        cachedRead: async () => '',
      },
      workspace: {
        on: name => {
          workspaceHandlers.push(name);
          return { name };
        },
        onLayoutReady: fn => readyCallbacks.push(fn),
      },
      metadataCache: { getFileCache: () => null },
    },
    registerEvent: vi.fn(),
  };
  return { plugin, vaultHandlers, workspaceHandlers, readyCallbacks };
}

describe('registerPlanMenu', () => {
  it('attaches no vault handler before the layout is ready', () => {
    const { plugin, vaultHandlers, readyCallbacks } = fakePlugin();
    PlanrPlugin.prototype.registerPlanMenu.call(plugin);
    expect(vaultHandlers).toEqual([]);
    expect(readyCallbacks).toHaveLength(1);
  });
  it('attaches create, modify, rename and delete once it is', () => {
    const { plugin, vaultHandlers, readyCallbacks } = fakePlugin();
    PlanrPlugin.prototype.registerPlanMenu.call(plugin);
    readyCallbacks[0]();
    expect([...vaultHandlers].sort()).toEqual(['create', 'delete', 'modify', 'rename']);
  });
  it('registers the file menu entry at load', () => {
    const { plugin, workspaceHandlers } = fakePlugin();
    PlanrPlugin.prototype.registerPlanMenu.call(plugin);
    expect(workspaceHandlers).toEqual(['file-menu']);
  });
});
