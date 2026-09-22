/** @vitest-environment happy-dom */
// "Und wie genau kann ich die Queues mal eben schnell umsortieren? Wie in
//  Tabellenansicht genau wie das umsortieren im Tree?"
//
// The gesture existed only on the schedule, on a Gantt bar, in a grouping you
// had to find — which is a fine place to NOTICE that something sits too early
// and a poor one to sit down and put ten things in order. That wants what the
// tree has: a dense list, a cursor, ⌥↑↓, and nothing else on the screen
// arguing for attention.
//
// Same keys as the tree deliberately. It is the same act.

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

// "Weil ich ja dann auch direkt aus der Queue ggf. mal einen Task aktualisiere,
//  anders abschätze usw."
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

// "Die Zeilen kann ich auch nicht per D&D umsortieren."
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

// "Ich finde das Feature soo super versteckt … hätte da lieber einen kleinen
//  eigenen Menüpunkt direkt hinter Arbeitspakete … dann müsste ich nur — wie
//  in den WorkItem-Dialogen — sehen können was die Parents sind und was der
//  Titel ist. Ggf. als charmanter Zweizeiler."
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

// "Kann ich in der Reihenfolge-Liste nicht auch die Items editieren (also
//  einfach den Dialog öffnen per edit-button)? Die Filter, die wir ja überall
//  haben, fehlen mir hier ein wenig."
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

  it('has a visible way into the dialog, not only a key', async () => {
    await openWorkOrder();
    await act(async () => { fireEvent.click(screen.getByTestId('wo-edit-A.2')); });
    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe('A.2');
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

// "Und warum sind erledigte nicht ganz oben (eigentlich will man die ja meist
//  nicht sehen)?"
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
