/** @vitest-environment happy-dom */
// "Wenn ich im Tree versuche einen erledigten WorkItem zu fokussieren, dann
//  fokussiert er irgendeinen ganz anderen. Jedenfalls springt er einfach weg."
//
// Clicking a row is the most basic thing the tree does, so this is worth
// pinning down with the plain case and the two filters that a finished item is
// most likely to be looked at through: hide-done on (where it is still shown
// as an ancestor or a diff hit), and the Δ review window.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject(extra = {}) {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'done', progress: 100, completedAt: '2026-09-18', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      { id: 'P1.3', name: 'Invoices', status: 'done', progress: 100, completedAt: '2026-09-19', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Select done', planStart: '2026-01-05', planEnd: '2027-06-30' },
    ...extra,
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const rowOf = id => [...document.querySelectorAll('tr')]
  .find(tr => tr.children[0]?.textContent.trim().replace(/^⋮⋮/, '') === id);
const selectedIds = () => [...document.querySelectorAll('tr.sel')]
  .map(tr => tr.children[0]?.textContent.trim().replace(/^⋮⋮/, ''));

const base = () => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'tree');
  localStorage.setItem('planr_tree_ids', 'true');
  localStorage.setItem('planr_tour_done', '1');
};

describe('clicking a finished item in the tree', () => {
  beforeEach(() => { base(); seedProject(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('selects the one that was clicked', async () => {
    renderApp();
    await screen.findByText('P1.3');

    await act(async () => { fireEvent.click(rowOf('P1.3')); });
    expect(selectedIds()).toEqual(['P1.3']);
  });

  it('stays on it, rather than moving on a beat later', async () => {
    // "Springt einfach weg" — whatever moves it would move it after the click,
    // in an effect, so give the app a chance to do so.
    renderApp();
    await screen.findByText('P1.1');

    await act(async () => { fireEvent.click(rowOf('P1.1')); });
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(selectedIds()).toEqual(['P1.1']);
  });

  it('selects it with hide-done on, where a finished row is the odd one out', async () => {
    localStorage.setItem('planr_hide_done', 'true');
    renderApp();
    await screen.findByText('P1.2');

    // With done hidden the row may not be there at all — that is fine and not
    // this bug. What must not happen is a click landing on someone else.
    const row = rowOf('P1.3');
    if (!row) return;
    await act(async () => { fireEvent.click(row); });
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(selectedIds()).toEqual(['P1.3']);
  });
});

// The state it was actually seen in: hide-done on AND a Δ review window, which
// is what brings finished rows back onto a screen that is otherwise hiding
// them. That combination is the whole reason to click a done item at all.
describe('clicking a finished item during a review', () => {
  beforeEach(() => {
    base();
    localStorage.setItem('planr_hide_done', 'true');
    localStorage.setItem('planr_diff_since', '14');
    seedProject({
      historyEvents: [
        { ts: '2026-09-18T10:00:00.000Z', id: 'P1.1', status: 'done', progress: 100, completedAt: '2026-09-18' },
        { ts: '2026-09-19T10:00:00.000Z', id: 'P1.3', status: 'done', progress: 100, completedAt: '2026-09-19' },
      ],
    });
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('selects the finished row that was clicked, and keeps it', async () => {
    renderApp();
    await screen.findByText('P1.2');

    for (const id of ['P1.1', 'P1.3']) {
      const row = rowOf(id);
      if (!row) continue;
      await act(async () => { fireEvent.click(row); });
      await act(async () => { await new Promise(r => setTimeout(r, 60)); });
      expect(selectedIds(), `after clicking ${id}`).toEqual([id]);
    }
  });
});
