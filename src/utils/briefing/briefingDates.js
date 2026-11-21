import { localDate, diffDays } from '../date.js';

export function fmtDateDE(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : localDate(d);
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function fmtDateFull(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : localDate(d);
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' });
}

export function weeksBetween(a, b) {
  const days = Math.abs(diffDays(a, b));
  return Math.round(days / 7);
}
