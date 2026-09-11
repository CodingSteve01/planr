/** @vitest-environment happy-dom */
// Overview (Review mode's portfolio lens) behaviours that only show up once
// a plan has history: a project that finished months ago drops off the
// roadmap, but NOT out of the headline percentage — archiving is a display
// filter.
//
// The Subway map itself is an injected SVG string, which happy-dom's parser
// mangles, so the map is stubbed out here: which projects reach the renderer
// is exactly what the archive filter changes.
//
// The portfolio lens used to also offer a "solo one line" mode (pick one
// project, the map collapses to just that line's calendar). It's gone — see
// SumView.jsx's RoadmapSwitcher — because the same calendar renderer now
// lives beside the Gantt as Plan mode's project lens (RoadmapLens.jsx,
// covered by src/__tests__/roadmapLens.app.test.jsx), which is a better fit:
// a portfolio review is exactly the moment you do NOT want to narrow to one
// line. The map here is always every project, full stop — asserted below.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { SumView } from '../components/views/SumView.jsx';
import { scanArchive } from '../utils/archive.js';
import { aggregateProgressPct } from '../utils/progress.js';
import { treeStats } from '../utils/scheduler.js';

// Stub the map: report the root ids it was handed, plus whether it was given
// a way to persist the line assignment.
vi.mock('../components/shared/Roadmap.jsx', () => ({
  Roadmap: ({ tree, onAssignmentChange }) => (
    <div data-testid="map"
      data-roots={tree.filter(node => !String(node.id).includes('.')).map(node => node.id).join(',')}
      data-persists={onAssignmentChange ? '1' : '0'} />
  ),
}));

const NOW = new Date('2026-09-10T12:00:00');

const tree = [
  { id: 'A1', name: 'Live Plattform', type: 'goal', status: 'wip', best: 0, factor: 1.5 },
  { id: 'A1.1', name: 'Offenes Paket', team: 'T1', status: 'open', best: 10, factor: 1.5, deps: [], assign: [] },
  { id: 'A1.2', name: 'Laufendes Paket', team: 'T1', status: 'wip', progress: 40, best: 10, factor: 1.5, deps: [], assign: [] },
  { id: 'Z1', name: 'Alte Umfirmierung', type: 'goal', status: 'done', best: 0, factor: 1.5, completedAt: '2026-03-01' },
  { id: 'Z1.1', name: 'Altes Paket', team: 'T1', status: 'done', best: 10, factor: 1.5, deps: [], assign: [],
    completedAt: '2026-03-01', completedStart: '2026-02-20', completedEnd: '2026-03-01' },
];
const scheduled = [
  { id: 'A1.1', treeId: 'A1.1', name: 'Offenes Paket', team: 'T1', personId: 'M1', person: 'Anna', status: 'open',
    effort: 15, startD: new Date('2026-09-14'), endD: new Date('2026-09-25') },
  { id: 'A1.2', treeId: 'A1.2', name: 'Laufendes Paket', team: 'T1', personId: 'M1', person: 'Anna', status: 'wip',
    effort: 15, startD: new Date('2026-10-05'), endD: new Date('2026-10-16') },
];
const goals = tree.filter(node => !node.id.includes('.') && node.type);
const teams = [{ id: 'T1', name: 'Team A', color: '#3b82f6' }];
const members = [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 }];
const noop = () => {};

function wrap(node) {
  return render(<I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider>);
}

function mount(extra = {}) {
  const archive = scanArchive({ tree, members, days: 90, now: NOW });
  return {
    archive,
    ...wrap(
      <SumView tree={tree} scheduled={scheduled} goals={goals} members={members} teams={teams}
        cpSet={new Set()} goalPaths={{}} stats={treeStats(tree)}
        archive={archive} showArchived={false} setShowArchived={noop} archiveDays={90}
        onNavigate={noop} onOpenItem={noop} onExportTodo={noop} {...extra} />,
    ),
  };
}

