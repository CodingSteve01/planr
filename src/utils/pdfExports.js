// High-quality PDF exports via pdfmake (dynamic import to keep initial bundle small).
// All PDFs carry: project name, kind, generation date in footer.
// The code lives in utils/pdf/; this file keeps the import path the callers use.
export { slug, loadPdfMake, PLANR_URL, madeWithPlanr, footerBuilder, STYLES, headerTable } from './pdf/pdfCore.js';
export { exportSummaryPDF } from './pdf/summaryPdf.js';
export { exportGanttPDF } from './pdf/ganttPdf.js';
export { exportTodoPDF } from './pdf/todoPdf.js';
export { exportWhatWhenPDF } from './pdf/whatWhenPdf.js';

// Horizon-aware date helpers live in utils/horizon.js so the app UI
// can share them. Re-export keeps existing callers working.
export { horizonLabel, horizonBucket } from './horizon.js';
