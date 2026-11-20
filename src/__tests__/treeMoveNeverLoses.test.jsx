/** @vitest-environment happy-dom */
// Two complaints about pushing items around the tree, reported together.
//
// 1. "Items simply disappear." They are not lost: re-parenting out a level
//    renumbers the subtree into a project of its own — P1.1 and its children
//    become P3 — and the project filter, still set to P1, then excludes the
//    very rows that were being moved. The plan is right and the screen is
//    empty where the item used to be, which is indistinguishable from losing
//    it. A search over ids does the same thing for the same reason.
//
// 2. Moving up or down stopped dead at the end of a sibling run. That is
//    the rule now, deliberately: up/down reorder among siblings and never
//    change the parent. Going out a level is outdent, which lands the row
//    right after the parent it left — so "carry it on" is ⌘⇧← then ⌘⇧↓.
//
// The first is guarded by watching the outcome rather than the cause: the
// moved row is marked, and if it is not in the next filtered list the view
// widens to wherever it went.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const PLAN = [
  { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
  { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
  { id: 'P1.1.1', name: 'Tariffs', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
  { id: 'P1.2', name: 'Masks', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
  { id: 'P2', name: 'Other', status: 'open', team: 'T1' },
];

function seed({ rootFilter = '' } = {}) {
  localStorage.clear();
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: PLAN,
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Moves', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
  if (rootFilter) localStorage.setItem('planr_root_filter', rootFilter);
}

const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
const names = () => [...document.querySelectorAll('[data-testid="tree-row-name"]')].map(n => n.textContent.trim());
const rowNamed = name => [...document.querySelectorAll('[data-testid="tree-row-name"]')]
  .find(n => n.textContent.trim() === name)?.closest('tr');

async function selectRow(name) {
  await act(async () => { fireEvent.click(rowNamed(name)); });
}
async function press(init) {
  const grid = screen.getByTestId('tree-editor-surface');
  await act(async () => { fireEvent.keyDown(grid, init); });
  await act(async () => { await new Promise(r => setTimeout(r, 60)); });
}
async function ready() {
  renderApp();
  await screen.findByTestId('tree-editor-surface');
  await waitFor(() => expect(names().length).toBeGreaterThan(1));
}

// The app persists its filter chips to localStorage, so a seeded root filter
// outlives this file unless it is cleared: the next test to run in the same
// environment would open on a plan narrowed to P1 and fail for a reason
// nothing in it mentions.
afterEach(() => { cleanup(); localStorage.clear(); });

describe('a move never hides what it moved', () => {
  beforeEach(() => seed({ rootFilter: 'P1' }));

  it('keeps an outdented branch on screen when the project filter would drop it', async () => {
    await ready();
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks']);   // P2 filtered away

    await selectRow('Prices');
    await press({ key: 'Tab', shiftKey: true });                          // out to top level

    // It became a project of its own, so P1's filter can no longer hold it.
    // The view widened instead of swallowing it.
    expect(names()).toContain('Prices');
    expect(names()).toContain('Tariffs');
    expect(names()).toContain('Other');                                   // the filter came off
  });

  it('leaves the filter alone when the move keeps the row visible', async () => {
    await ready();
    await selectRow('Tariffs');
    await press({ key: 'Tab', shiftKey: true });   // P1.1.1 → P1.3, still inside P1

    expect(names()).toContain('Tariffs');
    expect(names(), 'the filter was dropped for a move that did not need it').not.toContain('Other');
  });
});

// Up/down reorder and nothing else. They used to step out a level at the end
// of a run, which made an arrow a re-parent in disguise; that is outdent's
// job now, and outdent lands right after the parent it left.
describe('the structural commands, by keyboard and by toolbar', () => {
  beforeEach(() => seed());
  const grid = () => screen.getByTestId('tree-editor-surface');
  const mod = { metaKey: true, shiftKey: true };
  const selectedName = () => document.querySelector('tr.sel [data-testid="tree-row-name"]')?.textContent.trim();
  // Depth as drawn: the indentation spacer in front of the name is 20px a level.
  const levelOf = name => parseInt(rowNamed(name).querySelector('td[data-col="name"] span').style.width, 10) / 20 + 1;

  it('stops at the end of a sibling run instead of stepping out', async () => {
    await ready();
    await selectRow('Tariffs');                    // P1.1.1 — an only child
    await press({ key: 'ArrowUp', altKey: true });
    await press({ key: 'ArrowDown', ...mod });
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks', 'Other']);
    expect(screen.getByTestId('tv-move-up').disabled).toBe(true);
    expect(screen.getByTestId('tv-move-down').disabled).toBe(true);
  });

  it('⌘⇧← outdents to right after the old parent, ⌘⇧→ indents back as its last child', async () => {
    await ready();
    await selectRow('Tariffs');
    expect(levelOf('Tariffs')).toBe(3);
    await press({ key: 'ArrowLeft', ...mod });
    // Same place in the list — but now Prices' sibling, right after it.
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks', 'Other']);
    expect(levelOf('Tariffs')).toBe(2);
    expect(selectedName()).toBe('Tariffs');

    await press({ key: 'ArrowRight', ...mod });
    expect(levelOf('Tariffs')).toBe(3);
    expect(selectedName()).toBe('Tariffs');
  });

  it('runs one after another without the mouse: ⌘⇧↓, ⌘⇧↑, ⌘⇧← keep the row selected and the keyboard on the tree', async () => {
    await ready();
    await selectRow('Prices');                     // P1.1, before Masks
    await press({ key: 'ArrowDown', ...mod });
    expect(names()).toEqual(['Billing', 'Masks', 'Prices', 'Tariffs', 'Other']);
    expect(selectedName()).toBe('Prices');
    await press({ key: 'ArrowUp', ...mod });
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks', 'Other']);
    await press({ key: 'ArrowLeft', ...mod });     // Prices (with Tariffs) out, after Billing
    expect(names()).toEqual(['Billing', 'Masks', 'Prices', 'Tariffs', 'Other']);
    expect(levelOf('Prices')).toBe(1);
    expect(levelOf('Tariffs')).toBe(2);             // its child came along
    expect(selectedName()).toBe('Prices');
    expect(document.activeElement).toBe(grid());
  });

  it('the toolbar buttons run the same commands and keep the keyboard on the tree', async () => {
    await ready();
    await selectRow('Masks');                      // P1.2, after Prices
    expect(screen.getByTestId('tv-move-down').disabled).toBe(true);
    expect(screen.getByTestId('tv-indent').disabled).toBe(false);

    await act(async () => { fireEvent.click(screen.getByTestId('tv-move-up')); });
    expect(names()).toEqual(['Billing', 'Masks', 'Prices', 'Tariffs', 'Other']);
    expect(selectedName()).toBe('Masks');
    // The button went disabled under the focus; the keyboard is back on the tree.
    expect(document.activeElement).toBe(grid());

    await press({ key: 'ArrowDown', ...mod });   // and the next press still lands
    expect(names()).toEqual(['Billing', 'Prices', 'Tariffs', 'Masks', 'Other']);
  });

  it('keeps a moved branch folded', async () => {
    await ready();
    await selectRow('Prices');
    await press({ key: 'ArrowLeft' });            // fold Prices
    expect(names()).not.toContain('Tariffs');
    await press({ key: 'ArrowLeft', ...mod });    // outdent — the ids renumber
    expect(names()).toEqual(['Billing', 'Masks', 'Prices', 'Other']);
    expect(selectedName()).toBe('Prices');
  });

  it('Home and End jump to the first and last row, → and ← still fold', async () => {
    await ready();
    await selectRow('Masks');
    await press({ key: 'Home' });
    expect(selectedName()).toBe('Billing');
    await press({ key: 'End' });
    expect(selectedName()).toBe('Other');
    await press({ key: 'Home' });
    await press({ key: 'ArrowLeft' });            // fold Billing
    expect(names()).toEqual(['Billing', 'Other']);
    await press({ key: 'ArrowRight' });           // open it again
    await press({ key: 'ArrowRight' });           // and step into it
    expect(selectedName()).toBe('Prices');
  });

  it('F2 opens the row for editing', async () => {
    await ready();
    await selectRow('Masks');
    await press({ key: 'F2' });
    expect(document.querySelector('[data-testid="tree-name-input-P1.2"]')).toBeTruthy();
  });
});
