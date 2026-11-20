// Everything the Resources view and the holiday list write. Same context
// convention as nodeEdits.js; `ctx.act` is the node actions, `ctx.res` the
// resource actions themselves.
import { addDays, foldEdit, pruneChanges } from '../../utils/effective.js';
import { withoutTeam } from '../../utils/memberTeams.js';

export function addMember(ctx, teamId) {
  const { members, teams, planStart, act } = ctx;
  const id = 'm' + Date.now();
  act.setD('members', [
    ...members,
    { id, name: 'New person', team: teamId || teams[0]?.id || '', role: '', cap: 1.0, vac: 25, start: planStart },
  ]);
}

export function cloneMember(ctx, src) {
  const { members, act } = ctx;
  const id = 'm' + Date.now();
  const { teams: _teams, ...rest } = src;
  act.setD('members', [...members, { ...rest, id, team: '', cap: 0.5 }]);
}

// Everything the Resources view edits goes through the lens of the day you
// are working on (`effDate`, empty = today): `foldEdit` puts each field
// where it belongs — the change at that date, or the plan itself.
export function onResMeetingPlansUpd(ctx, list) {
  const { mutate, effFold } = ctx;
  mutate(d => {
    const known = new Set((d.meetingPlans || []).map(p => p.id));
    const kept = new Set((list || []).map(p => p.id));
    // Plans that were removed or added are timeless; edited ones are folded.
    let next = {
      ...d,
      meetingPlans: [...(d.meetingPlans || []).filter(p => kept.has(p.id)), ...(list || []).filter(p => !known.has(p.id))],
    };
    for (const plan of list || []) if (known.has(plan.id)) next = foldEdit(next, 'meetingPlans', plan, effFold);
    return pruneChanges(next);
  });
}

export function onResMemberUpd(ctx, m) {
  const { mutate, effFold } = ctx;
  mutate(d => foldEdit(d, 'members', m, effFold));
}

export function onResMemberAdd(ctx, teamId) {
  const { effDate, res, mutate } = ctx;
  // Somebody added while working on a date joins on that date.
  if (!effDate) {
    res.addMember(teamId);
    return;
  }
  const id = 'm' + Date.now();
  mutate(d => ({
    ...d,
    members: [
      ...(d.members || []),
      { id, name: 'New person', team: teamId || d.teams?.[0]?.id || '', role: '', cap: 1.0, vac: 25, start: effDate },
    ],
  }));
}

export function onResMemberDel(ctx, id) {
  const { members, effDate, mutate } = ctx;
  // Removed while working on a date: they leave the day before, and stay
  // in the plan for everything up to then.
  // Never LATER than they were already leaving; and somebody who would
  // only join on or after that day was never there — they are deleted.
  const target = members.find(m => m.id === id);
  if (effDate && target && !(target.start && target.start >= effDate)) {
    const last = addDays(effDate, -1);
    mutate(d => ({ ...d, members: (d.members || []).map(m => (m.id === id ? { ...m, end: m.end && m.end < last ? m.end : last } : m)) }));
    return;
  }
  mutate(d => pruneChanges({ ...d, members: (d.members || []).filter(m => m.id !== id) }));
}

export function onResVacUpd(ctx, v) {
  ctx.act.setD('vacations', v);
}

export function onResTeamUpd(ctx, i, k, v) {
  const { resLens, mutate, effFold } = ctx;
  const team = resLens.teams[i];
  if (team) mutate(d => foldEdit(d, 'teams', { ...team, [k]: v }, effFold));
}

export function onResTeamAdd(ctx) {
  const { teams, act } = ctx;
  act.setD('teams', [...teams, { id: `T${teams.length + 1}`, name: 'New Team', color: '#3b82f6' }]);
}

export function onResTeamDel(ctx, i) {
  const { teams, mutate } = ctx;
  const deleted = teams[i];
  if (!deleted) return;
  mutate(d => {
    const nextTeams = d.teams.filter((_, j) => j !== i);
    const nextMembers = d.members.map(m => withoutTeam(m, deleted.id));
    const nextTree = d.tree.map(r => {
      let out = r;
      if (r.team === deleted.id) out = { ...out, team: '' };
      if (r.phases?.length) {
        const phases = r.phases.map(p => {
          const hasMatch = p.team === deleted.id || (p.teams || []).includes(deleted.id);
          if (!hasMatch) return p;
          const teamsRest = (p.teams || []).filter(t => t !== deleted.id);
          return { ...p, team: p.team === deleted.id ? teamsRest[0] || '' : p.team, teams: teamsRest };
        });
        if (phases.some((p, idx) => p !== r.phases[idx])) out = { ...out, phases };
      }
      return out;
    });
    // A dated change for the team that is gone goes with it: team ids are
    // reused, and an orphan would come back to life on the next new team.
    return pruneChanges({ ...d, teams: nextTeams, members: nextMembers, tree: nextTree });
  });
}

export function onHolUpdate(ctx, v) {
  ctx.act.setD('holidays', v);
}
