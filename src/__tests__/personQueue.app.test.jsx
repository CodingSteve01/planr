/** @vitest-environment happy-dom */
// Setting a person's own order of work from the schedule, grouped by resource.
//
// The plan's order is the tree's. Grouped by resource you are not looking at
// the plan, you are looking at what one person does and in what order — the
// one list that can put a task from project B ahead of one from project A,
// because those two have no order between them in the tree to change.

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
    meta: { name: 'Queue', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
const press = async (key, opts = {}) => {
  await act(async () => { fireEvent.keyDown(window, { key, bubbles: true, ...opts }); });
};
const barOrder = () => [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));
const storedQueues = () => JSON.parse(localStorage.getItem('planr_v2') || '{}').personQueues || null;

describe('the schedule is not the queue', () => {
  // Reported: that hint text eats the little vertical space there is, and it
  // does not work anyway because the rows cannot be clicked. And: if this were
  // a queue, would it not be flat?
  //
  // All true, and the last question is the one that settles it. Grouped by
  // resource the schedule still shows each person's work as the project
  // hierarchy it belongs to, which is the right answer to "what is this person
  // carrying" and the wrong shape for "in what order". An ordering gesture
  // there needed a paragraph of explanation, a cursor you could only reach by
  // pressing a key first, and it still looked like a tree.
  //
  // So it is gone, and the Work order view — flat, clickable, one list per
  // owner — is the only place. The schedule keeps a read-only note that a
  // person's order is their own, because otherwise the bars would sit in an
  // order nothing on screen explains.
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'gantt');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_gantt_group', 'resource');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ resource: [] }));
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const openSchedule = async () => {
    renderApp();
    await waitFor(() => { if (!tabNamed('Schedule')) throw new Error('no tab'); });
    await act(async () => { fireEvent.mouseDown(tabNamed('Schedule'), { button: 0 }); });
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
  };

  it('spends no vertical space explaining a gesture it no longer has', async () => {
    await openSchedule();
    expect(screen.queryByTestId('queue-hint')).toBeNull();
  });

  it('still says whose order is their own, so the bars are explicable', async () => {
    localStorage.setItem('planr_v2', JSON.stringify({
      ...JSON.parse(localStorage.getItem('planr_v2')),
      personQueues: { M1: ['B.1', 'A.1', 'A.2'] },
    }));
    await openSchedule();
    expect(screen.getByTestId('queue-sorted-M1')).toBeTruthy();
    // Read-only here: it is changed where it lives.
    expect(screen.queryByTestId('queue-reset-M1')).toBeNull();
  });

  it('moves the item in the tree, like every other grouping', async () => {
    await openSchedule();
    const before = [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowUp', { altKey: true, shiftKey: true });
    // B.1 is the only child of B, so a sibling move cannot lift it past A —
    // which is exactly the limit the Work order view exists for.
    await waitFor(() => {
      const after = [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));
      if (after.join() !== before.join()) throw new Error('tree changed: ' + after.join());
    });
    expect(JSON.parse(localStorage.getItem('planr_v2')).personQueues).toBeFalsy();
  });
});
