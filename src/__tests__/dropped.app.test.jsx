/** @vitest-environment happy-dom */
// Dropping an item from the plan, end to end.
//
// The workaround it replaces was "done at 0 %", which counts the item as
// delivered and drags the percentage down at the same time. Marking something
// as not-going-to-happen should cost one keystroke, be obvious on the row, and
// survive a save.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { buildMarkdownText } from '../utils/markdown.js';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'done', progress: 100, team: 'T1', best: 5, factor: 1 },
      { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1 },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Dropped', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const rowOf = id => [...document.querySelectorAll('tr')]
  .find(tr => tr.children[0]?.textContent.trim().replace(/^⋮⋮/, '') === id);
const grid = () => document.querySelector('[data-testid="tree-editor-surface"]');

describe('dropping an item', () => {
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

  it('takes one key on the cursor row, and says so on the row', async () => {
    renderApp();
    await screen.findByText('P1.2');

    await act(async () => { fireEvent.click(rowOf('P1.2')); });
    await act(async () => { fireEvent.keyDown(grid(), { key: '0', bubbles: true }); });

    expect(rowOf('P1.2').getAttribute('data-dropped')).toBe('true');
  });

  it('is its own decision, not a status — the status it had is still there', async () => {
    // Taking it back has to give you the item you had, not an item reset to
    // "open" because dropping overwrote the only field that remembered.
    renderApp();
    await screen.findByText('P1.1');

    await act(async () => { fireEvent.click(rowOf('P1.1')); });
    await act(async () => { fireEvent.keyDown(grid(), { key: '0', bubbles: true }); });
    expect(rowOf('P1.1').getAttribute('data-status')).toBe('done');

    await act(async () => { fireEvent.keyDown(grid(), { key: '0', bubbles: true }); });
    expect(rowOf('P1.1').getAttribute('data-dropped')).toBeNull();
    expect(rowOf('P1.1').getAttribute('data-status')).toBe('done');
  });
});

describe('a dropped item in the file', () => {
  it('round-trips through markdown', () => {
    const tree = [
      { id: 'P1', name: 'Billing', team: 'T1', best: 0 },
      { id: 'P1.1', name: 'Dropped idea', team: 'T1', best: 3, factor: 1, status: 'open', dropped: true },
    ];
    const md = buildMarkdownText({
      tree, members: [], teams: [{ id: 'T1', name: 'Team A' }], vacations: [],
      data: { tree }, meta: { name: 'Dropped', planStart: '2026-01-01', planEnd: '2027-01-01' },
    });
    const line = md.split('\n').find(l => l.includes('**P1.1**'));
    expect(line).toMatch(/dropped:true/);
  });
});
