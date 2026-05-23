import { addD, iso, localDate } from './date.js';

function validDate(value) {
  if (!value) return null;
  const date = localDate(value);
  return Number.isNaN(+date) ? null : date;
}

export function inferGanttViewStart(tree = [], planStart = '', metaViewStart = '', paddingDays = 14) {
  const base = metaViewStart && (!planStart || metaViewStart < planStart)
    ? metaViewStart
    : planStart;

  let earliest = null;
  for (const node of tree || []) {
    const candidates = [
      node.completedStart,
      node.plannedStart,
      node.pinnedStart,
      node.status === 'done' ? node.completedEnd : '',
      node.status === 'done' ? node.completedAt : '',
    ];
    for (const candidate of candidates) {
      const date = validDate(candidate);
      if (date && (!earliest || date < earliest)) earliest = date;
    }
  }

  if (!earliest) return base;
  const padded = iso(addD(earliest, -Math.max(0, paddingDays)));
  if (!base) return padded;
  return padded < base ? padded : base;
}
