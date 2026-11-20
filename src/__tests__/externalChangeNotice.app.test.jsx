/** @vitest-environment happy-dom */
// The notice that the file changed on disk must stay reachable. It used to
// sit inside the header group that is cut off first when the bar gets narrow,
// so in a narrow pane the reload button was not there to click.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { parseMdToProject } from '../utils/markdownParse.js';
import { planAtEndOf } from '../utils/dayLog.js';

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


// `onDisk`: a write lands in the file, as it does on a real disk. Off where a
// test plays the outside writer itself and must not be overwritten.
function changingFile(initial, { onDisk = false } = {}) {
  const state = { text: initial, mod: 1000, reads: 0 };
  const handle = {
    name: 'baseline.planr.md', kind: 'file',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFile: async () => { state.reads++; return { name: 'baseline.planr.md', lastModified: state.mod, text: async () => state.text }; },
    createWritable: async () => ({ write: async content => { state.out = String(content); if (onDisk) state.text = state.out; state.written = (state.written || 0) + 1; }, close: async () => {} }),
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
    // A change right after the reload is measured against what was just read.
    state.mod = 20000;
    state.text = state.text.replace('Gamma Task', 'Delta Task');
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(await screen.findByTestId('external-change', {}, { timeout: 5000 })).toBeTruthy();
  }, 45000);

  it('a file that was only touched, as a sync service does, is not a changed file', async () => {
    const { handle, state } = changingFile(PLAN, { onDisk: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    await screen.findByText('Beta Task', {}, { timeout: 10000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    // Same text, newer time: twice, as it happens on every upload.
    state.mod = 9000;
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    state.mod = 12000;
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(screen.queryByTestId('external-change')).toBeNull();
    // A real change after that is still seen.
    state.mod = 15000;
    state.text = state.text.replace('Beta Task', 'Gamma Task');
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(await screen.findByTestId('external-change', {}, { timeout: 5000 })).toBeTruthy();
  }, 45000);

  it('what changed outside is recorded as a change of the day it was picked up', async () => {
    const { handle, state } = changingFile(PLAN);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    await screen.findByText('Beta Task', {}, { timeout: 10000 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    state.mod = 9000;
    state.text = PLAN.replace('Beta Task', 'Gamma Task');
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    fireEvent.click(await screen.findByTestId('external-reload', {}, { timeout: 5000 }));
    await screen.findByText('Gamma Task', {}, { timeout: 10000 });
    vi.useRealTimers();
    // Any edit makes the next save, and the save writes today's entry.
    const before = state.written || 0;
    fireEvent.click(screen.getByText('Alpha Task').closest('tr'));
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await waitFor(() => expect(state.written || 0).toBeGreaterThan(before), { timeout: 15000, interval: 200 });
    await waitFor(() => expect(parseMdToProject(state.out).tree.map(n => n.name)).toEqual(['Project', 'Gamma Task']), { timeout: 15000, interval: 200 });
    const real = parseMdToProject(state.out);
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(real.tree.map(n => n.name)).toEqual(['Project', 'Gamma Task']);
    // A task that comes back is appended; the views sort the tree themselves.
    expect(planAtEndOf(real, yesterday).tree.map(n => n.name).sort()).toEqual(['Alpha Task', 'Beta Task', 'Project']);
  }, 45000);

  it('a file that is busy for a moment is saved a moment later, without asking for it again', async () => {
    const { handle, state } = changingFile(PLAN, { onDisk: true });
    let busy = 0;
    const create = handle.createWritable;
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    fireEvent.click((await screen.findByText('Beta Task', {}, { timeout: 10000 })).closest('tr'));
    // From now on the first two writes find the file locked.
    handle.createWritable = async () => { if (busy++ < 2) throw new DOMException('locked', 'NoModificationAllowedError'); return create(); };
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await waitFor(() => expect(parseMdToProject(state.text).tree.map(n => n.name)).toEqual(['Project', 'Alpha Task']), { timeout: 25000, interval: 250 });
    expect(busy).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('.topbar').textContent).not.toContain('re-mount');
  }, 40000);

  it('a file that is gone says so', async () => {
    const { handle } = changingFile(PLAN, { onDisk: true });
    render(<I18nProvider><ThemeProvider><App mount={handle} onFileChange={() => {}} /></ThemeProvider></I18nProvider>);
    fireEvent.click((await screen.findByText('Beta Task', {}, { timeout: 10000 })).closest('tr'));
    handle.createWritable = async () => { throw new DOMException('gone', 'NotFoundError'); };
    fireEvent.click(screen.getByTestId('tv-delete-selected'));
    await waitFor(() => expect(document.querySelector('.topbar').textContent).toContain('re-mount'), { timeout: 20000, interval: 250 });
  }, 30000);
});
