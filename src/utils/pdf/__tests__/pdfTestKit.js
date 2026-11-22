// Shared helpers for the PDF export tests: the demo plan scheduled the way the
// app schedules it, and walkers over a pdfmake document definition.
import { deflateSync } from 'node:zlib';
import { translatorFor } from '../../../i18n.jsx';
import { buildDemoProject } from '../../demoProject.js';
import { buildExportCtx } from '../../exportCtx.js';
import { buildHMap } from '../../holidays.js';
import { compileMembers } from '../../effective.js';
import { sortTree } from '../../treeEdit.js';
import { goalCpm, rootCpm } from '../../cpm.js';
import { computeConfidence, enrichParentSchedules, schedule, treeStats } from '../../scheduler.js';

// The export ctx for a plan, with the scheduler run as usePlanModel runs it.
export function ctxFromData(data, lang) {
  const tree = sortTree(data.tree || []);
  const meta = data.meta || {};
  const members = compileMembers({
    members: data.members || [],
    teams: data.teams || [],
    meetingPlans: data.meetingPlans || [],
    changes: data.changes || [],
  });
  const planStart = meta.planStart || '2026-06-01';
  const { results: scheduled, weeks } = schedule(
    tree,
    members,
    data.vacations || [],
    planStart,
    meta.planEnd || '2027-12-31',
    buildHMap(data.holidays || []),
    meta.workDays || [1, 2, 3, 4, 5],
    planStart,
    {},
  );
  const stats = treeStats(tree);
  enrichParentSchedules(stats, tree, scheduled);
  return buildExportCtx({
    data: { ...data, tree },
    scheduled,
    weeks,
    cpSet: rootCpm(tree).critical,
    goalPaths: goalCpm(tree),
    stats,
    confidence: computeConfidence(tree, data.members || []).confidence,
    lang,
    projectWaitsOf: () => null,
  });
}

export function demoCtx(lang) {
  const t = translatorFor(lang);
  return ctxFromData(buildDemoProject(t), lang);
}

// A plan with nothing in it.
export function emptyCtx(lang) {
  return ctxFromData({ tree: [], members: [], teams: [], vacations: [], holidays: [], meta: { name: 'Empty plan' } }, lang);
}

// Keys whose values are geometry or pictures, never words.
const NOT_TEXT_KEYS = new Set(['image', 'svg', 'layout', 'canvas', 'margin', 'pageMargins', 'border', 'widths', 'heights', 'fit']);

// Every string in a definition, in reading order. `footer` is a function of
// (page, pageCount) in pdfmake; it is called with 1 of 3.
export function collectTexts(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (typeof node === 'function') return out;
  if (Array.isArray(node)) {
    node.forEach(n => collectTexts(n, out));
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (NOT_TEXT_KEYS.has(key)) continue;
    if (key === 'footer' && typeof value === 'function') collectTexts(value(1, 3), out);
    else if (key === 'text' && typeof value !== 'object') out.push(String(value));
    else if (value && typeof value === 'object') collectTexts(value, out);
  }
  return out;
}

// Every `{ table }` node in a definition.
export function findTables(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(n => findTables(n, out));
    return out;
  }
  if (node.table) out.push(node.table);
  Object.values(node).forEach(v => findTables(v, out));
  return out;
}

// The text of a table cell, whatever shape it has.
export const cellText = cell => collectTexts(cell).join('');

// The words that mean a template or a join went wrong.
export const BAD_TEXT = /undefined|\bNaN\b|\bnull\b|\[object/;

export function badTexts(dd) {
  return collectTexts(dd).filter(s => BAD_TEXT.test(s));
}

// Widths that are numbers: their sum, to compare with the printable width.
export function fixedWidthSum(table) {
  return table.widths.filter(w => typeof w === 'number').reduce((a, b) => a + b, 0);
}

// The page width a landscape page leaves between its margins, in points.
export const PRINTABLE = { A4: 842 - 72, A3: 1191 - 72, A2: 1684 - 72 };

// The body rows of a table, without its title and header rows.
export const bodyRows = table => table.body.slice(table.headerRows || 1);

// The labels of a table's column-header row.
export const headerLabels = table => table.body[(table.headerRows || 1) - 1].map(cellText);

// What every table must hold to: one width per header cell, one cell per
// column in every row, and fixed widths that fit the page.
export function tableProblems(table, printable) {
  const problems = [];
  const cols = table.widths.length;
  table.body.forEach((row, i) => {
    // A spanning cell is followed by placeholders, so cells == columns.
    if (row.length !== cols) problems.push(`row ${i} has ${row.length} cells for ${cols} columns`);
  });
  if (fixedWidthSum(table) > printable) problems.push(`fixed widths ${fixedWidthSum(table)} exceed ${printable}`);
  return problems;
}

// A plan of `n` flat tasks for one person, all starting on the plan start.
export function tinyPlanCtx(n, lang) {
  const tree = Array.from({ length: n }, (_, i) => ({
    id: 'T' + (i + 1),
    name: 'Export ' + (i + 1),
    status: 'open',
    best: 3,
    factor: 1,
    team: 'T1',
    assign: ['m1'],
  }));
  return ctxFromData(
    {
      tree,
      members: [{ id: 'm1', name: 'Anna Noor', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Frontend', color: '#2563eb' }],
      meta: { name: 'Kundenbereich', planStart: '2026-06-15' },
    },
    lang,
  );
}

// The count and the noun a table title ends in ("Name  ·  3 tasks").
export function titleCount(table) {
  const m = cellText(table.body[0][0]).match(/·\s+(\d+) (\S+)$/);
  return { n: Number(m[1]), word: m[2] };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// A real width x height PNG (8-bit grey, light stripes) as a data URL, so the
// layout sees a plausible aspect ratio instead of a 1 x 1 pixel.
export function pngDataUrl(width, height) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; // bit depth 8, colour type 0 (grey), the rest stays 0
  const rows = Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.alloc(width, y % 20 < 10 ? 235 : 250)]));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}
