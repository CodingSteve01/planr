import { Icon } from '../shared/Icon.jsx';
import { AddModal } from '../modals/AddModal.jsx';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { EstimationWizard } from '../modals/EstimationWizard.jsx';
import { NodeModal } from '../modals/NodeModal.jsx';

function BulkEditModal({ view, _t, renderBulkEditBody }) {
  const { bulkEditModalOpen, multiSel, setBulkEditModalOpen } = view;
  if (!bulkEditModalOpen || multiSel.size === 0) return null;
  return (
    <div className="overlay" onClick={() => setBulkEditModalOpen(false)}>
      <div className="modal" style={{ width: 'min(640px, 96vw)', maxHeight: '88vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>{_t('bulk.title') || `Massenänderung — ${multiSel.size} Items`}</h2>
          <button className="btn btn-ghost btn-icon sm" onClick={() => setBulkEditModalOpen(false)} aria-label={_t('close')}>
            <Icon name="x" size={11} />
          </button>
        </div>
        {renderBulkEditBody()}
      </div>
    </div>
  );
}

function EstimateModal({ plan, view, handlers }) {
  const { data, teams, tree } = plan;
  const { modal, modalNode, setMN, setModal } = view;
  const { updateNode } = handlers;
  if (modal !== 'estimate' || !modalNode) return null;
  return (
    <EstimationWizard
      node={tree.find(r => r.id === modalNode.id) || modalNode}
      tree={tree}
      teams={teams}
      taskTemplates={data.taskTemplates || []}
      risks={data.risks || []}
      sizes={data.sizes || []}
      onSave={est => {
        const node = tree.find(r => r.id === modalNode.id);
        if (node) updateNode({ ...node, ...est });
      }}
      onClose={() => {
        setModal(null);
        setMN(null);
      }}
    />
  );
}

export function ItemModals({ plan, view, handlers, _t, renderBulkEditBody }) {
  const { confReasons, confidence, cpLabels, cpSet, data, members, past, scheduled, stats, teams, tree } = plan;
  const { editorAsDialog, modal, modalFocus, modalNode, selected, setEditorDock, setMN, setModal, setModalFocus, setSel } = view;
  const { addNode, deleteNode, duplicateNode, moveNode, mutate, splitHandoff, splitTaskAtProgress, updateNode } = handlers;
  return (
    <>
      {modal === 'node' && modalNode && (
        <NodeModal
          node={tree.find(r => r.id === modalNode.id) || modalNode}
          tree={tree}
          members={members}
          teams={teams}
          taskTemplates={data.taskTemplates || []}
          sizes={data.sizes || []}
          customFields={data.customFields || DEFAULT_CUSTOM_FIELDS}
          scheduled={scheduled}
          cpSet={cpSet}
          cpLabels={cpLabels}
          stats={stats}
          confidence={confidence}
          confReasons={confReasons}
          historyEvents={data?.historyEvents || []}
          viewDay={past?.day || ''}
          focusRequest={modalFocus}
          onClose={() => {
            setModal(null);
            setMN(null);
            setModalFocus(null);
          }}
          onUpdate={updateNode}
          onDelete={deleteNode}
          onEstimate={n => {
            setMN(n);
            setModal('estimate');
          }}
          onDockSide={
            editorAsDialog
              ? () => {
                  setEditorDock('side');
                  setModal(null);
                  setMN(null);
                  setModalFocus(null);
                }
              : undefined
          }
          onDuplicate={id => {
            const newId = duplicateNode(id);
            if (newId) {
              setModal(null);
              setMN(null);
              setModalFocus(null);
              setTimeout(() => {
                const n = tree.find(r => r.id === newId) || { id: newId };
                setSel(n);
              }, 50);
            }
          }}
          onMove={(id, newParentId) => {
            const newId = moveNode(id, newParentId);
            if (newId) {
              setMN({ id: newId });
              setModalFocus(null);
              setTimeout(() => {
                const n = { ...modalNode, id: newId };
                setSel(n);
              }, 50);
            }
          }}
          onSplitHandoff={splitHandoff}
          onSplitTaskAtProgress={splitTaskAtProgress}
          onHistoryChange={events => {
            mutate(d => ({ ...d, historyEvents: events }));
          }}
          onNavigate={id => {
            const target = tree.find(r => r.id === id);
            if (!target) return;
            setModalFocus(null);
            setMN(target);
            setSel(target);
          }}
        />
      )}
      {modal === 'add' && (
        <AddModal
          tree={tree}
          teams={teams}
          members={members}
          taskTemplates={data.taskTemplates || []}
          sizes={data.sizes || []}
          selected={selected}
          onAdd={addNode}
          onClose={() => setModal(null)}
        />
      )}
      <BulkEditModal view={view} _t={_t} renderBulkEditBody={renderBulkEditBody} />
      <EstimateModal plan={plan} view={view} handlers={handlers} />
    </>
  );
}
