/** @vitest-environment happy-dom */
// Scenarios through the real App: a second truth can be opened, edited with
// the ordinary editing surface, compared, left, applied and discarded — and
// through all of it the plan in the file is the plan, until "apply" says
// otherwise.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor, within } from '@testing-library/react';
// The PDF layer is not under test here; what the app hands it is.
const exported = [];
let failNextExport = false;
vi.mock('../utils/scenarioReport.js', () => ({
  exportScenarioComparePDF: async model => {
    if (failNextExport) {
      failNextExport = false;
      throw new Error('pdf engine missing');
    }
    exported.push(model);
  },
}));
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function renderApp() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>,
  );
}

function seedProject(extra = {}) {
  const project = {
    tree: [
      { id: 'P1', name: 'Project', status: 'open', type: 'goal' },
      { id: 'P1.1', name: 'Alpha Task', team: 'T1', best: 5, factor: 1, status: 'open', assign: ['M1'], deps: [] },
      { id: 'P1.2', name: 'Beta Task', team: 'T1', best: 5, factor: 1, status: 'open', assign: ['M1'], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [],
    meetingPlans: [],
    meta: { name: 'Scenario Test', planStart: '2026-01-05', planEnd: '2027-01-01' },
    ...extra,
  };
  localStorage.setItem('planr_v2', JSON.stringify(project));
}

const stored = () => JSON.parse(localStorage.getItem('planr_v2'));
// The cache is written a moment after an edit (debounced, then on idle).
const storedWhen = async check => {
  await waitFor(
    () => {
      check(stored());
    },
    { timeout: 8000, interval: 100 },
  );
  return stored();
};

async function undo() {
  const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true });
  await act(async () => {
    window.dispatchEvent(e);
  });
}

async function createScenario(name) {
  fireEvent.click(await screen.findByTestId('scenario-switch'));
  // With no scenario yet the name field is there at once; otherwise one click away.
  if (!screen.queryByTestId('scenario-new-input')) fireEvent.click(screen.getByTestId('scenario-new'));
  fireEvent.change(screen.getByTestId('scenario-new-input'), { target: { value: name } });
  fireEvent.keyDown(screen.getByTestId('scenario-new-input'), { key: 'Enter' });
  await screen.findByTestId('scenario-bar');
}

async function deleteBeta() {
  const row = (await screen.findByText('Beta Task')).closest('tr');
  fireEvent.click(row);
  fireEvent.click(screen.getByTestId('tv-delete-selected'));
  await waitFor(() => expect(screen.queryByText('Beta Task')).toBeNull());
}

