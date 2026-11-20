/** @vitest-environment happy-dom */
// The seams between the document, undo, scenarios, an earlier day and the log
// writers. Each test is something a user does and what is true afterwards;
// together they pin what the parts of the app that hold these states agree on,
// so that they can be moved apart without anyone noticing a change.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import App from '../App.jsx';
import { SAVE_DEBOUNCE_MS } from '../app/useFileSync.js';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { parseMdToProject } from '../utils/markdownParse.js';

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

// A second, different plan: it has a task the first one does not.
const OTHER = PLAN.replace(
  '  - **P1.2** Beta Task (S 5T ×1) — Dev [AN]',
  '  - **P1.2** Beta Task (S 5T ×1) — Dev [AN]\n  - **P1.3** Gamma Task (S 5T ×1) — Dev [AN]',
);

// A file the host hands over: readable at once, and it keeps what is written.
// `gate`, when set, is a promise every write waits for: a slow disk.
function hostFile(initial, name = 'baseline.planr.md') {
  const state = { text: initial, writes: [], gate: null };
  const handle = {
    name,
    kind: 'file',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile: async () => ({ name, lastModified: 1000, text: async () => state.text }),
    createWritable: async () => ({
      write: async content => {
        if (state.gate) await state.gate;
        state.text = String(content);
        state.writes.push(state.text);
      },
      close: async () => {},
    }),
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
const entriesOf = (text, id) => historyOf(text).filter(l => l.split(' ')[1] === id);

const day = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// The plan with a log: Beta was called "Beta Old" until three days ago.
const withLog = () =>
  OTHER +
  `\n## Log\n\n\`\`\`planr-log\nv1\n` +
  JSON.stringify({ day: day(3), back: { tree: { set: { 'P1.2': { name: 'Beta Old' } } } } }) +
  '\n' +
  JSON.stringify({ day: day(2), back: { tree: { del: ['P1.3'] } } }) +
  '\n```\n';

const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
const advance = ms =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const renderApp = handle =>
  render(
    <I18nProvider>
      <ThemeProvider>
        <App mount={handle} onFileChange={() => {}} />
      </ThemeProvider>
    </I18nProvider>,
  );
const goTo = async d => {
  fireEvent.click(screen.getByTestId('effective-switch'));
  fireEvent.change(screen.getByTestId('effective-date-input'), { target: { value: d } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('effective-date-ok'));
  });
};
const leaveDay = () =>
  act(async () => {
    fireEvent.click(screen.getByTestId('effective-leave'));
  });
async function createScenario(name) {
  fireEvent.click(await screen.findByTestId('scenario-switch'));
  if (!screen.queryByTestId('scenario-new-input')) fireEvent.click(screen.getByTestId('scenario-new'));
  fireEvent.change(screen.getByTestId('scenario-new-input'), { target: { value: name } });
  fireEvent.keyDown(screen.getByTestId('scenario-new-input'), { key: 'Enter' });
  await screen.findByTestId('scenario-bar');
}
async function deleteTask(label) {
  fireEvent.click((await screen.findByText(label)).closest('tr'));
  fireEvent.click(screen.getByTestId('tv-delete-selected'));
  await waitFor(() => expect(names()).not.toContain(label));
}
async function setProgress(label, value) {
  fireEvent.click((await screen.findByText(label)).closest('tr'));
  fireEvent.click(screen.getByTestId('tv-edit-selected'));
  await screen.findByTestId('node-modal');
  fireEvent.change(screen.getByRole('slider'), { target: { value } });
  fireEvent.click(screen.getByTestId('nm-save'));
}
async function undoKey() {
  const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true });
  await act(async () => {
    window.dispatchEvent(e);
  });
}
// File > Open, answered with `other`; resolves once its content is on screen.
async function openFile(other, marker) {
  window.showSaveFilePicker = vi.fn();
  window.showOpenFilePicker = vi.fn(async () => [other.handle]);
  try {
    fireEvent.click(await screen.findByTestId('file-menu-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('file-menu-load'));
    });
    await screen.findByText(marker, {}, { timeout: 10000 });
  } finally {
    delete window.showSaveFilePicker;
    delete window.showOpenFilePicker;
  }
}

