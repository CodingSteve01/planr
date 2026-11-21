import { iso } from '../date.js';
import { buildReportModel } from '../report.js';
import { projectScopedCtx } from '../exportCtx.js';
import { sanitizePdfDoc } from '../pdfGlyphs.js';
import { PRINT } from '../printPalette.js';
import { STYLES, footerBuilder, loadPdfMake, slug } from './pdfCore.js';
import { buildRoadmapSvgForPdf } from './pdfSvg.js';
import { fmtDay, fmtInt, projectStatus, summaryVerdict } from './summaryModel.js';
import { pushProjectsSection, pushRisksSection, pushGoalsSection } from './summaryOverviewSections.js';
import { pushRoadmapSection, pushProjectRoadmapsSection, pushTimetableSection } from './summaryRoadmapSections.js';
import { pushCapacitySection, pushCriticalPathSection } from './summaryCapacitySections.js';

// ── Summary (Management) PDF ────────────────────────────────────────────────
export async function exportSummaryPDF(ctx, options = {}) {
  ctx = projectScopedCtx(ctx, 'exportSummaryPDF');
  const { includeTimetable = true, includeProjectRoadmaps = true } = options;
  const m = buildReportModel(ctx);
  const pdfMake = await loadPdfMake();
  const roadmapSvg = buildRoadmapSvgForPdf(ctx);
  const { meta, t, dateStr, totalPt, progLabel, roots, rootData, ccPt, teamCap, cpItems, risks, deadlineStates, scheduled, teams } = m;
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';
  const de = m.de;
  const projects = projectStatus(m);
  const v = summaryVerdict(m, projects);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    {
      text: t('Management summary for the board', 'Management-Zusammenfassung für den Vorstand'),
      fontSize: 11,
      color: PRINT.ink2,
      margin: [0, 1, 0, 1],
    },
    {
      // The progress figure is its own text node rather than part of the
      // sentence: exportParity holds the PDF to printing the very percentage
      // the Overview shows, and it looks for it as a standalone token.
      text: [
        t(`Data as of ${fmtDay(new Date(), de)}`, `Datenstand ${fmtDay(new Date(), de)}`) +
          (meta.planStart ? ' · ' + t('plan base', 'Planungsbasis') + ' ' + fmtDay(new Date(meta.planStart), de) : '') +
          ' · ' +
          projects.length +
          ' ' +
          t('projects', 'Projekte') +
          ' · ' +
          fmtInt(totalPt, de) +
          ' PT · ',
        { text: progLabel + '%' },
        ' ' + t('delivered', 'erledigt'),
      ],
      fontSize: 9,
      color: PRINT.muted,
      margin: [0, 0, 0, 10],
    },
    // The verdict. The only traffic-light word in the whole document.
    {
      columns: [
        { text: v.line, fontSize: 14, color: PRINT.ink, width: '*' },
        { text: v.word, fontSize: 12, bold: true, color: v.color, width: 'auto', alignment: 'right', noWrap: true, margin: [10, 2, 0, 0] },
      ],
      margin: [0, 0, 0, 12],
    },
  ];

  pushProjectsSection(content, { t, de, projects, ccPt });

  pushRisksSection(content, { t, risks });

  // Same props as the SVG render — keeps the legend line order, colors,
  // station progress, and diff overlays in lockstep with the on-screen
  // Roadmap.jsx instead of letting computeRoadmapModel re-derive them.
  const rmModelArgs = {
    tree: ctx.tree,
    scheduled: ctx.scheduled,
    stats: ctx.stats,
    diff: ctx.diff,
    horizonIds: ctx.horizonIds,
    horizonEnd: ctx.horizonEnd,
    futureProgressByRootId: ctx.futureProgressByRootId,
    assignment: ctx.roadmapAssignment || null,
    expandedLegendIds: new Set(),
  };
  await pushRoadmapSection(content, { t, roadmapSvg, rmModelArgs });

  pushProjectRoadmapsSection(content, { t, ctx, includeProjectRoadmaps });

  await pushTimetableSection(content, { t, ctx, rmModelArgs, includeTimetable });

  pushGoalsSection(content, { t, roots, rootData, deadlineStates });

  pushCapacitySection(content, { t, de, teamCap, scheduled });

  pushCriticalPathSection(content, { t, cpItems, teamName });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — Management Summary', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, t, kind: t('Management Summary', 'Management-Summary'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-summary-' + iso(new Date()) + '.pdf');
}
