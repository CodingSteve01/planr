/** @vitest-environment happy-dom */
// Phase 5 (Roadmap lenses): the project roadmap, a tab of its own in Plan
// mode, next to the Gantt.
//
// It shipped as a chip in the filter row that opened a 380px sidebar, and
// nobody found it — "I thought it was a separate tab". A view is not a
// filter, and the ask was for a roadmap NEXT TO the Gantt in the same style,
// which means a sibling tab at full width. These tests pin that: reachable
// from the tab bar, full pane, no toggle to discover.
//
// Same reasoning as treeEditor.app.test.jsx — a component-level test with
// spies would only prove that RoadmapLens.jsx calls the props it's handed,
// not that App actually wires a real project's roadmap into it, keeps it
// scoped to Plan mode, and persists the toggle/focus choices. So: drive the
// real App, read the rendered DOM.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Website Relaunch', type: 'goal', status: 'wip' },
      { id: 'P1.1', name: 'Design', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
      { id: 'P2', name: 'Mobile App', type: 'goal', status: 'open' },
      { id: 'P2.1', name: 'Onboarding', status: 'open', team: 'T1', best: 5, factor: 1.5, assign: [], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Roadmap lens', planStart: '2026-01-01', planEnd: '2027-01-01' },
  }));
}

function renderApp() {
  return render(
    <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
  );
}

// `findByRole` (not `getByRole`) because App shows a brief "Restoring project
// context..." onboarding state while it checks for a mounted file handle —
// the mode switch isn't in the DOM yet on the first tick.
const goToPlanMode = async () => fireEvent.click(await screen.findByRole('tab', { name: 'Plan' }));
const goToReviewMode = async () => fireEvent.click(await screen.findByRole('tab', { name: 'Review' }));
// The MODE switch uses role="tab"; the view tabs below it are plain divs
// with class "tab", so they are found by text.
const roadmapTab = () => [...document.querySelectorAll('.tab')].find(el => el.textContent.trim() === 'Roadmap');
const goToRoadmapTab = async () => {
  await screen.findByText('Roadmap');
  fireEvent.mouseDown(roadmapTab());
};
const lensPanel = () => screen.queryByTestId('roadmap-pane');
const pickerInput = () => screen.getByTestId('gantt-roadmap-lens-picker').querySelector('input');

// The SearchSelect popup portals to document.body — focus opens it, click a
// row to choose. Same technique as archive.roadmap.test.jsx.
function pickProject(name) {
  fireEvent.focus(pickerInput());
  fireEvent.click([...document.querySelectorAll('[data-ss-idx]')].find(row => row.textContent.includes(name)));
}