describe('the seams between document, undo, scenarios and earlier days', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_editor_dock', 'dialog');
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    localStorage.clear();
  });

  it('opening another file while a scenario is on screen leaves no scenario, no undo and no notice', async () => {
    const a = hostFile(PLAN);
    renderApp(a.handle);
    await screen.findByText('Beta Task', {}, { timeout: 10000 });
    await createScenario('Without Beta');
    await deleteTask('Beta Task');
    expect(screen.getByTestId('undo-btn').disabled).toBe(false);
    await openFile(hostFile(OTHER, 'other.planr.md'), 'Gamma Task');
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
    expect(screen.queryByTestId('scenario-notice')).toBeNull();
    expect(screen.getByTestId('undo-btn').disabled).toBe(true);
    // Nothing of the first plan's scenario is offered on the second.
    fireEvent.click(screen.getByTestId('scenario-switch'));
    expect(screen.queryByTestId('scenario-pick-s1')).toBeNull();
    expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Task', 'Gamma Task']);
  }, 45000);

  it('opening another file while an earlier day is on screen leaves no past view, no date and no undo', async () => {
    const a = hostFile(withLog());
    renderApp(a.handle);
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    await deleteTask('Gamma Task');
    await goTo(day(5));
    await waitFor(() => expect(names()).toContain('Beta Old'));
    await openFile(hostFile(OTHER, 'other.planr.md'), 'Beta Task');
    expect(screen.queryByTestId('effective-bar')).toBeNull();
    expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Task', 'Gamma Task']);
    expect(screen.getByTestId('undo-btn').disabled).toBe(true);
    // The date is gone too: the next pick starts from today, not from day(5).
    fireEvent.click(screen.getByTestId('effective-switch'));
    expect(screen.getByTestId('effective-date-input').value).toBe('');
  }, 45000);

  it('a notice about an applied scenario does not follow the user into another file', async () => {
    const a = hostFile(PLAN);
    renderApp(a.handle);
    await screen.findByText('Beta Task', {}, { timeout: 10000 });
    await createScenario('Without Beta');
    await deleteTask('Beta Task');
    fireEvent.click(screen.getByTestId('scenario-apply'));
    await screen.findByTestId('scenario-notice');
    await openFile(hostFile(OTHER, 'other.planr.md'), 'Gamma Task');
    expect(screen.queryByTestId('scenario-notice')).toBeNull();
  }, 45000);

  it('after opening a second file and changing one task, the history holds that change and not the whole plan', async () => {
    const a = hostFile(PLAN);
    renderApp(a.handle);
    await deleteTask('Beta Task');
    const b = hostFile(OTHER, 'other.planr.md');
    await openFile(b, 'Gamma Task');
    await setProgress('Alpha Task', '60');
    await advance(SAVE_DEBOUNCE_MS + 500);
    await waitFor(() => expect(b.state.writes.length).toBeGreaterThan(0));
    const lines = historyOf(b.state.text);
    expect(lines.filter(l => l.includes('kind=added'))).toEqual([]);
    expect(lines.filter(l => l.includes('kind=removed'))).toEqual([]);
    // The project's own status follows its task; nothing else is recorded.
    expect(lines.map(l => l.split(' ')[1])).toEqual(['P1', 'P1.1']);
    expect(b.state.text).toMatch(/P1\.1\*\* Alpha Task[^\n]*60%/);
  }, 45000);

  it('leaving an earlier day while its save is still being written records the save once, in the real plan', async () => {
    const a = hostFile(withLog());
    renderApp(a.handle);
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    await goTo(day(5));
    await waitFor(() => expect(names()).toContain('Beta Old'));
    await setProgress('Alpha Task', '60');
    // The disk is slow: the save starts and cannot finish.
    let release;
    a.state.gate = new Promise(r => (release = r));
    await advance(SAVE_DEBOUNCE_MS + 500);
    expect(a.state.writes).toHaveLength(0);
    await leaveDay();
    await waitFor(() => expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Task', 'Gamma Task']));
    a.state.gate = null;
    release();
    await waitFor(() => expect(a.state.writes.length).toBeGreaterThan(0));
    await advance(SAVE_DEBOUNCE_MS * 6);
    const settled = a.state.text;
    const own = entriesOf(a.state.text, 'P1.1');
    expect(own).toHaveLength(1);
    expect(own[0]).toContain(`effectiveAt=${day(5)}`);
    // Nothing is left over for a next save to write again.
    await advance(SAVE_DEBOUNCE_MS * 3);
    // A later write may still land, but it adds nothing to the file.
    expect(a.state.text).toBe(settled);
    expect(entriesOf(a.state.text, 'P1.1')).toHaveLength(1);
    expect(parseMdToProject(a.state.text).tree.find(n => n.id === 'P1.1').progress).toBe(60);
  }, 60000);

  it('after an edit, a scenario that was applied no longer has a notice, and one undo takes back the edit and not the apply', async () => {
    const a = hostFile(PLAN);
    renderApp(a.handle);
    await screen.findByText('Beta Task', {}, { timeout: 10000 });
    await createScenario('Without Beta');
    await deleteTask('Beta Task');
    fireEvent.click(screen.getByTestId('scenario-apply'));
    await screen.findByTestId('scenario-notice');
    // Edits closer together than the undo coalescing window count as one step.
    await advance(1000);
    await deleteTask('Alpha Task');
    expect(screen.queryByTestId('scenario-notice')).toBeNull();
    await undoKey();
    await screen.findByText('Alpha Task');
    expect(names()).toEqual(['Project', 'Alpha Task']);
    expect(screen.queryByTestId('scenario-bar')).toBeNull();
  }, 45000);

  it('after an edit on an earlier day, back in today the old undo stack is gone', async () => {
    const a = hostFile(withLog());
    renderApp(a.handle);
    await deleteTask('Gamma Task');
    expect(screen.getByTestId('undo-btn').disabled).toBe(false);
    await goTo(day(5));
    await waitFor(() => expect(names()).toContain('Beta Old'));
    await setProgress('Alpha Task', '60');
    await leaveDay();
    await waitFor(() => expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Task']));
    expect(screen.getByTestId('undo-btn').disabled).toBe(true);
    await undoKey();
    expect(names()).toEqual(['Project', 'Alpha Task', 'Beta Task']);
  }, 45000);

  it('a scenario stays when an earlier day is picked: no past view opens, and an earlier day offers no scenarios', async () => {
    const a = hostFile(withLog());
    renderApp(a.handle);
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    await createScenario('What if');
    await goTo(day(5));
    expect(screen.getByTestId('scenario-bar')).toBeTruthy();
    expect(screen.getByTestId('effective-bar').getAttribute('data-travel')).not.toBe('true');
    // Picking a day outside the past view sends the user to the Resources tab.
    expect(screen.getByRole('tab', { name: /Resources/ }).getAttribute('aria-selected')).toBe('true');
    // The other way round: on an earlier day there is no way to start a scenario.
    fireEvent.click(screen.getByTestId('scenario-leave'));
    // The date picked inside the scenario is still set; clear it, then go back.
    await leaveDay();
    fireEvent.click(screen.getByRole('tab', { name: /Tree/ }));
    await goTo(day(5));
    await waitFor(() => expect(names()).toContain('Beta Old'));
    expect(screen.getByTestId('effective-bar').getAttribute('data-travel')).toBe('true');
    expect(screen.queryByTestId('scenario-switch')).toBeNull();
  }, 45000);
});
