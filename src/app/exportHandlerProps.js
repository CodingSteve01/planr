import {
  exportJSON,
  exportNetworkPNG,
  exportGanttPNG,
  exportSprintMarkdown,
  exportMermaid,
  exportReportDocx,
  exportSummaryPDF,
  exportGanttPDF,
  exportTodoPDF,
  exportWhatWhenPDF,
} from '../utils/exports.js';
import { withoutPendingDates } from '../utils/history.js';

// Shared between the Export dialog and Report mode (ReportView.jsx) — both
// render the same ExportCards grid with the same handlers, so this object
// is built once and spread into whichever one is mounted.
// `exportCtx` builds the export context at the moment a card is clicked.
export function buildExportHandlerProps({ tab, setModal, exportCtx, onScenarioPDF, fileDataRef, data }) {
  return {
    tab,
    onOpenJira: () => setModal('jira'),
    onSummaryPDF: opts => exportSummaryPDF(exportCtx(), opts),
    onScenarioPDF,
    onGanttPDF: () => exportGanttPDF(exportCtx()),
    onWhatWhenPDF: () => exportWhatWhenPDF(exportCtx()),
    onTodoPDF: horizonDays => exportTodoPDF(exportCtx(), horizonDays),
    onReportDocx: () => exportReportDocx(exportCtx()),
    onSprintMarkdown: horizonDays => exportSprintMarkdown({ ...exportCtx(), horizonDays }),
    onMermaid: () => exportMermaid(exportCtx()),
    onNetworkPNG: () => exportNetworkPNG(exportCtx()),
    onGanttPNG: () => exportGanttPNG(exportCtx()),
    // The JSON export is the file in another format: the plan and its
    // scenarios, whichever of them happens to be on screen.
    onJSON: () => exportJSON({ ...exportCtx(), data: withoutPendingDates(fileDataRef.current || data) }),
    // The two picture exports are taken from a live view, so from anywhere
    // else their card can only say no. Given the way there, it stops being a
    // dead card and becomes one click of setup.
  };
}