const mapRoots = () => screen.getByTestId('map').getAttribute('data-roots').split(',').filter(Boolean);
const mapPersists = () => screen.getByTestId('map').getAttribute('data-persists') === '1';

describe('Overview archive filter', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });

  it('keeps the long-finished project off the roadmap', () => {
    const { container, archive } = mount();

    expect([...archive.rootIds]).toEqual(['Z1']);
    expect(mapRoots()).toEqual(['A1']);
  });

  it('drops its goal card too, and keeps the live one', () => {
    mount();

    expect(screen.queryByText('Live Plattform')).toBeTruthy();
    expect(screen.queryByText('Alte Umfirmierung')).toBeNull();
  });

  it('still counts the archived work in the headline percentage', () => {
    // The finished project is 100% done; dropping it from the sums would pull
    // the overall figure DOWN, which is exactly the wrong story.
    const full = aggregateProgressPct(tree.filter(node => node.id.includes('.')));
    const { container } = mount();

    const headline = container.querySelector('span[style*="font-size: 28px"]');
    expect(parseFloat(headline.textContent)).toBeCloseTo(full, 1);
  });

  it('says how much is hidden instead of hiding it silently', () => {
    const setShowArchived = vi.fn();
    mount({ setShowArchived });

    fireEvent.click(screen.getByText(/📦 1 archived/));

    expect(setShowArchived).toHaveBeenCalledWith(true);
  });

  it('shows the archived project again once the filter is off', () => {
    const { container } = mount({ showArchived: true });

    expect(mapRoots()).toEqual(['A1', 'Z1']);
    expect(screen.queryByText(/archived/)).toBeNull();
  });
});

describe('Overview portfolio lens is always every project', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });

  it('shows every project regardless of a stored roadmap assignment', () => {
    mount({
      showArchived: true, onAssignmentChange: noop,
      roadmapAssignment: { A1: { routeIdx: 3, colorIdx: 2 }, Z1: { routeIdx: 1, colorIdx: 5 } },
    });

    expect(mapRoots()).toEqual(['A1', 'Z1']);
    expect(mapPersists()).toBe(true);
  });

  it('has no per-project line picker — that surface moved to the Plan-mode project lens', () => {
    mount({ showArchived: true });

    expect(screen.queryByTestId('roadmap-line-picker')).toBeNull();
  });
});

// Phase 5 turned the Subway map into the portfolio lens — always every
// project — which is right for a portfolio review. It took the project picker
// away from the TIMETABLE at the same time, and that was a capability loss:
// no other view lists one project's dates as a schedule, so the picker there
// was not a duplicate of anything. It stays, scoped to the view that needs it.
describe('the timetable can still be narrowed to one project', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });

  it('offers the picker on the schedule view and not on the map', () => {
    mount({ showArchived: true });
    // Map view: no picker — the portfolio lens shows everything, on purpose.
    expect(screen.queryByTestId('timetable-root-picker')).toBeNull();

    // Switch to the schedule; the picker is there because no other view
    // lists one project's dates as a schedule.
    const scheduleBtn = [...document.querySelectorAll('button')]
      .find(b => /Fahrplan|Timetable|Schedule/i.test(b.textContent));
    expect(scheduleBtn, 'schedule switch not found').toBeTruthy();
    fireEvent.click(scheduleBtn);

    expect(screen.getByTestId('timetable-root-picker')).toBeTruthy();
  });

  it('remembers the scoped project across mounts, and ignores one that is gone', () => {
    localStorage.setItem('planr_roadmap_view', 'schedule');
    localStorage.setItem('planr_timetable_root', 'A1');
    mount({ showArchived: true });
    expect(screen.getByTestId('timetable-root-picker')).toBeTruthy();

    cleanup();
    localStorage.setItem('planr_timetable_root', 'GONE');
    mount({ showArchived: true });
    // A stored root that no longer exists must not blank the schedule.
    expect(screen.getByTestId('timetable-root-picker')).toBeTruthy();
  });
});
