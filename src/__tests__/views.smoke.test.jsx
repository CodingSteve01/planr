/** @vitest-environment happy-dom */
// Smoke tests for each memo'd view. Each one mounts with a minimal project
// payload and asserts the render doesn't throw. Catches missing imports,
// unwrapped JSX, and prop-shape mismatches introduced by future refactors.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { TreeView } from '../components/views/TreeView.jsx';
import { GanttView } from '../components/views/GanttView.jsx';
import { NetGraph } from '../components/views/NetGraph.jsx';
import { PlanReview } from '../components/views/PlanReview.jsx';
import { SumView } from '../components/views/SumView.jsx';
import { BriefingView } from '../components/views/BriefingView.jsx';
import { ResView } from '../components/views/ResView.jsx';
import { HolView } from '../components/views/HolView.jsx';

const tree = [{ id: 'P1', name: 'Item', team: 'T1', best: 5, factor: 1.5, status: 'open', deps: [], assign: [] }];
const teams = [{ id: 'T1', name: 'Team A', color: '#3b82f6' }];
const members = [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 }];
const scheduled = [];
const stats = {};
const weeks = [{ mon: new Date('2026-01-05'), wds: [new Date('2026-01-05')] }];
const noop = () => {};

function wrap(node) {
  return render(
    <I18nProvider>
      <ThemeProvider>{node}</ThemeProvider>
    </I18nProvider>,
  );
}

