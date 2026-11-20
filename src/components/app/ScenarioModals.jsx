import { ScenarioCompare } from '../shared/Scenario.jsx';

export function ScenarioModals({ plan, view, handlers }) {
  const { activeScenario, data, scn, scnChanges, scnCompareMemory, scnComparison, tree } = plan;
  const { modal, setModal, setSel, setTab } = view;
  const { exportScenarioPDF, scenarioApply, scenarioRevertChange } = handlers;
  return (
    <>
      {modal === 'scenario' && scn && (
        <ScenarioCompare
          scenario={activeScenario}
          base={scn.base}
          work={data}
          comparison={scnComparison}
          changes={scnChanges}
          conflicts={scn.conflicts || 0}
          memory={scnCompareMemory.current}
          onExport={exportScenarioPDF}
          onClose={() => setModal(null)}
          onApply={scenarioApply}
          onRevert={scenarioRevertChange}
          onOpenItem={id => {
            if (!tree.some(r => r.id === id)) return;
            setModal(null);
            setTab('tree');
            setSel(id);
          }}
        />
      )}
    </>
  );
}
