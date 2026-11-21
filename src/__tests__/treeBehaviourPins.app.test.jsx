/** @vitest-environment happy-dom */
// Three behaviours of the tree view that no other test reaches, pinned before
// the editing and key handling move out of TreeView.jsx:
//   - a drop into a collapsed package opens it,
//   - ⌥↓ moves a multi-row selection as one block,
//   - a pasted list is one undo step, however many rows it creates.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, createEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const leaf = (id, name) => ({ id, name, status: 'open', team: 'T1', best: 3, factor: 1, assign: ['M1'], deps: [] });
function seed() {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'tree');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem(
    'planr_v2',
    JSON.stringify({
      tree: [
        { id: 'P1', name: 'Harbor', status: 'open', team: 'T1' },
        leaf('P1.1', 'Alpha Task'),
        leaf('P1.2', 'Bravo Task'),
        leaf('P1.3', 'Echo Task'),
        { id: 'P2', name: 'Meadow', status: 'open', team: 'T1' },
        leaf('P2.1', 'Charlie Task'),
        leaf('P2.2', 'Delta Task'),
      ],
      members: [{ id: 'M1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [],
      meetingPlans: [],
      meta: { name: 'Pins', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }),
  );
}
const renderApp = () =>
  render(
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>,
  );
const stored = () => JSON.parse(localStorage.getItem('planr_v2')).tree;
const grid = () => screen.getByTestId('tree-editor-surface');
const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
const rowNamed = name =>
  [...document.querySelectorAll('[data-testid="tree-row-name"]')].find(n => n.textContent.trim() === name)?.closest('tr');
const dt = () => {
  const store = {};
  return { setData: (k, v) => (store[k] = String(v)), getData: k => store[k] || '', effectAllowed: '', dropEffect: '' };
};
const sized = el => {
  el.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20, left: 0, right: 100, width: 100 });
  return el;
};
// happy-dom drops clientY from a DragEvent's init, so it is set on the event.
const dragAt = (kind, el, dataTransfer, clientY) => {
  const ev = createEvent[kind](el, { dataTransfer });
  Object.defineProperty(ev, 'clientY', { value: clientY });
  fireEvent(el, ev);
};
const press = (key, opts = {}) =>
  act(async () => {
    fireEvent.keyDown(grid(), { key, bubbles: true, ...opts });
  });

async function open() {
  renderApp();
  await screen.findByTestId('tree-editor-surface');
  await waitFor(() => expect(names()).toContain('Delta Task'));
}

beforeEach(seed);
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('the tree view, behaviours pinned before its handlers move', () => {
  it('a drop into a collapsed package opens it', async () => {
    await open();
    await act(async () => {
      fireEvent.click(rowNamed('Meadow'));
    });
    await press('ArrowLeft'); // closes Meadow
    await waitFor(() => expect(names()).not.toContain('Charlie Task'));

    const data = dt();
    await act(async () => {
      fireEvent.dragStart(rowNamed('Alpha Task'), { dataTransfer: data });
    });
    await act(async () => {
      dragAt('dragOver', sized(rowNamed('Meadow')), data, 10);
    });
    expect(rowNamed('Meadow').getAttribute('data-drop')).toBe('inside');
    await act(async () => {
      dragAt('drop', rowNamed('Meadow'), data, 10);
    });

    await waitFor(() => expect(names()).toContain('Charlie Task'));
    expect(names()).toContain('Alpha Task');
    await waitFor(() =>
      expect(
        stored()
          .find(r => r.name === 'Alpha Task')
          .id.startsWith('P2.'),
      ).toBe(true),
    );
  });

  it('⌥↓ on a two-row selection moves both rows past the next sibling, still selected', async () => {
    await open();
    await act(async () => {
      fireEvent.click(rowNamed('Alpha Task'));
    });
    await press('ArrowDown', { shiftKey: true }); // Alpha Task and Bravo Task
    expect(document.querySelectorAll('tr.sel').length).toBe(2);

    await press('ArrowDown', { altKey: true });

    await waitFor(() =>
      expect(names()).toEqual(['Harbor', 'Echo Task', 'Alpha Task', 'Bravo Task', 'Meadow', 'Charlie Task', 'Delta Task']),
    );
    expect(document.querySelectorAll('tr.sel').length).toBe(2);
  });

  it('a pasted list of three rows is taken back by one ⌘Z', async () => {
    await open();
    await act(async () => {
      fireEvent.click(rowNamed('Bravo Task'));
    });
    const undoBtn = () => document.querySelector('[data-testid="undo-btn"]');
    expect(undoBtn().disabled).toBe(true);

    await act(async () => {
      fireEvent.paste(grid(), { clipboardData: { getData: () => 'Foxtrot Task\nGolf Task\nHotel Task' } });
    });
    await waitFor(() => expect(names()).toContain('Hotel Task'));
    await waitFor(() => expect(stored().length).toBe(10));

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });
    await waitFor(() => expect(names()).not.toContain('Foxtrot Task'));
    expect(names()).not.toContain('Foxtrot Task');
    expect(names()).not.toContain('Hotel Task');
    await waitFor(() => expect(stored().length).toBe(7));
    expect(undoBtn().disabled).toBe(true);
  });
});
