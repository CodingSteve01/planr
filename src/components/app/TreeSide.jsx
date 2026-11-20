import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { Icon } from '../shared/Icon.jsx';
import { BulkEditBody } from './BulkEditBody.jsx';
import { QuickEdit } from '../views/QuickEdit.jsx';

export function TreeSide({ plan, view, handlers, _t }) {
  const { confReasons, confidence, cpLabels, cpSet, data, hm, members, past, scheduled, stats, teams, tree, workDays } = plan;
  const {
    editorAsDialog,
    multiSel,
    selected,
    setBulkEditModalOpen,
    setEditorDock,
    setMN,
    setModal,
    setMultiSel,
    setSel,
    setSideTab,
    sideTab,
  } = view;
  const { addDep, deleteNode, duplicateNode, setHistoryEvents, removeDep, splitHandoff, splitTaskAtProgress, updateNode } = handlers;
  return (
    <>
      {selected && !editorAsDialog && (
        <div className="side fade">
          {multiSel.size > 0 ? (
            <>
              <div className="side-hdr">
                <h3>{multiSel.size} items selected</h3>
                <button
                  className="btn btn-sec btn-xs"
                  onClick={() => setBulkEditModalOpen(true)}
                  data-htip={_t('bulk.openModalTip')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <Icon name="maximize" size={11} />
                  {_t('bulk.openModal')}
                </button>
                <button
                  className="btn btn-ghost btn-icon sm"
                  onClick={() => {
                    setSel(null);
                    setMultiSel(new Set());
                  }}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
              <BulkEditBody plan={plan} view={view} handlers={handlers} _t={_t} />
            </>
          ) : (
            <>
              <div className="side-hdr">
                <h3>{selected.id}</h3>
                <button
                  className="btn btn-ghost btn-icon sm"
                  data-htip={_t('nm.fullEditTip')}
                  onClick={() => {
                    setMN(selected);
                    setModal('node');
                  }}
                >
                  <Icon name="maximize" size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-icon sm"
                  data-htip={_t('set.dockDialogTip')}
                  data-testid="editor-dock-dialog"
                  onClick={() => {
                    setEditorDock('dialog');
                    setMN(selected);
                    setModal('node');
                  }}
                >
                  <Icon name="panelLeft" size={13} />
                </button>
                <button className="btn btn-ghost btn-icon sm" onClick={() => setSel(null)}>
                  <Icon name="x" size={13} />
                </button>
              </div>
              <div className="side-body">
                <QuickEdit
                  node={selected}
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
                  workDays={workDays}
                  holidayIso={new Set(Object.keys(hm || {}))}
                  onUpdate={updateNode}
                  onDelete={id => {
                    deleteNode(id);
                    setSel(null);
                  }}
                  onEstimate={n => {
                    setMN(n);
                    setModal('estimate');
                  }}
                  tab={sideTab}
                  onTabChange={setSideTab}
                  onDuplicate={id => {
                    const newId = duplicateNode(id);
                    if (newId)
                      setTimeout(() => {
                        const n = tree.find(r => r.id === newId);
                        if (n) setSel(n);
                      }, 50);
                  }}
                  onAddDep={addDep}
                  onRemoveDep={removeDep}
                  onOpenItem={id => {
                    const n = tree.find(r => r.id === id);
                    if (n) setSel(n);
                  }}
                  historyEvents={data?.historyEvents || []}
                  viewDay={past?.day || ''}
                  onHistoryChange={setHistoryEvents}
                  onSplitHandoff={splitHandoff}
                  onSplitTaskAtProgress={splitTaskAtProgress}
                />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
