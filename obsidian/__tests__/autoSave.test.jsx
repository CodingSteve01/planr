/** @vitest-environment happy-dom */
// Reported: the plugin never writes the plan back to the file.
//
// The app's auto-save is a debounced effect that needs four things true at
// once — data, the auto-save flag, a mounted handle, and the file being out of
// sync. In the plugin all four come from a different direction than they do on
// the web: the handle arrives as a prop rather than out of IndexedDB, and the
// permission calls are stubbed to "granted" at build time. This drives the
// real App with a vault-shaped handle and asks the only question that matters:
// does anything reach the file?

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, screen, waitFor } from '@testing-library/react';
import App from '../../src/App.jsx';
import { I18nProvider, ThemeProvider } from '../../src/i18n.jsx';

const PLAN = {
  meta: { name: 'Vault plan', planStart: '2026-01-01', planEnd: '2027-01-01' },
  tree: [
    { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
    { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1 },
  ],
  members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
  teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
  vacations: [], meetingPlans: [],
};

// The same shape obsidian/src/vaultFs.js hands the app.
function vaultHandle(written) {
  let content = JSON.stringify(PLAN);
  return {
    kind: 'file',
    path: 'plans/venneker.planr.json',
    name: 'venneker.planr.json',
    async getFile() {
      return { name: 'venneker.planr.json', size: content.length, lastModified: Date.now(), text: async () => content };
    },
    async createWritable() {
      let buf = '';
      return {
        async write(chunk) { buf += String(chunk); },
        async close() { content = buf; written.push(buf); },
        async abort() {},
      };
    },
    async isSameEntry(other) { return other?.path === this.path; },
  };
}

describe('the plugin writes the plan back to its file', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); localStorage.setItem('planr_tour_done', '1'); localStorage.setItem('planr_tab', 'tree'); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('auto-saves an edit without anyone pressing save', { timeout: 20000 }, async () => {
    const written = [];
    const handle = vaultHandle(written);

    render(
      <I18nProvider><ThemeProvider>
        <App mount={handle} onFileChange={() => {}} />
      </ThemeProvider></I18nProvider>,
    );

    // The mounted plan has loaded.
    await screen.findByTestId('view-filters-trigger');
    await waitFor(async () => {
      const names = await screen.findAllByTestId('tree-row-name');
      if (!names.some(el => /Prices/.test(el.textContent))) throw new Error('plan not loaded');
    }, { timeout: 8000 });

    const row = (await screen.findAllByTestId('tree-row-name')).find(el => /Prices/.test(el.textContent));
    const { fireEvent } = await import('@testing-library/react');
    await act(async () => { fireEvent.click(row); });
    await act(async () => { fireEvent.keyDown(row, { key: ' ', bubbles: true }); });

    // Auto-save is debounced 5s.
    await waitFor(() => { if (!written.length) throw new Error('nothing written to the file'); }, { timeout: 12000 });
    expect(JSON.parse(written[written.length - 1]).tree.find(n => n.id === 'P1.1').status).not.toBe('open');
  });
});
