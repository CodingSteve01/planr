// High-quality PDF exports via pdfmake (dynamic import to keep initial bundle small).
// All PDFs carry: project name, kind, generation date in footer.
import { iso, isoWeek, isoWeekYear } from './date.js';
import { buildReportModel } from './report.js';
import { renderRoadmapSvg } from './roadmap.js';
import { buildGanttSvg, svgToDataUrl } from './exports.js';
import { re } from './scheduler.js';
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
  _pdfMake = pdfMake;
  return pdfMake;
}

// ── Horizon-aware date labelling ────────────────────────────────────────────
// Combines (a) distance from today and (b) planning confidence.
// Takes the fuzzier of the two so uncertain work isn't pinned down.
export function horizonLabel(date, confidence, de = false, now = new Date()) {
  if (!date) return de ? 'später' : 'later';
  const d = date instanceof Date ? date : new Date(date);
  const days = Math.round((d - now) / 86400000);
  const conf = confidence || 'committed';
  let gran;
  if (conf === 'exploratory' || days > 180) gran = 'q';
  else if (conf === 'estimated' || days > 60) gran = 'm';
  else if (days > 14) gran = 'w';
  else gran = 'd';
  if (gran === 'd') return iso(d);
  if (gran === 'w') {
    const mon = d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short', year: 'numeric' });
    return (de ? 'KW ' : 'Week ') + isoWeek(d) + ', ' + mon;
  }
  if (gran === 'm') return d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' });
  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
}

