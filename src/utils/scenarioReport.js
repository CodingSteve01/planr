// The scenario comparison as a PDF.
//
// This file only lays out. Every figure and every word arrives ready-made in
// `model`, built beside the comparison dialog (components/shared/scenario/useScenarioReport.js,
// `useScenarioReport`) from the same comparison the dialog shows — so the
// paper cannot say something the screen did not.
//
// What the paper has to do that the screen does not: say on every page that
// this is a scenario. The screen has a bar and a frame for that; a PDF gets
// forwarded without either. Hence the tag beside the title, the footer on
// every page, and the scenario's colour, which no other export uses.
import { iso } from './date.js';
import { PRINT } from './printPalette.js';
import { sanitizePdfDoc } from './pdfGlyphs.js';
import { STYLES, footerBuilder, headerTable, loadPdfMake, slug } from './pdfExports.js';

const TONES = { risk: PRINT.risk, done: PRINT.done, muted: PRINT.muted };

function cell(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  return {
    text: value.text ?? '',
    ...(value.bold ? { bold: true } : {}),
    ...(value.tone && TONES[value.tone] ? { color: TONES[value.tone] } : {}),
  };
}

function kpiTile(kpi) {
  return {
    stack: [
      { text: String(kpi.label || '').toUpperCase(), style: 'kpiL' },
      {
        columns: kpi.figures.map(f => ({
          width: 'auto',
          stack: [
            { text: f.n, style: 'kpiV', ...(f.tone && TONES[f.tone] ? { color: TONES[f.tone] } : {}) },
            ...(f.label ? [{ text: f.label, fontSize: 8, color: PRINT.ink2 }] : []),
          ],
        })),
        columnGap: 14,
        margin: [0, 2, 0, 2],
      },
      ...(kpi.sub ? [{ text: kpi.sub, style: 'cap' }] : []),
    ],
  };
}

const TILE_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingTop: () => 8,
  paddingBottom: () => 8,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  fillColor: () => PRINT.band,
};

// The document definition, without pdfmake: this is what the tests read.
export function buildScenarioReportDoc(model) {
  const de = model.lang === 'de';
  const t = (en, deText) => (de ? deText : en);
  const content = [
    {
      columns: [
        { width: '*', text: model.planName || 'Project', style: 'h1' },
        {
          width: 'auto',
          text: `${model.kind}`.toUpperCase(),
          fontSize: 9,
          bold: true,
          color: PRINT.scenario,
          characterSpacing: 0.8,
          margin: [0, 8, 0, 0],
        },
      ],
    },
    { text: model.title, fontSize: 13, bold: true, color: PRINT.scenario, margin: [0, 0, 0, 2] },
    { text: model.subtitle, style: 'sub', margin: [0, 0, 0, 8] },
  ];
  if (model.story?.length) {
    content.push({
      table: {
        widths: [3, '*'],
        body: [
          [
            { text: '', fillColor: PRINT.scenario, border: [false, false, false, false] },
            {
              stack: model.story.map(line => ({
                text: [{ text: `${line.name}: `, bold: true }, line.text],
                fontSize: 10.5,
                color: PRINT.ink,
                margin: [0, 1, 0, 1],
              })),
              fillColor: PRINT.scenarioSoft,
              border: [false, false, false, false],
              margin: [6, 5, 6, 5],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 10],
    });
  }
  if (model.kpis?.length) {
    content.push({
      table: { widths: model.kpis.map(() => '*'), body: [model.kpis.map(kpiTile)] },
      layout: { ...TILE_LAYOUT, vLineWidth: i => (i > 0 && i < model.kpis.length ? 6 : 0), vLineColor: () => PRINT.paper },
      margin: [0, 0, 0, 6],
    });
  }
  if (model.conflict) content.push({ text: model.conflict, fontSize: 9, color: PRINT.wip, margin: [0, 2, 0, 0] });
  for (const section of model.sections || []) {
    if (!section.rows.length) {
      content.push({ text: section.title, style: 'h2' });
      content.push({ text: section.empty || '—', style: 'cap', margin: [0, 0, 0, 6] });
      continue;
    }
    content.push({ text: '', margin: [0, 6, 0, 0] });
    content.push(
      headerTable(
        section.headers,
        section.rows.map(row => row.map(cell)),
        section.widths,
        `${section.title}  ·  ${section.rows.length}`,
      ),
    );
    if (section.note) content.push({ text: section.note, style: 'cap', margin: [0, -4, 0, 6] });
  }
  if (model.foot) content.push({ text: model.foot, style: 'cap', margin: [0, 8, 0, 0] });
  const meta = { name: model.footerName || `${model.planName} · ${model.kind}: ${model.scenarioName}` };
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: `${model.planName} — ${model.title}: ${model.scenarioName}`, creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, t, kind: model.title, dateStr: iso(new Date()) }),
    content,
  };
}

export async function exportScenarioComparePDF(model) {
  if (!model) return;
  const pdfMake = await loadPdfMake();
  const name = `${slug(model.planName)}-${slug(model.scenarioName)}-${model.lang === 'de' ? 'vergleich' : 'comparison'}-${iso(new Date())}.pdf`;
  pdfMake.createPdf(sanitizePdfDoc(buildScenarioReportDoc(model))).download(name);
}
