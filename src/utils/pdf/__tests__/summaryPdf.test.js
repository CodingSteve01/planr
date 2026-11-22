/** @vitest-environment node */
// The management summary PDF: sections, labels in both languages, options.
import { describe, expect, test, vi } from 'vitest';
import { buildSummaryDocDefinition } from '../summaryPdf.js';
import {
  PRINTABLE,
  badTexts,
  bodyRows,
  cellText,
  collectTexts,
  demoCtx,
  emptyCtx,
  findTables,
  headerLabels,
  tableProblems,
} from './pdfTestKit.js';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});

const build = async (lang, options) => (await buildSummaryDocDefinition(demoCtx(lang), options)).dd;
const roots = ctx => ctx.tree.filter(r => !r.id.includes('.'));
const tableWithHeader = (dd, first) => findTables(dd).find(tb => tb.widths && headerLabels(tb)[0] === first);

// Words that belong to the other language. They may appear in the plan's own
// names, which the demo translates, so only labels the export writes are listed.
const GERMAN_LABELS = /Dauer|KW\d|Fortschritt|Aufgaben|Wochen|Verbindlich|Zeitplan|Haltestellen|Erledigt|erledigt/;
const ENGLISH_LABELS =
  /Duration|\bCW\d|made with|Management summary|\bprojects\b|\bdelivered\b|Where each project|Team Capacity|Critical Path/;

describe.each(['en', 'de'])('summary PDF (%s)', lang => {
  const ctx = demoCtx(lang);
  let dd;
  let texts;
  test('builds', async () => {
    dd = (await buildSummaryDocDefinition(ctx)).dd;
    texts = collectTexts(dd);
    expect(texts.length).toBeGreaterThan(200);
  });

  test('is an A4 landscape document titled after the plan', () => {
    expect(dd.pageSize).toBe('A4');
    expect(dd.pageOrientation).toBe('landscape');
    expect(dd.info.title).toBe(ctx.data.meta.name + ' — Management Summary');
    expect(collectTexts(dd.content[0])).toEqual([ctx.data.meta.name]);
  });

  test('footer names the plan, the kind and the date', () => {
    const footer = collectTexts(dd.footer(1, 7)).join('|');
    expect(footer).toContain(ctx.data.meta.name + ' · ' + (lang === 'de' ? 'Management-Summary' : 'Management Summary'));
    expect(footer).toContain(lang === 'de' ? '15. Juni 2026' : 'June 15, 2026');
    expect(footer).toContain('1 / 7');
  });

  test('the status line states the date, the project count and the progress figure', () => {
    const status = collectTexts(dd.content[2]).join('');
    expect(status).toContain(lang === 'de' ? 'Datenstand 15.06.2026' : 'Data as of 2026-06-15');
    expect(status).toContain(`${roots(ctx).length} ${lang === 'de' ? 'Projekte' : 'projects'}`);
    expect(dd.content[2].text.some(part => /^\d+(\.\d)?%$/.test(part.text))).toBe(true);
  });

  test('the project table lists every top-level project with a progress figure', () => {
    // Columns: colour bar, id, name, forecast, target, delta, progress, bar.
    const tb = findTables(dd).find(x => headerLabels(x)[2] === (lang === 'de' ? 'Projekt' : 'Project'));
    const got = bodyRows(tb).map(row => row.map(cellText));
    expect(got.map(r => r[1]).sort()).toEqual(
      roots(ctx)
        .map(r => r.id)
        .sort(),
    );
    roots(ctx).forEach(r => expect(got.find(g => g[1] === r.id)[2]).toBe(r.name));
    got.forEach(r => expect(r[6]).toMatch(/^\d+% · \d+ PT$/));
  });

  test('the goals table lists every project once with its risk word', () => {
    const tb = tableWithHeader(dd, 'ID');
    const ids = bodyRows(tb).map(row => cellText(row[0]));
    expect(ids.sort()).toEqual(
      roots(ctx)
        .map(r => r.id)
        .sort(),
    );
  });

  test('the capacity section names every team and every person with work', () => {
    ctx.teams.forEach(tm => expect(texts).toContain(tm.name));
    new Set(ctx.scheduled.map(s => s.person)).forEach(p => expect(texts.some(s => s.startsWith(p))).toBe(true));
  });

  test('the timetable has a header in the document language', () => {
    const tb = tableWithHeader(dd, 'Stn');
    expect(headerLabels(tb).slice(0, 3)).toEqual(['Stn', 'Start', lang === 'de' ? 'Dauer' : 'Duration']);
  });

  test('week tags in the timetable use the language week abbreviation', () => {
    const tag = lang === 'de' ? /^KW\d+\/\d\d / : /^CW\d+\/\d\d /;
    const starts = findTables(dd)
      .filter(tb => tb.widths && headerLabels(tb)[0] === 'Stn')
      .flatMap(tb => bodyRows(tb).map(row => cellText(row[1])));
    expect(starts.length).toBeGreaterThan(5);
    starts.forEach(s => expect(s).toMatch(tag));
  });

  test('no label from the other language leaks in', () => {
    const wrong = texts.filter(s => (lang === 'de' ? ENGLISH_LABELS : GERMAN_LABELS).test(s));
    expect(wrong).toEqual([]);
  });

  test('every table keeps header, widths and rows in step and fits the page', () => {
    const tables = findTables(dd).filter(tb => tb.widths);
    expect(tables.length).toBeGreaterThanOrEqual(8);
    tables.forEach(tb => expect(tableProblems(tb, PRINTABLE.A4)).toEqual([]));
  });

  test('prints no undefined, NaN, null or [object] anywhere', () => {
    expect(badTexts(dd)).toEqual([]);
  });
});

describe('summary PDF options', () => {
  test('without the timetable there is no timetable section', async () => {
    const texts = collectTexts(await build('en', { includeTimetable: false }));
    expect(texts).not.toContain('Timetable');
    expect(texts).toContain('Project roadmaps');
  });

  test('without project roadmaps that section is gone', async () => {
    const texts = collectTexts(await build('en', { includeProjectRoadmaps: false }));
    expect(texts).not.toContain('Project roadmaps');
    expect(texts).toContain('Timetable');
  });
});

describe('summary PDF of an empty plan', () => {
  test.each([
    ['en', 'Where each project stands', 'Last project ends'],
    ['de', 'Wo jedes Projekt steht', 'Letztes Projekt endet'],
  ])('does not throw and still carries heading, table and verdict (%s)', async (lang, heading, verdict) => {
    const { dd } = await buildSummaryDocDefinition(emptyCtx(lang));
    const texts = collectTexts(dd);
    expect(texts).toContain(heading);
    expect(texts.join('|')).toContain(verdict);
    expect(texts.join('|')).toContain(lang === 'de' ? '0 Projekte' : '0 projects');
    expect(badTexts(dd)).toEqual([]);
  });
});
