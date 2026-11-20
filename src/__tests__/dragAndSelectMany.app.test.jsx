/** @vitest-environment happy-dom */
// Asked: drag and drop in the tree as good as in the Work order, and in both
// a real way to select many rows and do something with them.
//
// Tree: the whole row drags (it was a 14px grip), the rows in the hand dim, a
// drop lands next to any row or inside a package — across packages too, where
// it used to do nothing — and ⌘A takes every row on screen.
// Work order: field keys and the selection bar act on every picked row (Space
// on five picked rows changed one), ⌘A picks the owner's queue, a drop can
// land after a row, so the end of a queue is reachable at last.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, createEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const leaf = (id, name, extra = {}) => ({ id, name, status: 'open', team: 'T1', best: 3, factor: 1, assign: ['M1'], deps: [], ...extra });
function seed(tab) {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', tab);
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'open', team: 'T1' },
      leaf('P1.1', 'Alpha'), leaf('P1.2', 'Bravo'),
      { id: 'P2', name: 'Portal', status: 'open', team: 'T1' },
      leaf('P2.1', 'Charlie'), leaf('P2.2', 'Delta'),
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Drag', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}
const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
const stored = () => JSON.parse(localStorage.getItem('planr_v2')).tree;
const dt = () => {
  const store = {};
  return { setData: (k, v) => { store[k] = String(v); }, getData: k => store[k] || '', effectAllowed: '', dropEffect: '' };
};
// A row 20px tall at the top of the page, so clientY picks the zone.
const sized = el => { el.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20, left: 0, right: 100, width: 100 }); return el; };

// happy-dom drops clientY from a DragEvent's init, so it is set on the event.
const dragAt = (kind, el, dataTransfer, clientY) => {
  const ev = createEvent[kind](el, { dataTransfer });
  Object.defineProperty(ev, 'clientY', { value: clientY });
  fireEvent(el, ev);
};

afterEach(() => { cleanup(); localStorage.clear(); });

describe('the tree', () => {
  beforeEach(() => seed('tree'));
  const rowNamed = name => [...document.querySelectorAll('[data-testid="tree-row-name"]')]
    .find(n => n.textContent.trim() === name)?.closest('tr');
  const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
  const open = async () => {
    renderApp();
    await screen.findByTestId('tree-editor-surface');
    await waitFor(() => expect(names()).toContain('Delta'));
  };

  it('drags by the whole row and drops next to a row of another package', async () => {
    await open();
    expect(rowNamed('Alpha').getAttribute('draggable')).toBe('true');
    const data = dt();
    await act(async () => { fireEvent.dragStart(rowNamed('Alpha'), { dataTransfer: data }); });
    expect(rowNamed('Alpha').getAttribute('data-dragging')).toBe('true');
    await act(async () => { dragAt('dragOver', sized(rowNamed('Delta')), data, 2); });
    expect(rowNamed('Delta').getAttribute('data-drop')).toBe('before');
    await act(async () => { dragAt('drop', rowNamed('Delta'), data, 2); });
    await waitFor(() => expect(names()).toEqual(['Billing', 'Bravo', 'Portal', 'Charlie', 'Alpha', 'Delta']));
    await waitFor(() => expect(stored().find(r => r.name === 'Alpha').id.startsWith('P2.')).toBe(true));
  });

  it('drops into a package on the middle of its row', async () => {
    await open();
    const data = dt();
    await act(async () => { fireEvent.dragStart(rowNamed('Charlie'), { dataTransfer: data }); });
    await act(async () => { dragAt('dragOver', sized(rowNamed('Billing')), data, 10); });
    expect(rowNamed('Billing').getAttribute('data-drop')).toBe('inside');
    await act(async () => { dragAt('drop', rowNamed('Billing'), data, 10); });
    await waitFor(() => expect(names()).toEqual(['Billing', 'Alpha', 'Bravo', 'Charlie', 'Portal', 'Delta']));
  });

  it('marks no place a drop cannot go', async () => {
    await open();
    const data = dt();
    await act(async () => { fireEvent.dragStart(rowNamed('Billing'), { dataTransfer: data }); });
    await act(async () => { dragAt('dragOver', sized(rowNamed('Alpha')), data, 2); });
    expect(rowNamed('Alpha').getAttribute('data-drop')).toBeNull();   // into its own subtree
  });

  it('⌘A selects every row on screen, and dragging one drags them all', async () => {
    await open();
    await act(async () => { fireEvent.click(rowNamed('Alpha')); });
    await act(async () => { fireEvent.keyDown(screen.getByTestId('tree-editor-surface'), { key: 'a', metaKey: true }); });
    expect(document.querySelectorAll('tr.sel').length).toBe(6);
    await act(async () => { fireEvent.click(rowNamed('Alpha')); });   // back to one
    await act(async () => { fireEvent.click(rowNamed('Bravo'), { metaKey: true }); });
    await act(async () => { fireEvent.dragStart(rowNamed('Alpha'), { dataTransfer: dt() }); });
    expect(rowNamed('Alpha').getAttribute('data-dragging')).toBe('true');
    expect(rowNamed('Bravo').getAttribute('data-dragging')).toBe('true');
  });
});

describe('the work order', () => {
  beforeEach(() => seed('order'));
  const rowOf = id => document.querySelector(`[data-queue-row="${id}"]`);
  const rowIds = () => [...document.querySelectorAll('[data-queue-row]')].map(el => el.getAttribute('data-queue-row'));
  const open = async () => {
    renderApp();
    await waitFor(() => expect(rowIds().length).toBe(4));
  };
  const pickTwo = async () => {
    await act(async () => { fireEvent.click(rowOf('P1.1')); });
    await act(async () => { fireEvent.click(rowOf('P1.2'), { metaKey: true }); });
  };

  it('a field key acts on every picked row', async () => {
    await open();
    await pickTwo();
    await act(async () => { fireEvent.keyDown(rowOf('P1.1'), { key: '1' }); });
    await waitFor(() => expect(stored().find(r => r.id === 'P1.2').prio).toBe(1));
    expect(stored().find(r => r.id === 'P1.1').prio).toBe(1);
  });

  it('⌘A picks the whole queue, and the bar acts on it', async () => {
    await open();
    await act(async () => { fireEvent.keyDown(rowOf('P1.1'), { key: 'a', metaKey: true }); });
    expect(screen.getByTestId('wo-picked').textContent).toMatch(/^4/);
    await act(async () => { fireEvent.click(screen.getByTestId('wo-status-wip')); });
    await waitFor(() => expect(stored().filter(r => r.id.includes('.')).every(r => r.status === 'wip')).toBe(true));
  });

  it('drops after the last row, and a picked pair travels together', async () => {
    await open();
    await pickTwo();
    const data = dt();
    await act(async () => { fireEvent.dragStart(rowOf('P1.1'), { dataTransfer: data }); });
    expect(rowOf('P1.2').getAttribute('data-dragging')).toBe('true');
    await act(async () => { dragAt('dragOver', sized(rowOf('P2.2')), data, 18); });
    expect(rowOf('P2.2').getAttribute('data-drop')).toBe('after');
    await act(async () => { dragAt('drop', rowOf('P2.2'), data, 18); });
    await waitFor(() => expect(rowIds()).toEqual(['P2.1', 'P2.2', 'P1.1', 'P1.2']));
  });
});
