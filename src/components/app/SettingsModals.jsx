import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { SettingsModal } from '../modals/SettingsModal.jsx';

export function SettingsModals({ plan, view, handlers }) {
  const { data, meta, teams } = plan;
  const { editorDock, modal, setEditorDock, setModal, setShowTreeIds, setUiScale, showTreeIds, uiScale } = view;
  const { setD } = handlers;
  return (
    <>
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
