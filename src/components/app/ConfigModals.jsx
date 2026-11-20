import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { Icon } from '../shared/Icon.jsx';
import { SettingsModal } from '../modals/SettingsModal.jsx';

export function ConfigModals({ plan, view, handlers, _t, renderBulkEditBody }) {
  const { data, meta, teams } = plan;
  const {
    bulkEditModalOpen,
    editorDock,
    modal,
    multiSel,
    setBulkEditModalOpen,
    setEditorDock,
    setModal,
    setShowTreeIds,
    setUiScale,
    showTreeIds,
    uiScale,
  } = view;
  const { setD } = handlers;
  return (
    <>
      {bulkEditModalOpen && multiSel.size > 0 && (
        <div className="overlay" onClick={() => setBulkEditModalOpen(false)}>
          <div
            className="modal"
            style={{ width: 'min(640px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15 }}>{_t('bulk.title') || `Massenänderung — ${multiSel.size} Items`}</h2>
              <button className="btn btn-ghost btn-icon sm" onClick={() => setBulkEditModalOpen(false)} aria-label={_t('close')}>
                <Icon name="x" size={11} />
              </button>
            </div>
            {renderBulkEditBody()}
          </div>
        </div>
      )}
      {modal === 'settings' && (
        <SettingsModal
          meta={meta}
          editorDock={editorDock}
          setEditorDock={setEditorDock}
          showTreeIds={showTreeIds}
          setShowTreeIds={setShowTreeIds}
          uiScale={uiScale}
          setUiScale={setUiScale}
          taskTemplates={data.taskTemplates || []}
          risks={data.risks || []}
          sizes={data.sizes || []}
          customFields={data.customFields || DEFAULT_CUSTOM_FIELDS}
          teams={teams}
          onSave={m => setD('meta', m)}
          onSaveTemplates={tpls => setD('taskTemplates', tpls)}
          onSaveRisks={r => setD('risks', r)}
          onSaveSizes={s => setD('sizes', s)}
          onSaveCustomFields={cf => setD('customFields', cf)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
