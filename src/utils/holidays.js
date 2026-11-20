import { iso, addD, monOf, isoWeek, localDate } from './date.js';

export function calcEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), dy = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, dy);
}

export function computeNRW(years) {
  const r = [];
  years.forEach(y => {
    const e = calcEaster(y);
    const a = (d, n) => r.push({ date: iso(d), name: n, auto: true });
    a(new Date(y, 0, 1), 'Neujahr'); a(addD(e, -2), 'Karfreitag'); a(e, 'Ostersonntag');
    a(addD(e, 1), 'Ostermontag'); a(new Date(y, 4, 1), 'Tag der Arbeit');
    a(addD(e, 39), 'Christi Himmelfahrt'); a(addD(e, 49), 'Pfingstsonntag');
    a(addD(e, 50), 'Pfingstmontag'); a(addD(e, 60), 'Fronleichnam');
    a(new Date(y, 9, 3), 'Tag der Deutschen Einheit'); a(new Date(y, 10, 1), 'Allerheiligen');
    a(new Date(y, 11, 25), '1. Weihnachtstag'); a(new Date(y, 11, 26), '2. Weihnachtstag');
  });
  return r;
}

export const buildHMap = arr => Object.fromEntries((arr || []).map(h => [h.date, h.name]));

// Default working days: Mon(1)–Fri(5). Configurable via meta.workDays.
const DEFAULT_WORK_DAYS = new Set([1, 2, 3, 4, 5]);

export function isWD(d, hm, workDays) {
  const wd = workDays || DEFAULT_WORK_DAYS;
  return wd.has(d.getDay()) && !hm[iso(d)];
}

export function buildWeeks(start, end, hm, workDaysArr) {
  const wd = workDaysArr ? new Set(workDaysArr) : DEFAULT_WORK_DAYS;
  const wks = [], ps = localDate(start), pe = localDate(end); let d = monOf(ps);
  while (d <= pe) {
    // Scan all 7 days of the week, collecting those that are configured as working days.
    const wds = [];
    for (let i = 0; i < 7; i++) {
      const x = addD(d, i);
      if (x >= ps && x <= pe && isWD(x, hm, wd)) wds.push(new Date(x));
    }
    const hasH = Object.keys(hm).some(k => { const hd = new Date(k); return hd >= d && hd < addD(d, 7) && wd.has(hd.getDay()); });
    // Keep weeks that have at least one working day (or sit inside the plan window for display).
    if (wds.length > 0 || (d >= ps && d <= pe)) wks.push({ mon: new Date(d), wds, hasH, kw: isoWeek(d) });
    d = addD(d, 7);
  }
  return wks;
}
