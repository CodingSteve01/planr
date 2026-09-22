/** @vitest-environment happy-dom */
// "Es gibt kein Shortkey um den Eintrag eben im Dialog zu bearbeiten und der
//  Tree ist irgendwie auch das Einzige wo man überhaupt keyboard only arbeiten
//  kann."
//
// Both halves of that are true, and they are the same gap: a surface is
// reachable by keyboard only where somebody sat down and wired a cursor to it.
// The tree got one; nothing else did, and even there the one control that
// opens the full editor was a button and nothing but a button.
//
// These tests drive the real App through real key events, because the failure
// mode being guarded against is precisely "the handler exists but nothing
// routes the key to it".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: [] },
      { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: [] },
      { id: 'P1.3', name: 'Invoices', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Keyboard reach', planStart: '2026-01-05', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const grid = () => document.querySelector('[data-testid="tree-editor-surface"]');
const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);

async function goToTab(name) {
  await waitFor(() => { if (!tabNamed(name)) throw new Error(`no tab: ${name}`); });
  await act(async () => { fireEvent.mouseDown(tabNamed(name), { button: 0 }); });
}

async function press(target, key, opts = {}) {
  await act(async () => { fireEvent.keyDown(target, { key, bubbles: true, ...opts }); });
}

async function selectRow(id) {
  const cell = await screen.findByText(id);
  await act(async () => { fireEvent.click(cell.closest('tr')); });
}

const setup = () => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tree_ids', 'true');
  localStorage.setItem('planr_tour_done', '1');
  seedProject();
};

describe('opening the full editor from the keyboard', () => {
  beforeEach(() => { setup(); localStorage.setItem('planr_tab', 'tree'); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('E on the cursor row opens the dialog for that item', async () => {
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'e');

    // The dialog names the item it is editing.
    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.textContent).toContain('Masks');
  });

  it('leaves E alone while a name is being typed', async () => {
    // The one way this shortcut could be worse than no shortcut: eating a
    // letter out of a word.
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter');
    const input = await screen.findByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Preise' } }); });
    await press(input, 'e');

    expect(screen.queryByTestId('node-modal')).toBeNull();
    expect(input.value).toBe('Preise');
  });
});

describe('the schedule can be worked without a mouse', () => {
  beforeEach(() => { setup(); localStorage.setItem('planr_tab', 'gantt'); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const cursorId = () => document.querySelector('[data-gantt-cursor="1"]')?.getAttribute('data-task-id') || null;

  it('↓ and ↑ move a cursor through the bars', async () => {
    renderApp();
    await goToTab('Schedule');
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });

    await press(window, 'ArrowDown');
    const first = cursorId();
    expect(first).toBeTruthy();

    await press(window, 'ArrowDown');
    expect(cursorId()).not.toBe(first);

    await press(window, 'ArrowUp');
    expect(cursorId()).toBe(first);
  });

  it('E opens the item under the cursor', async () => {
    renderApp();
    await goToTab('Schedule');
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });

    await press(window, 'ArrowDown');
    const id = cursorId();
    await press(window, 'e');

    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe(id);
  });

  it('⌥↓ moves the item later — the same gesture as in the tree', async () => {
    // The order is the tree's now, so the Gantt has to be able to change it
    // with the keys the tree uses, or the timeline is still read-only where
    // the complaint was that it could not be arranged.
    renderApp();
    await goToTab('Schedule');
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });

    await press(window, 'ArrowDown');
    const moved = cursorId();
    const orderBefore = [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));

    await press(window, 'ArrowDown', { altKey: true });

    await waitFor(() => {
      const after = [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));
      if (after.indexOf(moved) <= orderBefore.indexOf(moved)) throw new Error('did not move');
    });
  });
});
