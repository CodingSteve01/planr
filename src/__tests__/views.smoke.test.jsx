/** @vitest-environment happy-dom */
// Smoke tests for each memo'd view. Each one mounts with a minimal project
// payload and asserts the render doesn't throw. Catches missing imports,
// unwrapped JSX, and prop-shape mismatches introduced by future refactors.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
  beforeEach(() => cleanup());

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
        onReorderInQueue={noop} onReorderSibling={noop} />,
    )).not.toThrow();
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
