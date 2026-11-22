/** @vitest-environment node */
// The "what comes when" PDF: one row per top-level topic, bucketed by end.
import { describe, expect, test, vi } from 'vitest';
import { buildWhatWhenDocDefinition } from '../whatWhenPdf.js';
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
  titleCount,
} from './pdfTestKit.js';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});

const HEADERS = {
  en: ['Projected End', 'ID', 'Topic', 'Teams', 'Progress', 'PT', 'Conf.'],
  de: ['Ende prognost.', 'ID', 'Thema', 'Teams', 'Fortschritt', 'PT', 'Conf.'],
};

// Top-level topics that have scheduled work.
const scheduledRoots = ctx =>
  ctx.tree.filter(r => !r.id.includes('.') && ctx.scheduled.some(s => s.id === r.id || s.id.startsWith(r.id + '.')));

const rows = dd => findTables(dd).flatMap(bodyRows);

describe.each(['en', 'de'])('what-when PDF (%s)', lang => {
  const ctx = demoCtx(lang);
  const { dd } = buildWhatWhenDocDefinition(ctx);
  const kind = lang === 'de' ? 'Was kommt wann' : 'What comes when';

  test('is an A4 landscape document titled after the plan', () => {
    expect(dd.pageSize).toBe('A4');
    expect(dd.pageOrientation).toBe('landscape');
    expect(dd.info.title).toBe(ctx.data.meta.name + ' — What comes when');
    expect(collectTexts(dd.content[0])).toEqual([ctx.data.meta.name]);
    expect(collectTexts(dd.content[1]).join('')).toContain(kind);
  });

  test('footer names the plan, the kind and the date', () => {
    const footer = collectTexts(dd.footer(1, 4)).join('|');
    expect(footer).toContain(ctx.data.meta.name + ' · ' + kind);
    expect(footer).toContain(lang === 'de' ? '15. Juni 2026' : 'June 15, 2026');
    expect(footer).toContain('1 / 4');
  });

  test('lists every topic with scheduled work exactly once, with its name', () => {
    const want = scheduledRoots(ctx);
    expect(want.length).toBeGreaterThan(2);
    const got = rows(dd).map(row => [cellText(row[1]), cellText(row[2])]);
    expect(got.map(g => g[0]).sort()).toEqual(want.map(r => r.id).sort());
    want.forEach(r => expect(got.find(g => g[0] === r.id)[1]).toContain(r.name));
  });

  test('every bucket title counts its topics', () => {
    findTables(dd).forEach(tb => {
      const { n, word } = titleCount(tb);
      expect(n).toBe(bodyRows(tb).length);
      expect(word).toBe(n === 1 ? (lang === 'de' ? 'Thema' : 'topic') : lang === 'de' ? 'Themen' : 'topics');
    });
  });

  test('shows progress as percent and done/total, and effort as a number', () => {
    rows(dd).forEach(row => {
      expect(cellText(row[4])).toMatch(/^\d+(\.\d)?% {2}· {2}\d+\/\d+$/);
      expect(cellText(row[5])).toMatch(/^\d+$/);
    });
  });

  test('confidence is written in the document language', () => {
    const words = lang === 'de' ? ['verbindlich', 'geschätzt', 'explorativ'] : ['committed', 'estimated', 'exploratory'];
    rows(dd).forEach(row => expect(words.some(w => cellText(row[6]).endsWith(w))).toBe(true));
  });

  test('a deadline topic shows its date', () => {
    const deadline = ctx.tree.find(r => r.type === 'deadline');
    const text = rows(dd)
      .map(row => cellText(row[2]))
      .find(s => s.includes(deadline.name));
    expect(text).toContain(`(${lang === 'de' ? 'Deadline' : 'deadline'}: ${deadline.date})`);
  });

  test('table header labels, widths and rows agree and fit the page', () => {
    findTables(dd).forEach(tb => {
      expect(headerLabels(tb)).toEqual(HEADERS[lang]);
      expect(tb.widths).toHaveLength(7);
      expect(tableProblems(tb, PRINTABLE.A4)).toEqual([]);
    });
  });

  test('prints no undefined, NaN, null or [object] anywhere', () => {
    expect(badTexts(dd)).toEqual([]);
  });
});

// `n` top-level topics with one task each, all for one person.
function topicsCtx(n, lang) {
  const tree = Array.from({ length: n }, (_, i) => [
    { id: 'P' + (i + 1), name: 'Rechnungen ' + (i + 1), status: 'open' },
    { id: `P${i + 1}.1`, name: 'Export', status: 'open', best: 3, factor: 1, team: 'T1', assign: ['m1'] },
  ]).flat();
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

describe('what-when PDF counts in singular for one', () => {
  test.each([
    ['en', 1, 'topic', 'topics'],
    ['en', 2, 'topic', 'topics'],
    ['de', 1, 'Thema', 'Themen'],
    ['de', 2, 'Thema', 'Themen'],
  ])('%s with %i topic(s): a bucket of one says "%s", more say "%s"', (lang, n, one, many) => {
    const { dd } = buildWhatWhenDocDefinition(topicsCtx(n, lang));
    const titles = findTables(dd).map(titleCount);
    expect(titles.reduce((sum, x) => sum + x.n, 0)).toBe(n);
    titles.forEach(x => expect(x.word).toBe(x.n === 1 ? one : many));
  });
});

describe('what-when PDF without anything scheduled', () => {
  test.each([
    ['en', 'Nothing scheduled.'],
    ['de', 'Kein Zeitplan vorhanden.'],
  ])('an empty plan answers with a message, not an error (%s)', (lang, text) => {
    expect(buildWhatWhenDocDefinition(emptyCtx(lang))).toEqual({ empty: text });
  });
});
