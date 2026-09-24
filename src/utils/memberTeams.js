// Team membership of a person.
//
// A member can sit in several teams (a full-stack developer in Frontend AND
// Backend). There is deliberately no percentage split: the teams only say which
// pools the person is eligible for. How their single capacity divides between
// those teams is whatever the scheduler books — see `realisedTeamShares`.
//
// Storage: `teams` is the full list, `team` mirrors `teams[0]` (the primary).
// Members written before multi-team support only carry `team`; they read as a
// one-element list, so every caller behaves exactly as before.

const uniq = xs => [...new Set(xs.filter(Boolean))];

export function memberTeams(member) {
  if (!member) return [];
  return uniq([member.team, ...(Array.isArray(member.teams) ? member.teams : [])]);
}

// `norm` lets the scheduler compare through its `pt` key normaliser. An empty
// team is the "no team" pool: it holds the members without any team, which is
// how the scheduler always paired untagged tasks with untagged people.
export function inTeam(member, teamId, norm = x => x) {
  if (!teamId) return memberTeams(member).length === 0;
  const key = norm(teamId);
  return memberTeams(member).some(t => norm(t) === key);
}

// Canonical shape after an edit: `team` is the primary, `teams` the full list.
// A single team collapses back to the legacy shape so untouched files stay
// byte-identical on the next save.
export function withTeams(member, teamIds) {
  const list = uniq(teamIds || []);
  const next = { ...member, team: list[0] || '' };
  if (list.length > 1) next.teams = list;
  else delete next.teams;
  return next;
}

// Drop one team from a member (team deleted); the next one becomes primary.
export function withoutTeam(member, teamId) {
  const list = memberTeams(member);
  if (!list.includes(teamId)) return member;
  return withTeams(member, list.filter(t => t !== teamId));
}

export function memberTeamNames(member, teams) {
  return memberTeams(member).map(id => teams?.find(t => t.id === id)?.name || id);
}

// Realised share per team, derived from scheduled work — never an input.
//
// Every scheduled row booked on the person contributes
// its effort to the row's team. Effort on a team the person is not a member
// of (cross-team help, untagged work) goes to that team / '' all the same, so
// the shares always add up to 100 % of what the person actually does.
// Optionally clipped to a [from, to] window by prorating each row over its
// calendar span.
export function realisedTeamShares(member, scheduled, { from = null, to = null } = {}) {
  const byTeam = new Map();
  const add = (team, effort) => { if (effort > 0) byTeam.set(team || '', (byTeam.get(team || '') || 0) + effort); };
  const clip = (startD, endD, effort) => {
    if (!from && !to) return effort;
    if (!startD || !endD) return effort;
    const s = +startD, e = +endD;
    const lo = Math.max(s, from ? +from : s), hi = Math.min(e, to ? +to : e);
    if (hi < lo) return 0;
    const span = e - s;
    return span > 0 ? effort * ((hi - lo) / span) : effort;
  };
  // Rows come from `schedule()` output, where handoff segments are already
  // expanded into rows of their own — so each row is counted once, on the
  // people it books.
  for (const s of scheduled || []) {
    if (s.unscheduled || s.status === 'done') continue;
    const people = s.assign?.length ? s.assign : (s.personId ? [s.personId] : []);
    if (!people.includes(member.id)) continue;
    // Multi-assign rows occupy every assignee for the full effort.
    add(s.team, clip(s.startD, s.endD, s.effort || 0));
  }
  const total = [...byTeam.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return [...byTeam.entries()]
    .map(([team, effort]) => ({ team, effort, pct: effort / total }))
    .sort((a, b) => b.effort - a.effort);
}

// The team a task should carry once `member` is put on it. Keeps the task's
// own team when the member works in it — a full-stack dev taking a Frontend
// task must not relabel it as their primary Backend — and otherwise adopts the
// member's primary team, which is what single-team members always did.
export function teamForAssignment(member, currentTeam) {
  if (!member) return currentTeam;
  if (currentTeam && memberTeams(member).includes(currentTeam)) return currentTeam;
  return member.team || currentTeam;
}
