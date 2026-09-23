// High-quality PDF exports via pdfmake (dynamic import to keep initial bundle small).
// All PDFs carry: project name, kind, generation date in footer.
import { iso, isoWeek, isoWeekYear } from './date.js';
import { buildReportModel } from './report.js';
import { renderRoadmapSvg, getLineColor, splitSvgMarkup } from './roadmap.js';
import { computeProjectRoadmap, renderProjectRoadmapSvg } from './projectRoadmap.js';
import { projectScopedCtx } from './exportCtx.js';
import { sanitizePdfDoc, PDF_GLYPH_MAP } from './pdfGlyphs.js';
import { buildGanttSvg, svgToDataUrl } from './exports.js';
import { progressPctLabel, totalEffort } from './progress.js';
import { formatPhaseToken } from './phases.js';

function slug(name) { return (name || 'planr').toLowerCase().replace(/\s+/g, '-'); }

let _pdfMake = null;
async function loadPdfMake() {
  if (_pdfMake) return _pdfMake;
  const pdfMakeMod = await import('pdfmake/build/pdfmake');
  const pdfMake = pdfMakeMod.default || pdfMakeMod;
  const vfsMod = await import('pdfmake/build/vfs_fonts');
  // pdfmake 0.3.x exports the vfs dict directly as module.exports; older
  // builds wrap it in { pdfMake: { vfs } }.
  const vfs = vfsMod.default?.pdfMake?.vfs
    || vfsMod.pdfMake?.vfs
    || (vfsMod.default && !vfsMod.default.pdfMake ? vfsMod.default : null)
    || vfsMod.vfs
    || null;
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
  const { PLEX_VFS, PLEX_FONTS } = await import('./pdfFonts.js');
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(PLEX_VFS);
  else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...PLEX_VFS };
  pdfMake.addFonts
    ? pdfMake.addFonts(PLEX_FONTS)
    : (pdfMake.fonts = { ...(pdfMake.fonts || {}), ...PLEX_FONTS });
  _pdfMake = pdfMake;
  return pdfMake;
}

// Horizon-aware date helpers live in utils/horizon.js so the app UI
// can share them. Re-export keeps existing callers working.
export { horizonLabel, horizonBucket } from './horizon.js';
import { horizonLabel, horizonBucket } from './horizon.js';
import { PRINT } from './printPalette.js';
import { isOnboard } from './capacity.js';
import { memberShades } from './teamShades.js';

// ── Shared footer / header builders ─────────────────────────────────────────
function footerBuilder({ meta, kind, dateStr }) {
  return (currentPage, pageCount) => ({
    margin: [40, 10, 40, 0],
    columns: [
      { text: (meta?.name || 'Project') + ' · ' + kind, fontSize: 8, color: PRINT.muted },
      { text: dateStr, fontSize: 8, color: PRINT.muted, alignment: 'center' },
      { text: currentPage + ' / ' + pageCount, fontSize: 8, color: PRINT.muted, alignment: 'right' },
    ],
  });
}

const STYLES = {
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
  hLineWidth: (i, node) => i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
  vLineWidth: () => 0.4,
  hLineColor: (i) => i === 1 ? PRINT.rule2 : PRINT.rule,
  vLineColor: () => PRINT.rule,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  fillColor: (rowIndex) => rowIndex === 0 ? PRINT.band : rowIndex % 2 === 0 ? PRINT.ground : null,
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
function headerTable(headers, rows, widths, title) {
  const width = widths || headers.map(() => '*');
  const titleRow = title ? [[
    { text: title, fontSize: 14, bold: true, color: PRINT.accent, colSpan: headers.length, margin: [0, 2, 0, 6], border: [false, false, false, false] },
    ...headers.slice(1).map(() => ({ text: '', border: [false, false, false, false] })),
  ]] : [];
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

// ── Prepare roadmap SVG for pdfmake's native SVG embed ─────────────────────
// pdfmake renders vector SVG directly via `{svg: <string>}`. Zero canvas
// rasterization, zero Image-loading drama with <style>/var() blocks. Only
// requirements: explicit width/height on the root <svg>, no CSS custom
// properties unresolved, and no external references.
function prepareRoadmapSvg(svgStr, W = 1400, H = 800) {
  if (!svgStr || !svgStr.startsWith('<svg')) return null;
  // The renderer appends an HTML legend after the drawing; the PDF builds its
  // own legend from the model (buildRoadmapLegendPdf), so what follows the
  // </svg> is nothing but trailing junk to an SVG renderer.
  const [drawing] = splitSvgMarkup(svgStr);
  let patched = drawing.replace(
    /^<svg [^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`,
  );
  // The roadmap CSS uses `stroke:var(--bg,#0e1116)` with `stroke-width:3.4`
  // on .rm-abbrev. Browser respects `paint-order: stroke fill` so the colored
  // fill ends up on top of the halo. svg-to-pdfkit (pdfmake's SVG renderer)
  // does NOT honor paint-order — it always paints fill first, stroke last —
  // so the white stroke ends up covering the colored fill, making every
  // station label literally white-on-white. Also: 'JetBrains Mono' is not
  // registered with pdfmake; svg-to-pdfkit silently swaps fonts which can
  // suppress the text. Drop the stroke entirely and use Roboto (the bundled
  // VFS font) so the labels actually render and stay readable.
  patched = patched.replace(
    /\.rm-abbrev\{[^}]*\}/,
    `.rm-abbrev{font:700 10.5px/1 Roboto,sans-serif;fill:${PRINT.ink};stroke:none}`,
  );
  // The end-of-line route badges also pull JetBrains Mono — keep the white
  // fill but pin them to Roboto so the text doesn't disappear.
  patched = patched.replace(
    /\.rm-badge\{[^}]*\}/,
    `.rm-badge{font:800 13px/1 Roboto,sans-serif;fill:#fff;letter-spacing:.04em}`,
  );
  // Symbols the bundled Roboto does not carry render as a missing-glyph box.
  // Embedded SVG bypasses the docDefinition sanitizer (svg-to-pdfkit does its
  // own text handling), so apply the same substitution by hand — including the
  // SVG-only swaps, because this is drawn in Roboto rather than Plex.
  patched = swapUnsupportedGlyphs(patched);
  return patched
    .replace(/var\(--tx,([^)]*)\)/g, PRINT.ink)
    .replace(/var\(--tx2,([^)]*)\)/g, PRINT.ink2)
    // Dark enough to read on white — original #7a839a + thin halo was too faint.
    .replace(/var\(--tx3,([^)]*)\)/g, PRINT.ink2)
    .replace(/var\(--bg,([^)]*)\)/g, PRINT.paper)
    .replace(/var\(--bg2,([^)]*)\)/g, PRINT.ground)
    .replace(/var\(--b,([^)]*)\)/g, PRINT.rule)
    .replace(/var\(--b2,([^)]*)\)/g, PRINT.rule2)
    .replace(/var\(--re,([^)]*)\)/g, PRINT.risk)
    .replace(/var\(--ac,([^)]*)\)/g, PRINT.accent)
    .replace(/var\(--tx[^)]*\)/g, PRINT.ink)
    .replace(/var\(--tx2[^)]*\)/g, PRINT.ink2)
    .replace(/var\(--tx3[^)]*\)/g, PRINT.ink2)
    .replace(/var\(--bg[^)]*\)/g, PRINT.paper)
    .replace(/var\(--b[^)]*\)/g, PRINT.rule)
    .replace(/var\(--re[^)]*\)/g, PRINT.risk)
    .replace(/var\(--ac[^)]*\)/g, PRINT.accent);
}

