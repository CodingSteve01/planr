/** @vitest-environment happy-dom */
// "Work as of an earlier day" used to be a mode of its own: a dialog, a chip,
// and a date stamped on whatever was written meanwhile. The date switch does
// that now, and shows the plan as it stood on that day while it does. One
// way to an earlier day, so the command and the File menu lead to the switch.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { openPalette } from './openPalette.js';
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

async function openDialog() {
  // `/` is ignored while focus is in a field, and the handler is attached on
  // mount — so firing it the instant render() returns raced the app on a
  // loaded machine and this file flaked, on a different test each time. Wait
  // for the shell, take focus out of any input, and let the keypress be
  // retried until the palette is actually up.
  await waitFor(() => {
    if (!document.querySelector('.tab-bar')) throw new Error('shell not mounted');
  });
  const input = await openPalette();
  await act(async () => { fireEvent.change(input, { target: { value: 'backdate' } }); });
  await act(async () => { fireEvent.keyDown(input, { key: 'Enter', bubbles: true }); });
  return screen.findByTestId('effective-menu');
}


const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('going to an earlier day', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('has no dialog and no chip of its own any more', async () => {
    renderApp();
    await waitFor(() => { if (!document.querySelector('.tab-bar')) throw new Error('shell not mounted'); });
    expect(screen.queryByTestId('backdate-chip')).toBeNull();
    expect(screen.queryByTestId('backdate-dialog')).toBeNull();
  });

  it('the palette command opens the date switch, and a day picked there is on screen', async () => {
    renderApp();
    const menu = await openDialog();
    expect(menu.querySelector('[data-testid="effective-earlier"]')).toBeTruthy();
    fireEvent.change(screen.getByTestId('effective-date-input'), { target: { value: day(4) } });
    await act(async () => { fireEvent.click(screen.getByTestId('effective-date-ok')); });
    const bar = await screen.findByTestId('effective-bar');
    expect(bar.getAttribute('data-travel')).toBe('true');
    await act(async () => { fireEvent.click(screen.getByTestId('effective-leave')); });
    expect(screen.queryByTestId('effective-bar')).toBeNull();
  });

  it('does not survive a reload: the app opens on today', async () => {
    const first = renderApp();
    await openDialog();
    fireEvent.change(screen.getByTestId('effective-date-input'), { target: { value: day(4) } });
    await act(async () => { fireEvent.click(screen.getByTestId('effective-date-ok')); });
    await screen.findByTestId('effective-bar');
    first.unmount();
    renderApp();
    await waitFor(() => { if (!document.querySelector('.tab-bar')) throw new Error('shell not mounted'); });
    expect(screen.queryByTestId('effective-bar')).toBeNull();
  });
});
