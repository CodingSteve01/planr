/** @vitest-environment happy-dom */
// What dragging a bar does, pinned before the drag code is moved.
//
// The Gantt's drag handlers (start, move, release, Escape, link drop) read
// state that lives in refs and in render-time state at the same time, and no
// other test drove them. These tests press the mouse on a bar, move it, let go,
// and look only at what the view hands back through its callbacks. They pass on
// the code as it stands: they describe it, they do not judge it.
//
// Dates are built from local-time parts on purpose. The pin snap compares them
// with vacation blocks parsed from ISO strings, so a vacation is always several
// days long here and the bar lands in the middle of it, away from the first and
// last day, where that comparison depends on the time zone of the machine.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, cleanup } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { GanttView } from '../components/views/GanttView.jsx';

const noop = () => {};
const MON = new Date(2026, 0, 5); // Monday
const day = (y, m, d) => new Date(y, m - 1, d);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function makeWeeks(count) {
  return Array.from({ length: count }, (_, i) => {
    const mon = addDays(MON, i * 7);
    return { mon, wds: [0, 1, 2, 3, 4].map(k => addDays(mon, k)) };
  });
}

const teams = [{ id: 'T1', name: 'Frontend', color: '#3b82f6' }];
const members = [{ id: 'M1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 25 }];

function leaf(id, extra = {}) {
  return { id, name: `Task ${id}`, team: 'T1', best: 3, factor: 1, status: 'open', deps: [], assign: [], ...extra };
}

// One scheduled entry per leaf: startD..endD are inclusive calendar days.
function scheduledOf(item, startD, endD, extra = {}) {
  return { ...item, treeId: item.id, startWi: 0, endWi: 0, startD, endD, ...extra };
}

function mount({ tree, scheduled, vacations = [], weeks = makeWeeks(10), storage = {}, handlers = {} }) {
  localStorage.setItem('planr_gantt_group', 'thread');
  localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ thread: [], project: [] }));
  Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, v));
  const calls = {
    onSeqUpdate: vi.fn(),
    onAddDep: vi.fn(),
    onReorderSibling: vi.fn(),
    onExtendViewStart: vi.fn(),
    ...handlers,
  };
  const view = render(
    <I18nProvider>
      <ThemeProvider>
        <GanttView
          scheduled={scheduled}
          weeks={weeks}
          goals={[]}
          teams={teams}
          members={members}
          vacations={vacations}
          cpSet={new Set()}
          cpEdges={[]}
          tree={tree}
          workDays={[1, 2, 3, 4, 5]}
          planStart="2026-01-01"
          onBarClick={noop}
          onSeqUpdate={calls.onSeqUpdate}
          onExtendViewStart={calls.onExtendViewStart}
          onTaskUpdate={noop}
          onRemoveDep={noop}
          onAddDep={calls.onAddDep}
          onReorderSibling={calls.onReorderSibling}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
  const shell = view.container.querySelector('.gantt');
  const bar = id => view.container.querySelector(`[data-task-bar="${id}"]`);
  return { ...view, calls, shell, bar };
}

// A drag as the browser reports it: down on the bar, moves and up on the shell.
function drag(shell, bar, { dx = 0, dy = 0, up = true }) {
  fireEvent.mouseDown(bar, { button: 0, clientX: 200, clientY: 100 });
  fireEvent.mouseMove(shell, { clientX: 200 + dx, clientY: 100 + dy });
  if (up) fireEvent.mouseUp(shell, { clientX: 200 + dx, clientY: 100 + dy });
}

