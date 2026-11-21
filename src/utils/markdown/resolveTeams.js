import { phaseTeamIds } from '../phases.js';

// Closing fix-up 1: clean the team names (older corrupt exports), then hand out
// team ids. Returns what the later fix-ups need: the teams and name → id.
export function resolveTeams(state) {
  const { tree, mems, teamSet, explicitTeams, taskTemplates } = state;
  // Self-healing: clean team values that may carry noise from older corrupt exports
  // (e.g. "Backend [SL] !decide:2026-09-30" → "Backend"). Same defensive cleanup for items.
  const sanitizeTeam = t => {
    if (!t) return t;
    let v = t;
    v = v.replace(/!decide:\d{4}-\d{2}-\d{2}/g, '');
    v = v.replace(/📌\d{4}-\d{2}-\d{2}/g, '');
    v = v.replace(/\[[^\]]*\]/g, ''); // strip any [assignees] residue
    v = v.replace(/\{[^}]*\}/g, ''); // strip any {tags} residue
    v = v.trim();
    return v;
  };
  tree.forEach(r => {
    if (r.team) {
      const cleaned = sanitizeTeam(r.team);
      if (cleaned !== r.team) {
        // If the original team string contained a decideBy/pinned, recover them
        const decM = r.team.match(/!decide:(\d{4}-\d{2}-\d{2})/);
        if (decM && !r.decideBy) r.decideBy = decM[1];
        const pinM2 = r.team.match(/📌(\d{4}-\d{2}-\d{2})/);
        if (pinM2 && !r.pinnedStart) r.pinnedStart = pinM2[1];
        r.team = cleaned;
      }
    }
  });
  // Re-collect team names after sanitization (so cleaned names are added to the team set)
  teamSet.clear();
  tree.forEach(r => {
    if (r.team) teamSet.add(r.team);
    if (r.phases) r.phases.forEach(p => phaseTeamIds(p).forEach(teamId => teamSet.add(teamId)));
  });
  mems.forEach(m => {
    if (m.team) {
      m.team = sanitizeTeam(m.team);
      teamSet.add(m.team);
    }
    if (m.teams) {
      m.teams = m.teams.map(sanitizeTeam).filter(Boolean);
      m.teams.forEach(t => teamSet.add(t));
    }
  });
  taskTemplates.forEach(tpl => tpl.phases.forEach(p => phaseTeamIds(p).forEach(teamId => teamSet.add(teamId))));

  // Build teams: prefer explicit team table, fall back to inferred
  const usedTeamNames = [...teamSet];
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const teamsArr = usedTeamNames.map((name, i) => {
    const exp = explicitTeams.find(t => t.name === name);
    return { id: `T${i + 1}`, name, color: exp?.color || palette[i % palette.length] };
  });
  const teamLookup = Object.fromEntries(teamsArr.map(t => [t.name, t.id]));
  tree.forEach(r => {
    if (r.team) r.team = teamLookup[r.team] || r.team;
    if (r.phases) {
      r.phases.forEach(p => {
        const teamsForPhase = phaseTeamIds(p).map(teamId => teamLookup[teamId] || teamId);
        p.teams = teamsForPhase;
        p.team = teamsForPhase[0] || '';
      });
    }
  });
  mems.forEach(m => {
    if (m.team) m.team = teamLookup[m.team] || m.team;
    if (m.teams) m.teams = m.teams.map(t => teamLookup[t] || t);
  });
  taskTemplates.forEach(tpl =>
    tpl.phases.forEach(p => {
      const teamsForPhase = phaseTeamIds(p).map(teamId => teamLookup[teamId] || teamId);
      p.teams = teamsForPhase;
      p.team = teamsForPhase[0] || '';
    }),
  );
  return { teamsArr, teamLookup };
}