// Bucket label for grouped views (e.g. "Q2 2026", "Mai 2026", "KW 17").
export function horizonBucket(date, confidence, de = false, now = new Date()) {
  if (!date) return { key: 'zzz_later', label: de ? 'Später / TBD' : 'Later / TBD', order: 99999 };
  const d = date instanceof Date ? date : new Date(date);
  const days = Math.round((d - now) / 86400000);
  const conf = confidence || 'committed';
  let gran;
  if (conf === 'exploratory' || days > 180) gran = 'q';
  else if (conf === 'estimated' || days > 60) gran = 'm';
  else if (days > 28) gran = 'm';
  else gran = 'w';
  if (gran === 'w') {
    const w = isoWeek(d), y = d.getFullYear();
    return { key: y + '-w' + String(w).padStart(2, '0'), label: (de ? 'KW ' : 'Week ') + w + ' · ' + d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short', year: 'numeric' }), order: y * 100 + w };
  }
  if (gran === 'm') {
    const m = d.getMonth(), y = d.getFullYear();
    return { key: y + '-m' + String(m + 1).padStart(2, '0'), label: d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' }), order: y * 100 + m + 50 };
  }
  const q = Math.floor(d.getMonth() / 3) + 1, y = d.getFullYear();
  return { key: y + '-q' + q, label: 'Q' + q + ' ' + y, order: y * 100 + q * 3 + 80 };
}

// ── Shared footer / header builders ─────────────────────────────────────────
function footerBuilder({ meta, kind, dateStr }) {
  return (currentPage, pageCount) => ({
    margin: [40, 10, 40, 0],
    columns: [
      { text: (meta?.name || 'Project') + ' · ' + kind, fontSize: 8, color: '#7a839a' },
      { text: dateStr, fontSize: 8, color: '#7a839a', alignment: 'center' },
      { text: currentPage + ' / ' + pageCount, fontSize: 8, color: '#7a839a', alignment: 'right' },
    ],
  });
}

const STYLES = {
  h1: { fontSize: 20, bold: true, color: '#1a1e2a', margin: [0, 0, 0, 2] },
  h2: { fontSize: 14, bold: true, color: '#1d4ed8', margin: [0, 14, 0, 6] },
  h3: { fontSize: 11, bold: true, color: '#4a5268', margin: [0, 8, 0, 4] },
  sub: { fontSize: 10, color: '#7a839a', margin: [0, 0, 0, 10] },
  cap: { fontSize: 8.5, color: '#7a839a' },
  th: { bold: true, fontSize: 9, color: '#1a1e2a', fillColor: '#edf2fa' },
  td: { fontSize: 9, color: '#1a1e2a' },
  mono: { fontSize: 8.5, color: '#1a1e2a' },
  small: { fontSize: 8, color: '#1a1e2a' },
  kpiV: { fontSize: 18, bold: true, color: '#1a1e2a' },
  kpiL: { fontSize: 7.5, color: '#7a839a', characterSpacing: 0.4 },
  riskCrit: { fontSize: 10, color: '#b91c1c', bold: true },
  riskHigh: { fontSize: 10, color: '#a16207', bold: true },
  riskMed: { fontSize: 10, color: '#475467' },
};

const TABLE_LAYOUT = {
  hLineWidth: (i, node) => i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
  vLineWidth: () => 0.4,
  hLineColor: (i) => i === 1 ? '#ccd2dc' : '#e0e4ea',
  vLineColor: () => '#e0e4ea',
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  fillColor: (rowIndex) => rowIndex === 0 ? '#edf2fa' : rowIndex % 2 === 0 ? '#fafbfd' : null,
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

function headerTable(headers, rows, widths) {
  return {
    table: {
      headerRows: 1,
      widths: widths || headers.map(() => '*'),
      body: [headers.map(th), ...rows.map(row => row.map(cell => td(cell)))],
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
  const patched = svgStr.replace(
    /^<svg [^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`,
  );
  return patched
    .replace(/var\(--tx,([^)]*)\)/g, '#1a1e2a')
    .replace(/var\(--tx2,([^)]*)\)/g, '#4a5268')
    .replace(/var\(--tx3,([^)]*)\)/g, '#7a839a')
    .replace(/var\(--bg,([^)]*)\)/g, '#ffffff')
    .replace(/var\(--bg2,([^)]*)\)/g, '#f8f9fc')
    .replace(/var\(--b,([^)]*)\)/g, '#e0e4ea')
    .replace(/var\(--b2,([^)]*)\)/g, '#ccd2dc')
    .replace(/var\(--re,([^)]*)\)/g, '#ef4444')
    .replace(/var\(--ac,([^)]*)\)/g, '#2563eb')
    .replace(/var\(--tx[^)]*\)/g, '#1a1e2a')
    .replace(/var\(--tx2[^)]*\)/g, '#4a5268')
    .replace(/var\(--tx3[^)]*\)/g, '#7a839a')
    .replace(/var\(--bg[^)]*\)/g, '#ffffff')
    .replace(/var\(--b[^)]*\)/g, '#e0e4ea')
    .replace(/var\(--re[^)]*\)/g, '#ef4444')
    .replace(/var\(--ac[^)]*\)/g, '#2563eb');
}

function buildRoadmapSvgForPdf(ctx) {
  const { tree, scheduled, stats } = ctx;
  const svgStr = renderRoadmapSvg({ tree, scheduled, stats });
  return prepareRoadmapSvg(svgStr, 1400, 800);
}

async function rasterizeGantt(ctx, scale = 3) {
  const r = buildGanttSvg(ctx);
  if (!r) return null;
  try {
    const url = await svgToDataUrl(r.svg, r.width, r.height, scale, '#ffffff');
    return { url, width: r.width, height: r.height };
  } catch { return null; }
}

// ── Summary (Management) PDF ────────────────────────────────────────────────
export async function exportSummaryPDF(ctx, options = {}) {
  const { includeTimetable = true } = options;
  const m = buildReportModel(ctx);
  const pdfMake = await loadPdfMake();
  const roadmapSvg = buildRoadmapSvgForPdf(ctx);
  const { meta, t, dateStr, done, wip, open, totalPt, prog, projectEnd, roots, rootData, cc, ccPt, ccTotal, teamCap, cpItems, risks, confidence, members, lvs, scheduled, teams } = m;
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';

  const kpiBlock = (label, value, color = '#1a1e2a') => ({
    stack: [
      { text: String(value), fontSize: 16, bold: true, color, margin: [0, 0, 0, 2] },
      { text: label, style: 'kpiL' },
    ],
    margin: [0, 0, 0, 0],
  });
  const kpis = [
    kpiBlock(t('Progress', 'Fortschritt'), prog + '%', '#16a34a'),
    kpiBlock(t('Items', 'Items'), lvs.length),
    kpiBlock(t('Done', 'Erledigt'), done, '#16a34a'),
    kpiBlock(t('Open', 'Offen'), wip + open, '#d97706'),
    kpiBlock(t('Total PT', 'Gesamt PT'), totalPt.toFixed(0)),
    kpiBlock(t('People', 'Personen'), members.length),
    kpiBlock(t('Projected End', 'Voraussichtl. Ende'), projectEnd ? iso(projectEnd) : '—'),
  ];
  if (cpItems.length) kpis.push(kpiBlock(t('Critical Path', 'Krit. Pfad'), cpItems.length, '#dc2626'));

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    { text: t('Management Summary', 'Management-Zusammenfassung') + ' · ' + dateStr + (meta.planStart ? ' · ' + t('Plan', 'Plan') + ': ' + meta.planStart : '') + (projectEnd ? ' → ' + iso(projectEnd) : ''), style: 'sub' },
    { text: t('Key Figures', 'Kennzahlen'), style: 'h2' },
    { columns: kpis, columnGap: 8, margin: [0, 0, 0, 8] },
    {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: 760, h: 8, r: 2, color: '#e5e8ee' },
        { type: 'rect', x: 0, y: 0, w: 760 * prog / 100, h: 8, r: 2, color: '#16a34a' },
      ],
      margin: [0, 0, 0, 10],
    },
  ];

  if (risks.length) {
    content.push({ text: t('Risks & Alerts', 'Risiken & Warnungen'), style: 'h2' });
    content.push({
      table: {
        widths: ['*'],
        body: risks.map(r => ([{
          text: (r.severity === 'critical' ? '⚠ ' : r.severity === 'high' ? '⚡ ' : 'ℹ ') + r.text,
          fontSize: 10,
          color: r.severity === 'critical' ? '#b91c1c' : r.severity === 'high' ? '#a16207' : '#475467',
          fillColor: r.severity === 'critical' ? '#fee2e2' : r.severity === 'high' ? '#fef3c7' : '#f0f2f5',
          margin: [6, 5, 6, 5],
          border: [false, false, false, false],
        }])),
      },
      layout: { paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 1, paddingBottom: () => 1 },
      margin: [0, 0, 0, 8],
    });
  }

  content.push({ text: t('Planning Confidence', 'Planungssicherheit'), style: 'h2' });
  if (ccTotal > 0) {
    const barW = 760;
    content.push({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: barW * cc.committed / ccTotal, h: 8, color: '#16a34a' },
        { type: 'rect', x: barW * cc.committed / ccTotal, y: 0, w: barW * cc.estimated / ccTotal, h: 8, color: '#d97706' },
        { type: 'rect', x: barW * (cc.committed + cc.estimated) / ccTotal, y: 0, w: barW * cc.exploratory / ccTotal, h: 8, color: '#7a839a' },
      ],
      margin: [0, 0, 0, 6],
    });
  }
  content.push(headerTable(
    [t('Confidence', 'Sicherheit'), 'Items', 'PT', t('Description', 'Beschreibung')],
    [
      [{ text: '● Committed', color: '#15803d' }, cc.committed, ccPt.committed.toFixed(0), t('Person assigned, solid estimate', 'Person zugewiesen, belastbare Schätzung')],
      [{ text: '◐ Estimated', color: '#a16207' }, cc.estimated, ccPt.estimated.toFixed(0), t('Estimate exists, no person yet', 'Aufwand geschätzt, noch keine Person')],
      [{ text: '○ Exploratory', color: '#7a839a' }, cc.exploratory, ccPt.exploratory > 0 ? ccPt.exploratory.toFixed(0) : '?', t('Scope unclear, concept work needed', 'Scope unklar, Konzeption nötig')],
    ],
    [90, 50, 50, '*'],
  ));

  if (roadmapSvg) {
    content.push({ text: t('Roadmap', 'Roadmap'), style: 'h2', pageBreak: 'before' });
    content.push({ svg: roadmapSvg, width: 760, margin: [0, 0, 0, 8] });
  }

  // Optional Fahrplan section — chronological station timetable for each line.
  // Uses the same computeRoadmapModel data as the Subway-Map.
  if (includeTimetable) {
    try {
      const { computeRoadmapModel } = await import('./roadmap.js');
      const rmModel = computeRoadmapModel({ tree: ctx.tree, scheduled: ctx.scheduled, stats: ctx.stats });
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
            const status = st.allDone ? '✓' : items.some(it => it.status === 'wip') ? '◐' : '○';
            return { abbrev: st.abbrev + (items.length > 1 ? ' ×' + items.length : ''), startD, endD, calDays, workDays, status };
          }).sort((a, b) => (a.startD || 0) - (b.startD || 0));

          return {
            stack: [
              {
                text: [
                  { text: line.root.id + '  ', color: line.color, bold: true },
                  { text: line.root.name, color: '#1a1e2a', bold: true },
                ],
                fontSize: 10, margin: [0, 0, 0, 3],
              },
              headerTable(
                [t('Stn', 'Stn'), t('Start', 'Start'), t('Dauer', 'Dauer'), ''],
                rows.map(r => [
                  { text: r.abbrev, color: line.color, bold: true, fontSize: 9 },
                  { text: r.startD ? `${kwTag(r.startD)} ${iso(r.startD).slice(5)}` : '—', fontSize: 8 },
                  { text: r.calDays ? `${r.calDays}d/${r.workDays.toFixed(0)}PT` : '—', fontSize: 8 },
                  { text: r.status, alignment: 'center', fontSize: 9 },
                ]),
                [45, 80, 60, 20],
              ),
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

  const goals = roots.filter(r => r.type);
  if (goals.length) {
    content.push({ text: t('Goals & Deadlines', 'Ziele & Deadlines'), style: 'h2' });
    content.push(headerTable(
      ['ID', t('Name', 'Name'), t('Deadline', 'Deadline'), t('Progress', 'Fortschritt'), t('Scheduled End', 'Geplantes Ende'), t('Risk', 'Risiko')],
      goals.map(g => {
        const rd = rootData.find(x => x.id === g.id);
        const isLate = rd?.endD && g.date && new Date(g.date) < rd.endD;
        return [
          g.id,
          { text: g.name, bold: true },
          g.date || '—',
          (rd?.prog || 0) + '% (' + (rd?.doneCount || 0) + '/' + (rd?.leafCount || 0) + ')',
          rd?.endD ? iso(rd.endD) : '—',
          isLate ? { text: '⚠ ' + t('AT RISK', 'GEFÄHRDET'), color: '#dc2626', bold: true } : rd?.endD ? { text: '✓ ' + t('on track', 'im Plan'), color: '#16a34a' } : '—',
        ];
      }),
      [40, '*', 70, 80, 70, 80],
    ));
  }

  // Team capacity as per-team cards
  const capCards = Object.values(teamCap).filter(tc => tc.members.length || tc.committed > 0 || tc.unassigned > 0);
  if (capCards.length) {
    content.push({ text: t('Team Capacity', 'Teamauslastung'), style: 'h2' });
    const pairs = [];
    for (let i = 0; i < capCards.length; i += 2) pairs.push(capCards.slice(i, i + 2));
    pairs.forEach(pair => {
      content.push({
        columns: pair.map(tc => {
          const total = tc.committed + tc.unassigned;
          const wBar = 340;
          const memStack = tc.members.map(mb => {
            const pp = lvs.filter(r => r.status !== 'done' && (r.assign || []).includes(mb.id)).reduce((s, r) => s + re(r.best || 0, r.factor || 1.5), 0);
            return { columns: [{ text: mb.name + (mb.cap < 1 ? ' (' + Math.round(mb.cap * 100) + '%)' : ''), fontSize: 9 }, { text: pp.toFixed(0) + ' PT', fontSize: 9, alignment: 'right' }], columnGap: 4 };
          });
          const barCanvas = total > 0 ? {
            canvas: [
              { type: 'rect', x: 0, y: 0, w: wBar * tc.committed / total, h: 6, color: '#16a34a' },
              { type: 'rect', x: wBar * tc.committed / total, y: 0, w: wBar * tc.unassigned / total, h: 6, color: '#d97706' },
            ],
            margin: [0, 4, 0, 2],
          } : null;
          const footerCol = total > 0 ? {
            columns: [
              { text: tc.committed.toFixed(0) + ' PT ' + t('assigned', 'zugewiesen'), fontSize: 8, color: '#16a34a' },
              tc.unassigned > 0 ? { text: tc.unassigned.toFixed(0) + ' PT ' + t('open', 'offen') + ' (' + tc.count + ')', fontSize: 8, color: '#d97706', alignment: 'right' } : { text: '' },
            ],
          } : null;
          return {
            stack: [
              { text: tc.name, bold: true, color: tc.color, fontSize: 11, margin: [0, 0, 0, 3] },
              ...memStack,
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
    content.push({ text: t('Critical Path', 'Kritischer Pfad'), style: 'h2' });
    content.push({ text: t('Any delay to these items delays the project end.', 'Jede Verzögerung dieser Items verzögert das Projektende.'), style: 'cap', margin: [0, 0, 0, 4] });
    content.push(headerTable(
      ['ID', t('Name', 'Name'), t('Team', 'Team'), t('Person', 'Person'), t('Start', 'Start'), t('End', 'Ende'), 'PT'],
      cpItems.map(s => [s.id, s.name, teamName(s.team), s.person || '—', s.startD ? iso(s.startD) : '—', s.endD ? iso(s.endD) : '—', s.effort?.toFixed(1) || '—']),
      [40, '*', 70, 80, 60, 60, 30],
    ));
  }

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — Management Summary', creator: 'Planr' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1a1e2a' },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('Management Summary', 'Management-Summary'), dateStr }),
    content,
  };
  pdfMake.createPdf(dd).download(slug(meta.name) + '-summary-' + iso(new Date()) + '.pdf');
}

// ── Gantt PDF ───────────────────────────────────────────────────────────────
export async function exportGanttPDF(ctx) {
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
  const pageMargin = 28;
  const printableW = { A4: 841 - pageMargin * 2, A3: 1191 - pageMargin * 2, A2: 1684 - pageMargin * 2 }[pageSize];
  const imgWidth = Math.min(printableW, nativeW);

  const content = [
    { text: meta.name || 'Project', style: 'h1' },
    { text: t('Schedule / Gantt', 'Zeitplan / Gantt') + ' · ' + dateStr + ' · ' + scheduled.length + ' ' + t('tasks', 'Tasks') + ' · ' + weeks.length + ' ' + t('weeks', 'Wochen'), style: 'sub' },
  ];
  if (gantt) content.push({ image: gantt.url, width: imgWidth, margin: [0, 0, 0, 14] });

  content.push({ text: t('Schedule Table', 'Terminübersicht'), style: 'h2', pageBreak: 'before' });
  const byTeam = {};
  scheduled.forEach(s => { const k = s.team || '__none'; (byTeam[k] || (byTeam[k] = [])).push(s); });
  Object.entries(byTeam).forEach(([tk, items]) => {
    const tm = teams.find(x => x.id === tk);
    content.push({ text: (tm?.name || t('No team', 'Kein Team')) + ' (' + items.length + ')', style: 'h3', color: tm?.color || '#4a5268' });
    items.sort((a, b) => (a.startD || 0) - (b.startD || 0));
    content.push(headerTable(
      ['ID', t('Name', 'Name'), t('Person', 'Person'), t('Start', 'Start'), t('End', 'Ende'), 'PT'],
      items.map(s => [s.id, s.name, s.person || '—', s.startD ? iso(s.startD) : '—', s.endD ? iso(s.endD) : '—', s.effort?.toFixed(1) || '—']),
      [50, '*', 100, 65, 65, 35],
    ));
  });

  const dd = {
    pageSize,
    pageOrientation: 'landscape',
    pageMargins: [pageMargin, pageMargin, pageMargin, 40],
    info: { title: (meta.name || 'Project') + ' — Gantt', creator: 'Planr' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1a1e2a' },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('Gantt / Schedule', 'Gantt / Zeitplan'), dateStr }),
    content,
  };
  pdfMake.createPdf(dd).download(slug(meta.name) + '-gantt-' + iso(new Date()) + '.pdf');
}

// ── TODO / Sprint PDF ───────────────────────────────────────────────────────
export async function exportTodoPDF(ctx, horizonDays) {
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
    content.push({ text: g.label + '  (' + g.items.length + ')', style: 'h2' });
    content.push(headerTable(
      [t('Start', 'Start'), t('End', 'Ende'), 'ID', t('Task', 'Task'), t('Team', 'Team'), t('Effort', 'Aufw.'), t('Status', 'Status'), 'Conf.'],
      g.items.map(s => {
        const node = tree.find(r => r.id === (s.treeId || s.id));
        const conf = confidence[s.id] || 'committed';
        const label = horizonLabel(s.startD, conf, m.de, now);
        const endLabel = horizonLabel(s.endD, conf, m.de, now);
        const decide = node?.decideBy ? { text: ' ⏰ ' + node.decideBy, color: '#d97706', fontSize: 8 } : null;
        const nameCell = decide ? { text: [{ text: s.name }, decide] } : s.name;
        return [
          { text: label, fontSize: 8.5 },
          { text: endLabel, fontSize: 8.5 },
          { text: s.id, fontSize: 8.5 },
          nameCell,
          teamName(s.team),
          s.effort?.toFixed(1) || '—',
          s.status === 'wip' ? { text: '🟡 WIP', color: '#d97706' } : { text: t('Open', 'Offen'), color: '#475467' },
          { text: conf === 'committed' ? '●' : conf === 'estimated' ? '◐' : '○', color: conf === 'committed' ? '#15803d' : conf === 'estimated' ? '#a16207' : '#7a839a', alignment: 'center' },
        ];
      }),
      [75, 75, 45, '*', 80, 40, 50, 25],
    ));
  });

  content.push({ text: t('● Committed · ◐ Estimated · ○ Exploratory (horizon-aware dates)', '● Verbindlich · ◐ Geschätzt · ○ Explorativ (horizontgerechte Daten)'), style: 'cap', margin: [0, 4, 0, 0] });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — TODO', creator: 'Planr' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1a1e2a' },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('TODO / Sprint', 'TODO / Sprint') + ' · ' + horizon + ' ' + t('days', 'Tage'), dateStr }),
    content,
  };
  pdfMake.createPdf(dd).download(slug(meta.name) + '-todo-' + horizon + 'd-' + iso(new Date()) + '.pdf');
}

// ── "What comes when" PDF — horizon-aware buckets, TOPIC level ──────────────
// Each row is a top-level root (Thema / Goal / Deadline). Bucket key is the
// root's projected end date (max endD of all descendant scheduled items).
// Confidence aggregate = worst confidence among the root's open leaves.
export async function exportWhatWhenPDF(ctx) {
  const m = buildReportModel(ctx);
  const { meta, t, dateStr, scheduled, tree, teams, confidence, rootData, lvs } = m;
  if (!scheduled.length) { alert(m.de ? 'Kein Zeitplan vorhanden.' : 'Nothing scheduled.'); return; }
  const pdfMake = await loadPdfMake();
  const teamName = id => teams.find(x => x.id === id)?.name || id || '—';
  const now = new Date();
  const GT = { goal: '🎯', painpoint: '⚡', deadline: '⏰' };

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
      const deadlineLate = rd.type === 'deadline' && rd.date && new Date(rd.date) < rd.endD;
      return {
        rd,
        worst,
        teamIds,
        teamNames: teamIds.map(teamName).join(', ') || '—',
        deadlineLate,
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
    content.push({ text: bucket.label + '  ·  ' + bucket.items.length + ' ' + t('topics', 'Themen'), style: 'h2' });
    bucket.items.sort((a, b) => (a.rd.endD || 0) - (b.rd.endD || 0));
    content.push(headerTable(
      [t('Projected End', 'Ende prognost.'), 'ID', t('Topic', 'Thema'), t('Teams', 'Teams'), t('Progress', 'Fortschritt'), 'PT', 'Conf.'],
      bucket.items.map(({ rd, worst, teamNames, deadlineLate }) => [
        { text: horizonLabel(rd.endD, worst, m.de, now), fontSize: 9 },
        { text: rd.id, fontSize: 9 },
        {
          text: [
            rd.type ? { text: GT[rd.type] + ' ', fontSize: 10 } : '',
            { text: rd.name, bold: true },
            rd.type === 'deadline' && rd.date ? { text: '  (' + t('deadline', 'Deadline') + ': ' + rd.date + ')', fontSize: 8, color: deadlineLate ? '#b91c1c' : '#7a839a' } : '',
            deadlineLate ? { text: '  ⚠', color: '#b91c1c', bold: true } : '',
          ],
        },
        { text: teamNames, fontSize: 9 },
        { text: rd.prog + '% (' + rd.doneCount + '/' + rd.leafCount + ')', fontSize: 9 },
        { text: rd.pt.toFixed(0), fontSize: 9 },
        { text: worst === 'committed' ? '● ' + t('committed', 'verbindlich') : worst === 'estimated' ? '◐ ' + t('estimated', 'geschätzt') : '○ ' + t('exploratory', 'explorativ'), fontSize: 8.5, color: worst === 'committed' ? '#15803d' : worst === 'estimated' ? '#a16207' : '#7a839a' },
      ]),
      [90, 45, '*', 100, 80, 35, 85],
    ));
  });

  content.push({ text: t('● Committed: person assigned, solid estimate · ◐ Estimated: effort known, no person · ○ Exploratory: scope unclear · ⚠ deadline at risk', '● Verbindlich: Person zugewiesen, belastbare Schätzung · ◐ Geschätzt: Aufwand bekannt, keine Person · ○ Explorativ: Scope unklar · ⚠ Deadline gefährdet'), style: 'cap', margin: [0, 6, 0, 0] });

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: { title: (meta.name || 'Project') + ' — What comes when', creator: 'Planr' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1a1e2a' },
    styles: STYLES,
    footer: footerBuilder({ meta, kind: t('What comes when', 'Was kommt wann'), dateStr }),
    content,
  };
  pdfMake.createPdf(dd).download(slug(meta.name) + '-whatwhen-' + iso(new Date()) + '.pdf');
}
