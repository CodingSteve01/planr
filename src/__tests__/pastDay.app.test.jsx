/** @vitest-environment happy-dom */
// An earlier day: the whole plan as it stood then, and an edit there counts
// from that day on. What reaches the file is always the real plan.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const PLAN = `# Baseline

## Plan

| Field | Value |
|---|---|
| Start | 2026-01-05 |

## Resources
- **Anna Noor** \`AN\` — Dev, Engineer

## Work Tree

- **P1** Project
  - **P1.1** Alpha Task (S 5T ×1) — Dev [AN]
  - **P1.2** Beta Task (S 5T ×1) — Dev [AN]
`;

// A file the host hands over: readable at once, and it keeps what is written.
function hostFile(initial) {
  const state = { text: initial, writes: [] };
  const handle = {
    name: 'baseline.planr.md',
    kind: 'file',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile: async () => ({ name: 'baseline.planr.md', lastModified: Date.now(), text: async () => state.text }),
    createWritable: async () => ({ write: async content => { state.text = String(content); state.writes.push(state.text); }, close: async () => {} }),
  };
  return { handle, state };
}

const historyOf = text => {
  const at = text.indexOf('```planr-history');
  if (at < 0) return [];
  const body = text.slice(at).split('\n').slice(1);
  const end = body.findIndex(l => l.startsWith('```'));
  return body.slice(0, end < 0 ? body.length : end).filter(l => l && l !== 'v1' && !l.startsWith('#') && !l.startsWith('<!--'));
};

import { parseMdToProject } from '../utils/markdownParse.js';
import { planAtEndOf } from '../utils/dayLog.js';

const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// The plan with a log: Beta was called "Beta Old" until three days ago, and
// Gamma was added two days ago.
const withLog = () => PLAN.replace('  - **P1.2** Beta Task (S 5T ×1) — Dev [AN]', '  - **P1.2** Beta Task (S 5T ×1) — Dev [AN]\n  - **P1.3** Gamma Task (S 5T ×1) — Dev [AN]')
  + `\n## Log\n\n\`\`\`planr-log\nv1\n`
  + JSON.stringify({ day: day(3), back: { tree: { set: { 'P1.2': { name: 'Beta Old' } } } } }) + '\n'
  + JSON.stringify({ day: day(2), back: { tree: { del: ['P1.3'] } } }) + '\n```\n';

const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
const goTo = async d => {
  fireEvent.click(screen.getByTestId('effective-switch'));
  fireEvent.change(screen.getByTestId('effective-date-input'), { target: { value: d } });
  await act(async () => { fireEvent.click(screen.getByTestId('effective-date-ok')); });
};
const written = async (state, n = 1) => waitFor(() => expect(state.writes.length).toBeGreaterThanOrEqual(n), { timeout: 15000, interval: 200 });

