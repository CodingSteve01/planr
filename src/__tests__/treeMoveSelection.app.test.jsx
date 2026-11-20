/** @vitest-environment happy-dom */
// Reported: with several rows selected, moving them moved only the row clicked
// last. A selection moves as a block now, in its own order, and one ⌘Z takes
// the whole move back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const leaf = (id, name) => ({ id, name, status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] });
const PLAN = [
  { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
  leaf('P1.1', 'Alpha'), leaf('P1.2', 'Bravo'), leaf('P1.3', 'Charlie'), leaf('P1.4', 'Delta'),
];

function seed() {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: PLAN,
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Moves', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
const rowNamed = name => [...document.querySelectorAll('[data-testid="tree-row-name"]')]
  .find(n => n.textContent.trim() === name)?.closest('tr');
const click = async (name, init = {}) => { await act(async () => { fireEvent.click(rowNamed(name), init); }); };

beforeEach(seed);
afterEach(() => { cleanup(); localStorage.clear(); });

describe('moving a multi-selection in the tree', () => {
  it('moves every selected row, as a block, and says so', async () => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await screen.findByTestId('tree-editor-surface');
    await waitFor(() => expect(names()).toEqual(['Billing', 'Alpha', 'Bravo', 'Charlie', 'Delta']));

    await click('Alpha');
    await click('Bravo', { metaKey: true });
    expect(screen.getByTestId('tv-moves-selection').textContent).toMatch(/^2 rows/);

    await act(async () => { fireEvent.click(screen.getByTestId('tv-move-down')); });
    expect(names()).toEqual(['Billing', 'Charlie', 'Alpha', 'Bravo', 'Delta']);

    // Still selected, so the next press carries on with the same block.
    await act(async () => { fireEvent.click(screen.getByTestId('tv-move-down')); });
    expect(names()).toEqual(['Billing', 'Charlie', 'Delta', 'Alpha', 'Bravo']);
    expect(screen.getByTestId('tv-move-down').disabled).toBe(true);
  });
});
