/** @vitest-environment happy-dom */
// The first day, from the board that already exists.
//
// The export and the reconcile half both went the other way. This is the
// question a new user actually has — "the tickets are already in Jira, do I
// have to type them all again" — and the answer has to survive being tried:
// everything is decided in the preview, and one ⌘Z takes the whole import
// back, because an import is the action people are most afraid of.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const CSV = [
  'Issue key,Summary,Issue Type,Status,Assignee,Parent,Priority,Original Estimate',
  'NA-1,Billing rebuild,Epic,In Progress,,,High,',
  'NA-2,Invoice list,Story,Done,Anna,NA-1,Medium,28800',
  'NA-3,Invoice detail,Story,To Do,Bob Jones,NA-1,Highest,3d',
].join('\n');

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [{ id: 'P1', name: 'Existing', status: 'open', team: 'T1' }],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Has a plan', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

async function openImport() {
  await act(async () => { fireEvent.keyDown(window, { key: '/', bubbles: true }); });
  const input = await screen.findByTestId('palette-input');
  await act(async () => { fireEvent.change(input, { target: { value: 'import from jira' } }); });
  await act(async () => { fireEvent.keyDown(input, { key: 'Enter', bubbles: true }); });
  return screen.findByTestId('jira-import-paste');
}

async function paste(box, text) {
  await act(async () => { fireEvent.change(box, { target: { value: text } }); });
}

describe('importing a Jira board', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows what it will write before it writes anything', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const box = await openImport();

    // Nothing pasted: nothing to import.
    expect(screen.getByTestId('jira-import-submit').disabled).toBe(true);

    await paste(box, CSV);

    // Grouped under one project by default, so an import never scatters five
    // loose projects into a plan that already has its own.
    await waitFor(() => expect(screen.getByTestId('jira-import-row-P2')).toBeTruthy());
    expect(screen.getByTestId('jira-import-row-P2.1').textContent).toContain('Billing rebuild');
    expect(screen.getByTestId('jira-import-row-P2.1.1').textContent).toContain('Invoice list');
    expect(screen.getByTestId('jira-import-submit').disabled).toBe(false);

    // And still nothing written.
    const stored = JSON.parse(localStorage.getItem('planr_v2'));
    expect(stored.tree).toHaveLength(1);
  });

  it('numbers past the projects the plan already has', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const box = await openImport();
    await paste(box, CSV);
    // P1 is taken, so the import starts at P2 — it cannot land on top of
    // something that is already there.
    expect(screen.queryByTestId('jira-import-row-P1')).toBeNull();
  });

// How many rows the plan holds, read off the grid.
//
// These assertions used to count `JSON.parse(localStorage.getItem('planr_v2'))`
// — the autosave MIRROR, which is effect-driven and debounced. On an idle
// machine it lands inside a `waitFor`; under load it does not, and the test
// fails with the mirror's previous contents ("expected 1 to be 5", or the same
// thing backwards after an undo). Twice today that read as a regression in
// whatever had just been edited. treeEditor.app.test.jsx carries the warning
// in its own header: the rendered row IS the app's answer, the mirror is a
// copy of it that may not have been taken yet.
const planRowCount = () => [...document.querySelectorAll('.tree-tbl tbody tr')]
  .filter(r => r.hasAttribute('data-status') || r.querySelector('[data-testid="tree-row-name"]')).length;

  it('writes the tickets into the plan, key and all', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const box = await openImport();
    await paste(box, CSV);
    await act(async () => { fireEvent.click(screen.getByTestId('jira-import-submit')); });

    // the one that was there + wrapper + three tickets
    await waitFor(() => expect(planRowCount()).toBe(5));
    // The field values are only in the mirror, so wait for it before reading
    // it rather than assuming the debounce has fired.
    await waitFor(() => expect(JSON.parse(localStorage.getItem('planr_v2')).tree.length).toBe(5));
    const stored = JSON.parse(localStorage.getItem('planr_v2'));
    const imported = stored.tree.filter(n => n.customValues?.jira);
    expect(imported.map(n => n.customValues.jira).sort()).toEqual(['NA-1', 'NA-2', 'NA-3']);
    // Status and the matched assignee came across; the unmatched one did not
    // get guessed onto somebody.
    const list = imported.find(n => n.customValues.jira === 'NA-2');
    expect(list.status).toBe('done');
    expect(list.assign).toEqual(['M1']);
    expect(imported.find(n => n.customValues.jira === 'NA-3').assign).toEqual([]);
  });

  it('takes the whole import back in one undo', async () => {
    // The thing that makes trying it safe.
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const box = await openImport();
    await paste(box, CSV);
    await act(async () => { fireEvent.click(screen.getByTestId('jira-import-submit')); });
    await waitFor(() => expect(planRowCount()).toBe(5));

    await act(async () => { fireEvent.click(screen.getByTestId('undo-btn')); });
    await waitFor(() => expect(planRowCount()).toBe(1));
  });

  it('offers the people it could not match, and leaves them out until asked', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const box = await openImport();
    await paste(box, CSV);

    const toggle = screen.getByTestId('jira-import-members');
    expect(toggle.checked, 'people should not be created behind your back').toBe(false);
    await act(async () => { fireEvent.click(toggle); });
    await act(async () => { fireEvent.click(screen.getByTestId('jira-import-submit')); });

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('planr_v2'));
      expect(stored.members.map(m => m.name)).toContain('Bob Jones');
    });
  });

  it('can put every epic in as its own project instead', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    const box = await openImport();
    await paste(box, CSV);
    await act(async () => { fireEvent.click(screen.getByTestId('jira-import-group')); });

    // No wrapper: the epic is the project.
    expect(screen.getByTestId('jira-import-row-P2').textContent).toContain('Billing rebuild');
  });
});