describe('dragging a bar', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    // Only Date is faked: timers and animation frames keep running.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(day(2026, 1, 14));
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    localStorage.clear();
  });

  it('day zoom: a pin snaps past a weekend and the assignee vacation to the next workable day', () => {
    const a = leaf('P1.1', { assign: ['M1'] });
    const tree = [leaf('P1', { best: 0 }), a];
    // Vacation Mon 12 to Sun 18 Jan. Friday 9 Jan plus four days is Tuesday 13th, inside it;
    // the walk goes on over the rest of the week and the weekend and stops on Monday 19th.
    const { shell, bar, calls } = mount({
      tree,
      scheduled: [scheduledOf(a, day(2026, 1, 9), day(2026, 1, 9), { assign: ['M1'] })],
      vacations: [{ person: 'M1', from: '2026-01-12', to: '2026-01-18' }],
    });
    drag(shell, bar('P1.1'), { dx: 4 * 14 });
    expect(calls.onSeqUpdate).toHaveBeenCalledTimes(1);
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', { pinnedStart: '2026-01-19' });
    expect(calls.onExtendViewStart).not.toHaveBeenCalled();
  });

  it('day zoom: without a vacation a pin that lands on a Saturday moves on to Monday', () => {
    const a = leaf('P1.1');
    const { shell, bar, calls } = mount({
      tree: [leaf('P1', { best: 0 }), a],
      scheduled: [scheduledOf(a, day(2026, 1, 7), day(2026, 1, 7))],
    });
    drag(shell, bar('P1.1'), { dx: 3 * 14 }); // Wed 7 Jan + 3 days = Sat 10 Jan
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', { pinnedStart: '2026-01-12' });
  });

  it('week zoom: a bar dragged two weeks right is pinned to the Monday two weeks after its start week', () => {
    const a = leaf('P1.1');
    const weeks = makeWeeks(10);
    const { shell, bar, calls } = mount({
      tree: [leaf('P1', { best: 0 }), a],
      // Starts Wednesday 14 Jan in the second week; week zoom moves by whole weeks from that week's Monday.
      scheduled: [scheduledOf(a, day(2026, 1, 14), day(2026, 1, 14), { startWi: 1, endWi: 1 })],
      weeks,
      storage: { planr_gantt_zoom: '40' },
    });
    drag(shell, bar('P1.1'), { dx: 2 * 40 });
    expect(calls.onSeqUpdate).toHaveBeenCalledTimes(1);
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', { pinnedStart: '2026-01-26' });
  });

  it('a pin before the plan start asks for the view to be extended, then pins', () => {
    const a = leaf('P1.1');
    const { shell, bar, calls } = mount({
      tree: [leaf('P1', { best: 0 }), a],
      scheduled: [scheduledOf(a, day(2026, 1, 7), day(2026, 1, 7))],
    });
    drag(shell, bar('P1.1'), { dx: -4 * 14 }); // Wed 7 Jan - 4 days = Sat 3 Jan, walks back to Fri 2 Jan
    expect(calls.onExtendViewStart).toHaveBeenCalledWith('2026-01-02');
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', { pinnedStart: '2026-01-02' });
  });

  it('the right handle of an open bar sets the fixed duration to the base plus the dragged days', () => {
    const a = leaf('P1.1', { fixedDurationDays: 3 });
    const { container, shell, calls } = mount({
      tree: [leaf('P1', { best: 0 }), a],
      scheduled: [scheduledOf(a, day(2026, 1, 7), day(2026, 1, 9), { fixedDurationDays: 3 })],
    });
    const handle = container.querySelector('.g-resize-handle');
    fireEvent.mouseDown(handle, { button: 0, clientX: 200, clientY: 100 });
    fireEvent.mouseMove(shell, { clientX: 200 + 2 * 14, clientY: 100 });
    fireEvent.mouseUp(shell);
    expect(calls.onSeqUpdate).toHaveBeenCalledTimes(1);
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', { fixedDurationDays: 5 });
  });

  it('Escape in the middle of a resize drag calls nothing, and the release afterwards neither', () => {
    const a = leaf('P1.1', { fixedDurationDays: 3 });
    const { container, shell, calls } = mount({
      tree: [leaf('P1', { best: 0 }), a],
      scheduled: [scheduledOf(a, day(2026, 1, 7), day(2026, 1, 9), { fixedDurationDays: 3 })],
    });
    const handle = container.querySelector('.g-resize-handle');
    fireEvent.mouseDown(handle, { button: 0, clientX: 200, clientY: 100 });
    fireEvent.mouseMove(shell, { clientX: 200 + 2 * 14, clientY: 100 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseUp(shell);
    expect(calls.onSeqUpdate).not.toHaveBeenCalled();
    expect(calls.onReorderSibling).not.toHaveBeenCalled();
  });

  it('a done bar dragged past today shifts both completed dates, caps the end at today and keeps the span', () => {
    const d = leaf('P1.1', { status: 'done', completedStart: '2026-01-06', completedEnd: '2026-01-09' });
    const { shell, bar, calls } = mount({
      tree: [leaf('P1', { best: 0 }), d],
      scheduled: [scheduledOf(d, day(2026, 1, 6), day(2026, 1, 9), { status: 'done' })],
    });
    // Today is Wed 14 Jan (faked). Ten days right would end on the 19th; the end stops at today
    // and the start follows, three days before it (the span of the recorded window).
    drag(shell, bar('P1.1'), { dx: 10 * 14 });
    expect(calls.onSeqUpdate).toHaveBeenCalledTimes(1);
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', {
      completedStart: '2026-01-11',
      completedEnd: '2026-01-14',
      completedAt: '2026-01-14',
    });
    // Pin is meaningless for done work: a move never writes pinnedStart.
    expect(calls.onSeqUpdate.mock.calls[0][1]).not.toHaveProperty('pinnedStart');
  });

  it('a done bar dragged inside the past moves both dates by the same number of days', () => {
    const d = leaf('P1.1', { status: 'done', completedStart: '2026-01-06', completedEnd: '2026-01-07' });
    const { shell, bar, calls } = mount({
      tree: [leaf('P1', { best: 0 }), d],
      scheduled: [scheduledOf(d, day(2026, 1, 6), day(2026, 1, 7), { status: 'done' })],
    });
    drag(shell, bar('P1.1'), { dx: 2 * 14 });
    expect(calls.onSeqUpdate).toHaveBeenCalledWith('P1.1', {
      completedStart: '2026-01-08',
      completedEnd: '2026-01-09',
      completedAt: '2026-01-09',
    });
  });
});

