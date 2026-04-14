export const iso = d => d.toISOString().split('T')[0];
export const addD = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
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
