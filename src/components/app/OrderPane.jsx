import { Frozen } from '../shared/Frozen.jsx';
import { WorkOrderView } from '../views/WorkOrderView.jsx';

/* `activeTree` — the archive-filtered tree, not the view-filtered one.
          This view runs its own three filters, and it has to see the work the
          schedule GAVE somebody before it can narrow to them; the pre-filtered
          tree matches on `assign`, so filtering to a person with nothing
          hand-assigned emptied the screen. */
export function OrderPane({
  activeTree,
  data,
  deferredSearch,
  members,
  onGanttTaskUpdate,
  onQueueReorder,
  onQueueReset,
  personFilter,
  personQueues,
  rootFilter,
  scheduled,
  setBulkEditModalOpen,
  setMN,
  setModal,
  setMultiSel,
  tab,
  teamFilter,
  teams,
}) {
  return (
    <div className="pane" style={{ display: tab === 'order' ? undefined : 'none' }}>
      <Frozen active={tab === 'order'}>
        <WorkOrderView
          tree={activeTree}
          members={members}
          teams={teams}
          scheduled={scheduled}
          sizes={data?.sizes || []}
          rootFilter={rootFilter}
          teamFilter={teamFilter}
          personFilter={personFilter}
          search={deferredSearch}
          personQueues={personQueues}
          onQueueReorder={onQueueReorder}
          onQueueReset={onQueueReset}
          onTaskUpdate={onGanttTaskUpdate}
          onFullEdit={node => {
            setMN(node);
            setModal('node');
          }}
          onOpenBulkEdit={ids => {
            setMultiSel(new Set(ids));
            setBulkEditModalOpen(true);
          }}
        />
      </Frozen>
    </div>
  );
}
