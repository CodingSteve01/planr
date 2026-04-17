function uniq(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function roundPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.round(num * 10) / 10;
}

export function nextPhaseId(seed = '') {
  return `ph${Date.now()}${seed}${Math.random().toString(36).slice(2, 6)}`;
}

export function phaseTeamIds(phase) {
  if (!phase) return [];
  if (Array.isArray(phase.teams)) return uniq(phase.teams);
  return phase.team ? [phase.team] : [];
}

export function phaseAssigneeIds(phase) {
  if (!phase) return [];
  return uniq(Array.isArray(phase.assign) ? phase.assign : []);
}

export function normalizePhase(phase = {}) {
  const teams = phaseTeamIds(phase);
  const assign = phaseAssigneeIds(phase);
  const effortPct = roundPct(phase.effortPct);
  return {
    ...phase,
    team: teams[0] || '',
    teams,
    assign,
    status: phase.status || 'open',
    ...(effortPct ? { effortPct } : {}),
  };
}

export function normalizePhases(phases) {
  return (phases || []).map(normalizePhase);
}

export function createPhaseDraft(phase = {}) {
  const normalized = normalizePhase(phase);
  return {
    id: phase.id || nextPhaseId(),
    name: phase.name || '',
    status: normalized.status,
    team: normalized.teams[0] || '',
    teams: normalized.teams,
    assign: normalized.assign,
    ...(normalized.effortPct ? { effortPct: normalized.effortPct } : {}),
  };
}

export function instantiateTemplatePhases(phases) {
  return normalizePhases(phases).map((phase, index) => createPhaseDraft({
    ...phase,
    id: nextPhaseId(String(index)),
    status: 'open',
    assign: [],
  }));
}

export function phaseWeightShares(phases) {
  const normalized = normalizePhases(phases);
  if (!normalized.length) return [];
  const explicit = normalized.filter(phase => phase.effortPct > 0);
  const explicitSum = explicit.reduce((sum, phase) => sum + phase.effortPct, 0);
  const missingCount = normalized.length - explicit.length;
  const remainder = explicit.length ? Math.max(0, 100 - explicitSum) : 100;
  const fallback = missingCount > 0 ? remainder / missingCount : 0;
  const rawWeights = normalized.map(phase => phase.effortPct > 0 ? phase.effortPct : fallback);
  const total = rawWeights.reduce((sum, weight) => sum + weight, 0) || normalized.length;
  return rawWeights.map(weight => weight / total);
}

export function phaseProgress(phases) {
  const normalized = normalizePhases(phases);
  if (!normalized.length) return 0;
  const weights = phaseWeightShares(normalized);
  const progress = normalized.reduce((sum, phase, index) => {
    const weight = weights[index] || 0;
    if (phase.status === 'done') return sum + weight;
    if (phase.status === 'wip') return sum + weight * 0.5;
    return sum;
  }, 0);
  return Math.round(progress * 100);
}

export function phaseTeamLabel(phase, teams) {
  return phaseTeamIds(phase)
    .map(id => teams?.find(team => team.id === id)?.name || id)
    .filter(Boolean)
    .join(', ');
}

export function phaseAssigneeLabel(phase, members) {
  return phaseAssigneeIds(phase)
    .map(id => members?.find(member => member.id === id)?.name || id)
    .filter(Boolean)
    .join(', ');
}

export function formatPhaseToken(phase, { teamName = id => id, memberLabel = id => id } = {}) {
  const normalized = normalizePhase(phase);
  const status = normalized.status === 'done' ? '✅' : normalized.status === 'wip' ? '🟡' : '○';
  const effort = normalized.effortPct ? ` {${normalized.effortPct}%}` : '';
  const teams = normalized.teams.length ? ` (${normalized.teams.map(teamName).join(' + ')})` : '';
  const assignees = normalized.assign.length ? ` [${normalized.assign.map(memberLabel).join(' + ')}]` : '';
  return `${status}${normalized.name}${effort}${teams}${assignees}`.trim();
}

export function parsePhaseToken(text) {
  let raw = (text || '').trim();
  if (!raw) return createPhaseDraft();
  let status = 'open';
  if (raw.startsWith('✅')) {
    status = 'done';
    raw = raw.slice(1).trim();
  } else if (raw.startsWith('🟡')) {
    status = 'wip';
    raw = raw.slice(2).trim();
  } else if (raw.startsWith('○')) {
    raw = raw.slice(1).trim();
  }
  const effortMatch = raw.match(/\{(\d+(?:\.\d+)?)%\}/);
  const effortPct = effortMatch ? roundPct(effortMatch[1]) : undefined;
  if (effortMatch) raw = raw.replace(effortMatch[0], '').trim();
  const teamMatch = raw.match(/\(([^)]*)\)/);
  const teams = teamMatch ? teamMatch[1].split(/\s*\+\s*/).map(part => part.trim()).filter(Boolean) : [];
  if (teamMatch) raw = raw.replace(teamMatch[0], '').trim();
  const assignMatch = raw.match(/\[([^\]]+)\]/);
  const assign = assignMatch ? assignMatch[1].split(/\s*\+\s*/).map(part => part.trim()).filter(Boolean) : [];
  if (assignMatch) raw = raw.replace(assignMatch[0], '').trim();
  return createPhaseDraft({ name: raw.trim(), status, teams, assign, effortPct });
}

export function formatTemplatePhaseLine(phase, teamName = id => id) {
  const normalized = normalizePhase(phase);
  const effort = normalized.effortPct ? ` {${normalized.effortPct}%}` : '';
  const teams = normalized.teams.length ? ` — ${normalized.teams.map(teamName).join(' + ')}` : '';
  return `${normalized.name}${effort}${teams}`.trim();
}

export function parseTemplatePhaseLine(text) {
  const raw = (text || '').trim();
  const parts = raw.split('—');
  const head = parsePhaseToken(parts[0] || '');
  const teams = parts[1]
    ? parts[1].split(/\s*\+\s*/).map(part => part.trim()).filter(Boolean)
    : phaseTeamIds(head);
  return {
    name: head.name,
    team: teams[0] || '',
    teams,
    ...(head.effortPct ? { effortPct: head.effortPct } : {}),
  };
}
