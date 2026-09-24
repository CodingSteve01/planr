/** @vitest-environment happy-dom */
// Asked: how do I reorder the queues quickly — as a table, the way reordering
// works in the tree?
//
// The gesture existed only on the schedule, on a Gantt bar, in a grouping you
// had to find — which is a fine place to NOTICE that something sits too early
// and a poor one to sit down and put ten things in order. That wants what the
// tree has: a dense list, a cursor, ⌥↑↓, and nothing else on the screen
// arguing for attention.
//
// Same keys as the tree deliberately. It is the same act.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'A eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'A.2', name: 'A zwei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'B', name: 'Projekt B', status: 'open', team: 'T1' },
      { id: 'B.1', name: 'B eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Queue table', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
const rowIds = () => [...document.querySelectorAll('[data-queue-row]')]
  .map(el => el.getAttribute('data-queue-row'));

// Its own view. Resources is where people, teams and holidays are
// administered; "in which order does who work" is planning, and it was filed
// under admin because that is where the person records happened to live.
async function openWorkOrder() {
  renderApp();
  await waitFor(() => { if (!tabNamed('Work order')) throw new Error('no tab'); });
  await act(async () => { fireEvent.mouseDown(tabNamed('Work order'), { button: 0 }); });
  await waitFor(() => { if (!rowIds().length) throw new Error('no rows'); });
}

const press = async (id, key, opts = {}) => {
  const row = document.querySelector(`[data-queue-row="${id}"]`);
  await act(async () => { fireEvent.keyDown(row, { key, bubbles: true, ...opts }); });
};

describe('a person\'s work order as a table', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('lists what one person has, in the order they will do it', async () => {
    await openWorkOrder();
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);
  });

  it('⌥↑ moves a task up, the same key as in the tree', async () => {
    await openWorkOrder();
    await press('B.1', 'ArrowUp', { altKey: true });
    await waitFor(() => { if (rowIds()[1] !== 'B.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.1', 'B.1', 'A.2']);
  });

  it('⌥⇧↑ takes it to the front — across the project boundary', async () => {
    await openWorkOrder();
    await press('B.1', 'ArrowUp', { altKey: true, shiftKey: true });
    await waitFor(() => { if (rowIds()[0] !== 'B.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['B.1', 'A.1', 'A.2']);
  });

  it('⌥↓ moves it back down', async () => {
    await openWorkOrder();
    await press('A.1', 'ArrowDown', { altKey: true });
    await waitFor(() => { if (rowIds()[0] !== 'A.2') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.2', 'A.1', 'B.1']);
  });

  it('says when the order is no longer the plan\'s, and gives it back', async () => {
    await openWorkOrder();
    expect(screen.queryByTestId('queue-reset-M1')).toBeNull();

    await press('B.1', 'ArrowUp', { altKey: true, shiftKey: true });
    await waitFor(() => { if (!screen.queryByTestId('queue-reset-M1')) throw new Error('no reset'); });

    await act(async () => { fireEvent.click(screen.getByTestId('queue-reset-M1')); });
    await waitFor(() => { if (rowIds()[0] !== 'A.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);
  });
});

// Reasoning given: from the queue you also want to update a task, re-estimate
// it, and so on.
//
// So the row is not a read-out with four columns. It is the tree's row: the
// same keys do the same things, because deciding the order and adjusting what
// you are ordering are the same sitting.
describe('working from the queue, not just looking at it', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const rowOf = id => document.querySelector(`[data-queue-row="${id}"]`);
  const press = async (id, key, opts = {}) => {
    await act(async () => { fireEvent.keyDown(rowOf(id), { key, bubbles: true, ...opts }); });
  };

  it('Space cycles the status, as on a tree row', async () => {
    await openWorkOrder();
    expect(rowOf('A.1').getAttribute('data-status')).toBe('open');
    await press('A.1', ' ');
    await waitFor(() => { if (rowOf('A.1').getAttribute('data-status') === 'open') throw new Error('unchanged'); });
  });

  it('1-4 sets the priority', async () => {
    await openWorkOrder();
    await press('A.2', '1');
    await waitFor(() => { if (rowOf('A.2').getAttribute('data-prio') !== '1') throw new Error('unchanged'); });
  });

  it('E opens the full editor for the row under the cursor', async () => {
    await openWorkOrder();
    await press('B.1', 'e');
    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe('B.1');
  });
});

// Reported: the rows cannot be reordered by drag and drop either.
//
// The keyboard is the fast path once you know it; dragging is how you find out
// the list can be rearranged at all. The tree has both, so this has both.
describe('dragging a row', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const rowOf = id => document.querySelector(`[data-queue-row="${id}"]`);

  // happy-dom has no DataTransfer, so carry the payload the way the handlers do.
  const dt = () => {
    const store = {};
    return { setData: (k, v) => { store[k] = String(v); }, getData: k => store[k] || '', effectAllowed: '', dropEffect: '' };
  };

  it('drops a task onto another and lands it there', async () => {
    await openWorkOrder();
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);

    const data = dt();
    await act(async () => {
      fireEvent.dragStart(rowOf('B.1'), { dataTransfer: data });
      fireEvent.dragOver(rowOf('A.1'), { dataTransfer: data });
      fireEvent.drop(rowOf('A.1'), { dataTransfer: data });
    });

    await waitFor(() => { if (rowIds()[0] !== 'B.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['B.1', 'A.1', 'A.2']);
  });

  // Reported: sorting does not feel like drag and drop. It was not — the drop
  // indicator was a box-shadow on the <tr>, and a table with
  // `border-collapse: collapse` paints no shadow on a row at all (verified in
  // Chromium: the same shadow on the cells does paint). So you dragged a row
  // and nothing ever said where it would land.
  //
  // The row carries the state as `data-drop`, and App.css paints it on the
  // cells. Both halves are checked: the attribute here, the selector below.
  it('says where the row will land while you drag', async () => {
    await openWorkOrder();
    const data = dt();
    // Separate ticks, as a real drag delivers them: dragstart has to have
    // landed in state before dragover can know what is being dragged.
    await act(async () => { fireEvent.dragStart(rowOf('B.1'), { dataTransfer: data }); });
    await act(async () => { fireEvent.dragOver(rowOf('A.1'), { dataTransfer: data }); });
    expect(rowOf('A.1').getAttribute('data-drop')).toBe('before');
    expect(rowOf('B.1').getAttribute('data-drop')).toBeNull();

    await act(async () => { fireEvent.dragEnd(rowOf('B.1'), { dataTransfer: data }); });
    expect(rowOf('A.1').getAttribute('data-drop')).toBeNull();
  });

  it('paints that indicator on the cells, where a collapsed table shows it', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');
    const rule = css.split('}').find(r => /\[data-drop=/.test(r));
    expect(rule, 'no data-drop rule in App.css').toBeTruthy();
    // On the cells — `tr[data-drop] {…}` alone is the bug this replaced.
    expect(rule).toMatch(/\[data-drop[^{]*\]\s*>?\s*td/);
  });

  // Reported as a question — can several rows be picked at once? They can,
  // with shift and cmd, exactly as in the tree. Nothing said so: the rows
  // highlighted and that was it, so a drag that moves five items looked like a
  // drag that moves one. The count says what the next move will take.
  it('says how many rows a move will take', async () => {
    await openWorkOrder();
    expect(document.querySelector('[data-testid="wo-picked"]')).toBeNull();

    await act(async () => { fireEvent.click(rowOf('A.1')); });
    await act(async () => { fireEvent.click(rowOf('B.1'), { shiftKey: true }); });

    const chip = document.querySelector('[data-testid="wo-picked"]');
    expect(chip, 'no selection count after a shift-click').toBeTruthy();
    expect(chip.textContent).toContain('3');

    await act(async () => { fireEvent.click(rowOf('A.2')); });
    expect(document.querySelector('[data-testid="wo-picked"]')).toBeNull();
  });

  it('offers a grip to drag by, like the tree does', async () => {
    await openWorkOrder();
    expect(rowOf('A.1').querySelector('.tv-drag-handle')).toBeTruthy();
  });

  it('ignores a drop on itself', async () => {
    await openWorkOrder();
    const data = dt();
    await act(async () => {
      fireEvent.dragStart(rowOf('A.1'), { dataTransfer: data });
      fireEvent.drop(rowOf('A.1'), { dataTransfer: data });
    });
    expect(rowIds()).toEqual(['A.1', 'A.2', 'B.1']);
  });
});

// Reported: the feature is well hidden. Wanted instead: its own menu entry
// directly after the work tree, and rows that show the parents and the title
// the way the item dialog does — ideally as a two-line row.
//
// The view existed but sat seventh in the row, behind four things you would
// pass on the way to somewhere else, and its rows were an id, a name and a
// project column — enough to recognise a task you already knew, not enough to
// know which of two similarly-named ones you are looking at. "Preise · Page:
// Wochenpflege" says something different under Abrechnung than under Kundenportal.
describe('where it sits and what a row says', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is the tab right after the work tree', async () => {
    renderApp();
    await waitFor(() => { if (!document.querySelectorAll('.tab').length) throw new Error('no tabs'); });
    const labels = [...document.querySelectorAll('.tab')].map(el => (el.firstChild?.textContent || '').trim());
    expect(labels[labels.indexOf('Work Tree') + 1]).toBe('Work order');
  });

  it('shows the path above the title, the way the item dialog does', async () => {
    await openWorkOrder();
    const row = document.querySelector('[data-queue-row="A.1"]');
    // Two lines: where it lives, then what it is.
    expect(row.querySelector('[data-queue-path]').textContent).toContain('Projekt A');
    expect(row.querySelector('[data-queue-title]').textContent).toBe('A eins');
  });

  it('shows the whole chain, not just the project', async () => {
    // A task three levels down is ambiguous without the middle of the path.
    localStorage.setItem('planr_v2', JSON.stringify({
      ...JSON.parse(localStorage.getItem('planr_v2')),
      tree: [
        { id: 'A', name: 'Abrechnung', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'Preise', status: 'wip', team: 'T1' },
        { id: 'A.1.1', name: 'Page: Wochenpflege', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.1.2', name: 'Dialoge', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      ],
    }));
    await openWorkOrder();
    const path = document.querySelector('[data-queue-row="A.1.1"] [data-queue-path]').textContent;
    expect(path).toContain('Abrechnung');
    expect(path).toContain('Preise');
  });
});

// Asked: can items be edited from the work order too — an edit button that
// opens the dialog? And the filters every other surface has are missing here.
//
// `E` opened the dialog from the first version, which is fine once you know
// and invisible until then — the tree carries a ⊞ button for the same reason.
// And the filter row is on every other working surface; a list of everything
// everybody has is the one place you most want to narrow to one team.
describe('working in the list', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  // Reported: rows in the queue that are nowhere to be seen in the tree. They
  // were dropped work — one of them still at 63% and "in progress" — and the
  // queue only left out what was done.
  it('leaves dropped work out, and work under something dropped', async () => {
    const plan = JSON.parse(localStorage.getItem('planr_v2'));
    plan.tree.push(
      { id: 'A.3', name: 'A drei (verworfen)', status: 'wip', progress: 63, dropped: true, team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'C', name: 'Projekt C', status: 'open', team: 'T1', dropped: true },
      { id: 'C.1', name: 'C eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
    );
    localStorage.setItem('planr_v2', JSON.stringify(plan));
    await openWorkOrder();
    expect(rowIds()).not.toContain('A.3');
    expect(rowIds()).not.toContain('C.1');
    expect(rowIds()).toContain('A.1');
  });

  it('has a visible way into the dialog, not only a key', async () => {
    await openWorkOrder();
    await act(async () => { fireEvent.click(screen.getByTestId('wo-edit-A.2')); });
    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe('A.2');
  });

  // Asked for: straight from the queue into the dialog with the mouse. A
  // single click stays the cursor, so it is the double-click.
  it('opens the dialog on a double-click on the row', async () => {
    await openWorkOrder();
    const row = document.querySelector('[data-queue-row="A.2"]');
    await act(async () => { fireEvent.doubleClick(row.querySelector('[data-queue-title]')); });
    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe('A.2');
  });

  it('keeps a single click as selection, without opening anything', async () => {
    await openWorkOrder();
    await act(async () => { fireEvent.click(document.querySelector('[data-queue-row="A.2"]')); });
    expect(screen.queryByTestId('node-modal')).toBeNull();
  });

  it('opening the dialog does not reorder anything', async () => {
    // The button sits on a draggable row; a click must not read as a drop.
    await openWorkOrder();
    const before = rowIds();
    await act(async () => { fireEvent.click(screen.getByTestId('wo-edit-A.2')); });
    expect(rowIds()).toEqual(before);
  });

  it('carries the same filter row as every other working surface', async () => {
    await openWorkOrder();
    expect(document.querySelector('.subtoolbar')).toBeTruthy();
  });

  it('narrows to one person when the filter says so', async () => {
    localStorage.setItem('planr_person_filter', 'M1');
    await openWorkOrder();
    // Only Anna's block; the unassigned team block is filtered away.
    expect(document.querySelectorAll('table.tree-tbl')).toHaveLength(1);
  });
});

// Asked: why are finished items at the top, when you mostly do not want to
// see them at all?
//
// They were at the top because the list follows the plan order and finished
// work tends to sit early in it. But the question answers itself: an order is a
// statement about work still to be done. A finished task has no ordering
// decision left in it, so it is not in the list at all — not sorted to the
// bottom, where it would still be scrolled past.
//
// It stays in the stored queue if it is already there; dropping it from the
// file would mean a task finishing quietly rewrote a decision.
describe('finished work', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is not in the order at all', async () => {
    localStorage.setItem('planr_v2', JSON.stringify({
      ...JSON.parse(localStorage.getItem('planr_v2')),
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'A eins', status: 'done', progress: 100, team: 'T1', best: 10, factor: 1, assign: ['M1'] },
        { id: 'A.2', name: 'A zwei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
        { id: 'A.3', name: 'A drei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      ],
    }));
    await openWorkOrder();
    expect(rowIds()).toEqual(['A.2', 'A.3']);
  });

  it('and a queue that still names it keeps naming it', async () => {
    localStorage.setItem('planr_v2', JSON.stringify({
      ...JSON.parse(localStorage.getItem('planr_v2')),
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'A eins', status: 'done', progress: 100, team: 'T1', best: 10, factor: 1, assign: ['M1'] },
        { id: 'A.2', name: 'A zwei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
        { id: 'A.3', name: 'A drei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      ],
      personQueues: { M1: ['A.3', 'A.1', 'A.2'] },
    }));
    await openWorkOrder();
    // Shown: the unfinished two, in the order that was set.
    expect(rowIds()).toEqual(['A.3', 'A.2']);
    // Stored: untouched — finishing a task must not rewrite a decision.
    expect(JSON.parse(localStorage.getItem('planr_v2')).personQueues.M1).toEqual(['A.3', 'A.1', 'A.2']);
  });
});

// Asked: can several items be selected at once and reordered together?
//
// The selection model is the tree's, because it is the same act: click, shift
// for a range, cmd for a pick. And a move takes the whole selection with it,
// in one step, keeping the selected items' order among themselves — otherwise
// moving five things means five keystrokes and counting.
describe('moving several at once', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'eins', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.2', name: 'zwei', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.3', name: 'drei', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.4', name: 'vier', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Multi', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const rowOf = id => document.querySelector(`[data-queue-row="${id}"]`);
  const click = async (id, opts = {}) => {
    await act(async () => { fireEvent.click(rowOf(id), opts); });
  };
  const press = async (id, key, opts = {}) => {
    await act(async () => { fireEvent.keyDown(rowOf(id), { key, bubbles: true, ...opts }); });
  };

  it('shift-click takes the range', async () => {
    await openWorkOrder();
    await click('A.2');
    await click('A.4', { shiftKey: true });
    expect([...document.querySelectorAll('[data-queue-row].sel')].map(r => r.getAttribute('data-queue-row')))
      .toEqual(['A.2', 'A.3', 'A.4']);
  });

  it('moves the whole selection in one step, keeping its own order', async () => {
    await openWorkOrder();
    await click('A.3');
    await click('A.4', { shiftKey: true });
    await press('A.4', 'ArrowUp', { altKey: true, shiftKey: true });

    await waitFor(() => { if (rowIds()[0] !== 'A.3') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.3', 'A.4', 'A.1', 'A.2']);
  });

  it('cmd-click picks items that are not next to each other', async () => {
    await openWorkOrder();
    await click('A.1');
    await click('A.4', { metaKey: true });
    await press('A.4', 'ArrowDown', { altKey: true, shiftKey: true });

    await waitFor(() => { if (rowIds()[0] === 'A.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.2', 'A.3', 'A.1', 'A.4']);
  });
});

// Asked: with only auto-assigned resources and fixed-assigned teams, can there
// still be a queue per resource — one based on the auto-assignment?
//
// You can see it, and that is the honest half. An item with a team and nobody
// on it belongs to the TEAM's queue, and the schedule then picks whoever is
// free first — so the row says who that turned out to be, marked as the
// scheduler's answer rather than yours.
//
// The order cannot live on that person, and the reason is worth stating: the
// auto-assignment is an OUTPUT of the schedule, and the queue is an INPUT to
// it. Reorder the work and a different person may come free first, so blocks
// keyed on it would reshuffle themselves while you drag. The team queue is the
// same decision without the circle.
describe('work nobody is on yet', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'eins', status: 'open', team: 'T1', best: 5, factor: 1 },
        { id: 'A.2', name: 'zwei', status: 'open', team: 'T1', best: 5, factor: 1 },
      ],
      members: [
        { id: 'M1', name: 'Anna Berg', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
        { id: 'M2', name: 'Bert Cole', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
      ],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Auto', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('says who the schedule picked, and marks it as the schedule\'s answer', async () => {
    await openWorkOrder();
    const who = document.querySelector('[data-queue-row="A.1"] [data-queue-who]');
    expect(who).toBeTruthy();
    expect(who.textContent).toMatch(/Anna|Bert|AB|BC/);
    expect(who.getAttribute('data-auto')).toBe('true');
  });

  it('still orders it, as the team\'s queue', async () => {
    await openWorkOrder();
    const rowOf = id => document.querySelector(`[data-queue-row="${id}"]`);
    await act(async () => { fireEvent.keyDown(rowOf('A.2'), { key: 'ArrowUp', altKey: true, bubbles: true }); });
    await waitFor(() => { if (rowIds()[0] !== 'A.2') throw new Error(rowIds().join()); });
    // The localStorage mirror is debounced, so wait for it rather than for a
    // wall-clock guess.
    await waitFor(() => {
      const q = JSON.parse(localStorage.getItem('planr_v2') || '{}').personQueues;
      if (!q) throw new Error('not stored yet');
      expect(Object.keys(q)).toEqual(['team:T1']);
    }, { timeout: 4000 });
  });
});

// A queue is one list, and nothing sits between its rows.
//
// This block used to assert the opposite: an owner's rows were grouped under
// package headers, and a header moved its whole package at once. The instinct
// was "settle the big blocks before the details", which is how anybody plans
// — and it was applied in the wrong place. The big blocks are settled in the
// TREE, and this list already arrives in the tree's order.
//
// What this view exists for is the one statement the tree cannot make: "this
// task from B, ahead of those three from A". A hierarchy header is exactly
// the thing that puts that move behind a wall — a queue crossing two projects
// had its rows split into blocks that could not interleave, which is the
// shape it was there to express. Reported plainly: no clustering here, the
// reordering may need to cross the hierarchy.
describe('one flat queue per owner', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'Paket eins', status: 'wip', team: 'T1' },
        { id: 'A.1.1', name: 'a', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.1.2', name: 'b', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.2', name: 'Paket zwei', status: 'wip', team: 'T1' },
        { id: 'A.2.1', name: 'c', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.2.2', name: 'd', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'TopDown', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('puts nothing between the rows', async () => {
    await openWorkOrder();
    expect(document.querySelectorAll('[data-queue-group]')).toHaveLength(0);
    expect(rowIds()).toEqual(['A.1.1', 'A.1.2', 'A.2.1', 'A.2.2']);
  });

  it('starts in the order the tree gives, so the plan is the default', async () => {
    // Nothing here invents an order. The tree said A.1 before A.2, and it is
    // A.1 before A.2 until somebody says otherwise in this list.
    await openWorkOrder();
    expect(rowIds()).toEqual(['A.1.1', 'A.1.2', 'A.2.1', 'A.2.2']);
  });

  it('moves one task past another package in a single step', async () => {
    // The move that has no equivalent in the tree, and the reason this view
    // exists. Under package headers it took three: out of one block, past a
    // header, into the next.
    await openWorkOrder();
    const row = document.querySelector('[data-queue-row="A.2.1"]');
    await act(async () => { fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true }); });
    await waitFor(() => { if (rowIds()[0] !== 'A.2.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.2.1', 'A.1.1', 'A.1.2', 'A.2.2']);
  });

  it('still takes a whole selection along when you pick one', async () => {
    // "These five, together" is a thing you say by selecting five, not a
    // shape the hierarchy decides for you in advance.
    await openWorkOrder();
    const first = document.querySelector('[data-queue-row="A.2.1"]');
    const last = document.querySelector('[data-queue-row="A.2.2"]');
    await act(async () => { fireEvent.click(first); });
    await act(async () => { fireEvent.click(last, { shiftKey: true }); });
    await act(async () => { fireEvent.keyDown(last, { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true }); });
    await waitFor(() => { if (rowIds()[0] !== 'A.2.1') throw new Error(rowIds().join()); });
    expect(rowIds()).toEqual(['A.2.1', 'A.2.2', 'A.1.1', 'A.1.2']);
  });
});

// The second gap: the person filter matched `assign`, so filtering to somebody
// showed nothing of the work the schedule had given them. Reading the plan per
// resource is most of the point when nothing is hand-assigned yet.
describe('filtering to who will actually do it', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'order');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'eins', status: 'open', team: 'T1', best: 5, factor: 1 },
        { id: 'A.2', name: 'zwei', status: 'open', team: 'T1', best: 5, factor: 1 },
        { id: 'A.3', name: 'drei', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M2'] },
      ],
      members: [
        { id: 'M1', name: 'Anna Berg', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
        { id: 'M2', name: 'Bert Cole', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' },
      ],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'AutoFilter', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows the work the schedule gave somebody, not just what was assigned', async () => {
    localStorage.setItem('planr_person_filter', 'M1');
    await openWorkOrder();
    // Anna has nothing assigned by hand; the schedule gave her the unassigned
    // work of her team. The old filter showed an empty screen.
    expect(rowIds().length).toBeGreaterThan(0);
    for (const id of rowIds()) expect(id).not.toBe('A.3');
  });

  it('and can still be reordered while filtered', async () => {
    localStorage.setItem('planr_person_filter', 'M1');
    await openWorkOrder();
    const first = rowIds()[0];
    const last = rowIds()[rowIds().length - 1];
    if (first === last) return;
    const row = document.querySelector(`[data-queue-row="${last}"]`);
    await act(async () => { fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true }); });
    await waitFor(() => { if (rowIds()[0] !== last) throw new Error(rowIds().join()); });
  });
});
