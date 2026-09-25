/** @vitest-environment happy-dom */
// Reported: ⌘F does nothing in the queue.
//
// The toolbar search box was on screen there, but the queue never received
// the query, and ⌘F was only taken for the tree, the Gantt and the network —
// on the queue it fell through to the browser. The box also sat on views
// that read no search at all, where typing into it did nothing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Abrechnung', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'Gewichtsstaffel Liste', status: 'open', team: 'T1', best: 3, factor: 1, assign: ['M1'] },
      { id: 'A.2', name: 'Export Buchhaltung', status: 'open', team: 'T1', best: 3, factor: 1, assign: ['M1'] },
      { id: 'B', name: 'Kundenportal', status: 'open', team: 'T1' },
      { id: 'B.1', name: 'Login', status: 'open', team: 'T1', best: 3, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Queue search', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
const rowIds = () => [...document.querySelectorAll('[data-queue-row]')].map(el => el.getAttribute('data-queue-row'));
const searchBox = () => document.querySelector('input[placeholder^="Search"]');
const until = check => waitFor(() => { if (!check()) throw new Error('not yet: ' + rowIds().join()); });

async function openQueue() {
  renderApp();
  await until(() => tabNamed('Work order'));
  await act(async () => { fireEvent.mouseDown(tabNamed('Work order'), { button: 0 }); });
  await until(() => rowIds().length);
}

async function type(text) {
  await act(async () => { fireEvent.change(searchBox(), { target: { value: text } }); });
}

describe('searching the queue', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('⌘F puts the cursor in the search box', async () => {
    await openQueue();
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true });
    await act(async () => { window.dispatchEvent(event); });
    expect(document.activeElement).toBe(searchBox());
    expect(event.defaultPrevented).toBe(true);
  });

  it('narrows the rows to matches and keeps each row\'s real place in the queue', async () => {
    await openQueue();
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);
    await type('export');
    await until(() => rowIds().join() === 'A.2');
    // Second in Anna's queue, still numbered 2 — a filter never renumbers.
    expect(document.querySelector('[data-queue-row="A.2"] td').textContent).toBe('2');
  });

  it('matches on the project a row sits in, as its path line shows it', async () => {
    await openQueue();
    await type('kundenportal');
    await until(() => rowIds().join() === 'B.1');
  });

  it('says so when nothing matches, instead of claiming there is nothing to order', async () => {
    await openQueue();
    await type('zzz');
    await until(() => document.querySelector('[data-testid="wo-empty"]'));
    expect(document.querySelector('[data-testid="wo-empty"]').textContent).toContain('zzz');
  });

  it('Enter hands the keyboard to the first matching row', async () => {
    await openQueue();
    await type('login');
    await act(async () => { fireEvent.keyDown(searchBox(), { key: 'Enter' }); });
    await until(() => document.activeElement?.getAttribute('data-queue-row') === 'B.1');
  });

  it('shows no search box on a view that does not search', async () => {
    await openQueue();
    expect(searchBox()).toBeTruthy();
    await act(async () => { fireEvent.mouseDown(tabNamed('Overview'), { button: 0 }); });
    await waitFor(() => { if (searchBox()) throw new Error('still there'); });
  });
});
