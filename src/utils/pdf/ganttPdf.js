import { iso } from '../date.js';
import { buildReportModel } from '../report.js';
import { projectScopedCtx } from '../exportCtx.js';
import { sanitizePdfDoc } from '../pdfGlyphs.js';
import { buildGanttSvg, svgToDataUrl } from '../exports.js';
import { PRINT } from '../printPalette.js';
import { STYLES, countLabel, footerBuilder, headerTable, loadPdfMake, slug } from './pdfCore.js';

async function rasterizeGantt(ctx, scale = 3) {
  const r = buildGanttSvg(ctx);
  if (!r) return null;
  try {
    const url = await svgToDataUrl(r.svg, r.width, r.height, scale, PRINT.paper);
    return { url, width: r.width, height: r.height };
  } catch {
    return null;
  }
}

// ── Gantt PDF ───────────────────────────────────────────────────────────────
// Landscape page sizes in points.
const PAGES = { A4: [842, 595], A3: [1191, 842], A2: [1684, 1191] };
// The same margin the other three documents use. At 28 this one sat its
// title and footer visibly closer to the paper edge than the summary beside
// it, which is the first thing that reads as "a different tool made this".
const PAGE_MARGIN = 36;
const FOOTER_SPACE = 40;
// The h1, the subtitle and the gap under the picture, which share page 1.
const HEADER_SPACE = 70;

// Page size and the box the picture must fit in. Without a picture the page
// is A4; with one it follows the picture's width so small text stays readable
// (A3 from 1100 pt wide, A2 from 1600). The box has both a width and a height:
// a tall picture that only had a width ran past the page, was moved to a page
// of its own and left page 1 blank.
function pageLayout(gantt) {
  const nativeW = gantt?.width || 0;
  const pageSize = nativeW > 1600 ? 'A2' : nativeW > 1100 ? 'A3' : 'A4';
  const [pageW, pageH] = PAGES[pageSize];
  const printableW = pageW - PAGE_MARGIN * 2;
  const printableH = pageH - PAGE_MARGIN - FOOTER_SPACE - HEADER_SPACE;
  return {
    pageSize,
    pageMargin: PAGE_MARGIN,
    bottomMargin: FOOTER_SPACE,
    imageBox: [nativeW ? Math.min(printableW, nativeW) : printableW, printableH],
  };
}

// The message the export shows when nothing is scheduled, null otherwise.
// Cheap: it does not build the document.
export function ganttEmptyMessage(ctx) {
  if (ctx.scheduled?.length) return null;
  return ctx.lang === 'de' ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.';
}

// The document definition, without the rasterised timeline (`gantt` is
// `{ url, width, height }` or null). Returns `{ empty }` with the message the
// export shows when there is nothing to draw, `{ dd, fileName }` otherwise.
export function buildGanttDocDefinition(ctx, gantt = null) {
  ctx = projectScopedCtx(ctx, 'exportGanttPDF');
  const empty = ganttEmptyMessage(ctx);
  if (empty) return { empty };
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, weeks, teams } = m;
  const { pageSize, pageMargin, bottomMargin, imageBox } = pageLayout(gantt);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    {
      text:
        t('Schedule / Gantt', 'Zeitplan / Gantt') +
        ' · ' +
        dateStr +
        ' · ' +
        countLabel(scheduled.length, t('task', 'Task'), t('tasks', 'Tasks')) +
        ' · ' +
        countLabel(weeks.length, t('week', 'Woche'), t('weeks', 'Wochen')),
      style: 'sub',
    },
  ];
  if (gantt) content.push({ image: gantt.url, fit: imageBox, margin: [0, 0, 0, 14] });
  else
    content.push({
      text: t(
        'The timeline image could not be rendered; the table below carries the same schedule.',
        'Das Timeline-Bild konnte nicht erzeugt werden; die Tabelle unten trägt denselben Zeitplan.',
      ),
      style: 'cap',
      margin: [0, 6, 0, 0],
    });

  // Only break when there is actually a picture above to break away from —
  // otherwise page 1 was a title, a subtitle and nothing else.
  content.push({ text: t('Schedule Table', 'Terminübersicht'), style: 'h2', ...(gantt ? { pageBreak: 'before' } : {}) });
  const byTeam = {};
  scheduled.forEach(s => {
    const k = s.team || '__none';
    (byTeam[k] || (byTeam[k] = [])).push(s);
  });
  Object.entries(byTeam).forEach(([tk, items]) => {
    const tm = teams.find(x => x.id === tk);
    items.sort((a, b) => (a.startD || 0) - (b.startD || 0));
    content.push(
      headerTable(
        ['ID', t('Name', 'Name'), t('Person', 'Person'), t('Start', 'Start'), t('End', 'Ende'), 'PT'],
        items.map(s => [
          s.id,
          s.name,
          s.person || '—',
          s.startD ? iso(s.startD) : '—',
          s.endD ? iso(s.endD) : '—',
          s.effort?.toFixed(1) || '—',
        ]),
        [50, '*', 100, 65, 65, 35],
        (tm?.name || t('No team', 'Kein Team')) + ' · ' + countLabel(items.length, t('task', 'Aufgabe'), t('tasks', 'Aufgaben')),
      ),
    );
  });

  const dd = {
    pageSize,
    pageOrientation: 'landscape',
    pageMargins: [pageMargin, pageMargin, pageMargin, bottomMargin],
    info: { title: (meta.name || 'Project') + ' — Gantt', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 9, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, t, kind: t('Gantt / Schedule', 'Gantt / Zeitplan'), dateStr }),
    content,
  };
  return { dd: sanitizePdfDoc(dd), fileName: slug(meta.name) + '-gantt-' + iso(new Date()) + '.pdf' };
}

export async function exportGanttPDF(ctx) {
  ctx = projectScopedCtx(ctx, 'exportGanttPDF');
  const empty = ganttEmptyMessage(ctx);
  if (empty) return alert(empty);
  const pdfMake = await loadPdfMake();
  const gantt = await rasterizeGantt(ctx, 3);
  const { dd, fileName } = buildGanttDocDefinition(ctx, gantt);
  pdfMake.createPdf(dd).download(fileName);
}
