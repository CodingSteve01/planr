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
export const fmtDate = s => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
export const diffDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
