/** @vitest-environment happy-dom */
// Integration test for Phase 1 (Undo/Redo): a real user mutation, performed
// through the actual UI (TreeView's selection action bar — the delete button
// that no longer asks for confirmation, since ⌘Z now covers that), must be
// reversible with ⌘Z and re-appliable with ⇧⌘Z — and ⌘Z must NOT fire while
// focus sits in a text field, where native browser undo should win instead.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
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

function seedProject() {
  const project = {
    tree: [
      { id: 'P1', name: 'Alpha Task', team: 'T1', best: 5, factor: 1.5, status: 'open', assign: [], deps: [] },
      { id: 'P2', name: 'Beta Task', team: 'T1', best: 5, factor: 1.5, status: 'open', assign: [], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [],
    meetingPlans: [],
    meta: { name: 'Undo Test', planStart: '2026-01-01', planEnd: '2027-01-01' },
  };
  try { localStorage.setItem('planr_v2', JSON.stringify(project)); } catch { /* ignore */ }
}

async function dispatchUndo(target) {
  const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true });
  await act(async () => { (target || window).dispatchEvent(e); });
}

async function dispatchRedo(target) {
  const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
  await act(async () => { (target || window).dispatchEvent(e); });
}

async function goToTreeTab() {
  const tab = await screen.findByText('Work Tree');
  fireEvent.mouseDown(tab, { button: 0 });
}

describe('Undo/redo integration', () => {
  beforeEach(() => {
    cleanup();
    try { localStorage.clear(); localStorage.setItem('planr_lang', 'en'); } catch { /* ignore */ }
    seedProject();
  });
  afterEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('undoes a real UI mutation (delete, confirm-free) with ⌘Z and redoes it with ⇧⌘Z', async () => {
    renderApp();
    await goToTreeTab();

    // Select the row — a plain click, no modifiers.
    const betaLabel = await screen.findByText('Beta Task');
    fireEvent.click(betaLabel.closest('tr'));

    // The selection action bar's delete button no longer confirms (Phase 1
    // subtracted that prompt — undo makes it redundant). Clicking it deletes
    // immediately.
    const deleteBtn = screen.getByText('× Delete');
    fireEvent.click(deleteBtn);
    expect(screen.queryByText('Beta Task')).toBeNull();

    // ⌘Z restores it.
    await dispatchUndo();
    expect(await screen.findByText('Beta Task')).toBeTruthy();

    // ⇧⌘Z re-applies the delete.
    await dispatchRedo();
    await waitFor(() => expect(screen.queryByText('Beta Task')).toBeNull());

    // Undo again so the tree is back to its seeded state for clarity.
    await dispatchUndo();
    expect(await screen.findByText('Beta Task')).toBeTruthy();
  });

  it('does not undo while focus is inside a text input', async () => {
    renderApp();
    await goToTreeTab();

    const betaLabel = await screen.findByText('Beta Task');
    fireEvent.click(betaLabel.closest('tr'));
    fireEvent.click(screen.getByText('× Delete'));
    expect(screen.queryByText('Beta Task')).toBeNull();

    // Focus a real text input (the tree/gantt/network search box) and fire
    // the same ⌘Z chord — native text-field undo should win, ours must stay
    // out of the way entirely.
    const search = screen.getByPlaceholderText(/Search/);
    search.focus();
    expect(document.activeElement).toBe(search);
    await dispatchUndo(search);

    // Still deleted — our undo did not fire while the search box had focus.
    expect(screen.queryByText('Beta Task')).toBeNull();

    // Blur and retry — now it should undo normally.
    search.blur();
    await dispatchUndo();
    expect(await screen.findByText('Beta Task')).toBeTruthy();
  });
});