// Same job as prepareRoadmapSvg, for the project-roadmap renderer: pin the
// size, resolve the theme variables to print colours and drop the fonts
// pdfmake does not carry. Kept separate because this SVG has its own class
// names and a variable height.
function prepareProjectRoadmapSvg(svgStr, height) {
  if (!svgStr || !svgStr.startsWith('<svg')) return null;
  const H = Math.max(120, Math.round(height || 320));
  return swapUnsupportedGlyphs(svgStr)
    .replace(/^<svg [^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${H}" viewBox="0 0 1400 ${H}" preserveAspectRatio="xMidYMid meet">`)
    // svg-to-pdfkit only has the bundled Roboto — anything else silently
    // drops the text (see prepareRoadmapSvg).
    .replace(/'JetBrains Mono',ui-monospace,monospace/g, 'Roboto,sans-serif')
    .replace(/'Inter',system-ui,sans-serif/g, 'Roboto,sans-serif')
    .replace(/var\(--tx,([^)]*)\)/g, PRINT.ink)
    .replace(/var\(--tx2,([^)]*)\)/g, PRINT.ink2)
    .replace(/var\(--tx3,([^)]*)\)/g, PRINT.ink2)
    .replace(/var\(--bg2,([^)]*)\)/g, PRINT.ground)
    .replace(/var\(--bg,([^)]*)\)/g, PRINT.paper)
    .replace(/var\(--b2,([^)]*)\)/g, PRINT.rule2)
    .replace(/var\(--b,([^)]*)\)/g, PRINT.rule)
    .replace(/var\(--[a-z0-9]+[^)]*\)/g, PRINT.ink);
}

// Same substitution pass the docDefinition gets, for the glyphs that can end
// up inside an SVG label (a task called "Release → UAT", say).
//
// Plus a second pass the docDefinition does NOT need. Embedded SVG is drawn by
// svg-to-pdfkit against pdfmake's bundled Roboto, not the Plex faces the rest
// of the document uses, and Roboto has no arrows — so the very characters
// PDF_GLYPH_MAP maps TOWARDS come out as empty boxes in here. An en dash says
// the same thing about a date range and about a handover.
const SVG_ONLY_SWAPS = { '→': '–', '←': '–', '↑': '^', '↓': 'v', '◊': '○' };

function swapUnsupportedGlyphs(svgStr) {
  let out = svgStr;
  Object.entries(PDF_GLYPH_MAP).forEach(([from, to]) => { out = out.split(from).join(to); });
  Object.entries(SVG_ONLY_SWAPS).forEach(([from, to]) => { out = out.split(from).join(to); });
  return out;
}

function buildRoadmapSvgForPdf(ctx) {
  const { tree, scheduled, stats, diff, horizonIds, horizonEnd, futureProgressByRootId, roadmapAssignment } = ctx;
  // Forward every prop the on-screen Roadmap (Roadmap.jsx:26-28) feeds into
  // renderRoadmapSvg. Without these the PDF re-computes assignment from
  // scratch, drops diff/horizon overlays, and rebuilds train positions —
  // making the export disagree with what the user sees on screen.
  const svgStr = renderRoadmapSvg({
    tree, scheduled, stats,
    diff, horizonIds, horizonEnd, futureProgressByRootId,
    assignment: roadmapAssignment,
    expandedLegendIds: new Set(),
  });
  return prepareRoadmapSvg(svgStr, 1400, 800);
}

// A4 landscape (841.89pt) less the 36pt margins the summary uses on both
// sides. Every full-width element on that page measures itself against this
// rather than carrying its own rounded-down copy.
const SUMMARY_W = 770;

// ── Summary page 1 ─────────────────────────────────────────────────────────
// A board reads top-left first and forwards this page on its own, so it states
// its conclusion before any figure that supports it. The composition is fixed
// rather than data-driven — always five KPI slots, at most five risks, one
// confidence bar — because a page whose shape changes month to month cannot be
// read as a series.
// Three on the page, sorted by severity. The expert brief settled on three
// with a hard cap of five; three is also what fits beside a project table of
// this size without the block tearing across the page break.
const MAX_RISKS = 3;
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 };

