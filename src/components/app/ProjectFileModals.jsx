import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { ExportModal } from '../modals/ExportModal.jsx';
import { JiraExportModal } from '../modals/JiraExportModal.jsx';
import { JiraImportModal } from '../modals/JiraImportModal.jsx';
import { NewProjModal } from '../modals/NewProjModal.jsx';
import { SnapshotModal } from '../modals/SnapshotModal.jsx';
import { pushSnapshot } from '../../app/snapshots.js';
import { detectJiraFieldId } from '../../utils/jiraSync.js';

export function ProjectFileModals({ plan, view, handlers, exportHandlerProps }) {
  const { data, members, meta, scheduled, teams, tree } = plan;
  const { modal, setModal, setSel, setTab } = view;
  const { applyJiraImport, resetHistory, setData, setSaved } = handlers;
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
