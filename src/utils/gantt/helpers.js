// Constants and pure helpers of the Gantt view (components/views/GanttView.jsx).
// Nothing here reads component state: inputs in, value out.

export const NO_TEAM = '__no_team__';
export const NO_TEAM_COLOR = '#64748b';
export const NO_PERSON = '__no_person__';
export const EMPTY_ARR = [];
export const DAY_ZOOM = 98;
export const MONTH_ZOOM = 9;

export function normalizeViewMode(mode) {
  if (mode === 'person') return 'resource';
  if (mode === 'projteam') return 'team';
  return mode || 'project';
}

export function fmtLoadDays(value) {
  return `${(Math.round((Number(value) || 0) * 10) / 10).toFixed(1).replace(/\.0$/, '')}d`;
}

export const personIdsOf = s => {
  const ids = new Set();
  if (s.personId) ids.add(s.personId);
  (s.assign || []).forEach(a => ids.add(a));
  return [...ids];
};
export const typeColorOf = node =>
  node?.type === 'deadline' ? 'var(--re)' : node?.type === 'painpoint' ? 'var(--am)' : node?.type === 'goal' ? 'var(--ac)' : 'var(--ac2)';

export const loadHeatColor = (percent, meta = null) => {
  if (meta?.historicalOnly) return 'rgba(148,163,184,.12)';
  if (!Number.isFinite(percent) || percent <= 0) return 'rgba(148,163,184,.08)';
  if (percent < 50) return 'rgba(59,130,246,.18)';
  if (percent < 90) return 'rgba(16,185,129,.20)';
  if (percent <= 110) return 'rgba(245,158,11,.26)';
  return 'rgba(239,68,68,.34)';
};
// Load, as one line of colour. Four bands and nothing in between, because
// the question is "is this week free, full, or over", not "what exactly is
// the percentage" — the figure is one hover away. Palette tokens rather
// than the old hardcoded Tailwind rgbas, so it holds in both themes.
export const loadHeatStroke = (percent, meta = null) => {
  if (meta?.historicalOnly) return 'var(--b3)';
  if (!Number.isFinite(percent) || percent <= 0) return 'var(--b2)';
  if (percent < 50) return 'color-mix(in srgb, var(--ac) 55%, transparent)';
  if (percent < 90) return 'var(--st-done)';
  if (percent <= 110) return 'var(--st-wip)';
  return 'var(--st-risk)';
};

export const rowDrawsBar = row => {
  if (row?.type !== 'task' || !row.s) return false;
  if (row.s._unestimated) return false;
  if (row.s._completed && (!row.s.startD || !row.s.endD)) return false;
  return true;
};