// One date format per document. ISO belongs in engineering appendices, not in
// a German board pack that also prints "23. September 2026" two lines above.
function fmtDay(d, de) {
  if (!d) return '—';
  const s = iso(d);
  return de ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : s;
}
function fmtMonth(d) {
  if (!d) return '—';
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function fmtInt(n, de) {
  return new Intl.NumberFormat(de ? 'de-DE' : 'en-US').format(Math.round(n || 0));
}

// One row per project, because a programme of eight independent projects has
// no single answer to "when is it done". The page used to print the maximum
// across all of them, which is the slowest project's date wearing the whole
// programme's name — true, and no use to anyone deciding about any one of them.
function projectStatus(m) {
  const { rootData, deadlineStates } = m;
  return rootData.map(r => {
    const ds = deadlineStates?.[r.id] || null;
    const days = (ds?.dateD && ds?.end) ? Math.round((ds.end - ds.dateD) / 86400000) : null;
    const late = !!ds?.isLate && days !== null && days > 0;
    const unclear = r.openPt > 0 ? r.ccPt.exploratory / r.openPt : 0;
    return {
      ...r, ds, days, late, unclear,
      color: late ? PRINT.risk : unclear > 0.25 ? PRINT.wip : PRINT.done,
    };
  }).sort((a, b) => {
    // Missed dates first, worst by days; then everything else by how much of
    // it is still unscoped.
    if (a.late !== b.late) return a.late ? -1 : 1;
    if (a.late && b.late) return b.days - a.days;
    return b.unclear - a.unclear;
  });
}

// The sentence the whole page exists to deliver.
function summaryVerdict(m, projects) {
  const { t, ccPt } = m;
  const openPt = ccPt.committed + ccPt.estimated + ccPt.exploratory;
  const unclearShare = openPt > 0 ? ccPt.exploratory / openPt : 0;
  const withTarget = projects.filter(p => p.ds?.dateD);
  const lateOnes = projects.filter(p => p.late);
  const last = projects.reduce((acc, p) => (p.endD && (!acc || !acc.endD || p.endD > acc.endD)) ? p : acc, null);
  const lastTxt = last ? `${fmtMonth(last.endD)} (${(last.name || '').trim()})` : '—';
  if (lateOnes.length) {
    const worst = lateOnes[0];
    return {
      word: t('RED', 'ROT'), color: PRINT.risk,
      line: t(
        `${lateOnes.length} of ${projects.length} projects miss their date — worst "${(worst.name || '').trim()}" by ${worst.days} days. Last project ends ${lastTxt}.`,
        `${lateOnes.length} von ${projects.length} Projekten verfehlen ihren Termin — am stärksten „${(worst.name || '').trim()}" um ${worst.days} Tage. Letztes Projekt endet ${lastTxt}.`,
      ),
    };
  }
  if (!withTarget.length) {
    return {
      word: t('NO TARGET', 'KEIN ZIEL'), color: PRINT.wip,
      line: t(
        `No project carries a target date, so none can be measured against one. Last project ends ${lastTxt}.`,
        `Kein Projekt hat einen hinterlegten Zieltermin, also lässt sich keines an einem messen. Letztes Projekt endet ${lastTxt}.`,
      ),
    };
  }
  if (unclearShare > 0.25) {
    return {
      word: t('AMBER', 'GELB'), color: PRINT.wip,
      line: t(
        `All ${withTarget.length} recorded dates hold, but ${Math.round(unclearShare * 100)}% of the open effort is not scoped yet. Last project ends ${lastTxt}.`,
        `Alle ${withTarget.length} hinterlegten Termine halten, aber ${Math.round(unclearShare * 100)}% des offenen Aufwands sind noch nicht geklärt. Letztes Projekt endet ${lastTxt}.`,
      ),
    };
  }
  return {
    word: t('GREEN', 'GRÜN'), color: PRINT.done,
    line: t(`Every recorded date holds under the current plan. Last project ends ${lastTxt}.`,
            `Alle hinterlegten Termine werden nach aktueller Planung gehalten. Letztes Projekt endet ${lastTxt}.`),
  };
}

// ── Roadmap legend for pdfmake ──────────────────────────────────────────────
// Per line: a header and one row per station. Unlike the on-screen legend
// this never lists what sits under a station — a management summary has no
// expand toggle, and the unfolded form ran to five pages of ellipsised
// fragments. Done stations are marked with a check, not struck through:
// a line through a name reads as cancelled, which is the opposite of what
// a finished station means.
function truncateStr(s, n) { return (s || '').length > n ? (s || '').slice(0, n - 1) + '…' : (s || ''); }
function buildRoadmapLegendPdf(model) {
  if (!model?.lines?.length) return null;
  const statusGlyph = (s) => s === 'done' ? '✓' : s === 'wip' ? '●' : '○';
  const columns = model.lines.map(line => {
    const allStations = [...line.majorStations, ...line.minorStations].sort((a, b) => a.t - b.t);
    if (!allStations.length) return { text: '', width: '*' };
    const stack = [
      {
        columns: [
          { canvas: [{ type: 'rect', x: 0, y: 3, w: 20, h: 10, r: 2, color: line.color }], width: 24 },
          { text: line.root.id, color: line.color, bold: true, fontSize: 9, width: 'auto', noWrap: true, margin: [2, 2, 4, 0] },
          { text: truncateStr(line.root.name, 22), color: PRINT.ink2, fontSize: 8, noWrap: true, margin: [0, 2, 0, 0] },
        ],
        columnGap: 3,
        margin: [0, 0, 0, 3],
      },
    ];
    allStations.forEach(st => {
      const stStatus = st.allDone ? 'done' : st.done > 0 ? 'wip' : 'open';
      const badge = st.allDone ? '' : ` ${st.done}/${st.total}`;
      stack.push({
        columns: [
          { text: statusGlyph(stStatus), color: stStatus === 'open' ? PRINT.muted : line.color, fontSize: 8, width: 10, margin: [0, 1, 0, 0] },
          { text: st.abbrev, color: line.color, bold: true, fontSize: 8, width: 30, noWrap: true, margin: [0, 1, 0, 0] },
          { text: truncateStr(st.name, 24) + badge, color: st.allDone ? PRINT.muted : PRINT.ink, fontSize: 7.5, margin: [0, 1, 0, 0] },
        ],
        columnGap: 2,
        margin: [0, 0, 0, 1],
      });
    });
    return { stack, width: '*' };
  });
  // pdfmake columns wrap on a single row; fit max 4 per row for legibility.
  const rowsOf = 4;
  const rows = [];
  for (let i = 0; i < columns.length; i += rowsOf) {
    rows.push({ columns: columns.slice(i, i + rowsOf), columnGap: 12, margin: [0, 0, 0, 6] });
  }
  return rows;
}

async function rasterizeGantt(ctx, scale = 3) {
  const r = buildGanttSvg(ctx);
  if (!r) return null;
  try {
    const url = await svgToDataUrl(r.svg, r.width, r.height, scale, PRINT.paper);
    return { url, width: r.width, height: r.height };
  } catch { return null; }
}

// ── Summary (Management) PDF ────────────────────────────────────────────────
export async function exportSummaryPDF(ctx, options = {}) {
  ctx = projectScopedCtx(ctx, 'exportSummaryPDF');
  const { includeTimetable = true, includeProjectRoadmaps = true } = options;
  const m = buildReportModel(ctx);
  const pdfMake = await loadPdfMake();
  const roadmapSvg = buildRoadmapSvgForPdf(ctx);
  const { meta, t, dateStr, done, wip, open, totalPt, prog, progLabel, donePt, projectEnd, roots, rootData, cc, ccPt, ccTotal, teamCap, cpItems, risks, deadlineStates, confidence, members, lvs, scheduled, teams } = m;
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';
  const de = m.de;
  const projects = projectStatus(m);
  const v = summaryVerdict(m, projects);
  const openPt = ccPt.committed + ccPt.estimated + ccPt.exploratory;

  // The confidence ramp, used identically in the per-project mini-bars and in
  // the summary bar further down.
  const CONF = [
    [t('Committed', 'Verbindlich'), 'committed', PRINT.confHi],
    [t('Estimated', 'Geschätzt'), 'estimated', PRINT.confMid],
    [t('Exploratory', 'Explorativ'), 'exploratory', PRINT.confLo],
  ];
  const confBar = (ccPtOf, total, width) => {
    if (!(total > 0)) return { text: '', width };
    let x = 0;
    const rects = CONF.map(([, key, col]) => {
      const w = width * (ccPtOf[key] || 0) / total;
      const r = { type: 'rect', x, y: 0, w, h: 7, color: col };
      x += w;
      return r;
    }).filter(r => r.w > 0.2);
    return { canvas: rects, width, margin: [0, 2, 0, 0] };
  };

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    { text: t('Management summary for the board', 'Management-Zusammenfassung für den Vorstand'), fontSize: 11, color: PRINT.ink2, margin: [0, 1, 0, 1] },
    {
      // The progress figure is its own text node rather than part of the
      // sentence: exportParity holds the PDF to printing the very percentage
      // the Overview shows, and it looks for it as a standalone token.
      text: [
        t(`Data as of ${fmtDay(new Date(), de)}`, `Datenstand ${fmtDay(new Date(), de)}`)
          + (meta.planStart ? ' · ' + t('plan base', 'Planungsbasis') + ' ' + fmtDay(new Date(meta.planStart), de) : '')
          + ' · ' + projects.length + ' ' + t('projects', 'Projekte')
          + ' · ' + fmtInt(totalPt, de) + ' PT · ',
        { text: progLabel + '%' },
        ' ' + t('delivered', 'erledigt'),
      ],
      fontSize: 9, color: PRINT.muted, margin: [0, 0, 0, 10],
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

  // ── Per project ──────────────────────────────────────────────────────────
  content.push({ text: t('Where each project stands', 'Wo jedes Projekt steht'), style: 'h2' });
  content.push({
    table: {
      headerRows: 1,
      widths: [3, 22, '*', 48, 56, 44, 82, 104],
      body: [
        [
          { text: '', border: [false, false, false, false] },
          { text: '', fontSize: 8, color: PRINT.muted, margin: [6, 0, 0, 3] },
          { text: t('Project', 'Projekt'), fontSize: 8, color: PRINT.muted, margin: [0, 0, 0, 3] },
          { text: t('Forecast', 'Prognose'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 0, 3] },
          { text: t('Target', 'Ziel'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 0, 3] },
          { text: t('Delta', 'Abw.'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 0, 3] },
          { text: t('Progress', 'Fortschritt'), fontSize: 8, color: PRINT.muted, alignment: 'right', margin: [0, 0, 10, 3] },
          { text: t('Open effort', 'Offener Aufwand'), fontSize: 8, color: PRINT.muted, margin: [0, 0, 0, 3] },
        ].map(c => ({ ...c, border: [false, false, false, true] })),
        ...projects.map(p => {
          const delta = p.days === null ? '—'
            : p.days > 0 ? '+' + Math.max(1, Math.round(p.days / 30)) + ' ' + t('mo.', 'Mon.')
              : t('on time', 'im Plan');
          return [
            { text: '', fillColor: p.color },
            { text: p.id, fontSize: 9, bold: true, color: PRINT.ink, margin: [6, 3, 0, 3] },
            { text: (p.name || '').trim(), fontSize: 9, color: PRINT.ink, margin: [0, 3, 6, 3] },
            { text: p.endD ? fmtMonth(p.endD) : t('done', 'erledigt'), fontSize: 9, color: p.endD ? PRINT.ink : PRINT.muted, alignment: 'right', margin: [0, 3, 0, 3] },
            { text: p.ds?.dateD ? fmtDay(p.ds.dateD, de) : '—', fontSize: 9, color: PRINT.ink2, alignment: 'right', margin: [0, 3, 0, 3] },
            { text: delta, fontSize: 9, color: p.days > 0 ? PRINT.risk : PRINT.ink2, alignment: 'right', margin: [0, 3, 0, 3] },
            { text: Math.round(p.prog) + '% · ' + fmtInt(p.pt, de) + ' PT', fontSize: 9, color: PRINT.ink2, alignment: 'right', noWrap: true, margin: [0, 3, 10, 3] },
            { ...confBar(p.ccPt, p.openPt, 104), margin: [0, 5, 0, 3] },
          ].map(c => ({ ...c, border: [false, false, false, false] }));
        }),
      ],
    },
    layout: {
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 0 : 0.5,
      hLineColor: () => PRINT.rule,
      vLineWidth: () => 0,
    },
    margin: [0, 0, 0, 6],
  });
  // The ramp is ordinal, so the legend reads left to right in that order and
  // says once what the three steps mean.
  content.push({
    columns: [
      ...CONF.map(([label, key, col]) => ({
        width: 'auto',
        columns: [
          { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: col }], width: 12 },
          { text: label + ' ' + fmtInt(ccPt[key], de) + ' PT', fontSize: 8, color: PRINT.muted, width: 'auto', noWrap: true },
        ],
        columnGap: 2,
      })),
      { text: '', width: '*' },
    ],
    columnGap: 14,
    margin: [25, 0, 0, 3],
  });
  // The per-project bars carry the split and the legend carries the totals, so
  // a second aggregate bar would say the same thing a third time. What is left
  // is the one line that says what the three steps mean.
  content.push({
    text: t('Committed = person and a solid estimate · Estimated = effort known, person open · Exploratory = scope still open',
            'Verbindlich = Person und belastbare Schätzung · Geschätzt = Aufwand bekannt, Person offen · Explorativ = Scope noch offen'),
    fontSize: 8, color: PRINT.muted, margin: [25, 0, 0, 14],
  });

  // Sorted by severity then magnitude, and capped. report.js pushes rule by
  // rule, so without this a medium could sit above a critical — which it did.
  const ranked = [...risks].sort((a, b) =>
    (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.rank || 0) - (a.rank || 0));
  const shown = ranked.slice(0, MAX_RISKS);
  if (shown.length) {
    // The heading is the table's FIRST ROW, spanning every column. pdfmake
    // does not keep a heading with the table that follows it: `unbreakable`
    // on the table pushed the table to the next page and left the heading
    // behind, and wrapping both in an unbreakable stack changed nothing,
    // because a stack is laid out one child at a time. As a row it cannot be
    // separated from what it names.
    content.push({
      table: {
        widths: [3, 170, 330, '*'],
        body: [
          [
            { text: '' },
            // Deliberately NOT style 'h2': that style carries headlineLevel,
            // which asks pdfmake to break the page BEFORE the heading so it
            // stays with what follows — and inside a table that threw the
            // whole table onto the next page with two thirds of this one
            // still empty. Same size, weight and colour, no headlineLevel.
            { text: t('What threatens the date', 'Was den Termin gefährdet'), fontSize: 14, bold: true, color: PRINT.accent, colSpan: 3, margin: [8, 2, 0, 6] },
            // The two cells a colSpan swallows still have to be present, and
            // they have to carry `text` — an object of nothing but `border`
            // is rejected outright ("Unrecognized document structure"), which
            // aborted the whole export.
            { text: '' }, { text: '' },
          ].map(c => ({ ...c, border: [false, false, false, false] })),
          ...shown.map(r => {
            const color = r.severity === 'critical' ? PRINT.risk : r.severity === 'high' ? PRINT.wip : PRINT.muted;
            // A rule at the row's edge instead of a tinted ground: fills turn
            // the page into a heat map and print as dirty grey on an office
            // laser printer.
            return [
              { text: '', fillColor: color },
              { text: r.title || '', fontSize: 10, bold: true, color: PRINT.ink, margin: [8, 4, 6, 4] },
              { text: r.text || '', fontSize: 10, color: PRINT.ink2, margin: [0, 3, 6, 3] },
              { text: r.ask || '', fontSize: 9, color: PRINT.ink2, margin: [0, 3, 0, 3] },
            ].map(c => ({ ...c, border: [false, false, false, false] }));
          }),
        ],
      },
      layout: {
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        // No rule under the heading row, none above the first finding, none
        // below the last.
        hLineWidth: (i, node) => (i <= 1 || i === node.table.body.length) ? 0 : 0.5,
        hLineColor: () => PRINT.rule,
        vLineWidth: () => 0,
      },
      margin: [0, 0, 0, 4],
    });
    if (ranked.length > shown.length) {
      content.push({
        text: (n => t(
          `+${n} further ${n === 1 ? 'finding' : 'findings'} of lower urgency, not shown`,
          `+${n} ${n === 1 ? 'weiterer Hinweis' : 'weitere Hinweise'} geringerer Dringlichkeit, hier nicht gezeigt`,
        ))(ranked.length - shown.length),
        fontSize: 9, color: PRINT.muted, margin: [11, 0, 0, 14],
      });
    } else {
      content.push({ text: '', margin: [0, 0, 0, 10] });
    }
  }

  // Same props as the SVG render — keeps the legend line order, colors,
  // station progress, and diff overlays in lockstep with the on-screen
  // Roadmap.jsx instead of letting computeRoadmapModel re-derive them.
  const rmModelArgs = {
    tree: ctx.tree, scheduled: ctx.scheduled, stats: ctx.stats,
    diff: ctx.diff, horizonIds: ctx.horizonIds, horizonEnd: ctx.horizonEnd,
    futureProgressByRootId: ctx.futureProgressByRootId,
    assignment: ctx.roadmapAssignment || null,
    expandedLegendIds: new Set(),
  };
  if (roadmapSvg) {
    content.push({ text: t('Roadmap', 'Roadmap'), style: 'h2', pageBreak: 'before' });
    content.push({ svg: roadmapSvg, width: SUMMARY_W, margin: [0, 0, 0, 8] });
    // Legend mirrors the Overview-tab block: per-line column with station rows.
    const { computeRoadmapModel } = await import('./roadmap.js');
    const rmModel = computeRoadmapModel(rmModelArgs);
    const legendRows = buildRoadmapLegendPdf(rmModel);
    if (legendRows) {
      // The legend used to run straight on from the map with no heading, so
      // whoever turned the page met a bare grid of abbreviations.
      content.push({ text: t('Stations', 'Haltestellen'), style: 'h3', pageBreak: 'before', margin: [0, 0, 0, 6] });
      legendRows.forEach(r => content.push(r));
    }
  }

  // ── Per-project roadmaps ────────────────────────────────────────────────
  // The subway map compares projects; these pages describe one each — the same
  // calendar view the Overview shows when a single project is picked, rendered
  // for EVERY root, because an export covers the whole plan (utils/exportCtx.js)
  // and must not depend on what the screen happens to be showing.
  if (includeProjectRoadmaps) {
    const roots = (ctx.tree || []).filter(node => node?.id && !node.id.includes('.'));
    const labels = {
      months: t('Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec', 'Jan,Feb,Mär,Apr,Mai,Jun,Jul,Aug,Sep,Okt,Nov,Dez'),
      tasks: t('tasks', 'Aufgaben'),
      today: t('today', 'heute'),
      deadline: t('Deadline', 'Deadline'),
      noDates: t('no dates yet', 'noch keine Termine'),
      stateDone: t('done', 'erledigt'),
      stateWip: t('in progress', 'in Bearbeitung'),
      stateOpen: t('open', 'offen'),
    };
    let first = true;
    roots.forEach(root => {
      const model = computeProjectRoadmap({ tree: ctx.tree, scheduled: ctx.scheduled, stats: ctx.stats, rootId: root.id });
      if (!model?.rows?.length) return;
      const svgStr = renderProjectRoadmapSvg({
        tree: ctx.tree, scheduled: ctx.scheduled, stats: ctx.stats, rootId: root.id,
        color: getLineColor(root.id, ctx.roadmapAssignment) || PRINT.accent,
        labels,
      });
      const prepared = prepareProjectRoadmapSvg(svgStr, model.height);
      if (!prepared) return;
      if (first) {
        content.push({ text: t('Project roadmaps', 'Projekt-Roadmaps'), style: 'h2', pageBreak: 'before' });
        content.push({
          text: t('One row per work package, on a calendar. Stops are the individual tasks.',
            'Eine Zeile je Arbeitspaket, auf dem Kalender. Haltestellen sind die einzelnen Aufgaben.'),
          style: 'cap', margin: [0, 0, 0, 8],
        });
        first = false;
      }
      // Scale to the text width, keeping the aspect ratio of the model height.
      content.push({ svg: prepared, width: SUMMARY_W, margin: [0, 0, 0, 14] });
    });
  }

  // Optional Fahrplan section — chronological station timetable for each line.
  // Uses the same computeRoadmapModel data as the Subway-Map.
  if (includeTimetable) {
    try {
      const { computeRoadmapModel } = await import('./roadmap.js');
      const rmModel = computeRoadmapModel(rmModelArgs);
      if (rmModel?.lines?.length) {
        content.push({ text: t('Timetable', 'Fahrplan'), style: 'h2' });
        content.push({ text: t('Station abbreviations reference the Subway-Map legend above.', 'Stations-Kürzel verweisen auf die Legende der Subway-Map oben.'), style: 'cap', margin: [0, 0, 0, 8] });
        // Aggregate all handoff segments for a tree item so cross-team chains show up.
        const segsByTree = {};
        (ctx.scheduled || []).forEach(s => {
          const k = s.treeId || s.id;
          (segsByTree[k] ||= []).push(s);
        });
        const kwTag = d => `KW${isoWeek(d)}/${String(isoWeekYear(d)).slice(-2)}`;

        // 2-col layout: split the lines down the middle per page.
        const buildLineBlock = (line) => {
          const allStations = [...line.majorStations, ...line.minorStations].filter(st => st.clusterItems?.length);
          const rows = allStations.map(st => {
            const items = st.clusterItems || [];
            const allSegs = items.flatMap(it => segsByTree[it.id] || []);
            const dated = allSegs.filter(s => s && s.startD && s.endD);
            const startD = dated.length ? new Date(Math.min(...dated.map(s => +s.startD))) : null;
            const endD = dated.length ? new Date(Math.max(...dated.map(s => +s.endD))) : null;
            const calDays = startD && endD ? Math.max(1, Math.round((endD - startD) / 86400000) + 1) : 0;
            const workDays = dated.reduce((s, r) => s + (r.workingDaysInWindow || 0), 0);
            // ◐ ◆ both missing in pdfmake Roboto. ● + amber color marks WIP.
            const status = st.allDone ? '✓' : items.some(it => it.status === 'wip') ? '●' : '○';
            return { abbrev: st.abbrev + (items.length > 1 ? ' ×' + items.length : ''), startD, endD, calDays, workDays, status };
          }).sort((a, b) => (a.startD || 0) - (b.startD || 0));

          // A timetable answers "when". A station with no scheduled segment has
          // no answer, and printing it filled whole pages with "— / —" rows.
          // The ones dropped are named in a single line below the table rather
          // than vanishing silently.
          const dated = rows.filter(r => r.startD);
          const undated = rows.filter(r => !r.startD);

          return {
            unbreakable: true,
            stack: [
              {
                text: [
                  { text: line.root.id + '  ', color: line.color, bold: true },
                  { text: line.root.name, color: PRINT.ink, bold: true },
                ],
                fontSize: 10, margin: [0, 0, 0, 3],
              },
              dated.length ? headerTable(
                [t('Stn', 'Stn'), t('Start', 'Start'), t('Dauer', 'Dauer'), ''],
                dated.map(r => [
                  { text: r.abbrev, color: line.color, bold: true, fontSize: 9 },
                  { text: `${kwTag(r.startD)} ${iso(r.startD).slice(5)}`, fontSize: 8 },
                  { text: r.calDays ? `${r.calDays}d/${r.workDays.toFixed(0)}PT` : '—', fontSize: 8 },
                  { text: r.status, alignment: 'center', fontSize: 9, color: r.status === '✓' ? PRINT.done : r.status === '●' ? PRINT.wip : PRINT.muted },
                ]),
                [45, 80, 60, 20],
              ) : { text: t('No scheduled stations.', 'Keine terminierten Haltestellen.'), fontSize: 8, color: PRINT.muted, italics: true },
              undated.length ? {
                text: t('Not scheduled: ', 'Nicht terminiert: ') + undated.map(r => r.abbrev).join(', '),
                fontSize: 7.5, color: PRINT.muted, margin: [0, 3, 0, 0],
              } : '',
            ],
            margin: [0, 0, 0, 10],
          };
        };

        // Pair lines 2-per-row via pdfmake columns.
        for (let i = 0; i < rmModel.lines.length; i += 2) {
          const left = buildLineBlock(rmModel.lines[i]);
          const right = rmModel.lines[i + 1] ? buildLineBlock(rmModel.lines[i + 1]) : { text: '' };
          content.push({ columns: [left, right], columnGap: 14 });
        }
      }
    } catch (e) {
      console.warn('[summary-pdf] timetable generation failed', e);
    }
  }

  // Every project, not only the ones somebody labelled. `type` is an
  // annotation — goal, pain point, deadline — and filtering on it dropped
  // five of eight projects out of the summary on a real plan, the largest
  // running one among them. A management PDF that omits the biggest project
  // is worse than none. Dropped ones stay out: a decision not to do
  // something is not a focus.
  const goals = roots.filter(r => !r.dropped);
  if (goals.length) {
    content.push(headerTable(
      ['ID', t('Name', 'Name'), t('Deadline', 'Deadline'), t('Progress', 'Fortschritt'), t('Scheduled End', 'Geplantes Ende'), t('Risk', 'Risiko')],
      goals.map(g => {
        const rd = rootData.find(x => x.id === g.id);
        // Same state machine as the Overview cards (utils/timeline.js):
        // completed work is reported as done, never as "at risk".
        const ds = deadlineStates?.[g.id];
        const riskCell = ds?.state === 'atRisk'
          ? { text: '■ ' + t('AT RISK', 'GEFÄHRDET'), color: PRINT.risk, bold: true }
          : ds?.state === 'doneLate'
            ? { text: '✓ ' + t('done · late', 'abgeschl. · verspätet'), color: PRINT.wip, bold: true }
            : ds?.state === 'done'
              ? { text: '✓ ' + t('done', 'abgeschlossen'), color: PRINT.done, bold: true }
              : rd?.endD ? { text: '✓ ' + t('on track', 'im Plan'), color: PRINT.done } : '—';
        return [
          g.id,
          { text: g.name, bold: true },
          g.date || '—',
          progressPctLabel(rd?.prog || 0) + '%  ·  ' + (rd?.doneCount || 0) + '/' + (rd?.leafCount || 0) + ' ' + t('tasks', 'Aufgaben'),
          rd?.endD ? iso(rd.endD) : '—',
          riskCell,
        ];
      }),
      [40, '*', 70, 80, 70, 80],
      t('Projects, Goals & Deadlines', 'Projekte, Ziele & Deadlines'),
    ));
  }

  // Team capacity as per-team cards
  // People who have left are not capacity. The raw team list keeps everyone
  // who ever was, so a whole team of leavers drew a card of three names at
  // 0 PT beside teams that are actually doing the work.
  const capCards = Object.values(teamCap)
    .map(tc => ({ ...tc, members: (tc.members || []).filter(mb => isOnboard(mb)) }))
    .filter(tc => tc.members.length || tc.committed > 0 || tc.unassigned > 0);
  if (capCards.length) {
    content.push({ text: t('Team Capacity', 'Teamauslastung'), style: 'h2' });
    const pairs = [];
    for (let i = 0; i < capCards.length; i += 2) pairs.push(capCards.slice(i, i + 2));
    pairs.forEach(pair => {
      content.push({
        // Without this a card broke over the page boundary and left its two
        // summary numbers alone at the top of the next page.
        unbreakable: true,
        columns: pair.map(tc => {
          const wBar = 340;
          // From the SCHEDULE, not from explicit `assign`. Most work in a long
          // plan has no name typed on it — the scheduler picks the person —
          // so counting only explicit assignments put people at 0 PT on this
          // page while the critical-path table on the next one showed them
          // carrying a task. Handoff rows hold their own share and the primary
          // row is trimmed to its, so summing every row is not double counting.
          // The card is about THIS team's open work, and every number on it
          // adds up to the bar: a dot per member in a step of the team's own
          // colour, the same tints the Plan review draws, and the bar stacked
          // from those same shares. The dots are the bar's legend — which is
          // the whole reason they are there.
          const shades = memberShades(tc.color, tc.members.length);
          const shareOf = id => scheduled
            .filter(r => r.status !== 'done' && !r.unscheduled && r.personId === id && (r.team || '') === (tc.id || ''))
            .reduce((acc, r) => acc + (r.effort || 0), 0);
          const memberShares = tc.members.map((mb, mi) => ({ mb, pt: shareOf(mb.id), color: shades[mi] || tc.color || PRINT.muted }));
          const staffedPt = memberShares.reduce((acc, x) => acc + x.pt, 0);
          const teamTotal = staffedPt + (tc.unassigned || 0);
          const memRows = memberShares.map(({ mb, pt, color }) => ({
            columns: [
              { canvas: [{ type: 'ellipse', x: 3.5, y: 6, r1: 3.5, r2: 3.5, color }], width: 10 },
              { text: mb.name + (mb.cap < 1 ? ' (' + Math.round(mb.cap * 100) + '%)' : ''), fontSize: 9, color: PRINT.ink },
              { text: fmtInt(pt, de) + ' PT', fontSize: 9, color: PRINT.ink2, alignment: 'right' },
            ],
            columnGap: 4,
          }));
          const barCanvas = teamTotal > 0 ? {
            canvas: (() => {
              let x = 0;
              const segs = memberShares.map(({ pt, color }) => {
                const w = wBar * pt / teamTotal;
                const r = { type: 'rect', x, y: 0, w, h: 8, color };
                x += w;
                return r;
              });
              if (tc.unassigned > 0) segs.push({ type: 'rect', x, y: 0, w: wBar * tc.unassigned / teamTotal, h: 8, color: PRINT.rule2 });
              return segs.filter(r => r.w > 0.2);
            })(),
            margin: [0, 5, 0, 3],
          } : null;
          const footerCol = teamTotal > 0 ? {
            columns: [
              { text: fmtInt(teamTotal, de) + ' PT ' + t('open in this team', 'offen in diesem Team'), fontSize: 8, color: PRINT.ink2 },
              tc.unassigned > 0
                ? { text: fmtInt(tc.unassigned, de) + ' PT ' + t('nobody on it', 'ohne Person') + ' · ' + tc.count + ' Items', fontSize: 8, color: PRINT.muted, alignment: 'right' }
                : { text: t('everything has a person', 'alles hat eine Person'), fontSize: 8, color: PRINT.muted, alignment: 'right' },
            ],
          } : null;
          return {
            stack: [
              {
                columns: [
                  { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, r: 1.5, color: tc.color || PRINT.muted }], width: 12 },
                  { text: tc.name, bold: true, color: PRINT.ink, fontSize: 11 },
                ],
                columnGap: 2, margin: [0, 0, 0, 4],
              },
              memRows.length ? {
                columns: [
                  { text: '', width: 10 },
                  { text: t('Person', 'Person'), fontSize: 7.5, color: PRINT.muted },
                  { text: t('open in this team', 'offen in diesem Team'), fontSize: 7.5, color: PRINT.muted, alignment: 'right' },
                ],
                columnGap: 4, margin: [0, 0, 0, 2],
              } : '',
              ...memRows,
              ...(barCanvas ? [barCanvas] : []),
              ...(footerCol ? [footerCol] : []),
            ],
            margin: [6, 6, 6, 6],
          };
        }),
        columnGap: 10,
        margin: [0, 0, 0, 6],
      });
    });
  }

  if (cpItems.length) {
    content.push({ text: t('Any delay to these items delays the project end.', 'Jede Verzögerung dieser Items verzögert das Projektende.'), style: 'cap', margin: [0, 8, 0, 4] });
    content.push(headerTable(
      ['ID', t('Name', 'Name'), t('Team', 'Team'), t('Person', 'Person'), t('Start', 'Start'), t('End', 'Ende'), 'PT'],
      cpItems.map(s => [s.id, s.name, teamName(s.team), s.person || '—', s.startD ? iso(s.startD) : '—', s.endD ? iso(s.endD) : '—', s.effort?.toFixed(1) || '—']),
      [40, '*', 70, 80, 60, 60, 30],
      t('Critical Path', 'Kritischer Pfad'),
    ));
  }

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — Management Summary', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('Management Summary', 'Management-Summary'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-summary-' + iso(new Date()) + '.pdf');
}

