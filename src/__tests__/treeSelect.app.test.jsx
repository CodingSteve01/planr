/** @vitest-environment happy-dom */
// Reported: selecting an item in the tree does not always let the shortcuts
// act on it — sometimes it is simply not selected. It happens on parent rows.
//
// Not a plugin problem, and not a misclick. The fold caret is only drawn on
// rows that have children, which is why it only ever happened on a parent, and
// it called `stopPropagation` so the row's own click handler — the one that
// selects the row and gives the grid the keyboard — never ran. So the most
// natural thing to click on a parent was the one thing that left the cursor
// wherever it had been, and the next keystroke went to some other row.
//
// Folding a branch is not a reason to lose your place in it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1' },
      { id: 'P1.1.1', name: 'Net prices', status: 'open', team: 'T1', best: 3, factor: 1 },
      { id: 'P1.1.2', name: 'Gross prices', status: 'open', team: 'T1', best: 3, factor: 1 },
      { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1 },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Tree select', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const rowOf = id => [...document.querySelectorAll('tr')]
  .find(tr => tr.children[0]?.textContent.trim().replace(/^⋮⋮/, '') === id);
const isSelected = id => !!rowOf(id)?.classList.contains('sel');
const prioOf = id => rowOf(id)?.getAttribute('data-prio');
const grid = () => document.querySelector('[data-testid="tree-editor-surface"]');

describe('selecting a row in the tree', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('folding a branch by its triangle selects that row too', async () => {
    renderApp();
    await screen.findByText('P1.1');

    // Somewhere else first, so "still selected" cannot pass by accident.
    await act(async () => { fireEvent.click(rowOf('P1.2')); });
    expect(isSelected('P1.2')).toBe(true);

    const caret = rowOf('P1.1').querySelector('[data-testid="tree-caret-P1.1"]');
    expect(caret).toBeTruthy();
    await act(async () => { fireEvent.click(caret); });

    expect(isSelected('P1.1')).toBe(true);
    expect(isSelected('P1.2')).toBe(false);
  });

  it('and the keyboard then works on the row you just folded', async () => {
    // The actual complaint: the shortcut went somewhere else, because the
    // cursor had never moved.
    renderApp();
    await screen.findByText('P1.1');

    await act(async () => { fireEvent.click(rowOf('P1.2')); });
    const caret = rowOf('P1.1').querySelector('[data-testid="tree-caret-P1.1"]');
    await act(async () => { fireEvent.click(caret); });

    await act(async () => { fireEvent.keyDown(grid(), { key: '1', bubbles: true }); });

    expect(prioOf('P1.1')).toBe('1');
    expect(prioOf('P1.2')).not.toBe('1');
  });

  it('still folds the branch — the children go away', async () => {
    renderApp();
    await screen.findByText('P1.1');
    expect(rowOf('P1.1.1')).toBeTruthy();

    const caret = rowOf('P1.1').querySelector('[data-testid="tree-caret-P1.1"]');
    await act(async () => { fireEvent.click(caret); });

    expect(rowOf('P1.1.1')).toBeFalsy();
  });
});
