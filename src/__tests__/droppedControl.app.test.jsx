/** @vitest-environment happy-dom */
// Dropping a task needs a control, not only a keystroke.
//
// Reported: "I don't think I can set the status to rejected yet." Correct —
// `dropped` could be set exactly one way, by pressing `0` on the cursor row
// in the tree. It was in the keyboard map and nowhere else: not in the item
// dialog, not in the quick editor, not on any button. A field with no visible
// affordance is a field most people never find, which is the same bug the
// tree's own toolbar was built to fix.
//
// It also belongs on more than a leaf. The status picker beside it is leaf-
// only because a package derives its status from its children; dropping is a
// decision you take about a whole package, and it carries to everything
// under it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const seed = () => {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'de');
  localStorage.setItem('planr_tab', 'tree');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt Alpha', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'Alpha eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'B', name: 'Projekt Beta', status: 'open', team: 'T1' },
      { id: 'B.1', name: 'Beta eins', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Drop', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
};

const stored = () => JSON.parse(localStorage.getItem('planr_v2') || '{}');
// The dialog commits on Save, like every other field in it.
const save = async () => {
  await act(async () => { fireEvent.click(screen.getByTestId('nm-save')); });
};
const nodeById = id => (stored().tree || []).find(n => n.id === id);

const openDialogFor = async name => {
  render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
  const row = await waitFor(() => {
    const el = screen.getByText(name).closest('tr');
    if (!el) throw new Error('row not rendered');
    return el;
  });
  await act(async () => { fireEvent.click(row); });
  // `E` is handled on the tree's own focusable surface, not on window.
  const surface = document.querySelector('[data-testid="tree-editor-surface"]');
  await act(async () => { fireEvent.keyDown(surface, { key: 'e' }); });
  // Dropping sits on the workflow tab, beside the status it does not replace.
  await waitFor(() => {
    if (!document.querySelector('[data-testid="nm-tab-workflow"]')) throw new Error('dialog did not open');
  });
  await act(async () => { fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 }); });
  await waitFor(() => {
    if (!document.querySelector('[data-testid="drop-toggle"]')) {
      throw new Error('no drop control in the dialog; dialog present: '
        + !!document.querySelector('.modal'));
    }
  });
};

describe('the item dialog can drop work', () => {
  beforeEach(() => { cleanup(); seed(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('offers a control for it at all', async () => {
    await openDialogFor('Alpha eins');
    expect(screen.getByTestId('drop-toggle')).toBeTruthy();
  });

  it('drops the task, and takes it back', async () => {
    await openDialogFor('Alpha eins');
    await act(async () => { fireEvent.click(screen.getByTestId('drop-toggle')); });
    await save();
    await waitFor(() => { if (!nodeById('A.1')?.dropped) throw new Error('not dropped'); });

    cleanup();
    await openDialogFor('Alpha eins');
    await act(async () => { fireEvent.click(screen.getByTestId('drop-toggle')); });
    await save();
    await waitFor(() => { if (nodeById('A.1')?.dropped) throw new Error('still dropped'); });
  });

  it('keeps the status the task had, so taking it back restores it', async () => {
    // The whole reason `dropped` is a field and not a fourth status.
    await openDialogFor('Alpha eins');
    const before = nodeById('A.1').status;
    await act(async () => { fireEvent.click(screen.getByTestId('drop-toggle')); });
    await save();
    await waitFor(() => { if (!nodeById('A.1')?.dropped) throw new Error('not dropped'); });
    expect(nodeById('A.1').status).toBe(before);
  });

  it('is offered on a package too, not only on a leaf', async () => {
    // Dropping is a decision about a whole package; the status picker beside
    // it is leaf-only because a package derives its status from its children.
    await openDialogFor('Projekt Beta');
    await act(async () => { fireEvent.click(screen.getByTestId('drop-toggle')); });
    await save();
    await waitFor(() => { if (!nodeById('B')?.dropped) throw new Error('package not dropped'); });
  });
});