describe('dragging from the link handle', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const four = () => {
    const items = ['P1.1', 'P1.2', 'P1.3', 'P1.4'].map(id => leaf(id));
    return {
      tree: [leaf('P1', { best: 0 }), ...items],
      scheduled: items.map((it, i) => scheduledOf(it, day(2026, 1, 5), day(2026, 1, 6), { _selectionOrder: i })),
    };
  };
  const connectorOf = (c, id) => c.querySelector(`.g-link-connector[data-link-target="${id}"] .g-link-connector-dot`);

  it('releasing on another bar adds the dependency, target first', () => {
    const { container, shell, bar, calls } = mount(four());
    fireEvent.mouseDown(connectorOf(container, 'P1.1'), { button: 0, clientX: 150, clientY: 60 });
    fireEvent.mouseMove(shell, { clientX: 160, clientY: 90 });
    fireEvent.mouseUp(bar('P1.4'), { clientX: 160, clientY: 90 });
    expect(calls.onAddDep).toHaveBeenCalledTimes(1);
    expect(calls.onAddDep).toHaveBeenCalledWith('P1.4', 'P1.1');
  });

  it('releasing on empty space or on the source bar adds nothing', () => {
    const { container, shell, bar, calls } = mount(four());
    fireEvent.mouseDown(connectorOf(container, 'P1.1'), { button: 0, clientX: 150, clientY: 60 });
    fireEvent.mouseUp(shell, { clientX: 5, clientY: 5 });
    fireEvent.mouseDown(connectorOf(container, 'P1.1'), { button: 0, clientX: 150, clientY: 60 });
    fireEvent.mouseUp(bar('P1.1'));
    expect(calls.onAddDep).not.toHaveBeenCalled();
  });

  it('Escape during a link drag cancels it: the release afterwards adds nothing', () => {
    const { container, shell, bar, calls } = mount(four());
    fireEvent.mouseDown(connectorOf(container, 'P1.1'), { button: 0, clientX: 150, clientY: 60 });
    fireEvent.mouseMove(shell, { clientX: 160, clientY: 90 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseUp(bar('P1.4'));
    expect(calls.onAddDep).not.toHaveBeenCalled();
  });

  it('with the source inside a three-bar selection, every selected bar becomes a predecessor of the target', () => {
    const { container, shell, bar, calls } = mount(four());
    ['P1.1', 'P1.2', 'P1.3'].forEach(id => fireEvent.click(bar(id), { ctrlKey: true }));
    fireEvent.mouseDown(connectorOf(container, 'P1.2'), { button: 0, clientX: 150, clientY: 60 });
    fireEvent.mouseMove(shell, { clientX: 160, clientY: 90 });
    fireEvent.mouseUp(bar('P1.4'), { clientX: 160, clientY: 90 });
    expect(calls.onAddDep).toHaveBeenCalledTimes(3);
    // The dragged source first, then the rest of the selection in display order.
    expect(calls.onAddDep.mock.calls).toEqual([
      ['P1.4', 'P1.2'],
      ['P1.4', 'P1.1'],
      ['P1.4', 'P1.3'],
    ]);
  });

  it('with the target inside the selection and the source outside, the source precedes every selected bar', () => {
    const { container, shell, bar, calls } = mount(four());
    ['P1.2', 'P1.3'].forEach(id => fireEvent.click(bar(id), { ctrlKey: true }));
    fireEvent.mouseDown(connectorOf(container, 'P1.1'), { button: 0, clientX: 150, clientY: 60 });
    fireEvent.mouseMove(shell, { clientX: 160, clientY: 90 });
    fireEvent.mouseUp(bar('P1.3'), { clientX: 160, clientY: 90 });
    expect(calls.onAddDep.mock.calls).toEqual([
      ['P1.3', 'P1.1'],
      ['P1.2', 'P1.1'],
    ]);
  });
});

describe('dragging a bar up or down', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const three = () => {
    const items = ['P1.1', 'P1.2', 'P1.3'].map(id => leaf(id));
    return {
      tree: [leaf('P1', { best: 0 }), ...items],
      scheduled: items.map((it, i) => scheduledOf(it, day(2026, 1, 5), day(2026, 1, 6), { _selectionOrder: i })),
    };
  };

  it('more than 10 px vertically, in project grouping, asks to move the item one place down', () => {
    const { shell, bar, calls } = mount({ ...three(), storage: { planr_gantt_group: 'project' } });
    drag(shell, bar('P1.2'), { dy: 20 });
    expect(calls.onReorderSibling).toHaveBeenCalledTimes(1);
    expect(calls.onReorderSibling).toHaveBeenCalledWith('P1.2', 'down');
    // A reorder is not a pin.
    expect(calls.onSeqUpdate).not.toHaveBeenCalled();
  });

  it('upwards it asks for one place up', () => {
    const { shell, bar, calls } = mount({ ...three(), storage: { planr_gantt_group: 'project' } });
    drag(shell, bar('P1.2'), { dy: -20 });
    expect(calls.onReorderSibling).toHaveBeenCalledWith('P1.2', 'up');
  });

  it('with three bars selected, a downward drag moves the selection, bottom item first', () => {
    const { shell, bar, calls } = mount({ ...three(), storage: { planr_gantt_group: 'project' } });
    ['P1.1', 'P1.2', 'P1.3'].forEach(id => fireEvent.click(bar(id), { ctrlKey: true }));
    drag(shell, bar('P1.2'), { dy: 20 });
    expect(calls.onReorderSibling.mock.calls).toEqual([
      ['P1.3', 'down'],
      ['P1.2', 'down'],
      ['P1.1', 'down'],
    ]);
  });

  it('with three bars selected, an upward drag moves the selection, top item first', () => {
    const { shell, bar, calls } = mount({ ...three(), storage: { planr_gantt_group: 'project' } });
    ['P1.1', 'P1.2', 'P1.3'].forEach(id => fireEvent.click(bar(id), { ctrlKey: true }));
    drag(shell, bar('P1.2'), { dy: -20 });
    expect(calls.onReorderSibling.mock.calls).toEqual([
      ['P1.1', 'up'],
      ['P1.2', 'up'],
      ['P1.3', 'up'],
    ]);
  });

  it('in compact mode the same vertical drag asks for nothing', () => {
    const { shell, bar, calls } = mount({ ...three(), storage: { planr_gantt_group: 'project', planr_gantt_compact: 'true' } });
    drag(shell, bar('P1.2'), { dy: 20 });
    expect(calls.onReorderSibling).not.toHaveBeenCalled();
    expect(calls.onSeqUpdate).not.toHaveBeenCalled();
  });
});
