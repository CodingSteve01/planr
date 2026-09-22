/** @vitest-environment happy-dom */
// Asked: why does the Gantt not follow the tree's order, even at top level?
//
// Because it had two orders of its own. The children of a node were sorted by
// earliest scheduled start with `displayOrder` only as a fallback, and the
// items inside a group by priority. Both predate the tree becoming the order
// of the work — they are the same pattern the scheduler carried until
// September 2026, a second ranking that quietly disagrees with the plan you
// arranged.
//
// The bars still say when; the rows say what the plan is.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seed(order) {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1', displayOrder: order.A },
      // Starts late: it waits for B. Ordered by time it would sort last, and
      // that is exactly the disagreement being tested.
      { id: 'A.1', name: 'A eins', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['B.1'], prio: 4 },
      { id: 'B', name: 'Projekt B', status: 'wip', team: 'T1', displayOrder: order.B },
      { id: 'B.1', name: 'B eins', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'], prio: 1 },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'GanttOrder', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const groupLabels = () => [...document.querySelectorAll('.gteam, .grow-l')]
  .map(el => el.textContent.trim())
  .filter(Boolean);

const setup = () => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'gantt');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_gantt_group', 'project');
  localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ project: [] }));
};

describe('the schedule lists what the tree lists, in that order', () => {
  beforeEach(setup);
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('A before B when the tree says so, even though B starts first', async () => {
    seed({ A: 1, B: 2 });
    renderApp();
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
    const labels = groupLabels();
    const a = labels.findIndex(l => l.includes('Projekt A'));
    const b = labels.findIndex(l => l.includes('Projekt B'));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(b);
  });

  it('and B before A when the tree says that', async () => {
    seed({ A: 2, B: 1 });
    renderApp();
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
    const labels = groupLabels();
    expect(labels.findIndex(l => l.includes('Projekt B')))
      .toBeLessThan(labels.findIndex(l => l.includes('Projekt A')));
  });

  it('priority does not reorder the rows', async () => {
    // B.1 is priority 1 and A.1 priority 4; the tree puts A first and that is
    // what the list shows. Priority is importance, not position.
    seed({ A: 1, B: 2 });
    renderApp();
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
    const ids = [...document.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id'));
    expect(ids.indexOf('A.1')).toBeLessThan(ids.indexOf('B.1'));
  });
});