describe('view smoke', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('TreeView mounts', () => {
    expect(() => wrap(
      <TreeView tree={tree} selected={null} multiSel={new Set()} onSelect={noop}
        search="" teamFilter="" rootFilter="" personFilter=""
        stats={stats} teams={teams} members={members} scheduled={scheduled}
        cpSet={new Set()} customFields={[]}
        onQuickAdd={noop} onDelete={noop} onReorder={noop} />,
    )).not.toThrow();
  });

  it('GanttView mounts', () => {
    expect(() => wrap(
      <GanttView scheduled={scheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={tree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    )).not.toThrow();
  });

  it('GanttView updates the timeline zoom through the zoom control', () => {
    localStorage.setItem('planr_gantt_zoom', '20');
    const scheduledTask = {
      ...tree[0],
      treeId: 'P1',
      startWi: 0,
      endWi: 0,
      startD: new Date('2026-01-05'),
      endD: new Date('2026-01-05'),
      assign: [],
    };
    const { container } = wrap(
      <GanttView scheduled={[scheduledTask]} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={tree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );

    fireEvent.click(container.querySelector('[data-htip="Zoom in"]'));

    expect(Number(localStorage.getItem('planr_gantt_zoom'))).toBeGreaterThan(20);
  });

  it('GanttView zooms the timeline with Ctrl+mouse wheel around the cursor', async () => {
    localStorage.setItem('planr_gantt_zoom', '20');
    const scheduledTask = {
      ...tree[0],
      treeId: 'P1',
      startWi: 0,
      endWi: 0,
      startD: new Date('2026-01-05'),
      endD: new Date('2026-01-05'),
      assign: [],
    };
    const { getByTestId } = wrap(
      <GanttView scheduled={[scheduledTask]} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={tree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );
    const timeline = getByTestId('gantt-timeline');
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 200, top: 0, bottom: 120, width: 200, height: 120 }),
    });
    timeline.scrollLeft = 100;

    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      ctrlKey: { value: true },
      deltaY: { value: -100 },
      clientX: { value: 50 },
      clientY: { value: 10 },
    });
    timeline.dispatchEvent(event);

    expect(Number(localStorage.getItem('planr_gantt_zoom'))).toBeGreaterThan(20);
    await waitFor(() => expect(timeline.scrollLeft).toBeGreaterThan(110));
    expect(timeline.scrollLeft).toBeLessThan(125);
  });

  it('GanttView pans the timeline with Alt-drag on empty space', () => {
    const scheduledTask = {
      ...tree[0],
      treeId: 'P1',
      startWi: 0,
      endWi: 0,
      startD: new Date('2026-01-05'),
      endD: new Date('2026-01-05'),
      assign: [],
    };
    const { container, getByTestId } = wrap(
      <GanttView scheduled={[scheduledTask]} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={tree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );
    const timeline = getByTestId('gantt-timeline');
    timeline.scrollLeft = 80;
    timeline.scrollTop = 20;

    fireEvent.mouseDown(timeline, { button: 0, altKey: true, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(container.querySelector('.gantt'), { altKey: true, clientX: 60, clientY: 90 });
    fireEvent.mouseUp(container.querySelector('.gantt'));

    expect(timeline.scrollLeft).toBe(120);
    expect(timeline.scrollTop).toBe(30);
  });

  it('GanttView supports rectangle selection and serial bulk linking', () => {
    localStorage.setItem('planr_gantt_group', 'thread');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ thread: [] }));
    const onAddDep = vi.fn();
    const selectionTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'open', deps: [], assign: [] },
      { id: 'P1.1', name: 'First', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
      { id: 'P1.2', name: 'Second', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
      { id: 'P1.3', name: 'Third', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
    ];
    const selectionScheduled = selectionTree
      .filter(item => item.id !== 'P1')
      .map((item, idx) => ({
        ...item,
        treeId: item.id,
        startWi: 0,
        endWi: 0,
        startD: new Date('2026-01-05'),
        endD: new Date('2026-01-05'),
        assign: [],
        _selectionOrder: idx,
      }));
    const { container, getByTestId } = wrap(
      <GanttView scheduled={selectionScheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={selectionTree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={onAddDep}
        onReorderSibling={noop} />,
    );
    const timeline = getByTestId('gantt-timeline');
    const shell = container.querySelector('.gantt');

    fireEvent.mouseDown(timeline, { button: 0, clientX: 0, clientY: 30 });
    fireEvent.mouseMove(shell, { clientX: 130, clientY: 190 });
    fireEvent.mouseUp(shell);

    expect(getByTestId('gantt-selection-count').textContent).toContain('3');
    fireEvent.click(getByTestId('gantt-link-selected'));

    expect(onAddDep).toHaveBeenCalledWith('P1.2', 'P1.1');
    expect(onAddDep).toHaveBeenCalledWith('P1.3', 'P1.2');
  });

  it('GanttView selects all visible bars with Cmd/Ctrl+A', () => {
    localStorage.setItem('planr_gantt_group', 'thread');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ thread: [] }));
    const selectionTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'open', deps: [], assign: [] },
      { id: 'P1.1', name: 'First', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
      { id: 'P1.2', name: 'Second', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
    ];
    const selectionScheduled = selectionTree
      .filter(item => item.id !== 'P1')
      .map(item => ({
        ...item,
        treeId: item.id,
        startWi: 0,
        endWi: 0,
        startD: new Date('2026-01-05'),
        endD: new Date('2026-01-05'),
        assign: [],
      }));
    const { getByTestId } = wrap(
      <GanttView scheduled={selectionScheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={selectionTree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });

    expect(getByTestId('gantt-selection-count').textContent).toContain('2');
  });

  it('GanttView removes incoming and outgoing links for a rectangle selection', () => {
    localStorage.setItem('planr_gantt_group', 'thread');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ thread: [] }));
    const onRemoveDep = vi.fn();
    const selectionTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'open', deps: [], assign: [] },
      { id: 'P1.0', name: 'External predecessor', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
      { id: 'P1.1', name: 'First', team: 'T1', best: 2, factor: 1, status: 'open', deps: ['P1.0'], softDeps: [], assign: [] },
      { id: 'P1.2', name: 'Second', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], softDeps: ['P1.1'], assign: [] },
      { id: 'P1.3', name: 'Outside successor', team: 'T1', best: 2, factor: 1, status: 'open', deps: ['P1.2'], assign: [] },
    ];
    const selectionScheduled = selectionTree
      .filter(item => item.id !== 'P1')
      .map((item, idx) => ({
        ...item,
        treeId: item.id,
        startWi: 0,
        endWi: 0,
        startD: new Date('2026-01-05'),
        endD: new Date('2026-01-05'),
        assign: [],
        _selectionOrder: idx,
      }));
    const { container, getByTestId } = wrap(
      <GanttView scheduled={selectionScheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={selectionTree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onRemoveDep={onRemoveDep} onAddDep={noop}
        onReorderSibling={noop} />,
    );
    const timeline = getByTestId('gantt-timeline');
    const shell = container.querySelector('.gantt');

    fireEvent.mouseDown(timeline, { button: 0, clientX: 0, clientY: 84 });
    fireEvent.mouseMove(shell, { clientX: 130, clientY: 150 });
    fireEvent.mouseUp(shell);
    fireEvent.click(getByTestId('gantt-clear-selected-links'));

    expect(onRemoveDep).toHaveBeenCalledWith('P1.1', 'P1.0');
    expect(onRemoveDep).toHaveBeenCalledWith('P1.2', 'P1.1');
    expect(onRemoveDep).toHaveBeenCalledWith('P1.3', 'P1.2');
  });

  it('GanttView can remove only soft links for a rectangle selection', () => {
    localStorage.setItem('planr_gantt_group', 'thread');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ thread: [] }));
    const onTaskUpdate = vi.fn();
    const selectionTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'open', deps: [], assign: [] },
      { id: 'P1.0', name: 'External predecessor', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
      { id: 'P1.1', name: 'First', team: 'T1', best: 2, factor: 1, status: 'open', deps: ['P1.0'], softDeps: [], assign: [] },
      { id: 'P1.2', name: 'Second', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], softDeps: ['P1.1'], assign: [] },
      { id: 'P1.3', name: 'Outside successor', team: 'T1', best: 2, factor: 1, status: 'open', deps: ['P1.2'], softDeps: [], assign: [] },
    ];
    const selectionScheduled = selectionTree
      .filter(item => item.id !== 'P1')
      .map((item, idx) => ({
        ...item,
        treeId: item.id,
        startWi: 0,
        endWi: 0,
        startD: new Date('2026-01-05'),
        endD: new Date('2026-01-05'),
        assign: [],
        _selectionOrder: idx,
      }));
    const { container, getByTestId } = wrap(
      <GanttView scheduled={selectionScheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={selectionTree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={onTaskUpdate} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );
    const timeline = getByTestId('gantt-timeline');
    const shell = container.querySelector('.gantt');

    fireEvent.mouseDown(timeline, { button: 0, clientX: 0, clientY: 84 });
    fireEvent.mouseMove(shell, { clientX: 130, clientY: 150 });
    fireEvent.mouseUp(shell);
    fireEvent.click(getByTestId('gantt-clear-selected-soft-links'));

    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.2', deps: [], softDeps: [] }));
    expect(onTaskUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.1', deps: [], softDeps: [] }));
    expect(onTaskUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.3', deps: [], softDeps: [] }));
  });

  it('GanttView clear-all links also marks newly link-free planned tasks as parallel', () => {
    localStorage.setItem('planr_gantt_group', 'thread');
    localStorage.setItem('planr_gantt_collapsed', JSON.stringify({ thread: [] }));
    const onTaskUpdate = vi.fn();
    const onRemoveDep = vi.fn();
    const selectionTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'open', deps: [], assign: [] },
      { id: 'P1.0', name: 'External predecessor', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
      { id: 'P1.1', name: 'First', team: 'T1', best: 2, factor: 1, status: 'open', deps: ['P1.0'], softDeps: [], assign: [] },
      { id: 'P1.2', name: 'Second', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], softDeps: ['P1.1'], assign: [] },
      { id: 'P1.3', name: 'Outside successor', team: 'T1', best: 2, factor: 1, status: 'open', deps: ['P1.2'], softDeps: [], assign: [] },
    ];
    const selectionScheduled = selectionTree
      .filter(item => item.id !== 'P1')
      .map((item, idx) => ({
        ...item,
        treeId: item.id,
        startWi: 0,
        endWi: 0,
        startD: new Date('2026-01-05'),
        endD: new Date('2026-01-05'),
        assign: [],
        _selectionOrder: idx,
      }));
    const { container, getByTestId } = wrap(
      <GanttView scheduled={selectionScheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={selectionTree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={onTaskUpdate} onRemoveDep={onRemoveDep} onAddDep={noop}
        onReorderSibling={noop} />,
    );
    const timeline = getByTestId('gantt-timeline');
    const shell = container.querySelector('.gantt');

    fireEvent.mouseDown(timeline, { button: 0, clientX: 0, clientY: 84 });
    fireEvent.mouseMove(shell, { clientX: 130, clientY: 150 });
    fireEvent.mouseUp(shell);
    fireEvent.click(getByTestId('gantt-clear-selected-links'));

    expect(onRemoveDep).not.toHaveBeenCalled();
    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.1', deps: [], softDeps: [], parallel: true }));
    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.2', deps: [], softDeps: [], parallel: true }));
    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.3', deps: [], softDeps: [], parallel: true }));
  });

  it('GanttView keeps changed done items visible when hideDone is active in diff mode', () => {
    const doneTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'wip', deps: [], assign: [] },
      {
        id: 'P1.1',
        name: 'Recently completed',
        team: 'T1',
        best: 2,
        factor: 1,
        status: 'done',
        deps: [],
        assign: [],
        completedStart: '2026-01-05',
        completedEnd: '2026-01-05',
      },
      { id: 'P1.2', name: 'Open work', team: 'T1', best: 2, factor: 1, status: 'open', deps: [], assign: [] },
    ];
    const doneScheduled = doneTree
      .filter(item => item.id !== 'P1')
      .map((item, idx) => ({
        ...item,
        treeId: item.id,
        startWi: idx,
        endWi: idx,
        startD: new Date('2026-01-05'),
        endD: new Date('2026-01-05'),
        assign: [],
      }));
    const { container } = wrap(
      <GanttView scheduled={doneScheduled} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={doneTree} hideDone diffDoneIds={['P1.1']} sinceDate={new Date('2026-01-01')}
        workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={noop} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );

    expect(container.textContent).toContain('Recently completed');
    expect(container.textContent).toContain('Open work');
  });

  it('GanttView opens done bars on click and shows their item tooltip on hover', () => {
    const onBarClick = vi.fn();
    const doneTree = [
      { id: 'P1', name: 'Project', team: 'T1', best: 0, factor: 1.5, status: 'done', deps: [], assign: [] },
      { id: 'P1.1', name: 'Work package', team: 'T1', best: 0, factor: 1.5, status: 'done', deps: [], assign: [] },
      {
        id: 'P1.1.1',
        name: 'Item',
        team: 'T1',
        best: 5,
        factor: 1.5,
        status: 'done',
        deps: [],
        assign: [],
        completedStart: '2026-01-05',
        completedEnd: '2026-01-05',
        completedAt: '2026-01-05',
      },
      {
        id: 'P1.1.2',
        name: 'Second item',
        team: 'T1',
        best: 1,
        factor: 1,
        status: 'done',
        deps: [],
        assign: [],
        completedStart: '2026-01-05',
        completedEnd: '2026-01-05',
        completedAt: '2026-01-05',
      },
    ];
    const { container } = wrap(
      <GanttView scheduled={[]} weeks={weeks} goals={[]} teams={teams}
        members={members} vacations={[]} cpSet={new Set()} cpEdges={[]}
        tree={doneTree} workDays={[1, 2, 3, 4, 5]} planStart="2026-01-01"
        onBarClick={onBarClick} onSeqUpdate={noop} onExtendViewStart={noop}
        onTaskUpdate={noop} onRemoveDep={noop} onAddDep={noop}
        onReorderSibling={noop} />,
    );
    const bar = container.querySelector('[data-task-bar="P1.1.1"]');

    fireEvent.mouseEnter(bar, { clientX: 100, clientY: 80 });
    expect(container.querySelector('.tt-title')?.textContent).toContain('P1.1.1');

    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalled();
  });

  it('NetGraph mounts', () => {
    expect(() => wrap(
      <NetGraph tree={tree} scheduled={scheduled} teams={teams} members={members}
        cpSet={new Set()} stats={stats}
        onNodeClick={noop} onAddNode={noop} onAddDep={noop} onDeleteNode={noop} />,
    )).not.toThrow();
  });

  it('PlanReview mounts', () => {
    expect(() => wrap(
      <PlanReview tree={tree} scheduled={scheduled} members={members} teams={teams}
        confidence={{}} cpSet={new Set()} stats={stats}
        onOpenItem={noop} onUpdate={noop} />,
    )).not.toThrow();
  });

  it('SumView mounts', () => {
    expect(() => wrap(
      <SumView tree={tree} scheduled={scheduled} goals={[]} members={members}
        teams={teams} cpSet={new Set()} goalPaths={{}} stats={stats}
        onNavigate={noop} onOpenItem={noop} onExportTodo={noop} />,
    )).not.toThrow();
  });

  it('BriefingView mounts', () => {
    expect(() => wrap(
      <BriefingView tree={tree} scheduled={scheduled} vacations={[]} members={members}
        teams={teams} stats={stats} cpSet={new Set()}
        onOpenItem={noop} onExportTodo={noop} />,
    )).not.toThrow();
  });

  it('ResView mounts', () => {
    expect(() => wrap(
      <ResView members={members} teams={teams} vacations={[]} meetingPlans={[]}
        onMeetingPlansUpd={noop} onUpd={noop} onAdd={noop} onClone={noop}
        onDel={noop} onVac={noop} onTeamUpd={noop} onTeamAdd={noop} onTeamDel={noop} />,
    )).not.toThrow();
  });

  it('HolView mounts', () => {
    expect(() => wrap(
      <HolView holidays={[]} planStart="2026-01-01" planEnd="2027-01-01" onUpdate={noop} />,
    )).not.toThrow();
  });
});
