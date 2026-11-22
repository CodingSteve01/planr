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
  tinyPlanCtx,
  titleCount,
} from './pdfTestKit.js';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});

const HEADERS = {
  en: ['Start', 'End', 'ID', 'Task', 'Team', 'Effort', 'Status', 'Conf.'],
  de: ['Start', 'Ende', 'ID', 'Task', 'Team', 'Aufw.', 'Status', 'Conf.'],
};

// Four tasks around the 30 day horizon that ends 2026-07-15 (today is 2026-06-15).
const EDGE_CASES = [
  { id: 'T1', status: 'open', startD: new Date('2026-07-15T12:00:00'), listed: true }, // exactly on the horizon end
  { id: 'T2', status: 'done', startD: new Date('2026-06-16T12:00:00'), listed: false }, // done
  { id: 'T3', status: 'open', startD: new Date('2026-07-16T12:00:00'), listed: false }, // the day after
  { id: 'T4', status: 'wip', startD: new Date('2026-06-20T12:00:00'), listed: true }, // in progress
];

// A plan whose scheduled tasks are the edge cases above.
function edgeCaseCtx(lang) {
  const base = tinyPlanCtx(EDGE_CASES.length, lang);
  const scheduled = base.scheduled.map(s => {
    const { startD, status } = EDGE_CASES.find(e => e.id === s.id);
    return { ...s, status, startD, endD: new Date(startD.getTime() + 2 * 86400000) };
  });
  return { ...base, scheduled };
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

  test('lists every task once, in lanes that state their task count', () => {
    const ids = listedIds(dd);
    expect(ids.length).toBeGreaterThan(3);
    expect(new Set(ids).size).toBe(ids.length);
    const tables = findTables(dd);
    tables.forEach(tb => expect(titleCount(tb).n).toBe(bodyRows(tb).length));
    expect(new Set(tables.map(tb => cellText(tb.body[0][0]))).size).toBe(tables.length);
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
    expect(sub).toContain(listedIds(dd).length + (lang === 'de' ? ' Tasks' : ' tasks'));
    expect(sub).toContain(lang === 'de' ? 'Horizont: 30 Tage' : 'Horizon: 30 days');
  });

  test('prints no undefined, NaN, null or [object] anywhere', () => {
    expect(badTexts(dd)).toEqual([]);
  });
});

describe.each(['en', 'de'])('todo PDF horizon edge cases (%s)', lang => {
  const { dd } = buildTodoDocDefinition(edgeCaseCtx(lang));

  test.each(EDGE_CASES)('task $id (status $status) is listed: $listed', ({ id, listed }) => {
    expect(listedIds(dd).includes(id)).toBe(listed);
  });
});

describe('todo PDF counts in singular for one', () => {
  test.each([
    ['en', 1, '1 task,', '1 lane', 'task'],
    ['en', 2, '2 tasks,', '1 lane', 'tasks'],
    ['de', 1, '1 Task,', '1 Lane', 'Aufgabe'],
    ['de', 2, '2 Tasks,', '1 Lane', 'Aufgaben'],
  ])('%s with %i task(s): "%s", "%s", lane title noun "%s"', (lang, n, tasks, lanes, noun) => {
    const { dd } = buildTodoDocDefinition(tinyPlanCtx(n, lang));
    expect(collectTexts(dd.content[1]).join('')).toMatch(new RegExp(' ' + tasks + ' ' + lanes + '$'));
    expect(findTables(dd).map(titleCount)).toEqual([{ n, word: noun }]);
  });
});

describe('todo PDF horizon', () => {
  test('a longer horizon lists more tasks and says so in the footer', () => {
    const ctx = demoCtx('en');
    const { dd } = buildTodoDocDefinition(ctx, 90);
    const short = listedIds(buildTodoDocDefinition(ctx).dd);
    expect(listedIds(dd).length).toBeGreaterThan(short.length);
    short.forEach(id => expect(listedIds(dd)).toContain(id));
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
