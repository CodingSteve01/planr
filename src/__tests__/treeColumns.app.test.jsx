/** @vitest-environment happy-dom */
// Reported: the tree looks cluttered — probably because it is only partly
// tabular — while the work order reads clearly.
//
// Right, and it is only the name column. Everything to the right of it —
// effort, percent, schedule — was already in columns. Behind the name sat up
// to eleven optional things, each with the same `marginLeft: 8`: team, the
// assignees' initials, an auto-assign badge, the priority glyph, severity, a
// date, decide-by, due, the diff badge, custom-field markers, and a leaf count
// on collapsed rows. Every row carries a different subset, so nothing ends
// where it ended on the line above and the eye has no edge to run along.
//
// So the name column holds the name — indent, caret, status, name — and
// nothing else, ever. What used to trail behind it has columns of its own.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'AB', name: 'Abrechnung in VOffice', status: 'wip', team: 'T1', type: 'goal', severity: 'critical', date: '2027-06-30' },
      { id: 'AB.6', name: 'Masken stehen', status: 'wip', team: 'T1' },
      { id: 'AB.6.1', name: 'Wizard Schritte 1 bis 5', status: 'wip', progress: 80, team: 'T1',
        best: 30, factor: 1.5, assign: ['M1', 'M2'], prio: 1, due: '2026-10-01', decideBy: '2026-09-30' },
      { id: 'AB.6.2', name: 'API: Zuweisungen', status: 'open', team: 'T2', best: 5, factor: 1 },
    ],
    members: [
      { id: 'M1', name: 'Adam Karepin', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
      { id: 'M2', name: 'Rita Lang', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
    ],
    teams: [{ id: 'T1', name: 'Frontend', color: '#3b82f6' }, { id: 'T2', name: 'Backend', color: '#10b981' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Columns', planStart: '2026-01-05', planEnd: '2027-12-31' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const rowOf = id => [...document.querySelectorAll('tr')]
  .find(tr => tr.children[0]?.textContent.trim().replace(/^⋮⋮/, '') === id);
const cell = (id, name) => rowOf(id)?.querySelector(`[data-col="${name}"]`);

const setup = () => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'tree');
  localStorage.setItem('planr_tree_ids', 'true');
  localStorage.setItem('planr_tour_done', '1');
  seedProject();
};

describe('the name column holds the name', () => {
  beforeEach(setup);
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('and nothing that used to trail behind it', async () => {
    renderApp();
    await screen.findByText('AB.6.1');
    const name = cell('AB.6.1', 'name').textContent;

    expect(name).toContain('Wizard Schritte 1 bis 5');
    for (const stray of ['Frontend', 'AK', 'RL', '2026-10-01', '2026-09-30']) {
      expect(name, `"${stray}" is still in the name cell`).not.toContain(stray);
    }
  });

  it('team, who and the signals each have a column of their own', async () => {
    renderApp();
    await screen.findByText('AB.6.1');

    expect(cell('AB.6.1', 'team').textContent).toContain('Frontend');
    expect(cell('AB.6.1', 'who').textContent).toMatch(/AK|Adam/);
    // Priority is a signal; so is a diff badge when a review window is open.
    expect(cell('AB.6.1', 'signal')).toBeTruthy();
  });

  it('gives every row the same cells, so the columns line up', async () => {
    // The actual complaint: a row with nothing to show must still occupy the
    // same slots, or the next column moves.
    renderApp();
    await screen.findByText('AB.6.2');
    const cols = id => [...rowOf(id).querySelectorAll('[data-col]')].map(c => c.getAttribute('data-col'));
    expect(cols('AB.6.2')).toEqual(cols('AB.6.1'));
  });

  it('puts a due date in the column about dates', async () => {
    // Formatted the way that column formats dates — an ISO string next to
    // "29. Juli → 06. Okt." was two date languages in one cell.
    renderApp();
    await screen.findByText('AB.6.1');
    const schedule = cell('AB.6.1', 'schedule').textContent;
    expect(schedule).toMatch(/Okt/);
    expect(schedule).not.toContain('2026-10-01');
  });
});

describe('what moved off the row', () => {
  beforeEach(setup);
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('severity, the goal date and decide-by are no longer printed on it', async () => {
    renderApp();
    await screen.findByText('AB');
    const row = rowOf('AB').textContent;
    expect(row).not.toContain('critical');
    expect(row).not.toContain('2027-06-30');
    expect(rowOf('AB.6.1').textContent).not.toContain('2026-09-30');
  });
});

describe('a collapsed parent', () => {
  beforeEach(setup);
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('counts its leaves in the app\'s language', async () => {
    // It said "(2 leafs)" — English, and misspelled, in a German app.
    renderApp();
    await screen.findByText('AB.6');
    const collapseAll = [...document.querySelectorAll('button')].find(b => /collapse all/i.test(b.textContent));
    if (!collapseAll) return;
    collapseAll.click();
    await waitFor(() => { if (!rowOf('AB')) throw new Error('no root'); });
    expect(document.body.textContent).not.toMatch(/leafs/);
  });
});
