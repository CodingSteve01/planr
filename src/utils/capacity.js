// Derive a member's scheduling capacity (0..1 of FTE) from a transparent
// hours/week budget minus recurring meetings. Legacy members keep the raw
// `cap` number; anyone with `capMode: 'derived'` + `weeklyHours`/`meetings`
// gets an auditable computed value.
//
// FTE baseline is fixed at 40 h/week so cap% matches the convention "100 % =
// one full-time person". A 30h part-time member with 4h of meetings ends up
// at 26/40 = 65 % — matches what a project manager would eyeball.

export const FTE_HOURS = 40;

// Weekly-equivalent multipliers. Daily meetings assume a 5-day work week; the
// scheduler already excludes weekends from capacity, so 5× is correct.
const FREQ_MULT = { daily: 5, weekly: 1, biweekly: 0.5, monthly: 12 / 52 };

export function meetingWeeklyHours(meeting) {
  if (!meeting || !meeting.hours) return 0;
  const mult = FREQ_MULT[meeting.frequency || 'weekly'] ?? 1;
  return Math.max(0, meeting.hours * mult);
}

export function sumMeetingHours(meetings) {
  if (!Array.isArray(meetings)) return 0;
  return meetings.reduce((s, m) => s + meetingWeeklyHours(m), 0);
}

// Collect the full set of meetings that apply to a member, in order:
//   1. Team-level plans (team.meetingPlanIds) — inherited by every team member
//   2. Member-level plans (member.meetingPlanIds) — additional individual plans
//   3. Member.meetings — one-off individual meetings
// Each plan meeting carries `_plan` / `_planName` for the UI breakdown.
//
// Pass `ctx = { plans, teams }` (both optional). Accepts also the legacy
// single-argument form `resolveMemberMeetings(member, allPlans)` so older
// call-sites keep working.
export function resolveMemberMeetings(member, ctxOrPlans) {
  if (!member) return [];
  const ctx = Array.isArray(ctxOrPlans) ? { plans: ctxOrPlans, teams: [] } : (ctxOrPlans || {});
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const teams = Array.isArray(ctx.teams) ? ctx.teams : [];
  const planById = Object.fromEntries(plans.map(p => [p.id, p]));
  const emitPlan = (pid, out, via) => {
    const plan = planById[pid];
    if (!plan || !Array.isArray(plan.meetings)) return;
    plan.meetings.forEach(m => out.push({ ...m, _plan: plan.id, _planName: plan.name, _planSource: via }));
  };
  const out = [];
  // Team-inherited plans
  const team = member.team ? teams.find(t => t.id === member.team) : null;
  (team?.meetingPlanIds || []).forEach(pid => emitPlan(pid, out, 'team'));
  // Member-attached plans
  (member.meetingPlanIds || []).forEach(pid => emitPlan(pid, out, 'member'));
  // Individual ad-hoc meetings
  (Array.isArray(member.meetings) ? member.meetings : []).forEach(m => out.push(m));
  return out;
}

// Baseline hours: derived-mode → weeklyHours (default 40); manual-mode →
// cap × 40 so a part-time member with cap=0.5 starts from 20h. Meetings
// (team plans + member plans + individual) reduce that baseline regardless
// of capMode — team-inherited plans always count, matching the user's
// expectation that "Team-Plans gelten egal auf was die Ressource steht".
export function deriveCap(member, ctxOrPlans) {
  if (!member) return 1;
  const wh = member.capMode === 'derived'
    ? (typeof member.weeklyHours === 'number' && member.weeklyHours >= 0 ? member.weeklyHours : FTE_HOURS)
    : (typeof member.cap === 'number' ? Math.max(0, member.cap) * FTE_HOURS : FTE_HOURS);
  const allMeetings = resolveMemberMeetings(member, ctxOrPlans);
  const meetingHours = sumMeetingHours(allMeetings);
  const avail = Math.max(0, wh - meetingHours);
  return avail / FTE_HOURS;
}

// Human-readable breakdown for tooltips / insights.
export function capBreakdown(member, ctxOrPlans) {
  if (!member || member.capMode !== 'derived') {
    const pct = Math.round((member?.cap ?? 1) * 100);
    return [{ kind: 'manual', text: `Manual: ${pct} %` }];
  }
  const wh = typeof member.weeklyHours === 'number' ? member.weeklyHours : FTE_HOURS;
  const lines = [{ kind: 'base', text: `${wh} h / Woche` }];
  const all = resolveMemberMeetings(member, ctxOrPlans);
  for (const m of all) {
    const weeklyH = meetingWeeklyHours(m);
    if (weeklyH <= 0) continue;
    const src = m._planName ? ` [Plan: ${m._planName}${m._planSource === 'team' ? ' · via Team' : ''}]` : '';
    const freqLabel = m.frequency && m.frequency !== 'weekly' ? ` (${m.frequency})` : '';
    lines.push({ kind: 'meeting', text: `− ${weeklyH.toFixed(2)} h  ${m.name || 'Meeting'}${freqLabel}${src}` });
  }
  const avail = Math.max(0, wh - sumMeetingHours(all));
  const pct = Math.round(avail / FTE_HOURS * 100);
  lines.push({ kind: 'result', text: `= ${avail.toFixed(2)} h  →  ${pct} % FTE` });
  return lines;
}

