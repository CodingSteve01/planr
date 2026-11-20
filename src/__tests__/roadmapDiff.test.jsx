/** @vitest-environment happy-dom */
// The Roadmap answers to the review window like every other working view.
//
// Reported: "the Roadmap has no support for the diff view the way all the
// other pages do". It did not — the filter bar offered a "since" window and
// this one view ignored it, so a sprint review had to be read on the Gantt or
// the Overview and then carried back here by hand.
//
// Same vocabulary as the Gantt, deliberately: what finished inside the window
// and what moved are both marked, and "only changed" hides the rest rather
// than dimming it. A ring on the stop rather than a fill, so it keeps saying
// what its status is at the same time.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { PlanRoadmap } from '../components/views/PlanRoadmap.jsx';
import { treeStats } from '../utils/scheduler.js';

const d = iso => new Date(`${iso}T00:00:00`);

const TREE = [
  { id: 'P1', name: 'Projekt', status: 'wip', team: 'T1' },
  { id: 'P1.1', name: 'Erfassung', status: 'wip', team: 'T1' },
  { id: 'P1.1.1', name: 'Masken', status: 'done', team: 'T1', best: 10, factor: 1 },
  { id: 'P1.2', name: 'Migration', status: 'open', team: 'T1' },
  { id: 'P1.2.1', name: 'Import', status: 'open', team: 'T1', best: 10, factor: 1 },
];
const SCHEDULED = [
  { id: 'P1.1.1', name: 'Masken', status: 'done', effort: 10, startD: d('2026-01-05'), endD: d('2026-02-06') },
  { id: 'P1.2.1', name: 'Import', status: 'open', effort: 10, startD: d('2026-03-02'), endD: d('2026-04-03') },
];

const mount = props => render(
  <I18nProvider><ThemeProvider>
    <PlanRoadmap tree={TREE} scheduled={SCHEDULED} stats={treeStats(TREE)} rootId="P1"
      color="#3d7ab0" onOpenItem={() => {}} {...props} />
  </ThemeProvider></I18nProvider>,
);

describe('the project lens and the review window', () => {
  afterEach(() => cleanup());

  it('marks nothing when no window is set', () => {
    const { container } = mount({});
    expect(container.querySelectorAll('[data-pr-changed]')).toHaveLength(0);
  });

  it('marks what finished inside the window', () => {
    const { container } = mount({
      sinceDate: d('2026-01-01'),
      diffDoneIds: new Set(['P1.1.1']),
    });
    const marked = [...container.querySelectorAll('.pr-stop[data-pr-changed]')];
    expect(marked.length, 'the finished stop is not marked').toBe(1);
    // …and its row is marked too, so you can find it without hunting.
    expect(container.querySelector('.pr-row[data-pr-changed]')).toBeTruthy();
  });

  it('marks what merely moved, not only what finished', () => {
    const { container } = mount({
      sinceDate: d('2026-01-01'),
      diffProgressedIds: new Set(['P1.2.1']),
    });
    expect(container.querySelectorAll('[data-pr-changed]').length).toBeGreaterThan(0);
  });

  it('hides the untouched rows when asked for only what changed', () => {
    const all = mount({ sinceDate: d('2026-01-01'), diffDoneIds: new Set(['P1.1.1']) });
    const rowsWithWindow = all.container.querySelectorAll('.pr-row').length;
    cleanup();

    const { container } = mount({
      sinceDate: d('2026-01-01'),
      diffDoneIds: new Set(['P1.1.1']),
      onlyChanged: true,
    });
    const rowsOnlyChanged = container.querySelectorAll('.pr-row').length;
    expect(rowsOnlyChanged).toBeLessThan(rowsWithWindow);
    expect(rowsOnlyChanged).toBeGreaterThan(0);
    // Everything left standing is something that changed.
    expect([...container.querySelectorAll('.pr-row')].every(r => r.dataset.prChanged === 'true')).toBe(true);
  });

  it('keeps the rows when only-changed is on but no window is set', () => {
    // Without a cutoff there is nothing to have changed since, and hiding
    // every row would read as an empty project.
    const { container } = mount({ onlyChanged: true });
    expect(container.querySelectorAll('.pr-row').length).toBeGreaterThan(0);
  });
});
