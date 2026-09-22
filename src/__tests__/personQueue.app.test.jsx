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

describe('a person\'s queue, from the schedule', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'gantt');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_gantt_group', 'resource');
    // Grouped by resource, a project summary whose children are all tasks is
    // collapsed by default — nothing to reorder while it is folded.
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ resource: [] }));
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('pulls a task across a project boundary — which the tree cannot do', async () => {
    renderApp();
    await waitFor(() => { if (!tabNamed('Schedule')) throw new Error('no tab'); });
    await act(async () => { fireEvent.mouseDown(tabNamed('Schedule'), { button: 0 }); });
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });

    // The plan order: all of A, then B.
    expect(barOrder()).toEqual(['A.1', 'A.2', 'B.1']);

    // Cursor onto B.1, then ⌥⇧↑ — to the front of Anna's own queue.
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowUp', { altKey: true, shiftKey: true });

    await waitFor(() => {
      if (barOrder()[0] !== 'B.1') throw new Error(`still ${barOrder().join(',')}`);
    });
  });

  it('is stored against the person, not smeared over the tasks', async () => {
    // The thing that must not happen again: a rank written onto every item,
    // competing with the tree everywhere. This belongs to Anna.
    renderApp();
    await waitFor(() => { if (!tabNamed('Schedule')) throw new Error('no tab'); });
    await act(async () => { fireEvent.mouseDown(tabNamed('Schedule'), { button: 0 }); });
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });

    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowUp', { altKey: true, shiftKey: true });

    await waitFor(() => { if (!storedQueues()) throw new Error('nothing stored'); });
    expect(Object.keys(storedQueues())).toEqual(['M1']);
    expect(storedQueues().M1[0]).toBe('B.1');
  });
});

// The queue is an override, and an invisible override is the thing that made
// `seq` unusable: the plan said one order, the schedule ran another, and
// nothing on screen admitted it. So a person whose queue has been hand-sorted
// says so on their own row, and hands it back in one click.
describe('a hand-sorted queue says so', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'gantt');
    localStorage.setItem('planr_tree_ids', 'true');
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
  const sortIt = async () => {
    await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown');
    await press('ArrowUp', { altKey: true, shiftKey: true });
  };

  it('is silent until somebody sorts something', async () => {
    await openSchedule();
    expect(screen.queryByTestId('queue-sorted-M1')).toBeNull();
  });

  it('marks the person whose order is no longer the plan\'s', async () => {
    await openSchedule();
    await sortIt();
    await waitFor(() => { if (!screen.queryByTestId('queue-sorted-M1')) throw new Error('no marker'); });
  });

  it('gives it back in one click', async () => {
    await openSchedule();
    await sortIt();
    await waitFor(() => { if (!screen.queryByTestId('queue-sorted-M1')) throw new Error('no marker'); });

    await act(async () => { fireEvent.click(screen.getByTestId('queue-reset-M1')); });

    await waitFor(() => { if (screen.queryByTestId('queue-sorted-M1')) throw new Error('still marked'); });
    expect(barOrder()).toEqual(['A.1', 'A.2', 'B.1']);
  });
});

// "Hm, und WO sind jetzt diese Queues?!?"
//
// Under a chip called "Resource" in the schedule's header, which is not the
// default grouping, with a gesture that is the same keystroke as everywhere
// else but means something different there — and no sign any of that exists
// until you have already used it, because the only marker appeared after the
// first sort.
//
// A capability you have to be told about in a commit message is not a
// capability. The grouping that owns the gesture says what the gesture does,
// and only that grouping, because everywhere else ⌥↑↓ moves the item in the
// tree and a hint about queues would be a lie.
describe('finding the queue at all', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'gantt');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ resource: [], project: [] }));
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const openSchedule = async () => {
    renderApp();
    await waitFor(() => { if (!tabNamed('Schedule')) throw new Error('no tab'); });
    await act(async () => { fireEvent.mouseDown(tabNamed('Schedule'), { button: 0 }); });
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
  };

  it('says what the gesture does, before anybody has used it', async () => {
    localStorage.setItem('planr_gantt_group', 'resource');
    await openSchedule();

    const hint = screen.getByTestId('queue-hint');
    expect(hint.textContent.toLowerCase()).toMatch(/order/);
  });

  it('stays quiet in the groupings where the gesture means the tree', async () => {
    localStorage.setItem('planr_gantt_group', 'project');
    await openSchedule();

    expect(screen.queryByTestId('queue-hint')).toBeNull();
  });
});
