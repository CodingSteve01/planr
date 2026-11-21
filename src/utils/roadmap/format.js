import { ROUTE_T_LO, ROUTE_T_HI } from './board.js';

const DAY = 864e5;
const MIN_VISIBLE_PROGRESS_DELTA = 0.00005; // 0.005 percentage points = 0.05 permille
// ─── Helpers (preserved from original) ───────────────────────────────────────
const parentId = id => id.split('.').slice(0, -1).join('.');
const depthOf = id => id.split('.').length;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const progressToRouteT = progress => ROUTE_T_LO + clamp(progress || 0, 0, 1) * (ROUTE_T_HI - ROUTE_T_LO);
const truncate = (text, len) => (!text ? '' : text.length > len ? `${text.slice(0, len - 1)}...` : text);

function trim1(value) {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

function trim2(value) {
  return (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

function formatPercentNumber(progress) {
  return trim1(clamp(progress || 0, 0, 1) * 100);
}

function contrastText(color) {
  if (!color?.startsWith('#')) return '#fff';
  let hex = color.slice(1);
  if (hex.length === 3)
    hex = hex
      .split('')
      .map(ch => ch + ch)
      .join('');
  if (hex.length !== 6) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.56 ? '#111318' : '#fff';
}

function formatProgressDelta(deltaProgress) {
  const delta = Number(deltaProgress) || 0;
  if (Math.abs(delta) < MIN_VISIBLE_PROGRESS_DELTA) return '0%';
  const sign = delta > 0 ? '+' : '-';
  const absPct = Math.abs(delta) * 100;
  if (absPct >= 0.1) return `${sign}${trim1(absPct)}%`;
  return `${sign}${trim2(absPct)}%`;
}

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(+date)) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function compareByTime(a, b) {
  const ad = a.anchorDate ? +a.anchorDate : Infinity;
  const bd = b.anchorDate ? +b.anchorDate : Infinity;
  if (ad !== bd) return ad - bd;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}
/**
 * Simple string hash → integer (djb2-style).
 * Used to create stable route assignment based on root ID.
 */
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

export {
  DAY,
  MIN_VISIBLE_PROGRESS_DELTA,
  parentId,
  depthOf,
  clamp,
  progressToRouteT,
  truncate,
  formatPercentNumber,
  contrastText,
  formatProgressDelta,
  esc,
  toDate,
  addDays,
  compareByTime,
  hashStr,
};
