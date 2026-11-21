// ── formatting ──────────────────────────────────────────────────────────────

// A shift in calendar days as text. Days while a week still reads as days,
// weeks beyond that: "+38 d" makes you divide, "+5 wk" does not. Shared with
// the views that mark what a scenario moves.
export function formatShift(t, n) {
  if (n == null) return '—';
  if (!n) return '±0';
  const sign = n > 0 ? '+' : '−';
  const abs = Math.abs(n);
  return abs <= 20 ? t('scn.days', `${sign}${abs}`) : t('scn.weeks', `${sign}${Math.round(abs / 7)}`);
}

export const changeCountLabel = (t, n) => (!n ? t('scn.noChanges') : n === 1 ? t('scn.oneChange') : t('scn.nChanges', n));
const conflictLabel = (t, n) => (n === 1 ? t('scn.oneConflict') : t('scn.conflicts', n));

// How many things a stored patch touches, without applying it. Only the
// fallback for scenarios saved before the count was kept on the entry.
export function patchSize(patch) {
  if (!patch) return 0;
  let n = 0;
  for (const key of ['tree', 'members', 'teams']) {
    const d = patch[key];
    if (!d) continue;
    const ids = new Set([...(d.add || []).map(e => e.id), ...(d.del || []), ...Object.keys(d.set || {}), ...Object.keys(d.unset || {})]);
    n += ids.size;
  }
  for (const key of ['vacations', 'holidays']) n += (patch[key]?.add?.length || 0) + (patch[key]?.del?.length || 0);
  n += Object.keys(patch.queues?.set || {}).length + (patch.queues?.del?.length || 0);
  n += Object.keys(patch.meta?.set || {}).length + (patch.meta?.del?.length || 0);
  n += Object.keys(patch.top || {}).length + (patch.topDel?.length || 0);
  return n;
}
const storedCount = s => (Number.isFinite(s.changes) ? s.changes : patchSize(s.patch));
export { conflictLabel, storedCount };
