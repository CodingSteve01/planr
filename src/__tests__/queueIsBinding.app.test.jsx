/** @vitest-environment happy-dom */
// "Ist sichergestellt, dass die Sortierung bindend ist? Also auch für Gantt usw.?"
//
// It has to be, or the Work order view is a wish list. The queue is an input to
// `schedule()`, so the dates change and everything downstream reads those —
// but "it should follow" and "it does follow" are different claims, and only
// one of them is testable. This drives the real app: reorder in the view, then
// read the Gantt's own bars and the dates it prints.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'A eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'A.2', name: 'A zwei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'B', name: 'Projekt B', status: 'wip', team: 'T1' },
      { id: 'B.1', name: 'B eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Binding', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
const goToTab = async name => {
  await waitFor(() => { if (!tabNamed(name)) throw new Error(`no tab ${name}`); });
  await act(async () => { fireEvent.mouseDown(tabNamed(name), { button: 0 }); });
};
const barOrder = () => [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));

describe('the order is binding', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_gantt_group', 'resource');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ resource: [], project: [] }));
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('the schedule follows it, not the tree', async () => {
    renderApp();
    await waitFor(() => { if (!document.querySelector('[data-queue-row]')) throw new Error('no rows'); });

    // B.1 to the front of Anna's queue — impossible in the tree, since B.1 and
    // the A tasks are not siblings.
    const row = document.querySelector('[data-queue-row="B.1"]');
    await act(async () => { fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true }); });
    await waitFor(() => {
      const ids = [...document.querySelectorAll('[data-queue-row]')].map(r => r.getAttribute('data-queue-row'));
      if (ids[0] !== 'B.1') throw new Error(ids.join());
    });

    await goToTab('Schedule');
    await waitFor(() => { if (!barOrder().length) throw new Error('no bars'); });
    // The Gantt draws B.1 first because it is scheduled first, not because the
    // view was told to sort differently.
    expect(barOrder()[0]).toBe('B.1');
  });

  it('and the tree, which knows nothing about queues, is untouched', async () => {
    renderApp();
    await waitFor(() => { if (!document.querySelector('[data-queue-row]')) throw new Error('no rows'); });
    const row = document.querySelector('[data-queue-row="B.1"]');
    await act(async () => { fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true }); });

    await goToTab('Work Tree');
    await waitFor(() => { if (!document.querySelector('[data-testid="tree-editor-surface"]')) throw new Error('no tree'); });
    // Scoped to the tree's own table: the work order pane stays mounted
    // behind it (that is what makes switching instant) and its rows are <tr>
    // too.
    const ids = [...document.querySelectorAll('[data-testid="tree-editor-surface"] tr')]
      .map(tr => tr.children[0]?.textContent.trim().replace(/^⋮⋮/, ''))
      .filter(id => /^[AB]/.test(id || ''));
    expect(ids).toEqual(['A', 'A.1', 'A.2', 'B', 'B.1']);
  });
});
