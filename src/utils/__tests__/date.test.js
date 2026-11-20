import { describe, test, expect } from 'vitest';
import { iso, localDate, addD, addWorkDays, isoWeek, monOf, diffDays } from '../date.js';

describe('iso', () => {
  test('uses local date parts (no UTC shift)', () => {
    const d = new Date(2026, 3, 23, 23, 59); // Apr 23 CET
    expect(iso(d)).toBe('2026-04-23');
  });
  test('zero-pads month and day', () => {
    expect(iso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('localDate', () => {
  test('parses YYYY-MM-DD as local midnight', () => {
    const d = localDate('2026-04-23');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(0);
  });
  test('null/empty → now', () => {
    const a = localDate('');
    const b = new Date();
    expect(a.getFullYear()).toBe(b.getFullYear());
  });
});

describe('addD', () => {
  test('adds calendar days', () => {
    expect(iso(addD(localDate('2026-04-23'), 3))).toBe('2026-04-26');
  });
  test('negative', () => {
    expect(iso(addD(localDate('2026-04-23'), -5))).toBe('2026-04-18');
  });
});

describe('addWorkDays (Mon-Fri default)', () => {
  test('skips weekend', () => {
    // Friday + 1 workday → next Monday
    expect(iso(addWorkDays(localDate('2026-04-24'), 1))).toBe('2026-04-27');
  });
  test('0 workdays → same date', () => {
    expect(iso(addWorkDays(localDate('2026-04-23'), 0))).toBe('2026-04-23');
  });
  test('5 workdays spans weekend', () => {
    // Monday + 5 workdays → following Monday
    expect(iso(addWorkDays(localDate('2026-04-20'), 5))).toBe('2026-04-27');
  });
  test('negative', () => {
    // Monday - 1 workday → previous Friday
    expect(iso(addWorkDays(localDate('2026-04-27'), -1))).toBe('2026-04-24');
  });
});

describe('isoWeek', () => {
  test('Mid-year week', () => {
    expect(isoWeek(localDate('2026-04-23'))).toBe(17);
  });
  test('First Monday of year', () => {
    expect(isoWeek(localDate('2026-01-05'))).toBe(2);
  });
  test('Year-boundary: Jan 1 2026 (Thu) is W1', () => {
    expect(isoWeek(localDate('2026-01-01'))).toBe(1);
  });
});

describe('monOf', () => {
  test('Friday → previous Monday', () => {
    expect(iso(monOf(localDate('2026-04-24')))).toBe('2026-04-20');
  });
  test('Sunday → previous Monday', () => {
    expect(iso(monOf(localDate('2026-04-26')))).toBe('2026-04-20');
  });
  test('Monday → itself', () => {
    expect(iso(monOf(localDate('2026-04-20')))).toBe('2026-04-20');
  });
});

describe('diffDays', () => {
  test('simple', () => {
    expect(diffDays('2026-04-20', '2026-04-23')).toBe(3);
  });
});
