/** @vitest-environment happy-dom */
// Keys that were listed or drawn but did something else than they said:
//   - On a German keyboard `/` is ⇧7, and the keyboard map took any `/` with
//     Shift as `?`, so `/` opened the map and the command palette together.
//   - ⌘↓ in the search box stepped once in the box and once more in App's
//     window listener, so every press skipped a match.
//   - ▲/▼ and ⌘↑/⌘↓ stepped `searchIdx` on the tree, which only filters —
//     two buttons that did nothing.
//   - ⇧←/⇧→ ("collapse/expand everything") did nothing until a row was
//     selected, though "everything" is what they do without one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor, screen } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const leaf = (id, name) => ({ id, name, status: 'open', team: 'T1', best: 3, factor: 1, assign: ['M1'], deps: [] });
function seed(tab) {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', tab);
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'open', team: 'T1' },
      leaf('P1.1', 'Match one'), leaf('P1.2', 'Match two'), leaf('P1.3', 'Match three'), leaf('P1.4', 'Other'),
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Keys', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}
const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
const searchBox = () => document.querySelector('input[placeholder^="Search"]');
const counter = () => (document.body.textContent.match(/(\d) \/ 3/) || [])[1];
const treeNames = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());

afterEach(() => { cleanup(); localStorage.clear(); });

describe('/ on a German keyboard', () => {
  beforeEach(() => seed('tree'));
  it('opens the palette, not the keyboard map as well', async () => {
    renderApp();
    await screen.findByTestId('tree-editor-surface');
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(screen.queryByTestId('command-palette')).not.toBeNull();
    expect(screen.queryByTestId('keymap-overlay')).toBeNull();
  });
});

describe('stepping through matches', () => {
  it('⌘↓ in the search box moves one match, not two', async () => {
    seed('gantt');
    renderApp();
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
    await act(async () => { fireEvent.change(searchBox(), { target: { value: 'match' } }); });
    await waitFor(() => expect(counter()).toBe('1'));
    searchBox().focus();
    await act(async () => { fireEvent.keyDown(searchBox(), { key: 'ArrowDown', metaKey: true }); });
    await waitFor(() => expect(counter()).toBe('2'));
  });

  it('offers no ▲/▼ on the tree, which filters instead of stepping', async () => {
    seed('tree');
    renderApp();
    await screen.findByTestId('tree-editor-surface');
    await act(async () => { fireEvent.change(searchBox(), { target: { value: 'match' } }); });
    await waitFor(() => expect(treeNames()).not.toContain('Other'));
    expect(document.querySelector('[aria-label^="Next match"]')).toBeNull();
  });
});

describe('⇧← in the tree', () => {
  beforeEach(() => seed('tree'));
  it('collapses everything with no row selected', async () => {
    renderApp();
    const surface = await screen.findByTestId('tree-editor-surface');
    await waitFor(() => expect(treeNames()).toContain('Match one'));
    await act(async () => { fireEvent.keyDown(surface, { key: 'ArrowLeft', shiftKey: true }); });
    await waitFor(() => expect(treeNames()).toEqual(['Billing']));
  });
});

// The keyboard map listed the tree, its row editor and the Gantt — and not
// the work order, which answers to a dozen keys of its own.
describe('the keyboard map', () => {
  beforeEach(() => seed('tree'));
  it('has a work-order section with the keys that view handles', async () => {
    renderApp();
    await screen.findByTestId('tree-editor-surface');
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })); });
    const map = screen.getByTestId('keymap-overlay').textContent;
    expect(map).toContain('Work order — cursor on a row');
    expect(map).toContain('Move earlier / later in the queue');
  });
});
