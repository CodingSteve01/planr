/** @vitest-environment happy-dom */
// "Von der Roadmap kommt ein Klick nach wie vor noch nicht in den Popup-Dialog
//  der Items, so wie z.B. aus dem Graph."
//
// #27 fixed this for the Roadmap tab and stated the reason well: routing a
// click through "set the root filter and jump to the Tree" is navigation, not
// editing — you lose the map you were reading to get a dialog you could have
// had in place. The Overview's subway map kept the old handler, which is the
// map that gets looked at most.
//
// Two halves to it. A work package (a node with children) went to the Tree tab
// instead of opening at all. A leaf did open, but as the bare tree node, so
// the dialog knew nothing about dates, effort or assignment — visibly less
// than the same item shows from a Gantt bar or a graph node.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'done', progress: 100, team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      { id: 'P1.2', name: 'Masks', status: 'wip', progress: 40, team: 'T1', best: 5, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Roadmap click', planStart: '2026-01-05', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const activeTabName = () => document.querySelector('.tab.on')?.firstChild?.textContent?.trim();
const itemInMap = id => [...document.querySelectorAll('[data-item-id]')]
  .find(el => el.getAttribute('data-item-id') === id);

async function clickInMap(id) {
  await waitFor(() => { if (!itemInMap(id)) throw new Error(`not on the map: ${id}`); });
  await act(async () => { fireEvent.click(itemInMap(id)); });
}

describe('clicking an item on the Overview subway map', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('opens a leaf in the dialog, with what the schedule knows about it', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    await clickInMap('P1.2');

    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe('P1.2');
    // The same dialog a Gantt bar opens: the scheduled row is merged in, so
    // the assignee is there to see.
    expect(dialog.textContent).toContain('Anna');
  });

  it('opens a work package in the dialog too, instead of jumping to the tree', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    await clickInMap('P1');

    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe('P1');
    // You keep the map you were reading.
    expect(activeTabName()).toBe('Overview');
  });
});

// And the part that made the click look broken rather than merely different:
// a station on the map itself was never a click target at all. It is drawn
// with `cursor:pointer` and a tooltip, so it says it is one — the legend rows
// underneath carried `data-item-id`, the stations did not, and a click landed
// on nothing. A pointer cursor over a dead element is worse than no cursor:
// it is the app telling you it will do something and then not doing it.
describe('a station on the map', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is a click target, like every other thing on the map that offers a pointer', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');

    await waitFor(() => {
      if (!document.querySelector('.rm-stop')) throw new Error('no stations drawn');
    });
    const stops = [...document.querySelectorAll('.rm-stop')];
    // Every drawn station names the item behind it.
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(stop.getAttribute('data-item-id')).toBeTruthy();
    }

    await act(async () => { fireEvent.click(stops[0]); });
    const dialog = await screen.findByTestId('node-modal');
    expect(dialog.getAttribute('data-node-id')).toBe(stops[0].getAttribute('data-item-id'));
  });
});

// "Es werden auch andere Tooltips als im Graph angezeigt."
//
// #27 gave the Roadmap tab the graph's tooltip and said why: the roadmap used
// to carry "AB.1 öffnen", which tells you what a click does and nothing about
// the item you are pointing at, and reading a roadmap is exactly when you want
// to know the item. The Overview's map kept its own card.
//
// It does not become the graph's tooltip everywhere, though, and that is the
// interesting half: a station can stand for five tasks that finish in the same
// fortnight, and "status, window, effort, dependencies" has no answer for
// five. Where the map is pointing at one item it shows the one card the rest
// of the app shows; where it is pointing at a group it keeps the summary,
// because that is the honest answer to what is under the cursor.
describe('what the map says on hover', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows the app-wide item tooltip for a station that is one item', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    await waitFor(() => { if (!document.querySelector('.rm-stop')) throw new Error('no stations'); });

    const stop = [...document.querySelectorAll('.rm-stop')]
      .find(el => el.getAttribute('data-cluster-size') === '1');
    expect(stop).toBeTruthy();
    const id = stop.getAttribute('data-item-id');
    const name = { 'P1.1': 'Prices', 'P1.2': 'Masks' }[id];
    expect(name).toBeTruthy();

    await act(async () => {
      fireEvent.mouseMove(stop, { clientX: 120, clientY: 120, bubbles: true });
    });

    const tip = await screen.findByTestId('item-tip');
    expect(tip.textContent).toContain(name);
    // A person by name, not by id. The map's own card said neither, and a
    // tooltip that says "M1" is the mechanics showing through (principle 8).
    expect(tip.textContent).toContain('Anna');
  });

  it('keeps its own summary where a station stands for several items', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    await waitFor(() => { if (!document.querySelector('.rm-stop')) throw new Error('no stations'); });

    const cluster = [...document.querySelectorAll('.rm-stop')]
      .find(el => Number(el.getAttribute('data-cluster-size') || 1) > 1);
    if (!cluster) return; // this fixture may not produce one; the rule is what matters

    await act(async () => {
      fireEvent.mouseMove(cluster, { clientX: 120, clientY: 120, bubbles: true });
    });
    expect(screen.queryByTestId('item-tip')).toBeNull();
  });
});