describe('scenarios in the App', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tab', 'tree');
    seedProject();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('says where you are: no bar in the plan, a bar and a frame in a scenario', async () => {
    const { container } = renderApp();
    await screen.findByText('Beta Task');
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
    expect(container.querySelector('.app.in-scenario')).toBeNull();
    expect(screen.getByTestId('scenario-switch').textContent).toContain('Plan');

    await createScenario('Without Beta');
    expect(container.querySelector('.app.in-scenario')).toBeTruthy();
    expect(screen.getByTestId('scenario-bar-name').textContent).toBe('Without Beta');
    expect(screen.getByTestId('scenario-switch').textContent).toContain('Without Beta');
    expect(screen.getByTestId('scenario-bar-summary').textContent).toContain('no changes yet');
    // Nothing to apply yet.
    expect(screen.getByTestId('scenario-apply').disabled).toBe(true);
  });

  it('an edit in a scenario stays out of the plan, in the file and on screen', async () => {
    renderApp();
    await createScenario('Without Beta');
    await deleteBeta();
    expect(screen.getByTestId('scenario-bar-summary').textContent).toContain('1 change');

    const file = await storedWhen(d => expect(d.scenarios?.[0]?.patch).toBeTruthy());
    // The plan in the file still has the task; the scenario is only the difference.
    expect(file.tree.map(n => n.id)).toEqual(['P1', 'P1.1', 'P1.2']);
    expect(file.scenarios).toHaveLength(1);
    expect(file.scenarios[0]).toMatchObject({ name: 'Without Beta', patch: { tree: { del: ['P1.2'] } } });

    // Back to the plan: the task is there. Into the scenario again: it is not.
    fireEvent.click(screen.getByTestId('scenario-leave'));
    expect(await screen.findByText('Beta Task')).toBeTruthy();
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('scenario-switch'));
    fireEvent.click(screen.getByTestId('scenario-pick-s1'));
    await screen.findByTestId('scenario-bar');
    expect(screen.queryByText('Beta Task')).toBeNull();
  });

  it('a reload opens on the plan and still knows the scenario', async () => {
    const first = renderApp();
    await createScenario('Without Beta');
    await deleteBeta();
    await storedWhen(d => expect(d.scenarios?.[0]?.patch).toBeTruthy());
    first.unmount();

    renderApp();
    expect(await screen.findByText('Beta Task')).toBeTruthy();
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('scenario-switch'));
    const row = screen.getByTestId('scenario-pick-s1');
    expect(row.textContent).toContain('Without Beta');
    expect(row.textContent).toContain('1 change');
    fireEvent.click(row);
    await screen.findByTestId('scenario-bar');
    expect(screen.queryByText('Beta Task')).toBeNull();
  });

  it('the comparison lists the change, says what it does, and can take it back', async () => {
    renderApp();
    await createScenario('Without Beta');
    await deleteBeta();
    fireEvent.click(screen.getByTestId('scenario-compare'));
    const modal = await screen.findByTestId('scenario-compare-modal');
    // One person, two five-day tasks: without the second the project ends a week earlier.
    const project = within(modal).getByTestId('scn-project-P1');
    expect(project.textContent).toMatch(/−\d+ d/);
    expect(within(modal).getByTestId('scn-tile-projects').textContent).toMatch(/1affected0end later1end earlier/);
    expect(modal.getAttribute('aria-modal')).toBe('true');

    fireEvent.click(within(modal).getByTestId('scn-tab-changes'));
    const change = within(modal).getByTestId('scn-change-item-P1.2');
    expect(change.textContent).toContain('Beta Task');
    expect(change.textContent).toContain('removed');
    // The tab says what its table shows.
    expect(within(modal).getByTestId('scn-tab-changes').textContent).toContain('1');
    fireEvent.click(within(modal).getByTestId('scn-revert-item-P1.2'));
    await waitFor(() => expect(within(modal).queryByTestId('scn-change-item-P1.2')).toBeNull());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(await screen.findByText('Beta Task')).toBeTruthy();
    expect(screen.getByTestId('scenario-bar-summary').textContent).toContain('no changes yet');
  });

  it('applying makes the scenario the plan, and one undo takes that back', async () => {
    renderApp();
    await createScenario('Without Beta');
    await deleteBeta();
    fireEvent.click(screen.getByTestId('scenario-apply'));
    await waitFor(() => expect(screen.queryByTestId('scenario-bar')).toBeNull());
    expect(screen.queryByText('Beta Task')).toBeNull();
    const applied = await storedWhen(d => expect(d.tree.map(n => n.id)).toEqual(['P1', 'P1.1']));
    expect(applied.scenarios).toBeUndefined();
    // Leaving a mode says what happened, and offers the way back.
    expect(screen.getByTestId('scenario-notice').textContent).toContain('Without Beta');

    fireEvent.click(screen.getByTestId('scenario-notice-undo'));
    expect(await screen.findByText('Beta Task')).toBeTruthy();
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
    const back = await storedWhen(d => expect(d.tree.map(n => n.id)).toEqual(['P1', 'P1.1', 'P1.2']));
    expect(back.scenarios?.[0]?.patch).toEqual({ tree: { del: ['P1.2'] } });
  });

  it('discarding returns to the untouched plan, and undo brings the scenario back', async () => {
    renderApp();
    await createScenario('Without Beta');
    await deleteBeta();
    fireEvent.click(screen.getByTestId('scenario-more'));
    fireEvent.click(screen.getByTestId('scenario-discard'));
    expect(await screen.findByText('Beta Task')).toBeTruthy();
    expect(screen.getByTestId('scenario-notice').textContent).toContain('Without Beta');
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('scenario-switch'));
    expect(screen.queryByTestId('scenario-pick-s1')).toBeNull();
    fireEvent.click(screen.getByTestId('scenario-switch'));

    await undo();
    fireEvent.click(screen.getByTestId('scenario-switch'));
    expect((await screen.findByTestId('scenario-pick-s1')).textContent).toContain('1 change');
  });

  it('writes no history while a scenario is on screen', async () => {
    renderApp();
    await screen.findByText('Beta Task');
    await createScenario('Without Beta');
    await deleteBeta();
    const file = await storedWhen(d => expect(d.scenarios?.[0]?.patch).toBeTruthy());
    expect(file.historyEvents || []).toEqual([]);
  });

  it('a visit to a scenario costs the plan neither its undo stack nor the visit', async () => {
    renderApp();
    // An edit to the plan first: Alpha goes.
    const row = (await screen.findByText('Alpha Task')).closest('tr');
    fireEvent.click(row);
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await waitFor(() => expect(screen.queryByText('Alpha Task')).toBeNull());
    // Then a scenario in which Beta goes too, and back to the plan.
    await createScenario('Without Beta');
    await deleteBeta();
    fireEvent.click(screen.getByTestId('scenario-leave'));
    expect(await screen.findByText('Beta Task')).toBeTruthy();
    // ⌘Z undoes the last edit to the PLAN …
    await undo();
    expect(await screen.findByText('Alpha Task')).toBeTruthy();
    // … and the scenario still holds what was done in it.
    fireEvent.click(screen.getByTestId('scenario-switch'));
    expect(screen.getByTestId('scenario-pick-s1').textContent).toContain('1 change');
    await storedWhen(d => {
      expect(d.scenarios?.[0]?.patch).toEqual({ tree: { del: ['P1.2'] } });
      expect(d.tree.map(n => n.id)).toEqual(['P1', 'P1.1', 'P1.2']);
    });
  });

  it('looking at a scenario that no longer fully fits does not rewrite it', async () => {
    // The stored scenario changes P1.2 and an item the plan no longer has.
    const patch = { tree: { set: { 'P1.2': { best: 9 }, 'P1.9': { best: 3 } } } };
    seedProject({
      scenarios: [{ id: 's1', name: 'Old idea', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', patch }],
    });
    renderApp();
    fireEvent.click(await screen.findByTestId('scenario-switch'));
    fireEvent.click(screen.getByTestId('scenario-pick-s1'));
    await screen.findByTestId('scenario-bar');
    expect(screen.getByTestId('scenario-bar-conflicts').textContent).toContain('1 change no longer applies');
    // Long enough for a save to have happened.
    await act(async () => {
      await new Promise(r => setTimeout(r, 2600));
    });
    expect(stored().scenarios[0]).toMatchObject({ patch, updatedAt: '2026-01-02T00:00:00.000Z' });
    // Leaving and coming back still says so.
    fireEvent.click(screen.getByTestId('scenario-leave'));
    fireEvent.click(await screen.findByTestId('scenario-switch'));
    fireEvent.click(screen.getByTestId('scenario-pick-s1'));
    expect((await screen.findByTestId('scenario-bar-conflicts')).textContent).toContain('1 change');
  });

  it('says what a missing person means for their team, not only for their own tasks', async () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    seedProject({
      meta: { name: 'Team Test', planStart: iso },
      members: [
        { id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0 },
        { id: 'M2', name: 'Ben', team: 'T1', cap: 1, vac: 0 },
      ],
      tree: [
        { id: 'P1', name: 'Project', status: 'open', type: 'goal' },
        ...[1, 2, 3, 4].map(i => ({
          id: `P1.${i}`,
          name: `Task ${i}`,
          team: 'T1',
          best: 10,
          factor: 1,
          status: 'open',
          assign: [],
          deps: [],
        })),
      ],
      scenarios: [{ id: 's1', name: 'Without Ben', patch: { members: { del: ['M2'] } }, changes: 1 }],
    });
    renderApp();
    fireEvent.click(await screen.findByTestId('scenario-switch'));
    fireEvent.click(screen.getByTestId('scenario-pick-s1'));
    fireEvent.click(await screen.findByTestId('scenario-compare'));
    const modal = await screen.findByTestId('scenario-compare-modal');
    const story = within(modal).getByTestId('scn-story').textContent;
    expect(story).toContain('Team A');
    expect(story).toContain('2 → 1 people');
    expect(story).toContain('−50 % capacity');
    expect(story).toMatch(/of 4 open tasks move/);
    expect(story).toMatch(/finishes .* later/);
    fireEvent.click(within(modal).getByTestId('scn-tab-teams'));
    const row = within(modal).getByTestId('scn-team-T1');
    expect(row.textContent).toContain('2 → 1');
    expect(row.textContent).toContain('−50 %');

    // The PDF gets the same sentence and the same rows the dialog shows.
    exported.length = 0;
    fireEvent.click(within(modal).getByTestId('scenario-export-pdf'));
    await waitFor(() => expect(exported).toHaveLength(1));
    const report = exported[0];
    expect(report).toMatchObject({ planName: 'Team Test', scenarioName: 'Without Ben', lang: 'en' });
    expect(`${report.story[0].name}: ${report.story[0].text}`).toBe(story);
    const section = id => report.sections.find(sec => sec.id === id);
    expect(section('changes').rows).toEqual([['−', 'People', 'Ben', 'removed']]);
    expect(section('teams').rows[0][0]).toBe('Team A');
    expect(section('teams').rows[0][1]).toMatchObject({ text: '2 → 1' });
    expect(section('projects').rows).toHaveLength(1);
    expect(section('items').rows.length).toBe(Number(within(modal).getByTestId('scn-tab-items').textContent.replace(/\D/g, '')));
  });

  it('a failed export is reported once, and the report card shows no success', async () => {
    const alerts = [];
    const realAlert = window.alert,
      realError = console.error;
    window.alert = msg => alerts.push(String(msg));
    console.error = () => {};
    failNextExport = true;
    try {
      localStorage.setItem('planr_tab', 'report');
      renderApp();
      await createScenario('Without Beta');
      const card = (await screen.findByText('Scenario comparison')).closest('div').parentElement;
      const button = within(card).getByRole('button');
      fireEvent.click(button);
      await waitFor(() => expect(alerts).toHaveLength(1));
      expect(alerts[0]).toContain('pdf engine missing');
      // Back to its label, not to a tick.
      await waitFor(() => expect(button.textContent).toBe('PDF'));
    } finally {
      window.alert = realAlert;
      console.error = realError;
      failNextExport = false;
    }
  });

  it('offers the comparison in the report view only while a scenario is on screen', async () => {
    localStorage.setItem('planr_tab', 'report');
    renderApp();
    await screen.findByTestId('scenario-switch');
    expect(screen.queryByText('Scenario comparison')).toBeNull();
    await createScenario('Without Beta');
    expect(await screen.findByText('Scenario comparison')).toBeTruthy();
  });

  it('pauses the review window while a scenario is open, and says so', async () => {
    localStorage.setItem('planr_diff_since', '14');
    renderApp();
    await screen.findByText('Beta Task');
    const trigger = () => document.querySelector('[data-testid="view-filters-trigger"]') || screen.getByText(/Δ/).closest('button');
    expect(trigger().textContent).toContain('Δ');
    expect(trigger().textContent).not.toContain('paused');
    await createScenario('Without Beta');
    await waitFor(() => expect(trigger().textContent).toContain('paused'));
    fireEvent.click(screen.getByTestId('scenario-leave'));
    await waitFor(() => expect(trigger().textContent).not.toContain('paused'));
    expect(localStorage.getItem('planr_diff_since')).toBe('14');
  });

  it('renames, duplicates and deletes from the menu', async () => {
    renderApp();
    await createScenario('First');
    await deleteBeta();
    // Rename in the bar.
    fireEvent.click(screen.getByTestId('scenario-bar-name'));
    fireEvent.change(screen.getByTestId('scenario-bar-input'), { target: { value: 'Renamed' } });
    fireEvent.keyDown(screen.getByTestId('scenario-bar-input'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('scenario-bar-name').textContent).toBe('Renamed'));
    // Duplicate: a second scenario with the same change, and that is where you land.
    fireEvent.click(screen.getByTestId('scenario-switch'));
    fireEvent.click(screen.getByTestId('scenario-duplicate-s1'));
    await waitFor(() => expect(screen.getByTestId('scenario-bar-name').textContent).toBe('Renamed (copy)'));
    expect(screen.queryByText('Beta Task')).toBeNull();
    expect(screen.getByTestId('scenario-bar-summary').textContent).toContain('1 change');
    // Delete the other one from the menu: still in the copy, the list is one shorter.
    fireEvent.click(screen.getByTestId('scenario-switch'));
    fireEvent.click(screen.getByTestId('scenario-delete-s1'));
    await waitFor(() => expect(screen.queryByTestId('scenario-pick-s1')).toBeNull());
    expect(screen.getByTestId('scenario-pick-s2')).toBeTruthy();
    const file = await storedWhen(d => expect(d.scenarios?.map(s => s.name)).toEqual(['Renamed (copy)']));
    expect(file.tree).toHaveLength(3);
  });
});
