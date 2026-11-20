/** @vitest-environment happy-dom */
// A status change entered for an earlier day lands in the log on that day,
// once, together with what it does to the packages above it.
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
    createWritable: async () => ({
      write: async content => {
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

const day = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('a dated status change', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_editor_dock', 'dialog');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('is written once, on its day, and takes the package above it along', async () => {
    const { handle, state } = hostFile(PLAN);
    render(
      <I18nProvider>
        <ThemeProvider>
          <App mount={handle} onFileChange={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );
    fireEvent.click((await screen.findByText('Alpha Task', {}, { timeout: 10000 })).closest('tr'));
    fireEvent.click(screen.getByTestId('tv-edit-selected'));
    await screen.findByTestId('node-modal');
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('nm-as-of'), { target: { value: day(6) } });
    fireEvent.click(screen.getByTestId('nm-save'));
    await waitFor(() => expect(state.writes.length).toBeGreaterThan(0), { timeout: 15000, interval: 200 });
    const lines = historyOf(state.text);
    const own = lines.filter(l => l.split(' ')[1] === 'P1.1');
    expect(own).toHaveLength(1);
    expect(own[0]).toContain('status=wip');
    expect(own[0]).toContain('progress=60');
    expect(own[0]).toContain(`effectiveAt=${day(6)}`);
    // Nothing in this save counts for today: the package's derived status
    // follows the item's day.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter(l => !l.includes(`effectiveAt=${day(6)}`))).toEqual([]);
    // The item itself carries the new state.
    expect(state.text).toMatch(/P1\.1\*\* Alpha Task[^\n]*60%/);
  }, 30000);

  const open = async () => {
    const { handle, state } = hostFile(PLAN);
    render(
      <I18nProvider>
        <ThemeProvider>
          <App mount={handle} onFileChange={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );
    fireEvent.click((await screen.findByText('Alpha Task', {}, { timeout: 10000 })).closest('tr'));
    fireEvent.click(screen.getByTestId('tv-edit-selected'));
    await screen.findByTestId('node-modal');
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    return state;
  };
  const written = async (state, n = 1) =>
    waitFor(() => expect(state.writes.length).toBeGreaterThanOrEqual(n), { timeout: 15000, interval: 200 });

  it('undo takes back the change and its date: the log says nothing happened', async () => {
    const state = await open();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('nm-as-of'), { target: { value: day(6) } });
    fireEvent.click(screen.getByTestId('nm-save'));
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: true });
    });
    // Something else, so that a save happens at all.
    fireEvent.click((await screen.findByText('Beta Task')).closest('tr'));
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await written(state);
    const lines = historyOf(state.text);
    expect(lines.filter(l => l.split(' ')[1] === 'P1.1')).toEqual([]);
    expect(lines.filter(l => l.includes('effectiveAt='))).toEqual([]);
    expect(state.text).not.toContain('asOfPending');
  }, 30000);

  it('the keyboard save carries the date too, and the next change counts for today again', async () => {
    const state = await open();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('nm-as-of'), { target: { value: day(4) } });
    fireEvent.keyDown(document, { key: 'Enter', metaKey: true });
    await written(state);
    await waitFor(() => expect(historyOf(state.text).filter(l => l.split(' ')[1] === 'P1.1')).toHaveLength(1), {
      timeout: 15000,
      interval: 200,
    });
    expect(historyOf(state.text).find(l => l.split(' ')[1] === 'P1.1')).toContain(`effectiveAt=${day(4)}`);
    const before = state.writes.length;

    // The row is still the selected one.
    await waitFor(() => expect(screen.queryByTestId('node-modal')).toBeNull());
    fireEvent.click(screen.getByTestId('tv-edit-selected'));
    await screen.findByTestId('node-modal');
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('nm-save'));
    await waitFor(() => expect(historyOf(state.text).filter(l => l.split(' ')[1] === 'P1.1')).toHaveLength(2), {
      timeout: 15000,
      interval: 200,
    });
    expect(state.writes.length).toBeGreaterThan(before);
    const second = historyOf(state.text).filter(l => l.split(' ')[1] === 'P1.1')[1];
    expect(second).toContain('progress=70');
    expect(second).not.toContain('effectiveAt=');
  }, 45000);
});
