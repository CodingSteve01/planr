/** @vitest-environment happy-dom */
// Run mode, end to end: the same seam treeEditor.app.test.jsx exists for.
// A pure-logic test on attention.js proves the ranking math; it cannot prove
// that a click on a rendered row actually reaches the tree through App's
// mutate() path, or that a pasted Jira table becomes a status write. So:
// drive the real App, seed a real plan, click the real buttons, and read the
// real tree back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, within } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  const project = {
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      // wip, estimated, assigned — should NOT show up in the attention list,
      // and SHOULD show up in Anna's queue under "Now" (wip, regardless of
      // scheduled dates).
      { id: 'P1.1', name: 'Prices', status: 'wip', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [], customValues: { jira: 'NA-1' } },
      // no estimate at all — the "unestimated" attention bucket.
      { id: 'P1.2', name: 'Unsized work', status: 'open', team: 'T1', best: 0, factor: 1.5, assign: [], deps: [] },
      // estimated but waits on P1.1, which is not done yet — "blocked".
      { id: 'P1.3', name: 'Waits on Prices', status: 'open', team: 'T1', best: 3, factor: 1.5, assign: ['M1'], deps: ['P1.1'] },
      // a decide-by date far in the past — "overdue", independent of when
      // this test actually runs.
      { id: 'P1.4', name: 'Stale decision', status: 'open', team: 'T1', best: 2, factor: 1.5, deps: [], decideBy: '2000-01-01' },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [],
    meetingPlans: [],
    customFields: [{ id: 'jira', name: 'Jira ID', type: 'uri', uriTemplate: '' }],
    meta: { name: 'Run mode test', planStart: '2026-01-01', planEnd: '2027-01-01' },
  };
  try { localStorage.setItem('planr_v2', JSON.stringify(project)); } catch { /* ignore */ }
}

function renderApp() {
  return render(
    <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
  );
}

// Same reader treeEditor.app.test.jsx uses: the rendered grid IS the app's
// answer, not the (effect-driven, not-yet-flushed-in-tests) autosave mirror.
function planTree() {
  return [...document.querySelectorAll('tr')]
    .map(row => ({
      id: row.children[0]?.textContent.trim().replace(/^⋮⋮/, ''),
      row,
    }))
    .filter(entry => /^[A-Za-z]+\d[\d.]*$/.test(entry.id || ''))
    .map(entry => ({ id: entry.id, status: entry.row.getAttribute('data-status') }));
}
const statusOf = id => planTree().find(n => n.id === id)?.status;

async function goToBuildTree() {
  await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /^Build$/ })); });
  const treeTab = await screen.findByText('Work Tree');
  await act(async () => { fireEvent.mouseDown(treeTab, { button: 0 }); });
}

describe('Run mode', () => {
  beforeEach(() => {
    cleanup();
    try {
      localStorage.clear();
      localStorage.setItem('planr_lang', 'en');
      localStorage.setItem('planr_mode', 'run'); // land directly on Briefing
    } catch { /* ignore */ }
    seedProject();
  });
  afterEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('lands on the Briefing tab in Run mode and builds the attention list', async () => {
    renderApp();
    expect(await screen.findByTestId('bv-attn-unestimated-P1.2')).toBeTruthy();
    expect(await screen.findByTestId('bv-attn-blocked-P1.3')).toBeTruthy();
    expect(await screen.findByTestId('bv-attn-overdue-P1.4')).toBeTruthy();
    // Ready, estimated, wip work earns no row — it needs no attention.
    expect(screen.queryByTestId(/bv-attn-.*-P1\.1$/)).toBeNull();
  });

  it('lists a wip, assigned leaf under the assignee\'s queue', async () => {
    renderApp();
    expect(await screen.findByText('Anna')).toBeTruthy();
    expect(screen.getByText('Prices')).toBeTruthy();
    expect(screen.getByTestId('bv-status-P1.1')).toBeTruthy();
  });

  it('changing status from an attention row writes through to the same tree node', async () => {
    renderApp();
    const button = await screen.findByTestId('bv-status-P1.2');
    expect(button.textContent).toBe('○'); // open

    await act(async () => { fireEvent.click(button); });
    expect(button.textContent).toBe('◐'); // wip

    await goToBuildTree();
    expect(statusOf('P1.2')).toBe('wip');
  });

  it('reports open work with no Jira key before any paste — link health needs no input', async () => {
    renderApp();
    // P1.2/P1.3/P1.4 are open leaves with no `jira` custom value; P1.1
    // carries one, so it must not show up here.
    expect(await screen.findByTestId('bv-jira-unlinked-P1.2')).toBeTruthy();
    expect(screen.getByTestId('bv-jira-unlinked-P1.3')).toBeTruthy();
    expect(screen.getByTestId('bv-jira-unlinked-P1.4')).toBeTruthy();
    expect(screen.queryByTestId('bv-jira-unlinked-P1.1')).toBeNull();
  });

  it('presents Jira drift as rows you accept, not a dialog, and applying writes the status', async () => {
    renderApp();

    // Open the (collapsed by default) paste box and reconcile.
    const toggle = await screen.findByText(/Paste Jira issues/);
    await act(async () => { fireEvent.click(toggle); });
    const textarea = await screen.findByPlaceholderText(/Issue key/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Issue key,Status\nNA-1,Done' } });
    });

    const row = await screen.findByTestId('bv-jira-diff-P1.1');
    expect(within(row).getByText('Prices')).toBeTruthy();

    // The same drift also surfaces in the ranked attention list.
    expect(await screen.findByTestId('bv-attn-drift-P1.1')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByTestId('bv-jira-apply')); });

    await goToBuildTree();
    expect(statusOf('P1.1')).toBe('done');
  });
});
