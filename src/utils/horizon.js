// Horizon-aware date formatting. Combines distance-from-today with planning
// confidence — the fuzzier of the two wins, so uncertain or far-out work
// isn't pinned down to a precision that doesn't exist.
//
// Granularity ladder (most precise → coarsest):
//   d (day)   → ISO date "2026-04-25"
//   w (week)  → "KW 17, Apr 2026"
//   m (month) → "April 2026"
//   q (quart) → "Q2 2026"
//
// Use this everywhere a scheduled date is shown OUTSIDE the item-detail
// context. The exception list — where exact dates remain visible — is
// deliberately small: the Item-Dialog (NodeModal / QuickEdit / TaskInsights),
// the Work-Tree schedule column, and the Gantt chart and its tooltip. Those
// surfaces are the ones the user uses to make planning decisions, so they
// keep ISO precision regardless of confidence.

import { iso, isoWeek } from './date.js';

// Planning-horizon filter: takes a localStorage-style value ("", "7", "14",
// "30", or "YYYY-MM-DD") and returns a Date for "show everything up to this
// day inclusive" or null when no horizon is set. Shared by the global
// HorizonPicker so every view interprets the same value the same way.
export function parseHorizonValue(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(val + 'T23:59:59');
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(23, 59, 59, 999); return d;
}

// Compute the set of scheduled-leaf ids whose work falls within
// [now, horizonEnd]. A task is "in horizon" when:
//   - its scheduled start is on or before horizonEnd AND
//   - it isn't already finished (endD >= now) OR it has no schedule but is
//     still open/in-progress (e.g. unscheduled deadlines or pinned items)
// Done tasks drop out so the filter narrows attention to active future
// work, not the rear-view mirror.
export function horizonScopedIds({ tree, scheduled, horizonEnd, now = new Date() }) {
  if (!horizonEnd) return null;
  const ids = new Set();
  const schedById = new Map((scheduled || []).map(s => [s.id, s]));
  for (const r of tree || []) {
    const s = schedById.get(r.id);
    if (s && s.startD) {
      const startD = s.startD instanceof Date ? s.startD : new Date(s.startD);
      const endD = s.endD instanceof Date ? s.endD : (s.endD ? new Date(s.endD) : startD);
      if (startD <= horizonEnd && endD >= now && r.status !== 'done') {
        ids.add(r.id);
      }
      continue;
    }
    // Fallback: use the task's own pinnedStart/decideBy/date if no schedule
    // exists yet (covers unestimated decision items the planner still tracks).
    const own = r.pinnedStart || r.decideBy || r.date;
    if (own) {
      const d = new Date(own);
      if (d <= horizonEnd && r.status !== 'done') ids.add(r.id);
    }
  }
  return ids;
}

function granularity(distanceDays, confidence) {
  const conf = confidence || 'committed';
  if (conf === 'exploratory' || distanceDays > 180) return 'q';
  if (conf === 'estimated' || distanceDays > 60) return 'm';
  if (distanceDays > 14) return 'w';
  return 'd';
}

// Single-date label. For grouped/bucketed views use horizonBucket() instead.
export function horizonLabel(date, confidence, de = false, now = new Date()) {
  if (!date) return de ? 'später' : 'later';
  const d = date instanceof Date ? date : new Date(date);
  const days = Math.round((d - now) / 86400000);
  const gran = granularity(days, confidence);
  if (gran === 'd') return iso(d);
  if (gran === 'w') {
    const mon = d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short', year: 'numeric' });
    return (de ? 'KW ' : 'Week ') + isoWeek(d) + ', ' + mon;
  }
  if (gran === 'm') return d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' });
  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
}

// Bucket descriptor for grouped views (e.g. "Q2 2026", "Mai 2026", "KW 17").
// Returns { key, label, order } so callers can group + sort consistently.
// Note: bucketing collapses the d-granularity rung into w (a single day
// rarely makes sense as its own group) but keeps the rest aligned with
// horizonLabel.
export function horizonBucket(date, confidence, de = false, now = new Date()) {
  if (!date) return { key: 'zzz_later', label: de ? 'Später / TBD' : 'Later / TBD', order: 99999 };
  const d = date instanceof Date ? date : new Date(date);
  const days = Math.round((d - now) / 86400000);
  const conf = confidence || 'committed';
  let gran;
  if (conf === 'exploratory' || days > 180) gran = 'q';
  else if (conf === 'estimated' || days > 60) gran = 'm';
  else if (days > 28) gran = 'm';
  else gran = 'w';
  if (gran === 'w') {
    const w = isoWeek(d), y = d.getFullYear();
    return { key: y + '-w' + String(w).padStart(2, '0'), label: (de ? 'KW ' : 'Week ') + w + ' · ' + d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short', year: 'numeric' }), order: y * 100 + w };
  }
  if (gran === 'm') {
    const m = d.getMonth(), y = d.getFullYear();
    return { key: y + '-m' + String(m + 1).padStart(2, '0'), label: d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' }), order: y * 100 + m + 50 };
  }
  const q = Math.floor(d.getMonth() / 3) + 1, y = d.getFullYear();
  return { key: y + '-q' + q, label: 'Q' + q + ' ' + y, order: y * 100 + q * 3 + 80 };
}
