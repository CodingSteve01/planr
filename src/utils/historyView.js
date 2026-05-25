export function effectiveDateOfEvent(ev) {
  if (!ev) return '';
  return ev.completedAt || ev.effectiveAt || (ev.ts ? String(ev.ts).slice(0, 10) : '');
}

export function recordedDateTimeLocal(ev) {
  if (!ev?.ts) return '';
  const d = new Date(ev.ts);
  if (Number.isNaN(+d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTimeLocalToIso(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(+d) ? '' : d.toISOString();
}

export function sortEventsByEffectiveDate(events = []) {
  return [...events].sort((a, b) => {
    const ad = effectiveDateOfEvent(a);
    const bd = effectiveDateOfEvent(b);
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a?.ts || '';
    const bt = b?.ts || '';
    if (at !== bt) return at.localeCompare(bt);
    return (a?.id || '').localeCompare(b?.id || '', undefined, { numeric: true });
  });
}

export function patchEventEffectiveDate(ev, date) {
  if (!ev) return ev;
  if (!date) {
    const { effectiveAt, completedAt, ...rest } = ev;
    return rest;
  }
  if (ev.completedAt != null || ev.status === 'done') return { ...ev, completedAt: date };
  return { ...ev, effectiveAt: date };
}

export function describeEvent(ev) {
  if (!ev) return '';
  if (ev.kind === 'removed') return 'removed';
  if (ev.kind === 'added') return `added · ${ev.status || 'open'} · ${ev.progress ?? 0}%`;
  const parts = [];
  if (ev.status) parts.push(ev.status);
  if (ev.progress != null) parts.push(`${ev.progress}%`);
  if (ev.completedAt) parts.push(`done ${ev.completedAt}`);
  if (ev.effectiveAt && !ev.completedAt) parts.push(`effective ${ev.effectiveAt}`);
  return parts.join(' · ') || 'event';
}
