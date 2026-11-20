import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { Icon } from '../shared/Icon.jsx';
import { TreeView } from '../views/TreeView.jsx';

export function TreeList({
  cpLabels,
  cpSet,
  data,
  deferredSearch,
  diff,
  diffOnlyChanged,
  editorAsDialog,
  hideDone,
  horizonEnd,
  horizonIds,
  horizonOnlyPlanned,
  members,
  multiSel,
  onGanttTaskUpdate,
  onTreeBulkDelete,
  onTreeCommand,
  onTreeCommandMany,
  onTreeDelete,
  onTreeDropRows,
  onTreeInsertAfter,
  onTreeInsertChild,
  onTreeMove,
  onTreePasteRows,
  onTreeRevealHidden,
  onTreeSelect,
  onTreeSelectAll,
  persistSince,
  personFilter,
  rootFilter,
  scheduled,
  scnChangedIds,
  selected,
  setBulkEditModalOpen,
  setMN,
  setModal,
  setMultiSel,
  showTreeIds,
  sinceDate,
  sinceDays,
  stats,
  teamFilter,
  teams,
  tree,
  visibleTreeForViews,
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {!visibleTreeForViews.length ? (
        <div className="empty" style={{ marginTop: 60 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--tx3)' }}>
            <Icon name="list" size={32} strokeWidth={1.4} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx2)', marginBottom: 8 }}>
            {hideDone && tree.length ? 'No visible open items' : 'No items yet'}
          </div>
          <button className="btn btn-pri" onClick={() => setModal('add')}>
            + Add first item
          </button>
        </div>
      ) : (
        <TreeView
          changedIds={scnChangedIds}
          tree={visibleTreeForViews}
          selected={selected}
          multiSel={multiSel}
          onSelect={onTreeSelect}
          showIds={showTreeIds}
          onFullEdit={node => {
            setMN(node);
            setModal('node');
          }}
          editorInDialog={editorAsDialog}
          search={deferredSearch}
          teamFilter={teamFilter}
          rootFilter={rootFilter}
          personFilter={personFilter}
          stats={stats}
          teams={teams}
          members={members}
          scheduled={scheduled}
          cpSet={cpSet}
          cpLabels={cpLabels}
          customFields={data.customFields || DEFAULT_CUSTOM_FIELDS}
          sizes={data.sizes || []}
          historyEvents={data?.historyEvents || []}
          sinceDays={sinceDays}
          persistSince={persistSince}
          sinceDate={sinceDate}
          diff={diff}
          onlyChanged={diffOnlyChanged}
          horizonIds={horizonIds}
          horizonEnd={horizonEnd}
          horizonOnlyPlanned={horizonOnlyPlanned}
          roadmapAssignment={data?.roadmapAssignment || null}
          onDelete={onTreeDelete}
          onTaskUpdate={onGanttTaskUpdate}
          onClearSelection={() => setMultiSel(new Set())}
          onOpenBulkEdit={() => setBulkEditModalOpen(true)}
          onMove={onTreeMove}
          onCommand={onTreeCommand}
          onCommandMany={onTreeCommandMany}
          onDropRows={onTreeDropRows}
          onSelectAll={onTreeSelectAll}
          onRevealHidden={onTreeRevealHidden}
          onInsertAfter={onTreeInsertAfter}
          onInsertChild={onTreeInsertChild}
          onBulkDelete={onTreeBulkDelete}
          onPasteRows={onTreePasteRows}
        />
      )}
    </div>
  );
}
