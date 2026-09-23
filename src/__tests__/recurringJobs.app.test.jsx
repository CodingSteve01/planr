/** @vitest-environment happy-dom */
// Named as the recurring work: reconcile Jira with Planr, book holidays,
// on- and offboard people.
//
// All three exist. All three are somewhere: a paste box two thirds down the
// Briefing, an Add button on the Resources table, a vacation list under it.
// Naming a job is not the same as having a way in for it, and a tool you use
// every week should not be a thing you go looking for.
//
// So these are commands, and each lands on the surface with the work already
// started — the box focused, the row created — rather than merely on the tab
// that contains it. The view jumps in the palette already do "go to the tab";
// a command that did only that would be a duplicate of one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Recurring jobs', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

async function runCommand(query) {
  await act(async () => { fireEvent.keyDown(window, { key: '/', bubbles: true }); });
  const input = await screen.findByTestId('palette-input');
  await act(async () => { fireEvent.change(input, { target: { value: query } }); });
  await act(async () => { fireEvent.keyDown(input, { key: 'Enter', bubbles: true }); });
}

const activeTabName = () => document.querySelector('.tab.on')?.firstChild?.textContent?.trim();

describe('the jobs that come back every week have a way in', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('reconciling Jira lands on the paste box, focused', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    // "jira" alone is genuinely ambiguous now that a plan can also be
    // IMPORTED from Jira, and the palette offers both — see the next test.
    // This one is about the recurring job, so it says which.
    await runCommand('reconcile');

    expect(activeTabName()).toBe('Briefing');
    const box = await screen.findByTestId('jira-paste');
    await waitFor(() => { if (document.activeElement !== box) throw new Error('not focused'); });
  });

  it('typing just "jira" offers both the reconcile and the import', async () => {
    // Neither may hide the other. Which one ranks first is a matter of taste;
    // one of them vanishing from the list is a bug.
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    await act(async () => { fireEvent.keyDown(window, { key: '/', bubbles: true }); });
    const input = await screen.findByTestId('palette-input');
    await act(async () => { fireEvent.change(input, { target: { value: 'jira' } }); });

    const labels = [document.querySelector('[data-testid="command-palette"]')?.textContent || ''];
    expect(labels.some(text => /reconcile/i.test(text)), labels.join(' | ')).toBe(true);
    expect(labels.some(text => /import/i.test(text)), labels.join(' | ')).toBe(true);
  });

  it('booking a holiday lands on the vacation list with a row already added', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    await runCommand('vacation');

    expect(activeTabName()).toBe('Resources');
    // A row to fill in, not a list to find the Add button under.
    await waitFor(() => {
      const rows = document.querySelectorAll('[data-testid^="rv-vac-row-"]');
      if (!rows.length) throw new Error('no vacation row');
    });
  });

  it('onboarding someone creates the person and puts the cursor in their name', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    await runCommand('onboard');

    expect(activeTabName()).toBe('Resources');
    const name = await screen.findByTestId('rv-new-member-name');
    await waitFor(() => { if (document.activeElement !== name) throw new Error('not focused'); });
  });
});
