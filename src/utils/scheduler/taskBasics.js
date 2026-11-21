import { inTeam } from '../memberTeams.js';
import { phaseProgress } from '../phases.js';

export const pt = t => {
  if (!t) return '';
  const m = t.match(/[A-Z][A-Z0-9]*/g);
  return m ? m[0] : t;
};
// Team pool membership. A member in several teams (`member.teams`) is a regular
// candidate in every one of those pools. Capacity is not split between them:
// all pools read the same per-person cursor (`pF`), so whatever one team books
// is gone for the other.
export const inTeamPt = (m, team) => inTeam(m, team, pt);
// Realistic effort: best × factor (no hidden caps — user's factor is respected)
export const re = (best, factor) => (best && best > 0 ? best * (factor || 1.5) : 0);
export const fixedDurationDays = task => {
  const n = Number(task?.fixedDurationDays);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.ceil(n)) : 0;
};
export const scheduleEffort = task => fixedDurationDays(task) || re(task?.best || 0, task?.factor || 1.5);
export const parentId = id => id.split('.').slice(0, -1).join('.');

// Derive task status + progress from its phases array.
// Returns null if no phases exist (caller keeps manual status).
export function derivePhaseStatus(phases) {
  if (!phases?.length) return null;
  const done = phases.filter(p => p.status === 'done').length;
  const wip = phases.filter(p => p.status === 'wip').length;
  if (done === phases.length) return { status: 'done', progress: 100 };
  if (done > 0 || wip > 0) return { status: 'wip', progress: phaseProgress(phases) };
  return { status: 'open', progress: 0 };
}