// ── Gantt PDF ───────────────────────────────────────────────────────────────
export async function exportGanttPDF(ctx) {
  ctx = projectScopedCtx(ctx, 'exportGanttPDF');
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, weeks, teams } = m;
  if (!scheduled.length) { alert(m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.'); return; }
  const pdfMake = await loadPdfMake();
  const gantt = await rasterizeGantt(ctx, 3);
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';

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
    { text: t('Schedule / Gantt', 'Zeitplan / Gantt') + ' · ' + dateStr + ' · ' + scheduled.length + ' ' + t('tasks', 'Tasks') + ' · ' + weeks.length + ' ' + t('weeks', 'Wochen'), style: 'sub' },
  ];
  if (gantt) content.push({ image: gantt.url, width: imgWidth, margin: [0, 0, 0, 14] });
  else content.push({ text: t('The timeline image could not be rendered; the table below carries the same schedule.', 'Das Timeline-Bild konnte nicht erzeugt werden; die Tabelle unten trägt denselben Zeitplan.'), style: 'cap', margin: [0, 6, 0, 0] });

  // Only break when there is actually a picture above to break away from —
  // otherwise page 1 was a title, a subtitle and nothing else.
  content.push({ text: t('Schedule Table', 'Terminübersicht'), style: 'h2', ...(gantt ? { pageBreak: 'before' } : {}) });
  const byTeam = {};
  scheduled.forEach(s => { const k = s.team || '__none'; (byTeam[k] || (byTeam[k] = [])).push(s); });
  Object.entries(byTeam).forEach(([tk, items]) => {
    const tm = teams.find(x => x.id === tk);
    items.sort((a, b) => (a.startD || 0) - (b.startD || 0));
    content.push(headerTable(
      ['ID', t('Name', 'Name'), t('Person', 'Person'), t('Start', 'Start'), t('End', 'Ende'), 'PT'],
      items.map(s => [s.id, s.name, s.person || '—', s.startD ? iso(s.startD) : '—', s.endD ? iso(s.endD) : '—', s.effort?.toFixed(1) || '—']),
      [50, '*', 100, 65, 65, 35],
      (tm?.name || t('No team', 'Kein Team')) + ' · ' + items.length + ' ' + t('tasks', 'Aufgaben'),
    ));
  });

  const dd = {
    pageSize,
    pageOrientation: 'landscape',
    pageMargins: [pageMargin, pageMargin, pageMargin, 40],
    info: { title: (meta.name || 'Project') + ' — Gantt', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 9, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('Gantt / Schedule', 'Gantt / Zeitplan'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-gantt-' + iso(new Date()) + '.pdf');
}

// ── TODO / Sprint PDF ───────────────────────────────────────────────────────
export async function exportTodoPDF(ctx, horizonDays) {
  ctx = projectScopedCtx(ctx, 'exportTodoPDF');
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, tree, teams, confidence } = m;
  if (!scheduled.length) { alert(m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.'); return; }
  const horizon = horizonDays ? Math.max(1, parseInt(horizonDays) || 30) : 30;
  const now = new Date();
  const end = new Date(); end.setDate(end.getDate() + horizon);
  const up = scheduled.filter(s => s.status !== 'done' && s.startD && s.startD <= end).sort((a, b) => (a.startD - b.startD) || (a.prio || 4) - (b.prio || 4));
  if (!up.length) { alert((m.de ? 'Keine Aufgaben in ' : 'No tasks within ') + horizon + (m.de ? ' Tagen.' : ' days.')); return; }
  const pdfMake = await loadPdfMake();
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';

  // Group by person (preferred) or team-unassigned.
  const groups = new Map();
  up.forEach(s => {
    const key = s.personId || ('team:' + (s.team || 'none'));
    if (!groups.has(key)) groups.set(key, { key, isPerson: !!s.personId, label: s.personId ? s.person : (teamName(s.team) || (m.de ? 'Kein Team' : 'No team')) + ' (' + t('unassigned', 'unzugewiesen') + ')', items: [] });
    groups.get(key).items.push(s);
  });
  const sorted = [...groups.values()].sort((a, b) => a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    { text: t('TODO / Sprint', 'TODO / Sprint') + ' · ' + dateStr + ' · ' + t('Horizon', 'Horizont') + ': ' + horizon + ' ' + t('days', 'Tage') + ' (' + iso(now) + ' → ' + iso(end) + ') · ' + up.length + ' ' + t('tasks', 'Tasks') + ', ' + sorted.length + ' ' + t('lanes', 'Lanes'), style: 'sub' },
  ];
  sorted.forEach(g => {
    content.push(headerTable(
      [t('Start', 'Start'), t('End', 'Ende'), 'ID', t('Task', 'Task'), t('Team', 'Team'), t('Effort', 'Aufw.'), t('Status', 'Status'), 'Conf.'],
      g.items.map(s => {
        const node = tree.find(r => r.id === (s.treeId || s.id));
        const conf = confidence[s.id] || 'committed';
        const label = horizonLabel(s.startD, conf, m.de, now);
        const endLabel = horizonLabel(s.endD, conf, m.de, now);
        const decide = node?.decideBy ? { text: ' ! ' + node.decideBy, color: PRINT.wip, fontSize: 8, bold: true } : null;
        const nameCell = decide ? { text: [{ text: s.name }, decide] } : s.name;
        return [
          { text: label, fontSize: 8.5 },
          { text: endLabel, fontSize: 8.5 },
          { text: s.id, fontSize: 8.5 },
          nameCell,
          teamName(s.team),
          s.effort?.toFixed(1) || '—',
          s.status === 'wip' ? { text: '● WIP', color: PRINT.wip, bold: true } : { text: t('Open', 'Offen'), color: PRINT.ink2 },
          // Confidence in its own ramp, not the status hues: the same scale
          // the summary and the screen use.
          { text: '●', color: conf === 'committed' ? PRINT.confHi : conf === 'estimated' ? PRINT.confMid : PRINT.confLo, alignment: 'center' },
        ];
      }),
      [75, 75, 45, '*', 80, 40, 50, 25],
      g.label + '  ·  ' + g.items.length + ' ' + t('tasks', 'Aufgaben'),
    ));
  });

  content.push({
    text: [
      { text: '● ', color: PRINT.confHi }, t('Committed', 'Verbindlich') + '  ',
      { text: '● ', color: PRINT.confMid }, t('Estimated', 'Geschätzt') + '  ',
      { text: '● ', color: PRINT.confLo }, t('Exploratory', 'Explorativ'),
      '  ·  ' + t('dates are rounded to match confidence', 'Daten sind der Belastbarkeit entsprechend gerundet'),
    ],
    style: 'cap', margin: [0, 4, 0, 0],
  });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — TODO', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 9, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('TODO / Sprint', 'TODO / Sprint') + ' · ' + horizon + ' ' + t('days', 'Tage'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-todo-' + horizon + 'd-' + iso(new Date()) + '.pdf');
}

// ── "What comes when" PDF — horizon-aware buckets, TOPIC level ──────────────
// Each row is a top-level root (Thema / Goal / Deadline). Bucket key is the
// root's projected end date (max endD of all descendant scheduled items).
// Confidence aggregate = worst confidence among the root's open leaves.
export async function exportWhatWhenPDF(ctx) {
  ctx = projectScopedCtx(ctx, 'exportWhatWhenPDF');
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, tree, teams, confidence, rootData, lvs, deadlineStates } = m;
  if (!scheduled.length) { alert(m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.'); return; }
  const pdfMake = await loadPdfMake();
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';
  const now = new Date();
  // Emoji and ★ ▲ ◆ aren't in pdfmake's bundled Roboto. ● ○ ■ ✓ are safe.
  // Goals get ● bold, painpoints get ■ amber, deadlines get ■ red — set by
  // the surrounding bold/color attributes downstream.
  const GT = { goal: '●', painpoint: '■', deadline: '■' };

  // Aggregate per root: projected end, worst confidence, PT, teams-involved.
  const CONF_ORDER = { committed: 0, estimated: 1, exploratory: 2 };
  const topics = rootData
    .filter(rd => rd.endD) // only roots that actually have scheduled work
    .map(rd => {
      // Worst confidence across open descendant leaves
      const rootLeaves = lvs.filter(l => l.id === rd.id || l.id.startsWith(rd.id + '.'));
      const openLeaves = rootLeaves.filter(l => l.status !== 'done');
      let worst = 'committed';
      openLeaves.forEach(l => {
        const c = confidence[l.id] || confidence[rd.id] || 'committed';
        if (CONF_ORDER[c] > CONF_ORDER[worst]) worst = c;
      });
      // Teams involved
      const teamIds = [...new Set(scheduled.filter(s => s.id === rd.id || s.id.startsWith(rd.id + '.')).map(s => s.team).filter(Boolean))];
      // Forecast-only: a finished deadline is not "late", it is delivered.
      const ds = deadlineStates?.[rd.id];
      const deadlineLate = ds?.state === 'atRisk';
      const deadlineDone = ds?.state === 'done' || ds?.state === 'doneLate';
      return {
        rd,
        worst,
        teamIds,
        teamNames: teamIds.map(teamName).join(', ') || '—',
        deadlineLate,
        deadlineDone,
      };
    });

  // Bucket by projected end date
  const buckets = new Map();
  topics.forEach(tp => {
    const b = horizonBucket(tp.rd.endD, tp.worst, m.de, now);
    if (!buckets.has(b.key)) buckets.set(b.key, { ...b, items: [] });
    buckets.get(b.key).items.push(tp);
  });
  const sorted = [...buckets.values()].sort((a, b) => a.order - b.order);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    { text: t('What comes when', 'Was kommt wann') + ' · ' + dateStr + ' · ' + t('projected end per topic, horizon-adjusted', 'prognostiziertes Ende je Thema, horizontgerecht'), style: 'sub' },
    {
      text: t('Each row is a top-level topic with its projected completion date. Date granularity collapses to weeks, months or quarters for distant or lower-confidence topics.', 'Jede Zeile ist ein Top-Level-Thema mit prognostiziertem Fertigstellungsdatum. Entfernte oder unsichere Themen werden zu Wochen, Monaten oder Quartalen gerundet.'),
      style: 'cap',
      margin: [0, 0, 0, 10],
    },
  ];

  sorted.forEach(bucket => {
    bucket.items.sort((a, b) => (a.rd.endD || 0) - (b.rd.endD || 0));
    content.push(headerTable(
      [t('Projected End', 'Ende prognost.'), 'ID', t('Topic', 'Thema'), t('Teams', 'Teams'), t('Progress', 'Fortschritt'), 'PT', 'Conf.'],
      bucket.items.map(({ rd, worst, teamNames, deadlineLate, deadlineDone }) => [
        { text: horizonLabel(rd.endD, worst, m.de, now), fontSize: 9 },
        { text: rd.id, fontSize: 9 },
        {
          text: [
            rd.type ? { text: GT[rd.type] + ' ', fontSize: 10 } : '',
            { text: rd.name, bold: true },
            rd.type === 'deadline' && rd.date ? { text: '  (' + t('deadline', 'Deadline') + ': ' + rd.date + ')', fontSize: 8, color: deadlineLate ? PRINT.risk : PRINT.muted } : '',
            deadlineLate ? { text: '  ■', color: PRINT.risk, bold: true } : deadlineDone ? { text: '  ✓', color: PRINT.done, bold: true } : '',
          ],
        },
        { text: teamNames, fontSize: 9 },
        { text: progressPctLabel(rd.prog) + '%  ·  ' + rd.doneCount + '/' + rd.leafCount, fontSize: 9 },
        { text: rd.pt.toFixed(0), fontSize: 9 },
        { text: '● ' + (worst === 'committed' ? t('committed', 'verbindlich') : worst === 'estimated' ? t('estimated', 'geschätzt') : t('exploratory', 'explorativ')), fontSize: 8.5, color: worst === 'committed' ? PRINT.confHi : worst === 'estimated' ? PRINT.confMid : PRINT.confLo },
      ]),
      [90, 45, '*', 100, 80, 35, 85],
      bucket.label + '  ·  ' + bucket.items.length + ' ' + t('topics', 'Themen'),
    ));
  });

  content.push({ text: t('● Committed (green): person assigned, solid estimate · ● Estimated (amber): effort known, no person · ○ Exploratory: scope unclear · ■ deadline at risk', '● Verbindlich (grün): Person zugewiesen, belastbare Schätzung · ● Geschätzt (amber): Aufwand bekannt, keine Person · ○ Explorativ: Scope unklar · ■ Deadline gefährdet'), style: 'cap', margin: [0, 6, 0, 0] });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — What comes when', creator: 'Planr' },
    defaultStyle: { font: 'PlexSans', fontSize: 10, color: PRINT.ink },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('What comes when', 'Was kommt wann'), dateStr }),
    content,
  };
  pdfMake.createPdf(sanitizePdfDoc(dd)).download(slug(meta.name) + '-whatwhen-' + iso(new Date()) + '.pdf');
}
