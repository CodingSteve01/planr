/** @vitest-environment happy-dom */
// The staircase.
//
// One row per task is the honest default and it is what makes a real plan
// unreadable: two hundred rows, each carrying one short bar a little further
// right than the one above, is a diagonal across an otherwise empty canvas.
// The question a schedule exists to answer — what runs when, and what runs at
// the same time — is the one thing that shape cannot show.
//
// Compact lays each group's bars out like words in a line of text: left to
// right in plan order, into the first lane where the bar fits, opening a new
// lane underneath only where two of them genuinely overlap. A group is then as
// tall as its busiest moment, which is the number the reader wanted.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

// Four tasks for one person, strictly one after another — nothing overlaps,
// so every bar can share a single lane.
function seedSequential() {
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
    meta: { name: 'Packing', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

// Four tasks, one each for four people — they all run at once, so no two can
// share a lane and the group has to be four lanes tall.
function seedParallel() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'eins', status: 'open', team: 'T1', best: 20, factor: 1, assign: ['M1'] },
      { id: 'A.2', name: 'zwei', status: 'open', team: 'T1', best: 20, factor: 1, assign: ['M2'] },
      { id: 'A.3', name: 'drei', status: 'open', team: 'T1', best: 20, factor: 1, assign: ['M3'] },
      { id: 'A.4', name: 'vier', status: 'open', team: 'T1', best: 20, factor: 1, assign: ['M4'] },
    ],
    members: ['M1', 'M2', 'M3', 'M4'].map(id => ({ id, name: id, team: 'T1', cap: 1, vac: 0, start: '2026-01-01' })),
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Packing', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);

const setup = seeder => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'gantt');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_gantt_group', 'project');
  seeder();
};

async function openGantt(minBars = 3) {
  renderApp();
  await screen.findByTestId('gantt-timeline');
  // A fresh plan opens with its groups folded, and a folded group has one row
  // — which is the shape this is not about.
  const expand = screen.queryByTestId('gantt-expand-all');
  if (expand) await act(async () => { fireEvent.click(expand); });
  await waitFor(() => { if (document.querySelectorAll('.gbar').length < minBars) throw new Error('not expanded'); });
}

const compactToggle = () => screen.getByTestId('gantt-compact-toggle');
// The `top` each row was placed at. In classic these step by one row height;
// in compact several of them repeat, which IS the packing.
const taskRowTops = () => [...document.querySelectorAll('[data-row-type="task"]')]
  .filter(row => row.querySelector('.gbar'))
  .map(row => row.style.top || '');

describe('the schedule packs its bars when asked', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('gives every task its own row by default', async () => {
    // Nothing changes for anybody who has not asked for it.
    setup(seedSequential);
    await openGantt();
    expect(compactToggle().getAttribute('aria-pressed')).toBe('false');
    // Classic rows sit in normal flow: no absolute top at all.
    expect(taskRowTops().every(top => top === '')).toBe(true);
  });

  it('flows work that never overlaps into one lane', async () => {
    setup(seedSequential);
    await openGantt();
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => { if (!taskRowTops().some(Boolean)) throw new Error('not packed'); });

    const tops = taskRowTops();
    expect(tops.length).toBeGreaterThan(1);
    // One person, four tasks back to back — one line holds all of them.
    expect(new Set(tops).size, `tops: ${tops.join(' ')}`).toBe(1);
  });

  it('opens a lane per task that genuinely runs at the same time', async () => {
    setup(seedParallel);
    await openGantt();
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => { if (!taskRowTops().some(Boolean)) throw new Error('not packed'); });

    const tops = taskRowTops();
    // Four people working at once cannot share a line, and the lanes are one
    // row apart — a group is exactly as tall as its busiest moment.
    expect(new Set(tops).size).toBe(4);
    const px = [...new Set(tops)].map(t => parseFloat(t)).sort((a, b) => a - b);
    for (let i = 1; i < px.length; i++) expect(px[i] - px[i - 1]).toBe(28);
  });

  it('starts its rows where the classic ones start', async () => {
    // The rows sit in normal flow below the deadline-flag strip, and `rowTop`
    // is measured from the FIRST row, not from the top of the box. Placing a
    // compact row at `rowTop` alone put every bar 18px above where the
    // dependency arrows, the label column and `rowCenterY` all agree it is —
    // which is what "the connecting lines are not where they belong" looks
    // like from the outside.
    const FLAG_ROW_H = 18;
    setup(seedSequential);
    await openGantt();
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => { if (!taskRowTops().some(Boolean)) throw new Error('not packed'); });

    const first = document.querySelector('[data-row-type="group"], [data-row-type="summary"]');
    expect(first, 'no container row').toBeTruthy();
    expect(parseFloat(first.style.top)).toBe(FLAG_ROW_H);
    for (const top of taskRowTops()) expect(parseFloat(top)).toBeGreaterThanOrEqual(FLAG_ROW_H);
  });

  it('remembers the choice', async () => {
    setup(seedSequential);
    await openGantt();
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => expect(localStorage.getItem('planr_gantt_compact')).toBe('true'));
  });

  it('drops the per-task label column, because a lane holds several', async () => {
    // The names are on the bars there. Leaving the column would print one
    // label per task beside a column of lanes that do not correspond to them.
    setup(seedSequential);
    await openGantt();
    const before = document.querySelectorAll('.grow-l').length;
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => { if (document.querySelectorAll('.grow-l').length === before) throw new Error('unchanged'); });
    expect(document.querySelectorAll('.grow-l').length).toBeLessThan(before);
    // The container the packing lives in is still named — a work package with
    // its own bar, in project grouping.
    expect(document.querySelectorAll('[data-row-type="summary"]').length).toBeGreaterThan(0);
  });
});


