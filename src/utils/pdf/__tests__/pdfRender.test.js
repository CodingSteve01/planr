/** @vitest-environment node */
// Runs pdfmake itself on every export's definition: the document must lay out,
// come out as a PDF and run to a sensible number of pages. The files are
// written to e2e/.output/pdf/ (git-ignored) so a person can open them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import pdfmake from 'pdfmake';
import { PLEX_FONTS, PLEX_VFS } from '../../pdfFonts.js';
import { buildGanttDocDefinition } from '../ganttPdf.js';
import { buildSummaryDocDefinition } from '../summaryPdf.js';
import { buildTodoDocDefinition } from '../todoPdf.js';
import { buildWhatWhenDocDefinition } from '../whatWhenPdf.js';
import { demoCtx, emptyCtx, pngDataUrl } from './pdfTestKit.js';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});

const OUT_DIR = fileURLToPath(new URL('../../../../e2e/.output/pdf/', import.meta.url));
// What the export rasterises at 3x, scaled down: a wide timeline of a short
// plan (5:2) and a tall one of a plan with many rows (3:10).
const WIDE = { url: pngDataUrl(500, 200), width: 1500, height: 600 };
const TALL = { url: pngDataUrl(360, 1200), width: 1200, height: 4000 };

// pdfmake's server build takes font bytes, not the browser's virtual file system.
beforeAll(() => {
  const face = key => Buffer.from(PLEX_VFS[PLEX_FONTS.PlexSans[key]], 'base64');
  pdfmake.setFonts({
    PlexSans: { normal: face('normal'), bold: face('bold'), italics: face('italics'), bolditalics: face('bolditalics') },
  });
  pdfmake.setLocalAccessPolicy(() => false);
  pdfmake.setUrlAccessPolicy(() => false);
  mkdirSync(OUT_DIR, { recursive: true });
});

async function render(name, dd) {
  const bytes = Buffer.from(await pdfmake.createPdf(dd).getBuffer());
  writeFileSync(OUT_DIR + name + '.pdf', bytes);
  const text = bytes.toString('latin1');
  return { head: text.slice(0, 4), pages: Number(text.match(/\/Count (\d+)/)[1]), size: bytes.length };
}

const gantt = lang => buildGanttDocDefinition(demoCtx(lang)).dd;
const ganttWithPicture = (lang, picture) => buildGanttDocDefinition(demoCtx(lang), picture).dd;

describe.each(['en', 'de'])('pdfmake renders the exports (%s)', lang => {
  const cases = [
    ['summary', async () => (await buildSummaryDocDefinition(demoCtx(lang))).dd, [3, 14]],
    ['todo', async () => buildTodoDocDefinition(demoCtx(lang)).dd, [1, 3]],
    ['whatwhen', async () => buildWhatWhenDocDefinition(demoCtx(lang)).dd, [1, 3]],
    ['gantt', async () => gantt(lang), [1, 3]],
    ['gantt-with-picture', async () => ganttWithPicture(lang, WIDE), [2, 2]],
    ['gantt-with-tall-picture', async () => ganttWithPicture(lang, TALL), [2, 2]],
  ];
  test.each(cases)('%s is a PDF with a sensible page count', async (name, build, [min, max]) => {
    const { head, pages, size } = await render(`${name}-${lang}`, await build());
    expect(head).toBe('%PDF');
    expect(pages).toBeGreaterThanOrEqual(min);
    expect(pages).toBeLessThanOrEqual(max);
    expect(size).toBeGreaterThan(5000);
  });
});

describe('pdfmake renders the summary of an empty plan', () => {
  test('one page, still a PDF', async () => {
    const { dd } = await buildSummaryDocDefinition(emptyCtx('de'));
    const { head, pages } = await render('summary-empty-de', dd);
    expect(head).toBe('%PDF');
    expect(pages).toBe(1);
  });
});
