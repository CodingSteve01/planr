import { describe, test, expect } from 'vitest';
import { computeNRW, buildHMap, buildWeeks } from '../holidays.js';

describe('computeNRW()', () => {
  const map = buildHMap(computeNRW([2026]));

  test('2026 has the movable Easter-based days on the right dates', () => {
    expect(map['2026-04-03']).toBe('Karfreitag');
    expect(map['2026-04-05']).toBe('Ostersonntag');
    expect(map['2026-04-06']).toBe('Ostermontag');
    expect(map['2026-05-14']).toBe('Christi Himmelfahrt');
    expect(map['2026-05-24']).toBe('Pfingstsonntag');
    expect(map['2026-05-25']).toBe('Pfingstmontag');
    expect(map['2026-06-04']).toBe('Fronleichnam');
  });

  test('2026 has the fixed days', () => {
    expect(map['2026-01-01']).toBe('Neujahr');
    expect(map['2026-05-01']).toBe('Tag der Arbeit');
    expect(map['2026-10-03']).toBe('Tag der Deutschen Einheit');
    expect(map['2026-11-01']).toBe('Allerheiligen');
    expect(map['2026-12-25']).toBe('1. Weihnachtstag');
    expect(map['2026-12-26']).toBe('2. Weihnachtstag');
    expect(Object.keys(map)).toHaveLength(13);
  });

  test('every entry is flagged automatic', () => {
    expect(computeNRW([2026]).every(h => h.auto === true)).toBe(true);
  });

  test('the leap year 2028 has 13 distinct days, Leap Day is not a holiday', () => {
    const list = computeNRW([2028]);
    const dates = list.map(h => h.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toHaveLength(13);
    expect(dates).not.toContain('2028-02-29');
    // Easter 2028 is 16 April.
    expect(buildHMap(list)['2028-04-14']).toBe('Karfreitag');
    expect(buildHMap(list)['2028-06-15']).toBe('Fronleichnam');
  });

  test('several years are concatenated without cross-over', () => {
    const list = computeNRW([2026, 2028]);
    expect(list).toHaveLength(26);
    expect(list.filter(h => h.date.startsWith('2027'))).toEqual([]);
  });
});

describe('buildHMap()', () => {
  test('maps date to name, tolerates null', () => {
    expect(buildHMap([{ date: '2026-01-01', name: 'Neujahr' }])).toEqual({ '2026-01-01': 'Neujahr' });
    expect(buildHMap(null)).toEqual({});
  });
});

describe('buildWeeks()', () => {
  const hm = buildHMap(computeNRW([2026, 2027]));
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  test('the week over the year boundary is ISO week 53 and skips New Year', () => {
    const weeks = buildWeeks('2026-12-28', '2027-01-10', hm);
    expect(weeks.map(w => ymd(w.mon))).toEqual(['2026-12-28', '2027-01-04']);
    expect(weeks.map(w => w.kw)).toEqual([53, 1]);
    // Mon–Thu are working days, Fri 1 Jan is a holiday.
    expect(weeks[0].wds.map(ymd)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
    expect(weeks[0].hasH).toBe(true);
    expect(weeks[1].wds).toHaveLength(5);
    expect(weeks[1].hasH).toBe(false);
  });

  test('a plan starting mid-week keeps only the days inside the window', () => {
    const weeks = buildWeeks('2026-04-01', '2026-04-10', hm);
    expect(weeks[0].wds.map(ymd)).toEqual(['2026-04-01', '2026-04-02']);
    expect(weeks[1].wds.map(ymd)).toEqual(['2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10']);
    expect(weeks.every(w => w.hasH)).toBe(true);
  });

  test('custom work days (Mon–Thu) drop Friday', () => {
    const weeks = buildWeeks('2026-06-01', '2026-06-07', {}, [1, 2, 3, 4]);
    expect(weeks[0].wds).toHaveLength(4);
  });
});
