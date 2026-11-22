/** @vitest-environment node */
// The TODO / Sprint PDF: what its definition lists, in both languages.
import { describe, expect, test, vi } from 'vitest';
import { buildTodoDocDefinition } from '../todoPdf.js';
import {
  PRINTABLE,
  badTexts,
  bodyRows,
  cellText,
  collectTexts,
  ctxFromData,
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

const DAY = 86400000;
const HEADERS = {
  en: ['Start', 'End', 'ID', 'Task', 'Team', 'Effort', 'Status', 'Conf.'],
  de: ['Start', 'Ende', 'ID', 'Task', 'Team', 'Aufw.', 'Status', 'Conf.'],
};

// The tasks the export must list: open, starting inside the horizon.
function expectedTasks(ctx, days = 30) {
  const end = new Date(Date.now() + days * DAY);
  return ctx.scheduled.filter(s => s.status !== 'done' && s.startD && s.startD <= end);
}

const listedIds = dd => findTables(dd).flatMap(tb => bodyRows(tb).map(row => cellText(row[2])));

describe.each(['en', 'de'])('todo PDF (%s)', lang => {
  const ctx = demoCtx(lang);
  const { dd } = buildTodoDocDefinition(ctx);

  test('is an A4 landscape document titled after the plan', () => {
    expect(dd.pageSize).toBe('A4');
    expect(dd.pageOrientation).toBe('landscape');
    expect(dd.info.title).toBe(ctx.data.meta.name + ' — TODO');
    expect(collectTexts(dd.content[0])).toEqual([ctx.data.meta.name]);
  });

  test('footer names the plan, the kind, the horizon and the date', () => {
    const footer = collectTexts(dd.footer(2, 5)).join('|');
    const days = lang === 'de' ? '30 Tage' : '30 days';
    expect(footer).toContain(ctx.data.meta.name + ' · TODO / Sprint · ' + days);
    expect(footer).toContain(lang === 'de' ? '15. Juni 2026' : 'June 15, 2026');
    expect(footer).toContain(lang === 'de' ? 'erstellt mit' : 'made with');
    expect(footer).toContain('2 / 5');
  });

  test('lists exactly the open tasks inside the horizon, once each', () => {
    const want = expectedTasks(ctx).map(s => s.id);
    expect(want.length).toBeGreaterThan(3);
    expect(listedIds(dd).sort()).toEqual(want.sort());
  });

  test('leaves done tasks and tasks beyond the horizon out', () => {
    const listed = new Set(listedIds(dd));
    const out = ctx.scheduled.filter(s => !expectedTasks(ctx).includes(s));
    expect(out.length).toBeGreaterThan(0);
    out.forEach(s => expect(listed.has(s.id)).toBe(false));
  });

  test('has one lane per person with the person and the task count in its title', () => {
    const tables = findTables(dd);
    const people = new Set(expectedTasks(ctx).map(s => s.person));
    expect(tables).toHaveLength(people.size);
    people.forEach(p => expect(tables.some(tb => cellText(tb.body[0][0]).startsWith(p + '  ·'))).toBe(true));
  });

  test('table header labels, widths and rows agree and fit the page', () => {
    findTables(dd).forEach(tb => {
      expect(headerLabels(tb)).toEqual(HEADERS[lang]);
      expect(tb.widths).toHaveLength(8);
      expect(tableProblems(tb, PRINTABLE.A4)).toEqual([]);
    });
  });

  test('subtitle states horizon, window and counts', () => {
    const sub = collectTexts(dd.content[1]).join('');
    expect(sub).toContain('2026-06-15 → 2026-07-15');
    expect(sub).toContain(expectedTasks(ctx).length + (lang === 'de' ? ' Tasks' : ' tasks'));
    expect(sub).toContain(lang === 'de' ? 'Horizont: 30 Tage' : 'Horizon: 30 days');
  });

  test('prints no undefined, NaN, null or [object] anywhere', () => {
    expect(badTexts(dd)).toEqual([]);
  });
});

describe('todo PDF horizon', () => {
  test('a longer horizon lists more tasks and says so in the footer', () => {
    const ctx = demoCtx('en');
    const { dd } = buildTodoDocDefinition(ctx, 90);
    expect(listedIds(dd).sort()).toEqual(
      expectedTasks(ctx, 90)
        .map(s => s.id)
        .sort(),
    );
    expect(listedIds(dd).length).toBeGreaterThan(listedIds(buildTodoDocDefinition(ctx).dd).length);
    expect(collectTexts(dd.footer(1, 1)).join('')).toContain('90 days');
  });

  test('a nonsense horizon falls back to 30 days', () => {
    const { dd } = buildTodoDocDefinition(demoCtx('en'), 'abc');
    expect(collectTexts(dd.content[1]).join('')).toContain('Horizon: 30 days');
  });
});

describe('todo PDF without anything to list', () => {
  test.each([
    ['en', 'Nothing scheduled.'],
    ['de', 'Kein Zeitplan vorhanden.'],
  ])('an empty plan answers with a message, not an error (%s)', (lang, text) => {
    expect(buildTodoDocDefinition(emptyCtx(lang))).toEqual({ empty: text });
  });

  test.each([
    ['en', 'No tasks within 30 days.'],
    ['de', 'Keine Aufgaben in 30 Tagen.'],
  ])('a plan whose work starts after the horizon says so (%s)', (lang, text) => {
    const data = {
      tree: [
        { id: 'A', name: 'Rechnungen', status: 'open' },
        { id: 'A.1', name: 'Export', status: 'open', best: 3, factor: 1, team: 'T1', assign: ['m1'] },
      ],
      members: [{ id: 'm1', name: 'Anna Noor', team: 'T1', cap: 1 }],
      teams: [{ id: 'T1', name: 'Frontend', color: '#2563eb' }],
      meta: { name: 'Kundenbereich', planStart: '2026-12-01' },
    };
    const ctx = ctxFromData(data, lang);
    expect(ctx.scheduled.length).toBeGreaterThan(0);
    expect(buildTodoDocDefinition(ctx)).toEqual({ empty: text });
  });
});
