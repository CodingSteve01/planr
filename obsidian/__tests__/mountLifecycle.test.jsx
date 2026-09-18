/** @vitest-environment happy-dom */
// "Wenn ich zwischen den Dateien einfach umschalten will, dann wird das
// Fenster einfach schwarz."
//
// React's unmount is deferred by a tick — Obsidian can close a leaf from
// inside a click handler React is still committing, and unmounting there
// warns. The first version deferred it while mounting the next plan into the
// same element, so a tick later the outgoing root cleared the container the
// incoming one had just filled: a black tab. Every mount gets its own
// container now, and the old one leaves the document immediately.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stands in for React: enough to tell "this container holds a live app" from
// "this container has been cleared", which is the whole question here.
vi.mock('react-dom/client', () => ({
  createRoot: el => ({
    render: () => { el.textContent = 'app'; },
    unmount: () => { el.textContent = ''; },
  }),
}));

const { PlanrView } = await import('../src/main.jsx');
const { setVaultApp } = await import('../src/vaultFs.js');

/** Obsidian's DOM helpers, only the two the view uses. */
function contentEl() {
  const el = document.createElement('div');
  el.createDiv = ({ cls } = {}) => {
    const child = document.createElement('div');
    if (cls) child.className = cls;
    el.appendChild(child);
    return child;
  };
  return el;
}

function view() {
  const v = Object.create(PlanrView.prototype);
  v.contentEl = contentEl();
  v.leaf = { id: 'leaf-1', updateHeader: () => {} };
  v.plugin = { fileModes: {} };
  v.root = null;
  v.mountEl = null;
  v.appPath = null;
  document.body.appendChild(v.contentEl);
  return v;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => { setVaultApp({ vault: {} }); });
afterEach(() => { document.body.innerHTML = ''; });

describe('switching a tab from one plan to another', () => {
  it('leaves the new plan on screen once the old one is torn down', async () => {
    const v = view();
    v.mount('Projekte/erster.planr');
    const first = v.mountEl;

    v.mount('Projekte/zweiter.planr');
    const second = v.mountEl;

    expect(second).not.toBe(first);
    await flush();

    expect(second.textContent).toBe('app');
    expect(second.isConnected).toBe(true);
    // And the plan we left is gone, not stacked behind the new one.
    expect(first.isConnected).toBe(false);
    expect(v.contentEl.children).toHaveLength(1);
  });

  it('takes the old container out of the document before React is told', () => {
    const v = view();
    v.mount('Projekte/erster.planr');
    const first = v.mountEl;

    v.unmount();

    // Straight away, not a tick later: nothing of the closed plan is visible
    // while React is still holding on to it.
    expect(first.isConnected).toBe(false);
    expect(v.root).toBeNull();
    expect(v.mountEl).toBeNull();
  });
});
