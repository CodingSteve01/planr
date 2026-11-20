import { AddModal } from '../modals/AddModal.jsx';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { NodeModal } from '../modals/NodeModal.jsx';

export function EditModals({ plan, view, handlers }) {
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
    </>
  );
}
