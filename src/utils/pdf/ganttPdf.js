import { iso } from '../date.js';
import { buildReportModel } from '../report.js';
import { projectScopedCtx } from '../exportCtx.js';
import { sanitizePdfDoc } from '../pdfGlyphs.js';
import { buildGanttSvg, svgToDataUrl } from '../exports.js';
import { PRINT } from '../printPalette.js';
import { STYLES, footerBuilder, headerTable, loadPdfMake, slug } from './pdfCore.js';

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
export async function exportGanttPDF(ctx) {
  ctx = projectScopedCtx(ctx, 'exportGanttPDF');
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, weeks, teams } = m;
  if (!scheduled.length) {
    alert(m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.');
    return;
  }
  const pdfMake = await loadPdfMake();
  const gantt = await rasterizeGantt(ctx, 3);

  // Pick page size based on gantt width so small text stays readable.
  // A3 landscape = 1191 x 842 pt. A2 landscape = 1684 x 1191.
  // Choose the smallest page whose printable width ≥ gantt native width / 1.4 (shrink tolerance).
  const nativeW = gantt?.width || 1200;
  const pageSize = nativeW > 1600 ? 'A2' : nativeW > 1100 ? 'A3' : 'A4';
  // The same margin the other three documents use. At 28 this one sat its
  // title and footer visibly closer to the paper edge than the summary beside
  // it, which is the first thing that reads as "a different tool made this".
  const pageMargin = 36;
  const printableW = { A4: 841 - pageMargin * 2, A3: 1191 - pageMargin * 2, A2: 1684 - pageMargin * 2 }[pageSize];
  const imgWidth = Math.min(printableW, nativeW);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    {
      text:
        t('Schedule / Gantt', 'Zeitplan / Gantt') +
        ' · ' +
        dateStr +
        ' · ' +
        scheduled.length +
        ' ' +
        t('tasks', 'Tasks') +
        ' · ' +
        weeks.length +
        ' ' +
        t('weeks', 'Wochen'),
      style: 'sub',
    },
  ];
  if (gantt) content.push({ image: gantt.url, width: imgWidth, margin: [0, 0, 0, 14] });
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
        (tm?.name || t('No team', 'Kein Team')) + ' · ' + items.length + ' ' + t('tasks', 'Aufgaben'),
      ),
    );
  });

  const dd = {
    pageSize,
    pageOrientation: 'landscape',
    pageMargins: [pageMargin, pageMargin, pageMargin, 40],
    info: { title: (meta.name || 'Project') + ' — Gantt', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 9, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, t, kind: t('Gantt / Schedule', 'Gantt / Zeitplan'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-gantt-' + iso(new Date()) + '.pdf');
}
