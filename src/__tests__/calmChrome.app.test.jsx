/** @vitest-environment happy-dom */
// "Die oberste Zeile sieht zugemüllt aus… auch die ganzen Schnell-Filter-Tags
// sind eher optische Last."
//
// principles.md has said so for a while: the top bar is file name, save
// state, mode switch and gear, tier 1 has a budget of one toolbar row, and
// "noise comes from borders, pills, badges and colours competing for
// attention". Six filter toggles, five of them off at any moment, are a row
// of switched-off switches.
//
// What these tests pin is the trade: quieter at rest, and not one capability
// less — every filter is still one click away, and a filter that IS on still
// says so on the surface, because a view may never quietly lie about what it
// shows.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Billing', status: 'wip', team: 'T1' },
      { id: 'P1.1', name: 'Prices', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: ['M1'], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Calm chrome', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

describe('the sub-toolbar at rest', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); delete window.__planrHost; });

  it('shows no filter toggles while nothing is filtered', async () => {
    renderApp();
    await screen.findByTestId('view-filters-trigger');
    expect(screen.queryByTestId('active-filters')).toBeNull();
    expect(screen.queryByTestId('quick-filters')).toBeNull();
  });

  it('keeps every filter one click away', async () => {
    renderApp();
    fireEvent.click(await screen.findByTestId('view-filters-trigger'));
    const quick = within(screen.getByTestId('quick-filters'));
    // Labels carry their glyph ("! Overdue", "○ Unestimated").
    for (const label of [/Done/, /Auto/, /Overdue/, /Unestimated/]) {
      expect(quick.getByText(label), `${label} missing`).toBeTruthy();
    }
  });

  it('says on the surface when a filter is on, and takes it back off there', async () => {
    renderApp();
    fireEvent.click(await screen.findByTestId('view-filters-trigger'));
    fireEvent.click(within(screen.getByTestId('quick-filters')).getByText(/Overdue/));

    // The filtered state is not allowed to hide in a popup — the view has to
    // declare it (principles.md, "a view is never the truth").
    const active = within(screen.getByTestId('active-filters'));
    expect(active.getByText(/Overdue/)).toBeTruthy();

    fireEvent.click(active.getByText(/Overdue/));
    expect(screen.queryByTestId('active-filters')).toBeNull();
  });
});

describe('the top bar', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); delete window.__planrHost; });

  it('keeps the plan counts for the modes that ask the question', async () => {
    const { container } = renderApp();
    await screen.findByTestId('view-filters-trigger');
    // Build mode: two numbers nobody asked for, in the one row every mode
    // has to look at.
    expect(container.querySelector('.topbar-count')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    expect(container.querySelector('.topbar-count')?.textContent).toMatch(/done/);
  });

  it('drops the wordmark when a host already says where you are', async () => {
    const { container, unmount } = renderApp();
    await screen.findByTestId('view-filters-trigger');
    expect(container.querySelector('.logo')).toBeTruthy();
    unmount();

    window.__planrHost = { portalRoot: document.body };
    const embedded = renderApp();
    await screen.findByTestId('view-filters-trigger');
    expect(embedded.container.querySelector('.logo')).toBeNull();
  });
});
