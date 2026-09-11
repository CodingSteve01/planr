/** @vitest-environment happy-dom */
// The seam the other tests leave open.
//
// `treeEditor.test.jsx` mounts TreeView with spies: it proves the view calls
// `onTaskUpdate({id, name})` when you type a name and press Enter. What it
// cannot prove is that App's side of that wire — `onGanttTaskUpdate` →
// `updateNode` → `mutate` → `setData` — actually lands the change in the plan.
//
// That gap is not academic. Trying to confirm the rename by hand in a real
// browser failed three times in a row for three different reasons (an
// automation tool delivering empty key events, a synthetic `input` event that
// never reaches React's onChange, a click that blurred the editor before the
// keystrokes arrived), which is exactly the situation where a plausible story
// about why it "must work" is worth nothing. So: drive the real App, read the
// real tree back, and let the assertion decide.
//
// Everything here goes through the keyboard, because that is the path this
// phase exists for.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
      { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Tree editor', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

function renderApp() {
  return render(
    <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
  );
}

// The plan as the user sees it: read back off the rendered grid.
//
// Reading localStorage instead looks more authoritative and is in fact worse
// here — the autosave mirror is effect-driven and had not run yet inside a
// test's window, so every assertion "failed" while the app was behaving
// correctly. The rendered row IS the app's answer; the mirror is a copy of it.
function planTree() {
  return [...document.querySelectorAll('tr')]
    .map(row => ({
      id: row.children[0]?.textContent.trim().replace(/^⋮⋮/, ''),
      row,
    }))
    .filter(entry => /^[A-Za-z]+\d[\d.]*$/.test(entry.id || ''))
    .map(entry => ({
      id: entry.id,
      // The name cell also carries chips (team, assignee, badges); the name is
      // the text of its own span, so take the first non-numeric text run.
      name: (entry.row.querySelector('[data-testid="tree-row-name"]')
        || entry.row.children[1])?.textContent.trim() || '',
      prio: entry.row.getAttribute('data-prio'),
      team: entry.row.getAttribute('data-team'),
      status: entry.row.getAttribute('data-status'),
    }));
}
const nodeById = id => planTree().find(n => n.id === id);
const nameOf = id => nodeById(id)?.name || '';
const hasName = text => planTree().some(n => n.name.includes(text));

const grid = () => document.querySelector('[data-testid="tree-editor-surface"]');

async function press(target, key, opts = {}) {
  await act(async () => {
    fireEvent.keyDown(target, { key, bubbles: true, ...opts });
  });
}

// Enter commits and opens the NEXT row; Escape backs out of that empty one.
// Both are needed before reading names off the grid, because a row being
// edited renders an <input>, not its name.
async function commitAndClose(input) {
  await press(input, 'Enter');
  const trailing = document.querySelector('tr input[data-testid^="tree-name-input-"]');
  if (trailing) await press(trailing, 'Escape');
}

async function selectRow(id) {
  const cell = await screen.findByText(id);
  await act(async () => { fireEvent.click(cell.closest('tr')); });
}

describe('the tree editor writes through to the plan', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_mode', 'build');   // the Work Tree lives in Build
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('renames an existing row: Enter, type, Enter — and the plan really changed', async () => {
    renderApp();
    await selectRow('P1.1');

    await press(grid(), 'Enter');
    const input = screen.getByTestId('tree-name-input-P1.1');
    expect(input.value).toBe('Prices');

    await act(async () => { fireEvent.change(input, { target: { value: 'Prices and conditions' } }); });
    await press(input, 'Enter');

    await waitFor(() => expect(nameOf('P1.1')).toContain('Prices and conditions'));
  });

  it('types a list: each Enter commits the name and opens the next row', async () => {
    renderApp();
    await selectRow('P1.2');

    await press(grid(), 'Enter');
    let input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks UI' } }); });
    await press(input, 'Enter');

    // Three more rows, typed without touching the mouse — the workflow this
    // phase exists for.
    for (const name of ['Evaluate animal data', 'Extend cancellations', 'Datev export']) {
      const open = document.querySelector('tr input[data-testid^="tree-name-input-"]');
      expect(open, `no editor open before typing "${name}"`).toBeTruthy();
      await act(async () => { fireEvent.change(open, { target: { value: name } }); });
      await press(open, 'Enter');
    }
    // Back out of the trailing empty row rather than leaving it behind.
    const trailing = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    if (trailing) await press(trailing, 'Escape');

    await waitFor(() => {
      ['Masks UI', 'Evaluate animal data', 'Extend cancellations', 'Datev export']
        .forEach(name => expect(hasName(name), `"${name}" not in the tree`).toBe(true));
    });
  });

  it('⇧Enter adds a child under the active row, in the plan', async () => {
    renderApp();
    await selectRow('P1.2');

    await press(grid(), 'Enter');
    const input = screen.getByTestId('tree-name-input-P1.2');
    await press(input, 'Enter', { shiftKey: true });

    const child = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    await act(async () => { fireEvent.change(child, { target: { value: 'Sub task' } }); });
    await press(child, 'Enter');
    const open = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    if (open) await press(open, 'Escape');

    await waitFor(() => {
      const created = planTree().find(n => n.name.includes('Sub task'));
      expect(created, 'child row not created').toBeTruthy();
      expect(created.id.startsWith('P1.2.')).toBe(true);
    });
  });

  it('a field shortcut on a multi-selection writes every row, and ⌘Z takes back all of them at once', async () => {
    renderApp();
    await selectRow('P1.1');
    await press(grid(), 'ArrowDown', { shiftKey: true });   // extend to P1.2

    // Priority is not rendered as text, so watch the undo button instead: it
    // is disabled until something is written, and one keypress on two rows
    // must leave exactly one entry on the stack.
    const undoBtn = () => [...document.querySelectorAll('.topbar button')]
      .find(b => b.textContent.trim() === '↶');
    expect(undoBtn().disabled).toBe(true);

    await press(grid(), '1');
    await waitFor(() => expect(undoBtn().disabled).toBe(false));

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });
    await waitFor(() => expect(undoBtn().disabled).toBe(true));
  });

  it('Tab re-parents in the plan, and dependency references survive it', async () => {
    renderApp();
    await selectRow('P1.2');

    await press(grid(), 'Tab');

    // P1.2 became a child of P1.1, so its id moved under it.
    await waitFor(() => {
      const moved = planTree().find(n => n.name.includes('Masks'));
      expect(moved, 'the moved row vanished').toBeTruthy();
      expect(moved.id.startsWith('P1.1.'), `id is ${moved.id}`).toBe(true);
    });
  });

  it('deleting "P1" leaves "P10" alone', async () => {
    // `startsWith(id)` is not a subtree test. With ten or more root items the
    // old one-liner deleted P10, P11, … along with P1 — invisible while
    // deleting meant a mouse trip behind a confirm, one keystroke away now.
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'P1', name: 'First', status: 'open', team: 'T1', best: 1, factor: 1 },
        { id: 'P10', name: 'Tenth', status: 'open', team: 'T1', best: 1, factor: 1 },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Prefix', planStart: '2026-01-01', planEnd: '2027-01-01' },
    }));
    renderApp();
    await selectRow('P1');

    await press(grid(), 'Delete');

    await waitFor(() => expect(hasName('First')).toBe(false));
    expect(hasName('Tenth'), 'P10 was deleted along with P1').toBe(true);
  });

  // ── The mouse path ──────────────────────────────────────────────────────
  // Every move above had a keyboard trigger and no visible affordance, so a
  // mouse user clicked a row and saw nothing happen. These assert the twin
  // gestures, through the real App, for the same reason as everything else
  // here: the view calling a callback is not the same as the plan changing.

  it('clicking the name of the already-selected row opens the editor', async () => {
    renderApp();
    await selectRow('P1.1');                        // first click selects

    const nameSpan = [...document.querySelectorAll('[data-testid="tree-row-name"]')]
      .find(el => el.textContent.trim() === 'Prices');
    expect(nameSpan, 'name span not found').toBeTruthy();
    await act(async () => { fireEvent.click(nameSpan); });   // second click renames

    const input = screen.getByTestId('tree-name-input-P1.1');
    expect(input.value).toBe('Prices');
    await act(async () => { fireEvent.change(input, { target: { value: 'Prices by mouse' } }); });
    await press(input, 'Enter');

    await waitFor(() => expect(hasName('Prices by mouse')).toBe(true));
  });

  it('the row ✎ button opens the editor on a row that was not selected', async () => {
    renderApp();
    // The app paints a "restoring project context" screen first — wait for
    // the row itself, not just for render() to return.
    const btn = await screen.findByTestId('tree-row-rename-P1.2');
    await act(async () => { fireEvent.click(btn); });

    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks reworked' } }); });
    await press(input, 'Enter');

    await waitFor(() => expect(hasName('Masks reworked')).toBe(true));
  });

  it('the row + button creates a sibling that is ready to type into', async () => {
    renderApp();
    // The app paints a "restoring project context" screen first — wait for
    // the row itself, not just for render() to return.
    const btn = await screen.findByTestId('tree-row-add-sibling-P1.1');
    await act(async () => { fireEvent.click(btn); });

    const input = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    expect(input, 'no editor opened for the new row').toBeTruthy();
    expect(input.value, 'the new row should be empty, not a placeholder name').toBe('');
    await act(async () => { fireEvent.change(input, { target: { value: 'Added with the mouse' } }); });
    await press(input, 'Enter');
    const trailing = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    if (trailing) await press(trailing, 'Escape');

    await waitFor(() => {
      const created = planTree().find(n => n.name.includes('Added with the mouse'));
      expect(created, 'the row was not created').toBeTruthy();
      expect(created.id.startsWith('P1.'), `${created.id} should be a sibling of P1.1`).toBe(true);
    });
  });

  it('the row ↳ button creates a child that is ready to type into', async () => {
    renderApp();
    // The app paints a "restoring project context" screen first — wait for
    // the row itself, not just for render() to return.
    const btn = await screen.findByTestId('tree-row-add-child-P1.2');
    await act(async () => { fireEvent.click(btn); });

    const input = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    expect(input, 'no editor opened for the new child').toBeTruthy();
    await act(async () => { fireEvent.change(input, { target: { value: 'Child by mouse' } }); });
    await press(input, 'Enter');
    const trailing = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    if (trailing) await press(trailing, 'Escape');

    await waitFor(() => {
      const created = planTree().find(n => n.name.includes('Child by mouse'));
      expect(created, 'the child was not created').toBeTruthy();
      expect(created.id.startsWith('P1.2.')).toBe(true);
    });
  });

  it('the contextual toolbar indents and outdents, and disables the move when it is a no-op', async () => {
    renderApp();
    await selectRow('P1.1');

    // P1.1 is the first child of P1 — nothing above it to become its parent.
    const btn = glyph => [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === glyph);
    await waitFor(() => expect(btn('⇥'), 'indent button missing').toBeTruthy());
    expect(btn('⇥').disabled, 'indent should be a no-op on the first child').toBe(true);

    await selectRow('P1.2');
    await waitFor(() => expect(btn('⇥').disabled).toBe(false));
    await act(async () => { fireEvent.click(btn('⇥')); });

    await waitFor(() => {
      const moved = planTree().find(n => n.name.includes('Masks'));
      expect(moved.id.startsWith('P1.1.'), `id is ${moved.id}`).toBe(true);
    });
  });

  it('deleting a multi-selection containing "P1" leaves "P10" alone', async () => {
    // onTreeBulkDelete carried the same `startsWith(id)` prefix bug deleteNode
    // did — and it is the path every ⌫ on a selection takes.
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'P1', name: 'First', status: 'open', team: 'T1', best: 1, factor: 1 },
        { id: 'P2', name: 'Second', status: 'open', team: 'T1', best: 1, factor: 1 },
        { id: 'P10', name: 'Tenth', status: 'open', team: 'T1', best: 1, factor: 1 },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Prefix bulk', planStart: '2026-01-01', planEnd: '2027-01-01' },
    }));
    renderApp();
    await selectRow('P1');
    await press(grid(), 'ArrowDown', { shiftKey: true });   // extend to P2

    await press(grid(), 'Delete');

    await waitFor(() => expect(hasName('First')).toBe(false));
    expect(hasName('Second'), 'P2 was in the selection and should be gone').toBe(false);
    expect(hasName('Tenth'), 'P10 was deleted along with P1').toBe(true);
  });

  // ── Inside the editor ───────────────────────────────────────────────────
  // The row editor used to accept a name and nothing else: arrows moved the
  // text caret, a digit typed a digit, Tab left the field. Naming a row and
  // giving it a priority were two separate trips.

  it('↑/↓ commit the name and carry the field to the next row', async () => {
    renderApp();
    await selectRow('P1.1');
    await press(grid(), 'Enter');

    let input = screen.getByTestId('tree-name-input-P1.1');
    await act(async () => { fireEvent.change(input, { target: { value: 'Prices reworked' } }); });
    await press(input, 'ArrowDown');

    // The name landed AND the field moved on, seeded with the next row's name.
    await waitFor(() => expect(hasName('Prices reworked')).toBe(true));
    const next = screen.getByTestId('tree-name-input-P1.2');
    expect(next.value).toBe('Masks');

    await press(next, 'ArrowUp');
    await waitFor(() => expect(screen.getByTestId('tree-name-input-P1.1').value).toBe('Prices reworked'));
  });

  it('⌥1 sets the priority without closing the editor or eating the name', async () => {
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter');

    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks urgent' } }); });
    // ⌥1 reports e.key "¡" on macOS — the handler reads e.code, so send that.
    await press(input, 'Dead', { altKey: true, code: 'Digit1' });

    // Still editing, and the name is still in the field — that is the point.
    expect(screen.getByTestId('tree-name-input-P1.2').value).toBe('Masks urgent');
    await waitFor(() => expect(nodeById('P1.2')?.prio).toBe('1'));

    await commitAndClose(screen.getByTestId('tree-name-input-P1.2'));
    await waitFor(() => expect(hasName('Masks urgent')).toBe(true));
    expect(nodeById('P1.2').prio).toBe('1');
  });

  it('the dropdowns beside the field write through, and do not close the editor', async () => {
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter');

    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks by dropdown' } }); });

    // Find-as-you-type: the field filters, Enter takes the match. With a
    // dozen teams, hunting a native dropdown by eye is the slow path.
    const prio = screen.getByTestId('tree-edit-prio');
    await act(async () => { fireEvent.focus(prio); });
    await act(async () => { fireEvent.change(prio, { target: { value: 'crit' } }); });
    await act(async () => { fireEvent.keyDown(prio, { key: 'Enter' }); });
    expect(screen.getByTestId('tree-name-input-P1.2'), 'the dropdown closed the editor').toBeTruthy();
    await waitFor(() => expect(nodeById('P1.2')?.prio).toBe('1'));

    const status = screen.getByTestId('tree-edit-status');
    await act(async () => { fireEvent.focus(status); });
    await act(async () => { fireEvent.change(status, { target: { value: 'progress' } }); });
    await act(async () => { fireEvent.keyDown(status, { key: 'Enter' }); });
    await waitFor(() => expect(nodeById('P1.2')?.status).toBe('wip'));

    await commitAndClose(screen.getByTestId('tree-name-input-P1.2'));
    await waitFor(() => expect(hasName('Masks by dropdown')).toBe(true));
  });

  it('a team is assigned from the row editor, and the typed name survives it', async () => {
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter');

    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks with team' } }); });
    const team = screen.getByTestId('tree-edit-team');
    await act(async () => { fireEvent.focus(team); });
    await act(async () => { fireEvent.change(team, { target: { value: 'Team A' } }); });
    await act(async () => { fireEvent.keyDown(team, { key: 'Enter' }); });

    await waitFor(() => expect(nodeById('P1.2')?.team).toBe('T1'));
    await commitAndClose(screen.getByTestId('tree-name-input-P1.2'));
    await waitFor(() => expect(hasName('Masks with team')).toBe(true));
    expect(nodeById('P1.2').team).toBe('T1');
  });

  it('Tab walks the row as a form, and Tab off the last field opens the next row', async () => {
    // This is what Tab means inside a field everywhere else. Re-parenting
    // moved to ⌥←/⌥→, which already reads as "move this row".
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter');

    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks tabbed' } }); });
    // The fields are in one container, in Tab order — that IS the contract.
    const fields = [...document.querySelector('.tv-edit-row').querySelectorAll('input, select')]
      .map(el => el.getAttribute('data-testid'));
    expect(fields).toEqual([
      'tree-name-input-P1.2', 'tree-edit-prio', 'tree-edit-size', 'tree-edit-status', 'tree-edit-team',
    ]);

    // Tab off the team dropdown finishes the row and opens the next one.
    await press(screen.getByTestId('tree-edit-team'), 'Tab');
    await waitFor(() => expect(hasName('Masks tabbed')).toBe(true));
    const open = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    expect(open, 'Tab off the last field should open the next row').toBeTruthy();
    expect(open.value).toBe('');
    await press(open, 'Escape');
  });

  it('⌥→ re-parents while the editor is open, keeping the name and following the new id', async () => {
    // Two writes in one keypress — the name, then moveNode's renumbering.
    // moveNode used to write a snapshot of the render closure's tree, which
    // is how the rename got eaten the first time round.
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter');

    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Masks indented' } }); });
    await press(input, 'ArrowRight', { altKey: true });

    const followed = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    expect(followed, 'the editor was orphaned by the move').toBeTruthy();
    expect(followed.value).toBe('Masks indented');

    await commitAndClose(followed);
    await waitFor(() => {
      const moved = planTree().find(n => n.name.includes('Masks indented'));
      expect(moved, 'the name was lost in the move').toBeTruthy();
      expect(moved.id.startsWith('P1.1.'), `id is ${moved.id}`).toBe(true);
    });
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  it('→ steps into a branch and ← steps back out to the parent', async () => {
    renderApp();
    await selectRow('P1');

    await press(grid(), 'ArrowRight');   // P1 is expanded → step to first child
    await waitFor(() => expect(document.querySelector('tr.sel td')?.textContent).toContain('P1.1'));

    await press(grid(), 'ArrowLeft');    // P1.1 is a leaf → step out to P1
    await waitFor(() => expect(document.querySelector('tr.sel td')?.textContent).toContain('P1'));
  });

  it('the arrow keys still navigate after the editor is closed with Escape', async () => {
    // The editor's <input> unmounts on Escape and focus falls to the body,
    // so the container's keydown handler stopped firing: Enter, Escape, and
    // then nothing moved.
    renderApp();
    await selectRow('P1.1');
    await press(grid(), 'Enter');
    expect(screen.getByTestId('tree-name-input-P1.1')).toBeTruthy();

    await press(screen.getByTestId('tree-name-input-P1.1'), 'Escape');
    await waitFor(() => expect(document.querySelector('tr input[data-testid^="tree-name-input-"]')).toBeNull());

    // Focus is back on the grid, so the cursor moves again.
    expect(document.activeElement).toBe(grid());
    await press(grid(), 'ArrowDown');
    await waitFor(() => expect(document.querySelector('tr.sel')?.textContent).toContain('P1.2'));
  });

  it('clicking another row ends edit mode and keeps what was typed', async () => {
    renderApp();
    await selectRow('P1.1');
    await press(grid(), 'Enter');
    const input = screen.getByTestId('tree-name-input-P1.1');
    await act(async () => { fireEvent.change(input, { target: { value: 'Prices, then clicked away' } }); });

    await selectRow('P1.2');

    await waitFor(() => expect(document.querySelector('tr input[data-testid^="tree-name-input-"]')).toBeNull());
    expect(hasName('Prices, then clicked away'), 'the typed name was dropped').toBe(true);
  });

  it('a brand-new row abandoned with Escape hands the cursor back to where it came from', async () => {
    renderApp();
    await selectRow('P1.2');
    await press(grid(), 'Enter', { shiftKey: true });   // ⇧Enter — new child

    const child = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    expect(child).toBeTruthy();
    await press(child, 'Escape');

    await waitFor(() => expect(document.querySelector('tr input[data-testid^="tree-name-input-"]')).toBeNull());
    // Not "nothing selected" — the row the child was created under.
    expect(document.querySelector('tr.sel')?.textContent).toContain('P1.2');
  });

  it('the arrow keys work without clicking a row first', async () => {
    // The keydown handler lives on the grid, so an unfocused grid meant the
    // shortcuts simply did nothing until you had clicked something.
    renderApp();
    await waitFor(() => expect(planTree().length).toBeGreaterThan(0));

    // The grid claims focus on mount (only from the body, never from a field
    // someone is typing in), so the very first arrow press lands.
    await waitFor(() => expect(document.activeElement).toBe(grid()));
    expect(document.querySelector('tr.sel'), 'mount must not move the cursor').toBeNull();

    await press(grid(), 'ArrowDown');
    await waitFor(() => expect(document.querySelector('tr.sel')?.textContent).toContain('P1'));
  });

  it('⌥→ subordinates a row to the one above it, the same as Tab', async () => {
    // The workflow: move the row behind the task it belongs under, then
    // press ⌥→. It is the same gesture as inside the editor, so there is no
    // "which mode am I in" to remember.
    renderApp();
    await selectRow('P1.2');

    await press(grid(), 'ArrowRight', { altKey: true });

    await waitFor(() => {
      const moved = planTree().find(n => n.name.includes('Masks'));
      expect(moved, 'the row vanished').toBeTruthy();
      expect(moved.id.startsWith('P1.1.'), `id is ${moved.id}`).toBe(true);
    });

    // ⌥← takes it back out.
    await press(grid(), 'ArrowLeft', { altKey: true });
    await waitFor(() => {
      const back = planTree().find(n => n.name.includes('Masks'));
      expect(back.id.split('.')).toHaveLength(2);
    });
  });

  it('a root moves past roots whose ids start with different letters', async () => {
    // Reported: "Paket 1" could not be moved up. Its id was P4, and the
    // reorder additionally required the same leading letters — so it could
    // pass P2 and P3 but never "Pr1". The ⤒▲▼⤓ buttons were enabled (they
    // read the visible order, correctly), the press did nothing, and there
    // was nothing on screen to explain it.
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'Pr1', name: 'Project Pr1', status: 'open', team: 'T1', best: 1, factor: 1 },
        { id: 'P4', name: 'Package One', status: 'open', team: 'T1', best: 1, factor: 1 },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Mixed roots', planStart: '2026-01-01', planEnd: '2027-01-01' },
    }));
    renderApp();
    await selectRow('P4');
    await waitFor(() => expect(planTree().map(n => n.id)).toEqual(['Pr1', 'P4']));

    await press(grid(), 'ArrowUp', { altKey: true });

    await waitFor(() => expect(planTree().map(n => n.id)).toEqual(['P4', 'Pr1']));
  });

  it('moves a root up when only some of its siblings carry a display order', async () => {
    // The reported plan, exactly: five roots that have never been reordered
    // (no displayOrder) and three that have. Two sort orders disagreed, so
    // "move P4 before Pr1" resolved to the index P4 already had.
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'B1', name: 'Project B1', status: 'open', team: 'T1', best: 1, factor: 1 },
        { id: 'Pr1', name: 'Project Pr1', status: 'open', team: 'T1', best: 1, factor: 1 },
        { id: 'P4', name: 'Package One', status: 'open', team: 'T1', best: 1, factor: 1, displayOrder: 1 },
        { id: 'P2', name: 'Project P2', status: 'open', team: 'T1', best: 1, factor: 1, displayOrder: 2 },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Mixed order', planStart: '2026-01-01', planEnd: '2027-01-01' },
    }));
    renderApp();
    await selectRow('P4');
    await waitFor(() => expect(planTree().map(n => n.id)).toEqual(['B1', 'Pr1', 'P4', 'P2']));

    await press(grid(), 'ArrowUp', { altKey: true });
    await waitFor(() => expect(planTree().map(n => n.id)).toEqual(['B1', 'P4', 'Pr1', 'P2']));

    // And again, all the way to the top — each press one visible step.
    await press(grid(), 'ArrowUp', { altKey: true });
    await waitFor(() => expect(planTree().map(n => n.id)).toEqual(['P4', 'B1', 'Pr1', 'P2']));
  });

  it('search + Enter puts the cursor on the first match, not the first row', async () => {
    // The trap: Enter fires the hand-over synchronously, but the committed
    // query has not reached the tree yet (App state, then a deferred value).
    // Jumping right away lands on the first row of the PREVIOUS result.
    renderApp();
    await waitFor(() => expect(planTree().length).toBeGreaterThan(1));

    const box = document.querySelector('input[placeholder^="Search"]');
    expect(box, 'search box not found').toBeTruthy();
    await act(async () => { fireEvent.change(box, { target: { value: 'Masks' } }); });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });

    await waitFor(() => {
      const sel = document.querySelector('tr.sel');
      expect(sel, 'nothing selected after search + Enter').toBeTruthy();
      expect(sel.textContent).toContain('Masks');
    });
    // And the keyboard is in the tree, so the arrows work straight away.
    expect(document.activeElement).toBe(grid());
  });

  it('the side panel follows an edit made in the tree, without reselecting', async () => {
    // QuickEdit keeps a local copy of the node and re-seeded it only when the
    // selected ID changed. So an edit made anywhere else — Space walking a
    // task's phases in the tree, a bulk change, an undo — left the panel
    // showing the values from whenever it was opened, until you clicked away
    // and back.
    renderApp();
    await selectRow('P1.2');

    // The Insights tab renders from QuickEdit's own copy of the node, which
    // is what went stale. (An earlier version of this test asserted on the
    // panel's text and on the status badge; both passed with the bug still
    // in — the badge reads the prop, which was never stale, and "wip"
    // appears in the status dropdown's options whatever the task's state.
    // A test that cannot fail is worse than no test.)
    const insights = () => screen.getByTestId('qe-insights').getAttribute('data-status');
    await waitFor(() => expect(insights()).toBe('open'));

    await press(grid(), ' ');

    await waitFor(() => expect(nodeById('P1.2').status).toBe('wip'));
    // Same selection the whole time — the panel must have followed.
    await waitFor(() => expect(insights()).toBe('wip'));
  });

  it('a cached row still repaints when its own data changes', async () => {
    // Rows are cached by signature so that moving the cursor does not
    // re-render every visible row — measured at 82 ms per arrow press on a
    // 300-row plan before, no measurable task after. The risk that buys is
    // the opposite failure: a row that quietly stops updating. This pins the
    // three writes that must always come through.
    renderApp();
    await selectRow('P1.2');

    await press(grid(), '1');
    await waitFor(() => expect(nodeById('P1.2').prio).toBe('1'));

    await press(grid(), ' ');
    await waitFor(() => expect(nodeById('P1.2').status).toBe('wip'));

    await press(grid(), 'Enter');
    const input = screen.getByTestId('tree-name-input-P1.2');
    await act(async () => { fireEvent.change(input, { target: { value: 'Repainted' } }); });
    await press(input, 'Enter');
    const trailing = document.querySelector('tr input[data-testid^="tree-name-input-"]');
    if (trailing) await press(trailing, 'Escape');
    await waitFor(() => expect(hasName('Repainted')).toBe(true));

    // And the neighbour that was never touched is still itself.
    expect(nameOf('P1.1')).toContain('Prices');
  });

  it('the cursor highlight moves off the old row, not just onto the new one', async () => {
    renderApp();
    await selectRow('P1.1');
    await waitFor(() => expect(document.querySelectorAll('tr.sel')).toHaveLength(1));

    await press(grid(), 'ArrowDown');

    await waitFor(() => {
      const sel = [...document.querySelectorAll('tr.sel')];
      expect(sel, 'exactly one row must be highlighted').toHaveLength(1);
      expect(sel[0].textContent).toContain('P1.2');
    });
  });

  it('⇧← collapses everything and ⇧→ expands it again', async () => {
    renderApp();
    await selectRow('P1');
    const childVisible = () => planTree().some(n => n.id === 'P1.1');
    expect(childVisible()).toBe(true);

    await press(grid(), 'ArrowLeft', { shiftKey: true });
    await waitFor(() => expect(childVisible()).toBe(false));

    await press(grid(), 'ArrowRight', { shiftKey: true });
    await waitFor(() => expect(childVisible()).toBe(true));
  });

  it('after a delete the cursor lands on the row above, not on nothing', async () => {
    renderApp();
    await selectRow('P1.2');

    await press(grid(), 'Delete');

    await waitFor(() => expect(hasName('Masks')).toBe(false));
    const sel = document.querySelector('tr.sel');
    expect(sel, 'nothing is selected after the delete').toBeTruthy();
    expect(sel.textContent).toContain('P1.1');
  });

  it('pasting a list creates the rows in the plan, nesting by indentation', async () => {
    renderApp();
    await selectRow('P1.2');

    await act(async () => {
      fireEvent.paste(grid(), {
        clipboardData: { getData: () => 'Pig invoices\n\tPO variant\n\tCancellation\nDatev mapping' },
      });
    });

    await waitFor(() => {
      ['Pig invoices', 'PO variant', 'Cancellation', 'Datev mapping']
        .forEach(name => expect(hasName(name), `"${name}" not pasted`).toBe(true));
    });
    const parent = planTree().find(n => n.name.includes('Pig invoices'));
    const child = planTree().find(n => n.name.includes('PO variant'));
    expect(child.id.startsWith(parent.id + '.'), `${child.id} under ${parent.id}`).toBe(true);
  });
});