describe('an earlier day', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); localStorage.setItem('planr_tab', 'tree'); localStorage.setItem('planr_tree_ids', 'true'); localStorage.setItem('planr_editor_dock', 'dialog'); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('the patch shape the fixture uses is the one the app writes', () => {
    // Guards the fixture above: if the patch format changes, this says so
    // before the other tests fail for a reason that is not theirs.
    const real = parseMdToProject(withLog());
    expect(real.dayLog.map(e => e.day)).toEqual([day(3), day(2)]);
    expect(planAtEndOf(real, day(5)).tree.map(n => n.name)).toEqual(['Project', 'Alpha Task', 'Beta Old']);
  });

  it('shows the whole plan as it stood, says so, and comes back unchanged', async () => {
    const { handle, state } = hostFile(withLog());
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    await goTo(day(5));
    await waitFor(() => expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Old']));
    expect(screen.getByTestId('effective-bar').getAttribute('data-travel')).toBe('true');
    expect(screen.queryByTestId('scenario-switch')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('effective-leave')); });
    await waitFor(() => expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Task', 'Gamma Task']));
    expect(screen.queryByTestId('effective-bar')).toBeNull();
    // Looking is not editing: nothing of the earlier day reaches the file.
    await new Promise(r => setTimeout(r, 300));
    for (const text of state.writes) { expect(text).toContain('Beta Task'); expect(text).not.toContain('Beta Old'); expect(text).toContain('Gamma Task'); }
  }, 30000);

  it('an edit there counts from that day: in the file it is in today\'s plan and in every day since', async () => {
    const { handle, state } = hostFile(withLog());
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    await goTo(day(5));
    await waitFor(() => expect(names()).toContain('Beta Old'));
    // Status of Alpha, on that day.
    fireEvent.click(screen.getByText('Alpha Task').closest('tr'));
    fireEvent.click(screen.getByTestId('tv-edit-selected'));
    await screen.findByTestId('node-modal');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    fireEvent.click(screen.getByTestId('nm-save'));
    await written(state);
    await waitFor(() => expect(historyOf(state.text).some(l => l.split(' ')[1] === 'P1.1')).toBe(true), { timeout: 15000, interval: 200 });
    const text = state.text;
    // The file holds today's plan, never the screen.
    expect(text).toContain('Beta Task');
    expect(text).not.toMatch(/\*\*P1\.2\*\* Beta Old/);
    expect(text).toContain('Gamma Task');
    expect(text).toMatch(/P1\.1\*\* Alpha Task[^\n]*60%/);
    const own = historyOf(text).filter(l => l.split(' ')[1] === 'P1.1');
    expect(own).toHaveLength(1);
    expect(own[0]).toContain(`effectiveAt=${day(5)}`);
    // And the log still reads back: Beta was old then, Gamma not there yet.
    const real = parseMdToProject(text);
    expect(planAtEndOf(real, day(5)).tree.map(n => n.name)).toEqual(['Project', 'Alpha Task', 'Beta Old']);
    // The screen is still the earlier day, with the edit in it.
    expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Old']);
  }, 45000);

  it('an ordinary edit today leaves an entry for today, and yesterday still has the old name', async () => {
    const { handle, state } = hostFile(PLAN);
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    fireEvent.click((await screen.findByText('Beta Task', {}, { timeout: 10000 })).closest('tr'));
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await written(state);
    const real = parseMdToProject(state.text);
    expect(real.dayLog.map(e => e.day)).toEqual([day(0)]);
    expect(planAtEndOf(real, day(1)).tree.map(n => n.name)).toEqual(['Project', 'Alpha Task', 'Beta Task']);
    expect(real.tree.map(n => n.name)).toEqual(['Project', 'Alpha Task']);
  }, 30000);

  it('what was changed today and not saved yet stays a change of today', async () => {
    const { handle, state } = hostFile(withLog());
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    fireEvent.click((await screen.findByText('Alpha Task', {}, { timeout: 10000 })).closest('tr'));
    fireEvent.click(screen.getByTestId('tv-edit-selected'));
    await screen.findByTestId('node-modal');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('nm-save'));
    // Straight to an earlier day, before the autosave has run, and edit there.
    await goTo(day(5));
    await waitFor(() => expect(names()).toContain('Beta Old'));
    fireEvent.click(screen.getByText('Beta Old').closest('tr'));
    fireEvent.click(screen.getByTestId('tv-edit-selected'));
    await screen.findByTestId('node-modal');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('nm-save'));
    await waitFor(() => expect(historyOf(state.text).some(l => l.split(' ')[1] === 'P1.2')).toBe(true), { timeout: 15000, interval: 200 });
    const lines = historyOf(state.text);
    const alpha = lines.filter(l => l.split(' ')[1] === 'P1.1');
    const beta = lines.filter(l => l.split(' ')[1] === 'P1.2');
    expect(alpha).toHaveLength(1);
    expect(alpha[0]).toContain('progress=40');
    expect(alpha[0]).not.toContain('effectiveAt=');
    expect(beta).toHaveLength(1);
    expect(beta[0]).toContain(`effectiveAt=${day(5)}`);
  }, 45000);
});
