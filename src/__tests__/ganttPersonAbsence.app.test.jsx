/** @vitest-environment happy-dom */
// Asked for: when a row belongs to exactly one resource, show their vacation
// and the public holidays right in its timeline. Grouped by resource, the
// person's own row is that row — so it carries both, once per person, while
// the task bars keep their own absence hatching (docs/gantt.md).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seed(group) {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'gantt');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_gantt_group', group);
  localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ resource: [], project: [] }));
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'A eins', status: 'open', team: 'T1', best: 30, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [{ person: 'M1', from: '2026-02-09', to: '2026-02-13', note: 'Ski' }],
    holidays: [{ date: '2026-02-17', name: 'Test holiday', auto: false }],
    meetingPlans: [],
    meta: { name: 'Absence', planStart: '2026-01-05', planEnd: '2026-12-31' },
  }));
}

const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
async function openSchedule() {
  render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
  await waitFor(() => { if (!tabNamed('Schedule')) throw new Error('no tab'); });
  await act(async () => { fireEvent.mouseDown(tabNamed('Schedule'), { button: 0 }); });
  await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });
}

describe('a person\'s own row in the schedule', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows their vacation and the public holidays, grouped by resource', async () => {
    seed('resource');
    await openSchedule();
    const vac = document.querySelector('[data-person-vacation="2026-02-09_2026-02-13"]');
    expect(vac).toBeTruthy();
    expect(vac.getAttribute('data-htip')).toMatch(/Anna · Vacation: 2026-02-09 → 2026-02-13 · Ski/);
    expect(document.querySelector('[data-person-holiday="2026-02-17"]')).toBeTruthy();
  });

  it('draws nothing of the kind where no row belongs to one person', async () => {
    seed('project');
    await openSchedule();
    expect(document.querySelector('[data-person-vacation]')).toBeNull();
    expect(document.querySelector('[data-person-holiday]')).toBeNull();
  });
});
