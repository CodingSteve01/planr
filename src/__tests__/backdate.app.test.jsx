/** @vitest-environment happy-dom */
// Backdating as a state of the app, not a field on one event.
//
// The history log could already move a single event to another day, one at a
// time, in a dialog. Restructuring a package is twenty events, so that was a
// way of describing the problem rather than solving it. This is the switch:
// while it is on, everything written counts as of that day — and while it is
// on, the app has to say so, because a forgotten backdate quietly falsifies
// every review after it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1 },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Backdate', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const chip = () => screen.queryByTestId('backdate-chip');

async function openDialog() {
  await act(async () => { fireEvent.keyDown(window, { key: '/', bubbles: true }); });
  const input = await screen.findByTestId('palette-input');
  await act(async () => { fireEvent.change(input, { target: { value: 'backdate' } }); });
  await act(async () => { fireEvent.keyDown(input, { key: 'Enter', bubbles: true }); });
  return screen.findByTestId('backdate-dialog');
}

describe('backdating', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is off, and invisible, until asked for', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    expect(chip()).toBeNull();
  });

  it('is reachable from the palette and announces itself once on', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    const dialog = await openDialog();
    const date = dialog.querySelector('input[type="date"]');
    await act(async () => { fireEvent.change(date, { target: { value: '2026-09-14' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('backdate-apply')); });

    await waitFor(() => { if (!chip()) throw new Error('no chip'); });
    expect(chip().textContent).toContain('2026-09-14');
  });

  it('can be switched off again from the chip', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    const dialog = await openDialog();
    const date = dialog.querySelector('input[type="date"]');
    await act(async () => { fireEvent.change(date, { target: { value: '2026-09-14' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('backdate-apply')); });
    await waitFor(() => { if (!chip()) throw new Error('no chip'); });

    await act(async () => { fireEvent.click(screen.getByTestId('backdate-clear')); });
    expect(chip()).toBeNull();
  });

  it('does not survive a reload — a forgotten backdate falsifies every review after it', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const dialog = await openDialog();
    const date = dialog.querySelector('input[type="date"]');
    await act(async () => { fireEvent.change(date, { target: { value: '2026-09-14' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('backdate-apply')); });
    await waitFor(() => { if (!chip()) throw new Error('no chip'); });

    cleanup();
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    expect(chip()).toBeNull();
  });
});
