/** @vitest-environment happy-dom */
// The bulk editor (several rows selected, side panel) wrote its own versions
// of three edits the single editors route through shared helpers:
//   - Status wrote only `status`: "done" left progress where it was and
//     stamped no completion date, "open" kept the progress, and a task with
//     phases got a status its phases contradicted.
//   - A phase dot computed progress as done/total, while the single editors
//     count a wip phase for its share (derivePhaseStatus).
//   - Assigning a person always switched the task to the person's primary
//     team, where the dialog keeps the task's team when the person works in
//     it (teamForAssignment). The side panel had the same drift, and App's
//     team-reconcile effect then overwrote every editor's choice with the
//     primary team anyway, one render later.
// The same edit has to give the same result wherever it is made.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { derivePhaseStatus } from '../utils/scheduler.js';

const phases = () => [
  { id: 'ph1', name: 'Build', status: 'open', effort: 1 },
  { id: 'ph2', name: 'Test', status: 'open', effort: 1 },
];
const leaf = (id, name, extra = {}) => ({ id, name, status: 'open', progress: 0, team: 'FE', best: 5, factor: 1.5, assign: [], deps: [], ...extra });

function seed(tree) {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'tree');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [{ id: 'P1', name: 'Billing', status: 'open', team: 'FE' }, ...tree],
    // Mia works in Frontend AND Backend; Backend is her primary team.
    members: [{ id: 'M1', name: 'Mia', team: 'BE', teams: ['FE'], cap: 1 }],
    teams: [{ id: 'FE', name: 'Frontend', color: '#3b82f6' }, { id: 'BE', name: 'Backend', color: '#10b981' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Bulk', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const stored = id => JSON.parse(localStorage.getItem('planr_v2')).tree.find(n => n.id === id);
const rowNamed = name => [...document.querySelectorAll('[data-testid="tree-row-name"]')]
  .find(n => n.textContent.trim() === name)?.closest('tr');
const click = async (name, init = {}) => { await act(async () => { fireEvent.click(rowNamed(name), init); }); };

async function selectBoth() {
  render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
  await screen.findByTestId('tree-editor-surface');
  await waitFor(() => { if (!rowNamed('Bravo')) throw new Error('no rows'); });
  await click('Alpha');
  await click('Bravo', { metaKey: true });
  await waitFor(() => { if (!document.querySelector('.side-body [role="tab"]')) throw new Error('no bulk panel'); });
}
async function pick(placeholder, label) {
  const input = document.querySelector(`.side-body input[placeholder="${placeholder}"]`);
  await act(async () => { fireEvent.focus(input); fireEvent.click(input); });
  const option = [...document.querySelectorAll('[data-searchselect-popup] [data-ss-idx]')].find(o => o.textContent.endsWith(label));
  await act(async () => { fireEvent.click(option); });
}
const openTab = async label => {
  const tab = [...document.querySelectorAll('.side-body [role="tab"]')].find(t => t.textContent === label);
  await act(async () => { fireEvent.click(tab); });
};

afterEach(() => { cleanup(); localStorage.clear(); });

describe('bulk edits behave like single edits', () => {
  beforeEach(() => seed([
    leaf('P1.1', 'Alpha', { status: 'wip', progress: 40 }),
    leaf('P1.2', 'Bravo', { phases: phases() }),
  ]));

  it('bulk "done" stamps completion and 100 %, and leaves a phased task to its phases', async () => {
    await selectBoth();
    await pick('Choose status...', 'Done');
    await waitFor(() => expect(stored('P1.1').status).toBe('done'));
    expect(stored('P1.1').progress).toBe(100);
    expect(stored('P1.1').completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stored('P1.2').status).toBe('open');
  });
});

describe('bulk phase dots derive progress like the single editors', () => {
  beforeEach(() => seed([
    leaf('P1.1', 'Alpha', { phases: phases() }),
    leaf('P1.2', 'Bravo', { phases: phases() }),
  ]));

  it('a wip phase counts for its share', async () => {
    await selectBoth();
    const dot = [...document.querySelectorAll('.side-body span')].find(s => s.textContent === '○');
    await act(async () => { fireEvent.click(dot); });   // Build: open → wip
    const expected = derivePhaseStatus([{ ...phases()[0], status: 'wip' }, phases()[1]]);
    await waitFor(() => expect(stored('P1.1').status).toBe('wip'));
    expect(stored('P1.1').progress).toBe(expected.progress);
    expect(expected.progress).toBeGreaterThan(0);
  });
});

describe('assigning in bulk keeps the task\'s team when the person works in it', () => {
  beforeEach(() => seed([leaf('P1.1', 'Alpha'), leaf('P1.2', 'Bravo')]));

  it('Mia on a Frontend task keeps it Frontend', async () => {
    await selectBoth();
    await openTab('Status');
    await pick('Assign person...', 'Mia');
    await waitFor(() => expect(stored('P1.1').assign).toEqual(['M1']));
    expect(stored('P1.1').team).toBe('FE');
    expect(stored('P1.2').team).toBe('FE');
  });
});
