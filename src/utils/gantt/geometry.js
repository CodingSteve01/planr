// Geometry of the Gantt time axis: where a date sits in pixels, which week it falls in,
// how the month and week headers read. Inputs in, value out.

import { MDE } from '../../constants.js';
import { addD, localDate } from '../date.js';
import { fixedDurationDays } from '../scheduler.js';

// Everything here reads only `weeks` and `WPX` (pixels per week).
export function createGeometry({ weeks, WPX }) {
  const DPX = WPX / 7;
  function dateToX(date) {
    if (!date) return 0;
    const d = date instanceof Date ? date : new Date(date);
    if (!weeks.length) return 0;
    if (d < weeks[0].mon) return 0;
    let wi = -1;
    for (let i = 0; i < weeks.length; i++) {
      if (d < addD(weeks[i].mon, 7)) {
        wi = i;
        break;
      }
    }
    if (wi < 0) return weeks.length * WPX;
    const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayInWeek = dow === 0 ? 6 : dow - 1; // Mon=0 ... Sun=6
    return wi * WPX + dayInWeek * DPX;
  }
  function weekIndexOfDate(date) {
    if (!date || !weeks.length) return -1;
    const d = date instanceof Date ? date : localDate(date);
    const wi = weeks.findIndex(w => d < addD(w.mon, 7));
    return wi >= 0 ? wi : weeks.length - 1;
  }
  function scheduledWorkDaysOf(s) {
    const fixed = fixedDurationDays(s);
    if (fixed) return fixed;
    if (s?.workingDaysInWindow > 0) return Math.max(1, Math.ceil(s.workingDaysInWindow));
    if (s?.startD && s?.endD) {
      const start = s.startD instanceof Date ? s.startD : localDate(s.startD);
      const end = s.endD instanceof Date ? s.endD : localDate(s.endD);
      const count = weeks.reduce((sum, w) => sum + (w.wds || []).filter(d => d >= start && d <= end).length, 0);
      if (count > 0) return count;
    }
    if (s?.startWi >= 0 && s?.endWi >= s.startWi) return Math.max(1, (s.endWi - s.startWi + 1) * 5);
    return 1;
  }
  return { DPX, dateToX, weekIndexOfDate, scheduledWorkDaysOf };
}

export function buildMonths(weeks) {
  const ms = [];
  let cm = null,
    cc = 0,
    cs = 0;
  weeks.forEach((w, i) => {
    const ym = `${w.mon.getFullYear()}-${w.mon.getMonth()}`;
    if (ym !== cm) {
      if (cm) ms.push({ ym: cm, count: cc, start: cs });
      cm = ym;
      cc = 1;
      cs = i;
    } else cc++;
  });
  if (cm) ms.push({ ym: cm, count: cc, start: cs });
  return ms;
}

export function monthHeaderLabel(m, { WPX, zoomMode }) {
  const [yearRaw, monthRaw] = m.ym.split('-');
  const year = String(yearRaw);
  const shortYear = year.slice(-2);
  const month = +monthRaw;
  const width = WPX * m.count;
  const name = MDE[month] || '';
  const shortName = name.slice(0, 3);
  const isJanuary = month === 0;
  if (zoomMode === 'month') {
    if (width < 30) return isJanuary ? shortYear : '';
    if (width < 44) return isJanuary ? shortYear : shortName;
    return isJanuary ? `${shortName} ${shortYear}` : shortName;
  }
  if (width < 42) return isJanuary ? `'${year.slice(2)}` : '';
  if (width < 58) return isJanuary ? shortYear : shortName;
  return `${name} '${year.slice(2)}`;
}

export function weekHeaderLabel(w, i, isYB, isNow, { WPX }) {
  if (isNow) return w.kw;
  const shortYear = String(w.mon.getFullYear()).slice(-2);
  if (WPX < 14) return isYB ? shortYear : '';
  if (WPX < 18) return isYB ? shortYear : i % 2 === 0 ? w.kw : '';
  if (WPX < 24) return isYB ? shortYear : i % 2 === 0 ? w.kw : '';
  return w.kw;
}
