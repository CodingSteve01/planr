/** @vitest-environment happy-dom */
import { describe, test, expect, vi, beforeAll } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { treeStats } from '../scheduler.js';
import { buildReportModel } from '../report.js';

const downloads = [];
vi.mock('../export/fileHelpers.js', async orig => ({
  ...(await orig()),
  download: (blob, name) => downloads.push({ blob, name }),
}));
// happy-dom has no canvas; a rasterised picture is stood in by a tiny PNG.
vi.mock('../export/svgRaster.js', () => ({
  svgToDataUrl: async () =>
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
}));
const { exportReportDocx } = await import('../export/reportDocx.js');

const d = isoStr => new Date(`${isoStr}T00:00:00`);

const TREE = [
  { id: 'P1', name: 'Rechnungen', status: 'wip', type: 'goal', date: '2026-06-30' },
  { id: 'P1.1', name: 'Übersicht für Kunden', status: 'done', best: 2, factor: 1, team: 'T1', assign: ['m1'] },
  { id: 'P1.2', name: 'Größenprüfung', status: 'open', best: 6, factor: 1, team: 'T1', assign: ['m2'] },
  { id: 'P2', name: 'Kundenbereich', status: 'open' },
  { id: 'P2.1', name: 'Anmeldung ändern', status: 'open', best: 4, factor: 1, team: 'T2', assign: ['m2'] },
];

function ctx() {
  const scheduled = TREE.filter(r => r.id.includes('.')).map((r, i) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    team: r.team,
    person: r.assign[0] === 'm1' ? 'Anna Noor' : 'Ben Ortiz',
    personId: r.assign[0],
    effort: r.best,
    startD: d(`2026-01-0${5 + i}`),
    endD: d(`2026-01-0${6 + i}`),
  }));
  return {
    tree: TREE,
    scheduled,
    members: [
      { id: 'm1', name: 'Anna Noor', team: 'T1', cap: 1 },
      { id: 'm2', name: 'Ben Ortiz', team: 'T2', cap: 1 },
    ],
    teams: [
      { id: 'T1', name: 'Frontend', color: '#2563eb' },
      { id: 'T2', name: 'Backend', color: '#16a34a' },
    ],
    weeks: [],
    cpSet: new Set(),
    goalPaths: {},
    stats: treeStats(TREE),
    confidence: {},
    meta: { name: 'Büro Planung', planStart: '2026-01-05' },
    lang: 'de',
    data: {},
  };
}

// One entry of a zip archive, read through its central directory (the local
// headers may leave the sizes to a trailing descriptor). No unzip library is
// a direct dependency, and zlib ships with Node.
function unzipEntry(buf, wanted) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === wanted) {
      const local = buf.readUInt32LE(p + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    p = next;
  }
  throw new Error(`${wanted} not in the archive`);
}

async function documentXml() {
  const { default: HTMLToDOCX } = await import('@turbodocx/html-to-docx');
  // The app injects the browser build as a script; here the node build stands in.
  window.HTMLToDOCX = HTMLToDOCX;
  await exportReportDocx(ctx());
  const { blob } = downloads[downloads.length - 1];
  return unzipEntry(Buffer.from(await blob.arrayBuffer()), 'word/document.xml');
}

describe('exportReportDocx()', () => {
  let xml;
  beforeAll(async () => {
    xml = await documentXml();
  });

  test('downloads a .docx named after the plan', () => {
    expect(downloads[0].name).toMatch(/-summary-\d{4}-\d{2}-\d{2}\.docx$/);
  });

  test('contains the project names', () => {
    expect(xml).toContain('Rechnungen');
    expect(xml).toContain('Kundenbereich');
  });

  test('keeps umlauts as real characters', () => {
    expect(xml).toContain('Übersicht für Kunden');
    expect(xml).toContain('Größenprüfung');
    expect(xml).not.toMatch(/&#(xc|xd|xf)/i);
    expect(xml).not.toContain('Ã');
  });

  test('contains the totals the report model computes', () => {
    const m = buildReportModel(ctx());
    expect(m.totalPt).toBe(12);
    expect(m.donePt).toBe(2);
    expect(xml).toContain(m.progLabel);
  });
});
