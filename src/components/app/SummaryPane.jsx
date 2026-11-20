import { Frozen } from '../shared/Frozen.jsx';
import { SumView } from '../views/SumView.jsx';

export function SummaryPane({ plan, view, handlers }) {
  const {
    archive,
    confidence,
    cpSet,
    data,
    diff,
    futureProgressByRootId,
    goalPaths,
    goals,
    hm,
    horizonDays,
    horizonEnd,
    horizonIds,
    members,
    projectWaitsOf,
    scheduled,
    scnShifts,
    sinceDate,
    stats,
    teams,
    tree,
    workDays,
  } = plan;
  const { archiveDays, diffOnlyChanged, horizonOnlyPlanned, setArchiveDays, setShowArchived, showArchived, sinceDays, tab } = view;
  const {
    onOpenItemDialog,
    onRoadmapAssignmentChange,
    onSumExportTodo,
    onSumNavigate,
    persistDiffOnlyChanged,
    persistHorizon,
    persistHorizonOnly,
    persistSince,
  } = handlers;
  return (
    <div className="pane" style={{ display: tab === 'summary' ? undefined : 'none' }}>
      <Frozen active={tab === 'summary'}>
        <SumView
          projectWaitsOf={projectWaitsOf}
          tree={tree}
          scheduled={scheduled}
          goals={goals}
          members={members}
          teams={teams}
          cpSet={cpSet}
          goalPaths={goalPaths}
          stats={stats}
          confidence={confidence}
          historyEvents={data?.historyEvents || []}
          sinceDays={sinceDays}
          persistSince={persistSince}
          sinceDate={sinceDate}
          diff={diff}
          scenarioShifts={scnShifts}
          diffOnlyChanged={diffOnlyChanged}
          persistDiffOnlyChanged={persistDiffOnlyChanged}
          horizonDays={horizonDays}
          persistHorizon={persistHorizon}
          horizonEnd={horizonEnd}
          horizonIds={horizonIds}
          horizonOnlyPlanned={horizonOnlyPlanned}
          persistHorizonOnly={persistHorizonOnly}
          futureProgressByRootId={futureProgressByRootId}
          workDays={workDays}
          holidayIso={new Set(Object.keys(hm || {}))}
          roadmapAssignment={data?.roadmapAssignment || null}
          onAssignmentChange={onRoadmapAssignmentChange}
          archive={archive}
          showArchived={showArchived}
          setShowArchived={setShowArchived}
          archiveDays={archiveDays}
          setArchiveDays={setArchiveDays}
          onNavigate={onSumNavigate}
          onOpenItem={onOpenItemDialog}
          onExportTodo={onSumExportTodo}
        />
      </Frozen>
    </div>
  );
}
