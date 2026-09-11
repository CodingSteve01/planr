import { useT } from '../../i18n.jsx';
import { useDialogShortcuts } from '../../utils/useDialogShortcuts.js';
import { ExportCards } from '../shared/ExportCards.jsx';

// The dialog form of Export — still reachable from the `/` palette
// ("Export… (dialog)") this phase for anyone who prefers a modal over
// switching to Report mode. The card grid itself lives in ExportCards.jsx,
// shared with ReportView.jsx, so this file only owns the modal chrome and
// closes itself before handing off to the Jira export dialog. (Jira
// reconcile — the return path — no longer lives behind a dialog; see Run
// mode's drift section in BriefingView.jsx.)
export function ExportModal({
  tab,
  onClose,
  onOpenJira,
  onSummaryPDF,
  onGanttPDF,
  onWhatWhenPDF,
  onTodoPDF,
  onReportDocx,
  onSprintMarkdown,
  onMermaid,
  onNetworkPNG,
  onGanttPNG,
  onJSON,
}) {
  const { t } = useT();
  useDialogShortcuts(onClose);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal fade" style={{ width: 'min(940px, 100%)', maxWidth: 940 }} onClick={e => e.stopPropagation()}>
        <h2>Export</h2>
        <ExportCards
          tab={tab}
          onOpenJira={() => { onClose(); onOpenJira(); }}
          onSummaryPDF={onSummaryPDF}
          onGanttPDF={onGanttPDF}
          onWhatWhenPDF={onWhatWhenPDF}
          onTodoPDF={onTodoPDF}
          onReportDocx={onReportDocx}
          onSprintMarkdown={onSprintMarkdown}
          onMermaid={onMermaid}
          onNetworkPNG={onNetworkPNG}
          onGanttPNG={onGanttPNG}
          onJSON={onJSON}
        />
        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
