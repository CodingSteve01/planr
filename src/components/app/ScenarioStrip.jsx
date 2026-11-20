import { EffectiveBar } from '../shared/Effective.jsx';
import { ScenarioBar, ScenarioNotice } from '../shared/Scenario.jsx';

export function ScenarioStrip({ plan, view, handlers }) {
  const { activeScenario, effCount, effDate, effDropDate, past, pastStart, scn, scnChanges, scnComparison } = plan;
  const { scnNotice, setModal, setScnNotice, setTab, tab } = view;
  const { handleUndo, pickEffDate, scenarioApply, scenarioCreate, scenarioDelete, scenarioRename, scenarioSwitch } = handlers;
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
