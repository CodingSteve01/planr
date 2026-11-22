/** @vitest-environment happy-dom */
// A plan whose last autosave is still pending in the snapshot ring when
// another file replaces it through the plain file input (loadFile, a load path
// that never flushed by hand) must still reach the ring.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import App from '../App.jsx';
import { SAVE_DEBOUNCE_MS } from '../app/useFileSync.js';
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
const OTHER = PLAN.replace('Alpha Task', 'Gamma Task');

function hostFile(initial, name = 'baseline.planr.md') {
  const state = { text: initial, writes: [] };
  const handle = {
    name,
    kind: 'file',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile: async () => ({ name, lastModified: 1000, text: async () => state.text }),
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

const advance = ms =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
async function setProgress(label, value) {
  const rowOf = () => screen.queryAllByTestId('tree-row-name').find(n => n.textContent.trim() === label);
  await waitFor(() => expect(rowOf()).toBeTruthy());
  fireEvent.click(rowOf().closest('tr'));
  fireEvent.click(screen.getByTestId('tv-edit-selected'));
  await screen.findByTestId('node-modal');
  fireEvent.change(screen.getByRole('slider'), { target: { value } });
  fireEvent.click(screen.getByTestId('nm-save'));
}

describe('the snapshot ring and a document change', () => {
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

  it('writes the pending state of the old plan when another file is opened through the file input', async () => {
    const a = hostFile(PLAN);
    render(
      <I18nProvider>
        <ThemeProvider>
          <App mount={a.handle} onFileChange={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );
    await setProgress('Alpha Task', '30');
    await advance(SAVE_DEBOUNCE_MS + 500);
    await waitFor(() => expect(a.state.writes.length).toBeGreaterThan(0));
    await setProgress('Alpha Task', '70'); // saved inside the window: pending
    await advance(SAVE_DEBOUNCE_MS + 500);
    await waitFor(() => expect(a.state.writes.length).toBeGreaterThan(1));
    const before = JSON.parse(localStorage.getItem('planr_v2_snapshots') || '[]');
    expect(before.some(s => JSON.stringify(s.data).includes('"progress":70'))).toBe(false);

    const input = document.querySelector('input[type="file"]');
    const file = new File([OTHER], 'other.planr.md', { type: 'text/markdown' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    const after = JSON.parse(localStorage.getItem('planr_v2_snapshots') || '[]');
    expect(after.some(s => JSON.stringify(s.data).includes('"progress":70'))).toBe(true);
  }, 45000);
});