describe('Plan mode: project lens beside the Gantt', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); });

  it('is a tab next to the Gantt, defaulting to the first project', async () => {
    renderApp();
    await goToPlanMode();

    // Plan mode offers both, as sibling tabs — not one hidden inside the other.
    // A tab label can carry a trailing "New!" badge, so match on the prefix.
    const tabLabels = [...document.querySelectorAll('.tab')].map(el => el.textContent.trim());
    expect(tabLabels).toContain('Roadmap');
    // Directly after the Gantt — "next to the Gantt view" is the whole ask.
    const scheduleIdx = tabLabels.findIndex(l => l.startsWith('Schedule'));
    expect(scheduleIdx, 'Schedule tab not found').toBeGreaterThan(-1);
    expect(tabLabels.indexOf('Roadmap')).toBe(scheduleIdx + 1);
    await goToRoadmapTab();

    expect(lensPanel()).toBeTruthy();
    expect(pickerInput().value).toBe('Website Relaunch');
    // The roadmap itself is an injected SVG string (dangerouslySetInnerHTML) —
    // happy-dom's parser doesn't turn it into readable text nodes, so check
    // the raw markup rather than textContent (see archive.roadmap.test.jsx).
    expect(lensPanel().innerHTML).toContain('Website Relaunch');
  });

  it('switches to another project through the picker and remembers the choice', async () => {
    renderApp();
    await goToPlanMode();
    await goToRoadmapTab();

    pickProject('Mobile App');

    expect(pickerInput().value).toBe('Mobile App');
    expect(lensPanel().innerHTML).toContain('Mobile App');
    expect(localStorage.getItem('planr_gantt_roadmap_focus')).toBe('P2');
  });

  it('has no toggle to find — the tab IS the affordance', async () => {
    renderApp();
    await goToPlanMode();

    // The chip that used to open it is gone: a view belongs in the tab bar,
    // not in the row of data filters beside "Overdue" and "Unestimated".
    expect(screen.queryByText('🗺 Roadmap')).toBeNull();
    await goToRoadmapTab();
    expect(lensPanel()).toBeTruthy();
  });

  it('draws as DOM rows, not a scaled image', async () => {
    // The SVG renderer keeps the Subway map and the PDF, where one scalable
    // image is exactly right. Here it was wrong: a fixed 1400px viewBox at
    // width:100% SCALES, so on a wide window every row, label and dot grew
    // by the same factor and the view looked oversized next to the Gantt it
    // is supposed to match. Pixels have to mean pixels in a view you work in.
    renderApp();
    await goToPlanMode();
    await goToRoadmapTab();

    const pane = screen.getByTestId('roadmap-pane');
    expect(screen.getByTestId('plan-roadmap')).toBeTruthy();
    expect(pane.querySelector('svg'), 'still rendering the scaled SVG').toBeNull();

    // One row per work package, and the rows carry the project's own items.
    const rows = pane.querySelectorAll('.pr-row');
    expect(rows.length).toBeGreaterThan(0);
    expect([...pane.querySelectorAll('.pr-label-name')].map(el => el.textContent)).toContain('Design');
  });

  it('zooms as a factor on the fit, so the buttons mean something at any project length', async () => {
    // The first version stepped absolute pixels-per-day. A six-month project
    // and a three-year one need wildly different scales to fill the same
    // pane, so a 2 px/day step did nothing at all to a project whose fit was
    // already 13 px/day — the button was simply inert.
    renderApp();
    await goToPlanMode();
    await goToRoadmapTab();

    const zoomOut = () => screen.getByTestId('plan-roadmap-zoom-out');
    const zoomIn = () => screen.getByTestId('plan-roadmap-zoom-in');
    const label = () => document.querySelector('.pr-zoom-val').textContent;

    // 1× is "the whole project, edge to edge" — there is nothing to zoom out to.
    expect(label()).toBe('fit');
    expect(zoomOut().disabled).toBe(true);

    fireEvent.click(zoomIn());
    expect(label()).toBe('1.5×');
    expect(zoomOut().disabled).toBe(false);

    fireEvent.click(zoomOut());
    expect(label()).toBe('fit');
    expect(zoomOut().disabled).toBe(true);
  });

  it('opens the item behind a row', async () => {
    renderApp();
    await goToPlanMode();
    await goToRoadmapTab();

    const label = [...document.querySelectorAll('.pr-label')]
      .find(el => el.textContent.includes('Design'));
    expect(label, 'no row to click').toBeTruthy();
    fireEvent.click(label);

    // Same entry point the portfolio map and the Gantt use (onSumOpenItem):
    // a leaf opens the item editor, a parent narrows the tree to it. "Design"
    // is a leaf here.
    await waitFor(() => {
      const modal = document.querySelector('.modal');
      expect(modal, 'clicking a row opened nothing').toBeTruthy();
      expect(modal.textContent).toContain('Design');
    });
  });

  it('falls back to an existing project when the remembered one is gone', async () => {
    localStorage.setItem('planr_gantt_roadmap_focus', 'GHOST');
    renderApp();
    await goToPlanMode();
    await goToRoadmapTab();

    expect(pickerInput().value).toBe('Website Relaunch');
  });

  it('shows a year on the first tick even when the axis does not start in January', async () => {
    // Reported: a project starting mid-year had no year anywhere on the
    // axis — it used to print one only on a January tick, and a roadmap
    // that opens on "Jul Aug Sep Oct Nov" with no year is not orientable.
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'P1', name: 'Autumn Launch', type: 'goal', status: 'open' },
        {
          id: 'P1.1', name: 'Build', status: 'open', team: 'T1',
          best: 20, factor: 1.5, assign: [], deps: [],
          pinnedStart: '2026-09-01',
        },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Autumn axis', planStart: '2026-01-01', planEnd: '2027-06-01' },
    }));
    renderApp();
    await goToPlanMode();
    await goToRoadmapTab();

    const ticks = [...document.querySelectorAll('.pr-tick-lbl')].map(el => el.textContent);
    expect(ticks.length, 'no month ticks rendered').toBeGreaterThan(0);
    expect(ticks[0], 'first tick carries no year').toMatch(/’\d{2}$/);
    // And it is not (only) because the axis happens to start in January.
    expect(ticks[0]).not.toMatch(/^Jan /);
  });
});

describe('Review mode: the portfolio lens has no per-project picker', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); });

  it('never renders the Plan-mode project-lens picker', async () => {
    renderApp();
    await goToReviewMode();

    expect(screen.queryByTestId('gantt-roadmap-lens-picker')).toBeNull();
    expect(screen.queryByTestId('roadmap-line-picker')).toBeNull();
  });
});
