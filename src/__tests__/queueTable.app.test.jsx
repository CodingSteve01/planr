/** @vitest-environment happy-dom */
// "Und wie genau kann ich die Queues mal eben schnell umsortieren? Wie in
//  Tabellenansicht genau wie das umsortieren im Tree?"
//
// The gesture existed only on the schedule, on a Gantt bar, in a grouping you
// had to find — which is a fine place to NOTICE that something sits too early
// and a poor one to sit down and put ten things in order. That wants what the
// tree has: a dense list, a cursor, ⌥↑↓, and nothing else on the screen
// arguing for attention.
//
// Same keys as the tree deliberately. It is the same act.

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
      { id: 'B', name: 'Projekt B', status: 'open', team: 'T1' },
      { id: 'B.1', name: 'B eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Queue table', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
const rowIds = () => [...document.querySelectorAll('[data-queue-row]')]
  .map(el => el.getAttribute('data-queue-row'));

async function openWorkOrder() {
  renderApp();
  await waitFor(() => { if (!tabNamed('Resources')) throw new Error('no tab'); });
  await act(async () => { fireEvent.mouseDown(tabNamed('Resources'), { button: 0 }); });
  const pill = await screen.findByTestId('rv-section-order');
  await act(async () => { fireEvent.click(pill); });
  await waitFor(() => { if (!rowIds().length) throw new Error('no rows'); });
}

const press = async (id, key, opts = {}) => {
  const row = document.querySelector(`[data-queue-row="${id}"]`);
  await act(async () => { fireEvent.keyDown(row, { key, bubbles: true, ...opts }); });
};

describe('a person\'s work order as a table', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'resources');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('lists what one person has, in the order they will do it', async () => {
    await openWorkOrder();
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);
  });

  it('⌥↑ moves a task up, the same key as in the tree', async () => {
    await openWorkOrder();
    await press('B.1', 'ArrowUp', { altKey: true });
    await waitFor(() => { if (rowIds()[1] !== 'B.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.1', 'B.1', 'A.2']);
  });

  it('⌥⇧↑ takes it to the front — across the project boundary', async () => {
    await openWorkOrder();
    await press('B.1', 'ArrowUp', { altKey: true, shiftKey: true });
    await waitFor(() => { if (rowIds()[0] !== 'B.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['B.1', 'A.1', 'A.2']);
  });

  it('⌥↓ moves it back down', async () => {
    await openWorkOrder();
    await press('A.1', 'ArrowDown', { altKey: true });
    await waitFor(() => { if (rowIds()[0] !== 'A.2') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.2', 'A.1', 'B.1']);
  });

  it('says when the order is no longer the plan\'s, and gives it back', async () => {
    await openWorkOrder();
    expect(screen.queryByTestId('rv-queue-reset-M1')).toBeNull();

    await press('B.1', 'ArrowUp', { altKey: true, shiftKey: true });
    await waitFor(() => { if (!screen.queryByTestId('rv-queue-reset-M1')) throw new Error('no reset'); });

    await act(async () => { fireEvent.click(screen.getByTestId('rv-queue-reset-M1')); });
    await waitFor(() => { if (rowIds()[0] !== 'A.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);
  });
});
