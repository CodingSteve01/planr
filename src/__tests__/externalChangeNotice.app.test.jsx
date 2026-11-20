/** @vitest-environment happy-dom */
// The notice that the file changed on disk must stay reachable. It used to
// sit inside the header group that is cut off first when the bar gets narrow,
// so in a narrow pane the reload button was not there to click.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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


function changingFile(initial) {
  const state = { text: initial, mod: 1000, reads: 0 };
  const handle = {
    name: 'baseline.planr.md', kind: 'file',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFile: async () => { state.reads++; return { name: 'baseline.planr.md', lastModified: state.mod, text: async () => state.text }; },
    createWritable: async () => ({ write: async () => {}, close: async () => {} }),
  };
  return { handle, state };
}

describe('the file-changed notice in the header', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); localStorage.setItem('planr_tab', 'tree'); });
  afterEach(() => { vi.useRealTimers(); cleanup(); localStorage.clear(); });

  it('sits outside the group that gets cut off, and reloads', async () => {
    const { handle, state } = changingFile(PLAN);
    // The poll runs every five seconds; the clock is driven by hand so the
    // test does not depend on how fast the machine is.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    await screen.findByText('Beta Task', {}, { timeout: 10000 });
    // One poll sees the file as it is, then it changes on disk.
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    state.mod = 9000;
    state.text = PLAN.replace('Beta Task', 'Gamma Task');
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    const notice = await screen.findByTestId('external-change', {}, { timeout: 5000 });
    expect(notice.closest('.topbar-file')).toBeNull();
    expect(notice.closest('.topbar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('external-reload'));
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    await waitFor(() => expect(screen.queryByTestId('external-change')).toBeNull());
  }, 45000);
});
