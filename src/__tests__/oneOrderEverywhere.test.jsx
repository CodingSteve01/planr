/** @vitest-environment happy-dom */
// Reported after an afternoon spent rearranging the tree: the work-order
// queues showed a completely different sequence.
//
// They did. `displayOrder` is a number written onto the rows — reordering
// siblings never reorders the ARRAY. So every surface that simply walked
// `data.tree` read the order the rows happened to be stored in, which was the
// tree's order once, before the first reorder. Measured on the plan that was
// reported: 171 of 181 positions differed between the stored order and the
// order on screen. Only the tree view and the Gantt sorted; the queues, the
// resource views, the report and the PDFs did not — and each of them presents
// itself as the plan's order.
//
// The array carries the order now, sorted once where App reads it, so a view
// cannot forget to do it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor, act, fireEvent } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { sortTree } from '../utils/treeEdit.js';

// Stored back to front: the ids run 1, 2, 3 and `ord` says 3, 2, 1. Exactly
// what an afternoon of ⌥↑ leaves behind.
const STORED = [
  { id: 'P1', name: 'Billing', status: 'wip', team: 'T1', displayOrder: 2 },
  { id: 'P1.1', name: 'Alpha', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [], displayOrder: 3 },
  { id: 'P1.2', name: 'Bravo', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [], displayOrder: 2 },
  { id: 'P1.3', name: 'Charlie', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [], displayOrder: 1 },
  { id: 'P2', name: 'Portal', status: 'open', team: 'T1', displayOrder: 1 },
  { id: 'P2.1', name: 'Delta', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [], displayOrder: 1 },
];
const ARRANGED = ['P2', 'P2.1', 'P1', 'P1.3', 'P1.2', 'P1.1'];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: STORED,
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Order', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
});
// The app persists its filter chips to localStorage, so a seeded root filter
// outlives this file unless it is cleared: the next test to run in the same
// environment would open on a plan narrowed to P1 and fail for a reason
// nothing in it mentions.
afterEach(() => { cleanup(); localStorage.clear(); });

const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);

describe('the stored order and the arranged order', () => {
  it('are not the same thing — which is the whole problem', () => {
    expect(STORED.map(r => r.id)).not.toEqual(ARRANGED);
    expect(sortTree(STORED).map(r => r.id)).toEqual(ARRANGED);
  });

  it('keeps a row whose parent is missing instead of dropping it', () => {
    // The walk starts at the roots and follows ids down, so an orphan was
    // reachable from nothing and fell out of the result: a row in the plan
    // and nowhere on the screen.
    const orphaned = [{ id: 'P1', name: 'Root' }, { id: 'P4.2', name: 'Stranded' }];
    expect(sortTree(orphaned).map(r => r.id)).toEqual(['P1', 'P4.2']);
  });
});

describe('the work order view', () => {
  it('lists a queue in the order the tree is arranged in', async () => {
    renderApp();
    const tab = await screen.findByText('Work order');
    await act(async () => { fireEvent.click(tab); });

    const queueRows = () => [...document.querySelectorAll('.tree-tbl tbody tr')]
      .filter(r => /^\d/.test(r.textContent));          // the rank column
    await waitFor(() => expect(queueRows().length).toBe(4));
    const order = queueRows()
      .map(r => ['Alpha', 'Bravo', 'Charlie', 'Delta'].find(n => r.textContent.includes(n)));
    // Delta is P2's and P2 comes first; then P1's three, back to front.
    expect(order).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
  });
});

describe('what the queue cannot decide', () => {
  it('marks a row that waits for something further down the same list', async () => {
    // A queue says "this one first"; a dependency says "not before that one",
    // and the schedule honours the second. The list never mentioned it.
    localStorage.clear();
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
        { id: 'P1.1', name: 'Alpha', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: ['P1.2'] },
        { id: 'P1.2', name: 'Bravo', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [] },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Held', planStart: '2026-01-01', planEnd: '2027-01-01' },
    }));
    renderApp();
    const tab = await screen.findByText('Work order');
    await act(async () => { fireEvent.click(tab); });

    await waitFor(() => expect(document.querySelector('[data-queue-blocked]')).toBeTruthy());
    // Alpha is first in tree order and waits for Bravo, which is second here.
    const mark = document.querySelector('[data-queue-blocked]');
    expect(mark.getAttribute('data-queue-blocked')).toBe('order');
    expect(mark.textContent).toContain('P1.2');
    expect(mark.closest('tr').textContent).toContain('Alpha');
    // Bravo holds nobody up, so it carries no mark.
    expect(document.querySelectorAll('[data-queue-blocked]')).toHaveLength(1);
  });
});