// A dependency line is an arrow between two BARS, so a row that draws nothing
// cannot be one of its ends. The row renderer bails out on two cases — an
// unestimated task, and a finished one with no dates — and the index the lines
// are built from excluded only the first. The result was a line running to a
// blank row in the middle of a group, looking like it had come adrift; in
// compact, where a bar-less row takes no lane at all, it landed on a lane
// holding other work entirely.
describe('a dependency line ends on a bar', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  const seedDep = predecessorEstimated => () => {
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        // With best 0 this one is unestimated: no bar, ever.
        { id: 'A.1', name: 'Vorgänger', status: 'open', team: 'T1', best: predecessorEstimated ? 5 : 0, factor: 1, assign: ['M1'] },
        { id: 'A.2', name: 'Nachfolger', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'], deps: ['A.1'] },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Deps', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  };
  const depLines = () => [...document.querySelectorAll('[data-testid="gantt-timeline"] svg path')]
    .filter(p => p.getAttribute('stroke') && (p.getAttribute('d') || '').length > 12);

  it('draws one when both ends have a bar', async () => {
    setup(seedDep(true));
    await openGantt();
    await waitFor(() => { if (!depLines().length) throw new Error('no dep line'); });
    expect(depLines().length).toBeGreaterThan(0);
  });

  it('draws none when the predecessor has no bar to point at', async () => {
    setup(seedDep(false));
    // One of the two tasks has no bar, so there are fewer of them to wait for.
    await openGantt(2);
    // Give it the same chance to appear as the case above.
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(depLines(), 'a line was drawn to a row with no bar').toHaveLength(0);
  });

  it('and none in compact either', async () => {
    setup(seedDep(false));
    await openGantt(2);
    await act(async () => { fireEvent.click(compactToggle()); });
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(depLines()).toHaveLength(0);
  });
});


// Folding, in a view where a row is a lane.
//
// Reported from the project grouping: collapsing does not seem to work, and
// the work packages have no bars. Both were the same rule read too widely — a
// container below the grouping was hidden whether it was open or shut. Open,
// that is right: its children are on the lanes and its own bar would overlap
// every one of them. Shut, its children are not drawn AT ALL, so its bar is
// the only thing left standing for them, and hiding it made a folded package
// with two hundred items under it vanish from the chart.
describe('a folded package in compact', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  const seedNested = () => {
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [
        { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'Paket eins', status: 'wip', team: 'T1' },
        { id: 'A.1.1', name: 'a', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.1.2', name: 'b', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
        { id: 'A.2', name: 'Paket zwei', status: 'wip', team: 'T1' },
        { id: 'A.2.1', name: 'c', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      ],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Folding', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  };

  const labelRows = () => [...document.querySelectorAll('.gantt-left .grow-l, .gantt-left .gteam')]
    .map(el => el.textContent.trim());

  it('hides a package that is open, because its children are the content', async () => {
    setup(seedNested);
    await openGantt();
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => { if (!taskRowTops().some(Boolean)) throw new Error('not packed'); });
    // The project keeps its row; the two packages do not.
    expect(labelRows().some(text => /Projekt A/.test(text))).toBe(true);
    expect(labelRows().some(text => /Paket eins/.test(text))).toBe(false);
  });

  it('keeps a package that is shut — with its bar, its name and its chevron', async () => {
    setup(seedNested);
    await openGantt();
    // Fold one package while still in classic, where it has a row to click.
    const pkgRow = [...document.querySelectorAll('.gantt-left .grow-l')]
      .find(row => /Paket eins/.test(row.textContent) && row.querySelector('button[aria-label]'));
    expect(pkgRow, 'no package row to fold').toBeTruthy();
    await act(async () => { fireEvent.click(pkgRow.querySelector('button[aria-label]')); });
    await act(async () => { fireEvent.click(compactToggle()); });
    await waitFor(() => { if (!taskRowTops().some(Boolean)) throw new Error('not packed'); });

    // It is one thing now, so it is one row — named, and with the caret that
    // opens it again. Without that it was a bar with no label and no way back.
    const folded = [...document.querySelectorAll('.gantt-left .grow-l')]
      .find(row => /Paket eins/.test(row.textContent));
    expect(folded, 'the folded package lost its row').toBeTruthy();
    expect(folded.querySelector('button[aria-label]'), 'no way to unfold it').toBeTruthy();
    // …and it still draws something in the chart.
    const bars = [...document.querySelectorAll('[data-row-type="summary"] .gbar')];
    expect(bars.length).toBeGreaterThan(0);
  });
});
