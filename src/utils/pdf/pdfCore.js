import { PRINT } from '../printPalette.js';

export function slug(name) {
  return (name || 'planr').toLowerCase().replace(/\s+/g, '-');
}

// "1 task", "2 tasks": the count with the noun in the right number.
export function countLabel(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

let _pdfMake = null;
export async function loadPdfMake() {
  if (_pdfMake) return _pdfMake;
  const pdfMakeMod = await import('pdfmake/build/pdfmake');
  const pdfMake = pdfMakeMod.default || pdfMakeMod;
  const vfsMod = await import('pdfmake/build/vfs_fonts');
  // pdfmake 0.3.x exports the vfs dict directly as module.exports; older
  // builds wrap it in { pdfMake: { vfs } }.
  const vfs =
    vfsMod.default?.pdfMake?.vfs ||
    vfsMod.pdfMake?.vfs ||
    (vfsMod.default && !vfsMod.default.pdfMake ? vfsMod.default : null) ||
    vfsMod.vfs ||
    null;
  if (vfs) {
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
    else pdfMake.vfs = vfs;
  }
  // …and then the app's own typeface on top of Roboto.
  //
  // A PDF cannot resolve a webfont, so a document that should look like the
  // app has to carry the app's faces with it. These are IBM Plex Sans and
  // Mono, subsetted to exactly the code points the PDF layer promises to
  // render (utils/pdfFonts.js). Roboto stays in the VFS underneath as the
  // fallback pdfmake expects to find.
  const { PLEX_VFS, PLEX_FONTS } = await import('../pdfFonts.js');
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(PLEX_VFS);
  else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...PLEX_VFS };
  pdfMake.addFonts ? pdfMake.addFonts(PLEX_FONTS) : (pdfMake.fonts = { ...(pdfMake.fonts || {}), ...PLEX_FONTS });
  _pdfMake = pdfMake;
  return pdfMake;
}

// ── Shared footer / header builders ─────────────────────────────────────────
// Where "made with Planr" leads. A PDF travels further than the app does —
// the person reading a management summary has usually never seen Planr — so
// the footer says what made it and the wordmark is a link to find out.
export const PLANR_URL = 'https://github.com/CodingSteve01/planr';

// The app's wordmark as print text: "Planr" in bold with the accent-coloured
// dot, both parts linked. Text rather than an image so it stays selectable
// and sharp at any zoom, like the rest of the document.
export function madeWithPlanr(t) {
  return [
    t('made with ', 'erstellt mit '),
    { text: 'Planr', bold: true, color: PRINT.ink2, link: PLANR_URL },
    { text: '.', bold: true, color: PRINT.accent, link: PLANR_URL },
  ];
}

export function footerBuilder({ meta, t, kind, dateStr }) {
  return (currentPage, pageCount) => ({
    margin: [40, 10, 40, 0],
    columns: [
      { text: (meta?.name || 'Project') + ' · ' + kind, fontSize: 8, color: PRINT.muted },
      { text: [dateStr + ' · ', ...madeWithPlanr(t)], fontSize: 8, color: PRINT.muted, alignment: 'center' },
      { text: currentPage + ' / ' + pageCount, fontSize: 8, color: PRINT.muted, alignment: 'right' },
    ],
  });
}

export const STYLES = {
  h1: { fontSize: 20, bold: true, color: PRINT.ink, margin: [0, 0, 0, 2] },
  // headlineLevel: pdfmake honors this when deciding page breaks — a heading
  // that would land alone at the bottom of a page is pushed to the next page
  // so it stays with the table/content that follows it.
  h2: { fontSize: 14, bold: true, color: PRINT.accent, margin: [0, 14, 0, 6], headlineLevel: 1 },
  h3: { fontSize: 11, bold: true, color: PRINT.ink2, margin: [0, 8, 0, 4], headlineLevel: 2 },
  sub: { fontSize: 10, color: PRINT.muted, margin: [0, 0, 0, 10] },
  cap: { fontSize: 8.5, color: PRINT.muted },
  th: { bold: true, fontSize: 9, color: PRINT.ink, fillColor: PRINT.band },
  td: { fontSize: 9, color: PRINT.ink },
  mono: { fontSize: 8.5, color: PRINT.ink },
  small: { fontSize: 8, color: PRINT.ink },
  kpiV: { fontSize: 18, bold: true, color: PRINT.ink },
  kpiL: { fontSize: 7.5, color: PRINT.muted, characterSpacing: 0.4 },
  riskCrit: { fontSize: 10, color: PRINT.risk, bold: true },
  riskHigh: { fontSize: 10, color: PRINT.wip, bold: true },
  riskMed: { fontSize: 10, color: PRINT.ink2 },
};

const TABLE_LAYOUT = {
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: i => (i === 1 ? PRINT.rule2 : PRINT.rule),
  vLineColor: () => PRINT.rule,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  fillColor: rowIndex => (rowIndex === 0 ? PRINT.band : rowIndex % 2 === 0 ? PRINT.ground : null),
};

function td(value, opts = {}) {
  if (value == null || value === '') return { text: '—', style: 'td', ...opts };
  if (typeof value === 'object' && !value.text && !value.stack && !value.image) return value;
  if (typeof value === 'object') return { style: 'td', ...value, ...opts };
  return { text: String(value), style: 'td', ...opts };
}

function th(value) {
  return { text: value, style: 'th', alignment: 'left' };
}

// `title` puts the section heading INSIDE the table as its first row and
// counts it among the repeating header rows, so a table that runs over a page
// break carries its name onto the next page instead of leaving the reader
// with a column header and no idea what is being listed. It also cannot be
// stranded at the foot of a page with its table on the next one — pdfmake
// lays a heading and the table after it out separately, and the heading style
// carries `headlineLevel`, which makes that worse rather than better.
export function headerTable(headers, rows, widths, title) {
  const width = widths || headers.map(() => '*');
  const titleRow = title
    ? [
        [
          {
            text: title,
            fontSize: 14,
            bold: true,
            color: PRINT.accent,
            colSpan: headers.length,
            margin: [0, 2, 0, 6],
            border: [false, false, false, false],
          },
          ...headers.slice(1).map(() => ({ text: '', border: [false, false, false, false] })),
        ],
      ]
    : [];
  return {
    table: {
      headerRows: title ? 2 : 1,
      // Bumps the break point up if only 1-2 body rows would land at the top
      // of the next page — kills the header+orphan widow at section pages.
      keepWithHeaderRows: 3,
      widths: width,
      body: [...titleRow, headers.map(th), ...rows.map(row => row.map(cell => td(cell)))],
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 8],
  };
}
