/** @vitest-environment happy-dom */
// Two complaints about pushing items around the tree, reported together.
//
// 1. "Items simply disappear." They are not lost: re-parenting out a level
//    renumbers the subtree into a project of its own — P1.1 and its children
//    become P3 — and the project filter, still set to P1, then excludes the
//    very rows that were being moved. The plan is right and the screen is
//    empty where the item used to be, which is indistinguishable from losing
//    it. A search over ids does the same thing for the same reason.
//
// 2. Moving up or down stopped dead at the end of a sibling run. Carrying an
//    item on from there meant outdent, reorder, indent, in that order — so
//    the obvious gesture was the one that did nothing.
//
// The first is guarded by watching the outcome rather than the cause: the
// moved row is marked, and if it is not in the next filtered list the view
// widens to wherever it went. The second is `outOfGroupTarget` — at the
// boundary the row steps out a level and lands where it was pressing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { outOfGroupTarget, visibleSiblingTarget } from '../utils/treeEdit.js';

const PLAN = [
  { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
  { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
  { id: 'P1.1.1', name: 'Tariffs', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
  { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
  { id: 'P2', name: 'Other', status: 'open', team: 'T1' },
];

function seed({ rootFilter = '' } = {}) {
  localStorage.clear();
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: PLAN,
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Moves', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
  if (rootFilter) localStorage.setItem('planr_root_filter', rootFilter);
}

const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
const rowNamed = name => [...document.querySelectorAll('[data-testid="tree-row-name"]')]
  .find(n => n.textContent.trim() === name)?.closest('tr');

async function selectRow(name) {
  await act(async () => { fireEvent.click(rowNamed(name)); });
}
async function press(init) {
  const grid = screen.getByTestId('tree-editor-surface');
  await act(async () => { fireEvent.keyDown(grid, init); });
  await act(async () => { await new Promise(r => setTimeout(r, 60)); });
}
async function ready() {
  renderApp();
  await screen.findByTestId('tree-editor-surface');
  await waitFor(() => expect(names().length).toBeGreaterThan(1));
}

// The app persists its filter chips to localStorage, so a seeded root filter
// outlives this file unless it is cleared: the next test to run in the same
// environment would open on a plan narrowed to P1 and fail for a reason
// nothing in it mentions.
afterEach(() => { cleanup(); localStorage.clear(); });

describe('a move never hides what it moved', () => {
  beforeEach(() => seed({ rootFilter: 'P1' }));

  it('keeps an outdented branch on screen when the project filter would drop it', async () => {
    await ready();
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks']);   // P2 filtered away

    await selectRow('Prices');
    await press({ key: 'Tab', shiftKey: true });                          // out to top level

    // It became a project of its own, so P1's filter can no longer hold it.
    // The view widened instead of swallowing it.
    expect(names()).toContain('Prices');
    expect(names()).toContain('Tariffs');
    expect(names()).toContain('Other');                                   // the filter came off
  });

  it('leaves the filter alone when the move keeps the row visible', async () => {
    await ready();
    await selectRow('Tariffs');
    await press({ key: 'Tab', shiftKey: true });   // P1.1.1 → P1.3, still inside P1

    expect(names()).toContain('Tariffs');
    expect(names(), 'the filter was dropped for a move that did not need it').not.toContain('Other');
  });
});

describe('moving past the end of a sibling run', () => {
  beforeEach(() => seed());

  it('steps the row out a level and puts it above the parent it left', async () => {
    await ready();
    await selectRow('Tariffs');                    // P1.1.1 — an only child
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks', 'Other']);

    await press({ key: 'ArrowUp', altKey: true });
    // Out of P1.1 and in front of it.
    expect(names()).toEqual(['Billing', 'Tariffs', 'Prices', 'Masks', 'Other']);
  });

  it('steps out downwards too, landing below the parent', async () => {
    await ready();
    await selectRow('Tariffs');
    await press({ key: 'ArrowDown', altKey: true });
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks', 'Other']);
    // Same row order as before — but a level further out, so the next press
    // carries it past Masks rather than stopping.
    await press({ key: 'ArrowDown', altKey: true });
    expect(names()).toEqual(['Billing', 'Prices', 'Masks', 'Tariffs', 'Other']);
  });

  it('carries a row all the way out to the top level, one press at a time', async () => {
    await ready();
    await selectRow('Tariffs');
    await press({ key: 'ArrowUp', altKey: true });   // out of P1.1
    await press({ key: 'ArrowUp', altKey: true });   // out of P1 — a project now
    expect(names()).toEqual(['Tariffs', 'Billing', 'Prices', 'Masks', 'Other']);
  });
});

describe('where the boundary is', () => {
  const visible = ['P1', 'P1.1', 'P1.1.1', 'P1.2', 'P2'];

  it('is not reached while the run still has somewhere to go', () => {
    expect(visibleSiblingTarget(visible, 'P1.1', 'down')).toEqual({ targetId: 'P1.2', position: 'after' });
    expect(outOfGroupTarget(visible, 'P1.1', 'down')).toBeNull();
  });

  it('hands the press to the parent at either end of the run', () => {
    expect(outOfGroupTarget(visible, 'P1.1', 'up')).toEqual({ parentId: '', targetId: 'P1', position: 'before' });
    expect(outOfGroupTarget(visible, 'P1.2', 'down')).toEqual({ parentId: '', targetId: 'P1', position: 'after' });
  });

  it('stops at a root — there is nothing further out', () => {
    expect(outOfGroupTarget(visible, 'P1', 'up')).toBeNull();
    expect(outOfGroupTarget(visible, 'P2', 'down')).toBeNull();
  });

  it('refuses to position against a parent it cannot see', () => {
    // Nothing on screen to move relative to, so the press does nothing rather
    // than guessing at a row the filters are hiding.
    expect(outOfGroupTarget(['P1.1'], 'P1.1', 'up')).toBeNull();
  });

  it('answers nothing for the ends of the run, which stay inside it', () => {
    expect(outOfGroupTarget(visible, 'P1.1', 'first')).toBeNull();
    expect(outOfGroupTarget(visible, 'P1.1', 'last')).toBeNull();
  });
});

describe('stepping out with the name still open', () => {
  beforeEach(() => seed());

  it('carries the typed name across the renumber', async () => {
    // The move renumbers the row underneath the open editor — P1.1.1 becomes
    // P1.2 — so an editor still pointing at the old id would write the name
    // to a row that no longer exists.
    await ready();
    await selectRow('Tariffs');
    await press({ key: 'Enter' });                       // open the name

    const input = document.querySelector('[data-testid="tree-name-input-P1.1.1"]');
    expect(input, 'the inline editor did not open').toBeTruthy();
    await act(async () => { fireEvent.change(input, { target: { value: 'Tariff model' } }); });
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowUp', altKey: true }); });
    await act(async () => { fireEvent.keyDown(document.querySelector('input[data-testid^="tree-name-input"]') || input, { key: 'Enter' }); });
    await act(async () => { await new Promise(r => setTimeout(r, 80)); });

    expect(names()).toContain('Tariff model');
    expect(names()).not.toContain('Tariffs');
  });
});
