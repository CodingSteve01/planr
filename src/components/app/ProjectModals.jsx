import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { EstimationWizard } from '../modals/EstimationWizard.jsx';
import { ExportModal } from '../modals/ExportModal.jsx';
import { JiraExportModal } from '../modals/JiraExportModal.jsx';
import { JiraImportModal } from '../modals/JiraImportModal.jsx';
import { NewProjModal } from '../modals/NewProjModal.jsx';
import { detectJiraFieldId } from '../../utils/jiraSync.js';

export function ProjectModals({ plan, view, handlers, exportHandlerProps }) {
  const { data, members, meta, scheduled, teams, tree } = plan;
  const { modal, modalNode, setMN, setModal, setSel, setTab } = view;
  const { applyJiraImport, resetHistory, setData, setSaved, updateNode } = handlers;
  return (
    <>
      {modal === 'new' && (
        <NewProjModal
          onClose={() => setModal(null)}
          onCreate={d => {
            setData(d);
            resetHistory();
            setSaved(false);
            setModal(null);
            setTab('tree');
            setSel(d.tree?.[0] || null);
          }}
        />
      )}
      {modal === 'estimate' && modalNode && (
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
      )}
      {modal === 'jira' && (
        <JiraExportModal tree={tree} scheduled={scheduled} members={members} teams={teams} meta={meta} onClose={() => setModal(null)} />
      )}
      {modal === 'jiraImport' && (
        <JiraImportModal
          tree={tree}
          members={members}
          jiraFieldId={detectJiraFieldId(data?.customFields || DEFAULT_CUSTOM_FIELDS, tree) || 'jira'}
          hasProject
          onClose={() => setModal(null)}
          onImport={applyJiraImport}
        />
      )}
      {modal === 'export' && <ExportModal onClose={() => setModal(null)} {...exportHandlerProps} />}
    </>
  );
}
