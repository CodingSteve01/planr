/** @vitest-environment happy-dom */
// The timetable's rows are columns, and a column holds one thing. The first
// one used to hold the abbreviation, the "×n" count AND the review window's
// badges in 44px, so on a busy station the badges were drawn over the date.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { TimetableView } from '../components/views/TimetableView.jsx';
import { I18nProvider } from '../i18n.jsx';
import { treeStats } from '../utils/scheduler.js';

const day = n => new Date(2027, 0, 4 + n);
const tree = [
  { id: 'P1', name: 'Project', status: 'open', type: 'goal' },
  { id: 'P1.1', name: 'Preise', status: 'wip' },
  ...[1, 2, 3].map(i => ({ id: `P1.1.${i}`, name: `Task ${i}`, status: i === 1 ? 'done' : 'open', best: 5, factor: 1, team: 'T1' })),
];
const scheduled = [1, 2, 3].map(i => ({
  id: `P1.1.${i}`,
  treeId: `P1.1.${i}`,
  startD: day(i * 7),
  endD: day(i * 7 + 4),
  status: 'open',
  team: 'T1',
  effort: 5,
}));
const show = props =>
  render(
    <I18nProvider>
      <TimetableView
        tree={tree}
        scheduled={scheduled}
        stats={treeStats(tree)}
        teams={[{ id: 'T1', name: 'Dev' }]}
        members={[]}
        {...props}
      />
    </I18nProvider>,
  );

describe('the timetable keeps its columns', () => {
  afterEach(() => cleanup());

  it("gives the review window's badges a column of their own", () => {
    show({ sinceDate: new Date(2026, 10, 5), diffDoneIds: ['P1.1.1'], diffProgressedIds: ['P1.1.2'] });
    const cells = screen.getAllByTestId('tt-window');
    expect(
      cells
        .map(el => el.textContent)
        .filter(Boolean)
        .sort(),
    ).toEqual(['▲1', '●1']);
    const badges = cells.find(el => el.textContent === '●1');
    const abbrev = badges.parentElement.querySelector('[data-testid="tt-abbrev"]');
    // The abbreviation (and its count, when it has one), and nothing else.
    expect(abbrev.textContent).toMatch(/^[^●▲\s]+$/);
    expect(abbrev.contains(badges)).toBe(false);
    expect(badges.parentElement.style.gridTemplateColumns.trim().split(/\s+/)).toHaveLength(5);
    // What a narrow column might clip is also in the row's tooltip, in words.
    expect(badges.parentElement.getAttribute('data-htip')).toContain('Finished in the review window: 1');
  });

  it('has no badge column, and no gap for one, while no window is on', () => {
    show({});
    expect(screen.queryByTestId('tt-window')).toBeNull();
    const row = screen.getAllByTestId('tt-abbrev')[0].parentElement;
    expect(row.style.gridTemplateColumns.trim().split(/\s+/)).toHaveLength(4);
  });
});

describe('the timetable marks what a scenario moves', () => {
  afterEach(() => cleanup());

  it("in the scenario's colour, with the furthest shift, and says so in the tooltip", () => {
    show({
      scenarioShifts: new Map([
        ['P1.1.2', 91],
        ['P1.1.3', 12],
      ]),
    });
    const marks = screen.getAllByTestId('tt-scenario');
    expect(
      marks
        .map(el => el.textContent)
        .filter(Boolean)
        .sort(),
    ).toEqual(['+12 d', '+13 wk']);
    const row = marks.find(el => el.textContent === '+13 wk').parentElement;
    expect(row.style.borderLeft).toContain('var(--sc)');
    expect(row.getAttribute('data-htip')).toContain('Moved by the scenario: 1 of 1');
    // A station the scenario leaves alone carries no mark and keeps its place.
    const quiet = marks.find(el => !el.textContent).parentElement;
    expect(quiet.style.borderLeft).not.toContain('var(--sc)');
    expect(quiet.style.gridTemplateColumns).toBe(row.style.gridTemplateColumns);
  });

  it('a task that is new or gone is marked without a number', () => {
    show({ scenarioShifts: new Map([['P1.1.2', null]]) });
    expect(
      screen
        .getAllByTestId('tt-scenario')
        .map(el => el.textContent)
        .filter(Boolean),
    ).toEqual(['×1']);
  });

  it("never shows the review window's badges beside it", () => {
    show({ scenarioShifts: new Map([['P1.1.2', 5]]), sinceDate: new Date(2026, 10, 5), diffDoneIds: ['P1.1.1'] });
    expect(screen.queryByTestId('tt-window')).toBeNull();
  });
});
