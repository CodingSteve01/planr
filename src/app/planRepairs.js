import { computeNRW } from '../utils/holidays.js';
import { teamForAssignment } from '../utils/memberTeams.js';
import { deriveParentStatuses, treeStats } from '../utils/scheduler.js';

// Auto holidays as a fresh computeNRW() dates them, or null when every one of
// them already matches.
export function migratedAutoHolidays(holidays, planStart, planEnd) {
  const ys = new Date(planStart).getFullYear(),
    ye = new Date(planEnd).getFullYear();
  const years = [];
  for (let y = ys; y <= ye; y++) years.push(y);
  const fresh = computeNRW(years);
  const freshByKey = new Map(fresh.map(h => [`${h.name}|${h.date.slice(0, 4)}`, h.date]));
  let changed = false;
  const migrated = holidays.map(h => {
    if (!h.auto) return h;
    const key = `${h.name}|${h.date.slice(0, 4)}`;
    const expected = freshByKey.get(key);
    if (expected && expected !== h.date) {
      changed = true;
      return { ...h, date: expected };
    }
    return h;
  });
  return changed ? migrated : null;
}

// Derive parent statuses and reconcile each task's team with its first
// assignee, in one pass over the document. Returns the same object when
// nothing had to change, so React skips the re-render.
export function withDerivedTeamsAndStatuses(d, members) {
  let t = d.tree || [];
  let changed = false;
  // 1. Reconcile teams with the first assignee, by the same rule the
  //    editors assign with (teamForAssignment): the task keeps its team
  //    when the person works in it, and otherwise takes the person's
  //    primary team. This said "the person's team always wins", which
  //    quietly relabelled a Frontend task as Backend the moment a
  //    full-stack member was put on it — undoing, one render later, the
  //    choice every editor had just made.
  if (members.length) {
    t = t.map(r => {
      if (!r.assign?.length) return r;
      const firstAssignee = members.find(m => m.id === r.assign[0]);
      if (!firstAssignee?.team) return r;
      const team = teamForAssignment(firstAssignee, r.team);
      if (r.team !== team) {
        changed = true;
        return { ...r, team };
      }
      return r;
    });
  }
  // 2. Derive parent statuses — must run on the (possibly team-fixed) tree
  // Only treeStats is needed here (for _autoStatus); enrichParentSchedules
  // is display-only and runs in the component's own memo.
  const st = treeStats(t);
  const t2 = deriveParentStatuses(t, st);
  if (t2.some((r, i) => r.status !== t[i].status)) {
    changed = true;
    t = t2;
  }
  if (!changed) return d; // no-op: same reference = React skips re-render
  return { ...d, tree: t };
}

// Trim weeks to the actual horizon when planEnd wasn't user-set:
// latest scheduled endD + padding. Falls back to a 6-month
// window when nothing is scheduled so the Gantt isn't empty.
export function trimmedToHorizon(out, paddingDays) {
  let latest = null;
  for (const s of out.results || []) {
    const endD = s.endD instanceof Date ? s.endD : s.endD ? new Date(s.endD) : null;
    if (endD && (!latest || endD > latest)) latest = endD;
  }
  const horizonEnd = latest
    ? new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + paddingDays)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1);
  const trimmedWeeks = (out.weeks || []).filter(w => w.mon <= horizonEnd);
  return { results: out.results, weeks: trimmedWeeks.length ? trimmedWeeks : out.weeks };
}
