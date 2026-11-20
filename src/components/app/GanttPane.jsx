import { Frozen } from '../shared/Frozen.jsx';
import { GanttView } from '../views/GanttView.jsx';

export function GanttPane({ plan, view, handlers }) {
  const {
    activeScheduled,
    activeTree,
    confReasons,
    confidence,
    cpLabels,
    data,
    diff,
    diffDoneSet,
    diffProgressedSet,
    horizonEnd,
    horizonIds,
    members,
    personQueues,
    planStart,
    scnBaseline,
    searchIdx,
    sinceDate,
    teams,
    vacations,
    viewCpEdges,
    viewCpSet,
    viewGoals,
    weeks,
    workDays,
  } = plan;
  const {
    deferredSearch,
    diffOnlyChanged,
    hideDone,
    horizonOnlyPlanned,
    personFilter,
    rootFilter,
    setBulkEditModalOpen,
    setMultiSel,
    tab,
    teamFilter,
  } = view;
  const {
    onGanttAddDep,
    onGanttBarClick,
    onGanttExtendViewStart,
    onGanttRemoveDep,
    onGanttReorderSibling,
    onGanttSeqUpdate,
    onGanttTaskUpdate,
  } = handlers;
  return (
    <div className="pane-full" style={{ display: tab === 'gantt' ? 'flex' : 'none' }}>
      <Frozen active={tab === 'gantt'}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', overflow: 'hidden' }}>
          <GanttView
            baseline={scnBaseline}
            scheduled={activeScheduled}
            weeks={weeks}
            goals={viewGoals}
            teams={teams}
            members={members}
            vacations={vacations}
            meetingPlans={data.meetingPlans || []}
            cpSet={viewCpSet}
            cpLabels={cpLabels}
            cpEdges={viewCpEdges}
            tree={activeTree}
            hideDone={hideDone}
            search={deferredSearch}
            searchIdx={searchIdx}
            workDays={workDays}
            planStart={planStart}
            confidence={confidence}
            confReasons={confReasons}
            rootFilter={rootFilter}
            teamFilter={teamFilter}
            personFilter={personFilter}
            diffDoneIds={diffDoneSet}
            diffProgressedIds={diffProgressedSet}
            diffPastLeafState={diff?.pastLeafState}
            sinceDate={sinceDate}
            onlyChanged={diffOnlyChanged}
            horizonIds={horizonIds}
            horizonEnd={horizonEnd}
            horizonOnlyPlanned={horizonOnlyPlanned}
            onBarClick={onGanttBarClick}
            onSeqUpdate={onGanttSeqUpdate}
            onExtendViewStart={onGanttExtendViewStart}
            onTaskUpdate={onGanttTaskUpdate}
            onRemoveDep={onGanttRemoveDep}
            onAddDep={onGanttAddDep}
            onReorderSibling={onGanttReorderSibling}
            personQueues={personQueues}
            onOpenBulkEdit={ids => {
              if (ids) setMultiSel(new Set(ids));
              setBulkEditModalOpen(true);
            }}
          />
        </div>
      </Frozen>
    </div>
  );
}
