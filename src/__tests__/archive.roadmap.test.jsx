/** @vitest-environment happy-dom */
// Two Overview behaviours that only show up once a plan has history:
//   1. a project that finished months ago drops off the roadmap, but NOT out
//      of the headline percentage — archiving is a display filter,
//   2. one project can be shown on its own as a single roadmap line.
//
// The Subway map itself is an injected SVG string, which happy-dom's parser
// mangles, so the map is stubbed out here: which projects reach the renderer
// is exactly what these two features change.
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

describe('Overview single-line mode', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });

  // The line picker is a SearchSelect: focus the input to open it, then click
  // the row. Its popup portals to document.body, hence the document query.
  const openPicker = () => fireEvent.focus(screen.getByTestId('roadmap-line-picker').querySelector('input'));
  const pickLine = name => {
    openPicker();
    fireEvent.click([...document.querySelectorAll('[data-ss-idx]')].find(row => row.textContent.includes(name)));
  };
  // Row 0 is the "— All lines —" empty row.
  const clearLine = () => {
    openPicker();
    fireEvent.click([...document.querySelectorAll('[data-ss-idx="0"]')].pop());
  };

  it('reduces the roadmap to the selected project', () => {
    const { container } = mount({ showArchived: true });
    expect(mapRoots()).toEqual(['A1', 'Z1']);

    pickLine('Alte Umfirmierung');

    expect(mapRoots()).toEqual(['Z1']);
  });

  it('goes back to every line via "All lines" and remembers the choice', () => {
    const { container } = mount({ showArchived: true });

    pickLine('Alte Umfirmierung');
    expect(localStorage.getItem('planr_roadmap_solo')).toBe('Z1');

    clearLine();
    expect(localStorage.getItem('planr_roadmap_solo')).toBe('');
    expect(mapRoots()).toEqual(['A1', 'Z1']);
  });

  it('picking the active line again releases it', () => {
    const { container } = mount({ showArchived: true });

    pickLine('Live Plattform');
    expect(localStorage.getItem('planr_roadmap_solo')).toBe('A1');

    pickLine('Live Plattform');
    expect(localStorage.getItem('planr_roadmap_solo')).toBe('');
  });

  it('never persists a line assignment while a single line is soloed', () => {
    // The soloed line is handed a colour-only assignment, so persisting what
    // the renderer computes from it would move that line in the full map.
    const { container } = mount({
      showArchived: true, onAssignmentChange: noop,
      roadmapAssignment: { A1: { routeIdx: 3, colorIdx: 2 }, Z1: { routeIdx: 1, colorIdx: 5 } },
    });
    expect(mapPersists()).toBe(true);

    pickLine('Live Plattform');

    expect(mapPersists()).toBe(false);
  });

  it('falls back to all lines when the remembered project is gone', () => {
    localStorage.setItem('planr_roadmap_solo', 'GHOST');
    mount({ showArchived: true });

    expect(mapRoots()).toEqual(['A1', 'Z1']);
  });
});
