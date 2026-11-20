import { EffectiveBar } from '../shared/Effective.jsx';
import { ScenarioBar, ScenarioNotice } from '../shared/Scenario.jsx';

export function ScenarioStrip({
  activeScenario,
  effCount,
  effDate,
  effDropDate,
  handleUndo,
  past,
  pastStart,
  pickEffDate,
  scenarioApply,
  scenarioCreate,
  scenarioDelete,
  scenarioRename,
  scenarioSwitch,
  scn,
  scnChanges,
  scnComparison,
  scnNotice,
  setModal,
  setScnNotice,
  setTab,
  tab,
}) {
  return (
    <>
      {scn && (
        <ScenarioBar
          scenario={activeScenario}
          changeCount={scnChanges.length}
          comparison={scnComparison}
          conflicts={scn.conflicts || 0}
          onRename={scenarioRename}
          onDuplicate={id => scenarioCreate('', { copyOf: id })}
          onCompare={() => setModal('scenario')}
          onApply={scenarioApply}
          onDelete={scenarioDelete}
          onLeave={() => scenarioSwitch(null)}
        />
      )}
      <EffectiveBar
        date={effDate}
        count={effCount}
        showResources={tab !== 'resources'}
        onResources={() => setTab('resources')}
        travel={!!past}
        logStart={pastStart}
        onDropDate={effDropDate}
        onLeave={() => pickEffDate('')}
      />
      {!scn && <ScenarioNotice notice={scnNotice} onUndo={handleUndo} onClose={() => setScnNotice(null)} />}
    </>
  );
}
