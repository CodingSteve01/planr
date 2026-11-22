/** @vitest-environment node */
// The Gantt PDF: the schedule table, and the page it picks for the picture.
import { describe, expect, test, vi } from 'vitest';
import { buildGanttDocDefinition } from '../ganttPdf.js';
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

const HEADERS = {
  en: ['ID', 'Name', 'Person', 'Start', 'End', 'PT'],
  de: ['ID', 'Name', 'Person', 'Start', 'Ende', 'PT'],
};
const picture = width => ({ url: 'data:image/png;base64,AAAA', width, height: 500 });
const rows = dd => findTables(dd).flatMap(bodyRows);

describe.each(['en', 'de'])('gantt PDF (%s)', lang => {
  const ctx = demoCtx(lang);
  const { dd } = buildGanttDocDefinition(ctx);

  test('is a landscape document titled after the plan', () => {
    expect(dd.pageOrientation).toBe('landscape');
    expect(dd.info.title).toBe(ctx.data.meta.name + ' — Gantt');
    expect(collectTexts(dd.content[0])).toEqual([ctx.data.meta.name]);
  });

  test('footer names the plan, the kind and the date', () => {
    const footer = collectTexts(dd.footer(3, 3)).join('|');
    expect(footer).toContain(ctx.data.meta.name + ' · ' + (lang === 'de' ? 'Gantt / Zeitplan' : 'Gantt / Schedule'));
    expect(footer).toContain(lang === 'de' ? '15. Juni 2026' : 'June 15, 2026');
    expect(footer).toContain('3 / 3');
  });

  test('subtitle counts the scheduled tasks and the weeks', () => {
    const sub = collectTexts(dd.content[1]).join('');
    const [tasks, weeks] = lang === 'de' ? ['Tasks', 'Wochen'] : ['tasks', 'weeks'];
    expect(sub).toContain(`${ctx.scheduled.length} ${tasks} · ${ctx.weeks.length} ${weeks}`);
  });

  test('lists every scheduled task exactly once with name, person and dates', () => {
    const got = rows(dd);
    expect(got.map(r => cellText(r[0])).sort()).toEqual(ctx.scheduled.map(s => s.id).sort());
    ctx.scheduled.forEach(s => {
      const row = got.find(r => cellText(r[0]) === s.id).map(cellText);
      expect(row[1]).toBe(s.name);
      expect(row[2]).toBe(s.person || '—');
      expect(row[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row[4]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row[5]).toBe(s.effort.toFixed(1));
    });
  });

  test('has one table per team, titled with the team and its task count', () => {
    const tables = findTables(dd);
    const teams = new Set(ctx.scheduled.map(s => s.team));
    expect(tables).toHaveLength(teams.size);
    tables.forEach(tb => {
      const title = cellText(tb.body[0][0]);
      expect(title).toContain(' · ' + bodyRows(tb).length + (lang === 'de' ? ' Aufgaben' : ' tasks'));
      expect(ctx.teams.some(t => title.startsWith(t.name))).toBe(true);
    });
  });

  test('table header labels, widths and rows agree and fit the page', () => {
    findTables(dd).forEach(tb => {
      expect(headerLabels(tb)).toEqual(HEADERS[lang]);
      expect(tb.widths).toHaveLength(6);
      expect(tableProblems(tb, PRINTABLE.A3)).toEqual([]);
    });
  });

  test('without a picture it says the table carries the schedule', () => {
    const note = lang === 'de' ? 'Das Timeline-Bild konnte nicht erzeugt werden' : 'The timeline image could not be rendered';
    expect(collectTexts(dd.content).join('|')).toContain(note);
    expect(dd.content.some(n => n.pageBreak === 'before')).toBe(false);
  });

  test('prints no undefined, NaN, null or [object] anywhere', () => {
    expect(badTexts(dd)).toEqual([]);
  });
});

describe('gantt PDF page size follows the picture', () => {
  const ctx = demoCtx('en');
  test.each([
    [1000, 'A4'],
    [1500, 'A3'],
    [2400, 'A2'],
  ])('a picture %i pt wide is printed on %s, never wider than the margins', (width, size) => {
    const { dd } = buildGanttDocDefinition(ctx, picture(width));
    expect(dd.pageSize).toBe(size);
    const image = dd.content.find(n => n.image);
    expect(image.width).toBeLessThanOrEqual(PRINTABLE[size]);
    expect(image.width).toBeLessThanOrEqual(width);
  });

  test('with a picture the table starts on a new page', () => {
    const { dd } = buildGanttDocDefinition(ctx, picture(1500));
    const heading = dd.content.find(n => n.style === 'h2');
    expect(heading.pageBreak).toBe('before');
    expect(collectTexts(heading)).toEqual(['Schedule Table']);
  });

  test('German heading for the table', () => {
    const { dd } = buildGanttDocDefinition(demoCtx('de'), picture(1500));
    expect(collectTexts(dd.content.find(n => n.style === 'h2'))).toEqual(['Terminübersicht']);
  });
});

describe('gantt PDF without anything scheduled', () => {
  test.each([
    ['en', 'Nothing scheduled.'],
    ['de', 'Kein Zeitplan vorhanden.'],
  ])('an empty plan answers with a message, not an error (%s)', (lang, text) => {
    expect(buildGanttDocDefinition(emptyCtx(lang))).toEqual({ empty: text });
  });
});
