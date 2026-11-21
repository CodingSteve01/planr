import { normalizeVacation } from '../date.js';
import { buildMemberShortMap } from '../memberShort.js';

// Closing fix-up 2: names in the file → ids (assignees, handoff, vacations,
// meeting plans). Returns the vacations in their final shape and who a short
// name means, for the work-order block.
export function resolveReferences(state, teamsArr, teamLookup) {
  const { tree, mems, vacationsArr, parsedMeetingPlans, explicitTeams } = state;
  // Resolve assignee references — try short name from MD first, then full name match,
  // finally computed initials match (for back-compat with files written by older builds)
  const computedShorts = buildMemberShortMap(mems);
  const resolveMember = token => {
    // 1. Match by short name parsed from MD (`SL`)
    const byParsedShort = mems.find(m => m._parsedShort === token);
    if (byParsedShort) return byParsedShort.id;
    // 2. Match by full name (back-compat with old MDs)
    const byName = mems.find(m => m.name === token);
    if (byName) return byName.id;
    // 3. Match by computed initials (back-compat without explicit short)
    const byComputed = mems.find(m => computedShorts[m.id] === token);
    if (byComputed) return byComputed.id;
    return token; // unresolved — keep as-is
  };
  tree.forEach(r => {
    if (r.assign?.length) r.assign = r.assign.map(resolveMember);
    if (r.phases?.length) {
      r.phases.forEach(phase => {
        if (phase.assign?.length) phase.assign = phase.assign.map(resolveMember);
      });
    }
    // Resolve handoff plan stages: short-codes → member IDs, team name → team ID.
    if (Array.isArray(r.handoffPlan)) {
      r.handoffPlan = r.handoffPlan.map(stage => {
        const shorts = stage._parsedShorts || [];
        const teamName = stage._parsedTeam || '';
        const out = {};
        if (shorts.length) out.assign = shorts.map(resolveMember);
        if (teamName) out.team = teamLookup[teamName] || teamName;
        return out;
      });
    }
  });
  vacationsArr.forEach(v => {
    v.person = resolveMember(v.person);
  });
  // Normalize to {person, from, to, note} — converts legacy week format on load
  const normalizedVacations = vacationsArr.map(normalizeVacation);
  // Resolve meeting-plan name refs → ids on teams + members.
  const planByName = Object.fromEntries(parsedMeetingPlans.map(p => [p.name, p.id]));
  teamsArr.forEach(tm => {
    const parsed = explicitTeams.find(et => et.name === tm.name)?._parsedPlans;
    if (parsed?.length) tm.meetingPlanIds = parsed.map(n => planByName[n] || n).filter(Boolean);
  });
  mems.forEach(m => {
    if (m._parsedPlanNames) {
      m.meetingPlanIds = m._parsedPlanNames.map(n => planByName[n] || n).filter(Boolean);
      delete m._parsedPlanNames;
    }
    if (Array.isArray(m.meetingChanges)) {
      m.meetingChanges = m.meetingChanges.map(change => {
        if (!change?._parsedPlanNames) return change;
        const next = {
          ...change,
          meetingPlanIds: change._parsedPlanNames.map(n => planByName[n] || n).filter(Boolean),
        };
        delete next._parsedPlanNames;
        return next;
      });
    }
  });
  // Who a short name in the work-order block means, taken while the parsed
  // short names are still on the members.
  // First one wins on a duplicate, as it does for assignees (`resolveMember`
  // uses `find`), so a queue and the tasks it orders land on the same person.
  const memberIdByShort = new Map();
  mems.forEach(m => {
    const short = m._parsedShort || computedShorts[m.id];
    if (short && !memberIdByShort.has(short)) memberIdByShort.set(short, m.id);
  });
  // Strip transient _parsedShort field from members
  mems.forEach(m => {
    delete m._parsedShort;
  });
  return { normalizedVacations, memberIdByShort };
}
