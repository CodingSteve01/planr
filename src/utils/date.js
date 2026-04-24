// Parse a YYYY-MM-DD string as local midnight (not UTC midnight).
// new Date('2026-04-14') returns UTC midnight, which in CET is April 14 01:00 —
// one hour AHEAD of local midnight, causing off-by-one comparisons against local dates.
export const localDate = s => {
  if (!s) return new Date();
  if (s instanceof Date) return new Date(s);
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// Format a Date as YYYY-MM-DD using LOCAL date parts — not UTC.
// toISOString() returns the UTC date; in any non-UTC timezone that shifts the
// output by up to a day (e.g. midnight Europe/Berlin = 22:00 or 23:00 UTC the
// previous day), which caused holidays to render a day early in the Gantt.
export const iso = d => {
  const r = d instanceof Date ? d : new Date(d);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
};
export const addD = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
// Step `n` working days forward (positive) or backward (negative).
// Skips non-working days. `workDays` is an optional Set of day-of-week numbers
// (0=Sun…6=Sat); defaults to Mon–Fri if omitted.
const DEFAULT_WD_SET = new Set([1, 2, 3, 4, 5]);
export const addWorkDays = (d, n, workDays) => {
  const wd = workDays instanceof Set ? workDays : DEFAULT_WD_SET;
  const r = new Date(d);
  const step = n >= 0 ? 1 : -1;
  let added = 0;
  while (added < Math.abs(n)) {
    r.setDate(r.getDate() + step);
    if (wd.has(r.getDay())) added++;
  }
  return r;
};
export const monOf = d => { const r = new Date(d), w = r.getDay(); r.setDate(r.getDate() - (w === 0 ? 6 : w - 1)); return r; };
export const isoWeek = d => {
  const j4 = new Date(d.getFullYear(), 0, 4), sw = new Date(j4);
  sw.setDate(j4.getDate() - ((j4.getDay() + 6) % 7));
  return Math.round((monOf(d) - sw) / (7 * 864e5)) + 1;
};
// ISO week-year: the year that the Thursday of this week belongs to.
// Differs from getFullYear() around Jan 1 (e.g. 2026-01-01 is in KW1 of 2026,
// but 2025-12-29 is also in KW1 of 2026).
export const isoWeekYear = d => {
  const t = new Date(d);
  t.setDate(t.getDate() + 4 - ((t.getDay() + 6) % 7));
  return t.getFullYear();
};
export const fmtDate = s => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
export const diffDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

// Iterate every calendar day from fromIso to toIso (inclusive), yielding Date objects.
export function* eachDayInclusive(fromIso, toIso) {
  const s = localDate(fromIso);
  const e = localDate(toIso);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) yield new Date(d);
}

// Normalize a vacation entry to {person, from, to, note} regardless of whether
// it was stored in the old week-based format {person, week, note} or the new
// date-range format {person, from, to, note}.
// Backward compat: week → from=week, to=week+4 days (Mon–Fri).
export function normalizeVacation(v) {
  if (v.from && v.to) return { person: v.person, from: v.from, to: v.to, note: v.note || '' };
  const from = v.week || v.from || '';
  const to = from ? iso(addD(localDate(from), 4)) : '';
  return { person: v.person, from, to, note: v.note || '' };
}
