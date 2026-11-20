import { ScenarioCompare } from '../shared/Scenario.jsx';
import { SnapshotModal } from '../modals/SnapshotModal.jsx';
import { pushSnapshot } from '../../app/snapshots.js';

export function ScenarioModals({ plan, view, handlers }) {
  const { activeScenario, data, scn, scnChanges, scnCompareMemory, scnComparison, tree } = plan;
  const { modal, setModal, setSel, setTab } = view;
  const { exportScenarioPDF, resetHistory, scenarioApply, scenarioRevertChange, setData, setSaved } = handlers;
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
      {modal === 'snapshots' && (
        <SnapshotModal
          onClose={() => setModal(null)}
          onRestore={snap => {
            if (
              !confirm(
                `Restore project from snapshot of ${new Date(snap.ts).toLocaleString()}? Current state will be replaced (a fresh snapshot of it is taken first).`,
              )
            )
              return;
            // Take a defensive snapshot of current state before restoring.
            if (data) pushSnapshot(data);
            setData(snap.data);
            resetHistory();
            setSaved(false);
            setModal(null);
          }}
          onExportJson={snap => {
            const blob = new Blob([JSON.stringify(snap.data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `planr-snapshot-${new Date(snap.ts).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
            a.click();
          }}
        />
      )}
    </>
  );
}
