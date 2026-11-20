// Markdown import/export extracted from App.jsx.
// parseMdToProject: reads .md text → project data object
// buildMarkdownText: project data → .md text (for saving)
import { GT } from '../constants.js';
import { buildMemberShortMap } from './memberShort.js';
import { formatPhaseToken, formatTemplatePhaseLine } from './phases.js';
import { memberTeams } from './memberTeams.js';
import { DEFAULT_SIZES } from './sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from './customFields.js';
import { formatHistoryBlock } from './history.js';
import { formatChangesBlock, formatScenariosBlock } from './scenario.js';
import { formatDayLogBlock } from './dayLog.js';

// ── Export: data → Markdown ──────────────────────────────────────────────────
export function buildMarkdownText({ tree, members, teams, vacations, data, meta }) {
  const teamName = id => teams.find(t => t.id === id)?.name || id;
  const memberName = id => members.find(m => m.id === id)?.name || id;
  const shortMap = buildMemberShortMap(members);
  const memberShort = id => shortMap[id] || memberName(id);
  const activeSizes = data?.sizes?.length ? data.sizes : DEFAULT_SIZES;
  const SZ = Object.fromEntries(activeSizes.map(s => [s.days, s.label]));
  const sz = b => { const k = Object.keys(SZ).map(Number).sort((a, c) => Math.abs(a - b) - Math.abs(c - b)); return SZ[k[0]] || ''; };
  const esc = s => (s || '').toString().replace(/\|/g, '\\|').replace(/\n/g, ' ');
  let md = `# ${meta.name || 'Project'}\n\n`;

  if (meta.planStart || meta.planEnd) {
    md += `## Plan\n\n| Field | Value |\n|---|---|\n`;
    if (meta.planStart) md += `| Start | ${meta.planStart} |\n`;
    if (meta.planEnd) md += `| End | ${meta.planEnd} |\n`;
    if (meta.viewStart && meta.viewStart < (meta.planStart || '')) md += `| View Start | ${meta.viewStart} |\n`;
    if (meta.workDays && JSON.stringify(meta.workDays) !== '[1,2,3,4,5]') md += `| Work Days | ${meta.workDays.join(',')} |\n`;
    md += '\n';
  }
  if (teams.length) {
    const anyTeamPlans = teams.some(t => (t.meetingPlanIds || []).length);
    const planNameById = Object.fromEntries((data?.meetingPlans || []).map(p => [p.id, p.name]));
    if (anyTeamPlans) {
      md += `## Teams\n\n| Name | Color | Meeting Plans |\n|---|---|---|\n`;
      teams.forEach(t => {
        const planNames = (t.meetingPlanIds || []).map(id => planNameById[id] || id).join(', ');
        md += `| ${esc(t.name)} | \`${t.color || '#3b82f6'}\` | ${esc(planNames)} |\n`;
      });
    } else {
      md += `## Teams\n\n| Name | Color |\n|---|---|\n`;
      teams.forEach(t => { md += `| ${esc(t.name)} | \`${t.color || '#3b82f6'}\` |\n`; });
    }
    md += '\n';
  }

  // Meeting Plans catalogue — before Resources so plans are defined when
  // resources reference them.
  if ((data?.meetingPlans || []).length) {
    md += `## Meeting Plans\n\n`;
    const freqSuffix = f => f === 'daily' ? '/d' : f === 'biweekly' ? '/2w' : f === 'monthly' ? '/mo' : '/w';
    data.meetingPlans.forEach(plan => {
      md += `### ${esc(plan.name)}\n`;
      (plan.meetings || []).forEach(mt => {
        md += `- ${esc(mt.name || 'Meeting')} ${mt.hours != null ? `${mt.hours}h` : ''}${freqSuffix(mt.frequency)}\n`;
      });
      md += '\n';
    });
  }

  if (members.length) {
    md += `## Resources\n`;
    members.forEach(m => {
      const isDerived = m.capMode === 'derived';
      const cap = (!isDerived && m.cap < 1) ? ` (${Math.round(m.cap * 100)}%)` : '';
      const hours = isDerived && typeof m.weeklyHours === 'number' ? `, ${m.weeklyHours}h/w` : '';
      const vac = (m.vac && m.vac !== 25) ? `, ${m.vac}d/y` : '';
      md += `- **${m.name}** \`${shortMap[m.id]}\` — ${memberTeams(m).map(teamName).join(' + ')}${m.role ? ', ' + m.role : ''}${cap}${hours}${vac}${m.start ? ', ab ' + m.start : ''}${m.end ? ', bis ' + m.end : ''}\n`;
      if (isDerived && (m.meetings || []).length) {
        const freqSuffix = f => f === 'daily' ? '/d' : f === 'biweekly' ? '/2w' : f === 'monthly' ? '/mo' : '/w';
        md += `  *Meetings: ${m.meetings.map(mt => `${mt.name}${mt.hours != null ? ` ${mt.hours}h` : ''}${freqSuffix(mt.frequency)}`).join(', ')}*\n`;
      }
      if ((m.meetingPlanIds || []).length) {
        const planNames = m.meetingPlanIds
          .map(pid => (data?.meetingPlans || []).find(p => p.id === pid)?.name || pid)
          .join(', ');
        md += `  *Plans: ${planNames}*\n`;
      }
      // Scheduled capacity changes — each "{from}→{cap%}|{Xh/w}" entry
      // applies from that date onward. Scheduler picks the latest entry
      // whose `from` is on or before the task's start.
      if (Array.isArray(m.capChanges) && m.capChanges.length) {
        const items = m.capChanges
          .filter(c => c && c.from)
          .map(c => {
            const parts = [c.from + '→'];
            if (typeof c.cap === 'number') parts.push(`${Math.round(c.cap * 100)}%`);
            if (typeof c.weeklyHours === 'number') parts.push(`${c.weeklyHours}h/w`);
            return parts.join('');
          });
        if (items.length) md += `  *Capacity plan: ${items.join(', ')}*\n`;
      }
      // Scheduled meeting overrides — each entry replaces the member's
      // meeting list from `from` onward. Format mirrors the *Meetings:*
      // line so existing parsers can read either.
      if (Array.isArray(m.meetingChanges) && m.meetingChanges.length) {
        const freqSuffix = f => f === 'daily' ? '/d' : f === 'biweekly' ? '/2w' : f === 'monthly' ? '/mo' : '/w';
        const lines = m.meetingChanges
          .filter(c => c && c.from && (Array.isArray(c.meetings) || Array.isArray(c.meetingPlanIds)))
          .map(c => {
            const planNames = (c.meetingPlanIds || [])
              .map(pid => (data?.meetingPlans || []).find(p => p.id === pid)?.name || pid)
              .filter(Boolean);
            const planToken = planNames.length ? [`plans:${planNames.join('+')}`] : [];
            const ms = (c.meetings || []).map(mt => `${mt.name}${mt.hours != null ? ` ${mt.hours}h` : ''}${freqSuffix(mt.frequency)}`);
            const tokens = [...planToken, ...ms].filter(Boolean);
            return tokens.length ? `${c.from}→[${tokens.join(', ')}]` : null;
          })
          .filter(Boolean);
        if (lines.length) md += `  *Meeting plan: ${lines.join('; ')}*\n`;
      }
    });
    md += '\n';
  }
  if ((vacations || []).length) {
    md += `## Vacations\n\n| Person | From | To | Note |\n|---|---|---|---|\n`;
    vacations.forEach(v => { md += `| ${esc(memberName(v.person))} | ${v.from || ''} | ${v.to || ''} | ${esc(v.note)} |\n`; });
    md += '\n';
  }
  if ((data?.holidays || []).length) {
    md += `## Holidays\n\n| Date | Name | Source |\n|---|---|---|\n`;
    data.holidays.forEach(h => { md += `| ${h.date} | ${esc(h.name)} | ${h.auto ? 'auto' : 'custom'} |\n`; });
    md += '\n';
  }

  // Custom fields definition — write if user has explicitly defined any, OR if any task
  // carries a custom value (so field metadata travels with the value for roundtrip).
  // If neither → stay silent: MD stays identical to pre-feature files.
  const anyCustomValues = tree.some(r => r.customValues && Object.values(r.customValues).some(v => v != null && v !== ''));
  const customFields = data?.customFields?.length ? data.customFields : (anyCustomValues ? DEFAULT_CUSTOM_FIELDS : null);
  if (customFields?.length) {
    md += `## Custom Fields\n\n| ID | Name | Type | Template/Options |\n|---|---|---|---|\n`;
    customFields.forEach(cf => {
      const extra = cf.type === 'uri' ? (cf.uriTemplate || '') : cf.type === 'select' ? (cf.options || []).join(',') : '';
      md += `| ${esc(cf.id)} | ${esc(cf.name)} | ${cf.type} | ${esc(extra)} |\n`;
    });
    md += '\n';
  }

  md += `## Work Tree\n`;
  tree.forEach(r => {
    const d = r.id.split('.').length;
    const indent = '  '.repeat(d - 1);
    const done = r.status === 'done' ? '✅ ' : r.status === 'wip' ? '🟡 ' : '';
    const factorPart = (r.factor && r.factor !== 1.5) ? ` ×${r.factor}` : '';
    const est = r.best > 0 ? ` (${sz(r.best)} ${r.best}T${factorPart})` : '';
    const prog = r.progress > 0 && r.progress < 100 ? ` ${r.progress}%` : '';
    const team = r.team ? ` — ${teamName(r.team)}` : '';
    const assign = (r.assign || []).length ? ` [${r.assign.map(memberShort).join(', ')}]` : '';
    const tags = [];
    if (r.prio && r.prio !== 2) tags.push(`prio:${r.prio}`);
    if (!r.id.includes('.') && r.severity && r.severity !== 'high') tags.push(r.severity);
    if (r.confidence) tags.push(`conf:${r.confidence}`);
    if (r.completedAt) tags.push(`done:${r.completedAt}`);
    if (r.completedStart) tags.push(`done-start:${r.completedStart}`);
    if (r.completedEnd) tags.push(`done-end:${r.completedEnd}`);
    if (r.plannedStart) tags.push(`plan-start:${r.plannedStart}`);
    if (r.plannedEnd) tags.push(`plan-end:${r.plannedEnd}`);
    if (r.deadlineRelevant === false) tags.push('deadline:false');
    if (r.due) tags.push(`due:${r.due}`);
    if (r.teamLock) tags.push('team-lock:true');
    if (r.parallel) tags.push('parallel:true');
    if (r.dropped) tags.push('dropped:true');
    if (r.fixedDurationDays > 0) tags.push(`fixed:${Math.max(1, Math.ceil(+r.fixedDurationDays))}`);
    if (typeof r.displayOrder === 'number') tags.push(`ord:${r.displayOrder}`);
    // Custom field values inline: {jira:PROJ-123, customer:Acme}
    const cvEntries = r.customValues ? Object.entries(r.customValues).filter(([, v]) => v != null && v !== '') : [];
    if (cvEntries.length) tags.push(...cvEntries.map(([k, v]) => `cv.${k}:${String(v).replace(/[,}]/g, ' ')}`));
    const tagStr = tags.length ? ` {${tags.join(', ')}}` : '';
    // All deps are hard now. Old softDeps merge into the single bucket so
    // existing plans flatten on the next save. `~id` prefix retired.
    const allDepIds = [...new Set([...(r.deps || []), ...(r.softDeps || [])])];
    const depItems = allDepIds.map(d => { const lbl = (r._depLabels || {})[d]; return lbl ? `${d} (${lbl})` : d; });
    const deps = depItems.length ? `\n${indent}  *Requires: ${depItems.join(', ')}*` : '';
    const phases = (r.phases || []).length ? `\n${indent}  *Phases: ${r.phases.map(p => formatPhaseToken(p, {
      teamName,
      memberLabel: memberShort,
    })).join(', ')}*` : '';
    // Handoff plan: `*Handoff: → Max (FE); → Anna*` — one chevron per stage.
    // Each stage emits team in parens (if set) and assignee short codes.
    const handoffPlan = Array.isArray(r.handoffPlan) ? r.handoffPlan.filter(st => st && (st.team || (st.assign || []).length)) : [];
    const handoff = handoffPlan.length
      ? `\n${indent}  *Handoff: ${handoffPlan.map(st => {
          const names = (st.assign || []).map(memberShort).join(', ');
          const tn = st.team ? teamName(st.team) : '';
          if (names && tn) return `→ ${names} (${tn})`;
          if (names) return `→ ${names}`;
          return `→ (${tn})`;
        }).join('; ')}*`
      : '';
    const note = r.note ? `\n${indent}  *${r.note}*` : '';
    // GT, not a third private copy of the map: this wrote ⏰ for a deadline
    // while the reader only ever looked for GT.deadline, so a save-then-load
    // round trip left the ⏰ sitting inside the project's NAME and dropped the
    // type. That is where „Rechnungen im Portal ⏰" came from.
    const type = r.type ? ` ${GT[r.type] || GT.goal}` : '';
    const date = r.date ? ` (${r.date})` : '';
    const decideBy = r.decideBy ? ` ⏰decide:${r.decideBy}` : '';
    const pinned = r.pinnedStart ? ` 📌${r.pinnedStart}` : '';
    const desc = r.description ? `\n${indent}  ${r.description}` : '';
    md += `${indent}- ${done}**${r.id}** ${r.name}${type}${date}${est}${prog}${team}${assign}${tagStr}${decideBy}${pinned}${deps}${phases}${handoff}${note}${desc}\n`;
  });

  // Task Templates section
  if ((data?.taskTemplates || []).length) {
    md += `\n## Task Templates\n\n`;
    data.taskTemplates.forEach(tpl => {
    md += `### ${tpl.name}\n`;
    tpl.phases.forEach((p, i) => {
      md += `${i + 1}. ${formatTemplatePhaseLine(p, teamName)}\n`;
    });
    md += '\n';
  });
  }

  // History — append-only event log for "what changed since <date>" reviews.
  // Skipped when empty so untouched files stay identical.
  if (Array.isArray(data?.historyEvents) && data.historyEvents.length) {
    md += `\n## History\n\n<!-- Auto-generated. App appends events on save; do not edit by hand. -->\n\n`;
    md += '```planr-history\n';
    md += formatHistoryBlock(data.historyEvents);
    md += '\n```\n';
  }

  // Persistent Roadmap (Subway-Map) layout — saves the {rootId → route,
  // colour} assignment so projects keep their visual identity across
  // data edits. Format mirrors the history block for consistency.
  if (data?.roadmapAssignment && typeof data.roadmapAssignment === 'object') {
    const entries = Object.entries(data.roadmapAssignment)
      .filter(([, v]) => v && Number.isFinite(v.routeIdx) && Number.isFinite(v.colorIdx));
    if (entries.length) {
      md += `\n## Roadmap\n\n<!-- Auto-generated. Locks Subway-Map line colours + lanes so they stay stable. -->\n\n`;
      md += '```planr-roadmap\nv1\n';
      entries.forEach(([rootId, v]) => {
        md += `${rootId} route=${v.routeIdx} color=${v.colorIdx}\n`;
      });
      md += '```\n';
    }
  }

  // Per-person work order (utils/personQueue.js). The plan's order is the
  // tree's; this is the one override, and it belongs to a person rather than
  // being smeared over the tasks — so it is one line per person here, not a
  // number on every item.
  if (data?.personQueues && typeof data.personQueues === 'object') {
    // v2: the owner is written the way the rest of the file names people and
    // teams — `@SHORT` and `#Team name` — and ` | ` ends it, because a team's
    // name may hold spaces. v1 wrote the in-memory id, and a Markdown plan
    // hands out new ids on every load: the order pointed at nobody one reload
    // later. An owner the plan does not have is not written at all: a queue
    // for nobody orders nothing, and a line that can never be resolved would
    // sit in the file for good.
    const lines = [];
    Object.entries(data.personQueues).forEach(([owner, ids]) => {
      if (!Array.isArray(ids) || ids.length < 2) return;
      const teamId = owner.startsWith('team:') ? owner.slice(5) : null;
      const team = teamId != null ? teams.find(t => t.id === teamId) : null;
      const label = team ? `#${team.name}` : (teamId == null && shortMap[owner]) ? `@${shortMap[owner]}` : null;
      if (label) lines.push(`${label} | ${ids.join(' ')}\n`);
    });
    if (lines.length) {
      md += `\n## Work order\n\n<!-- Auto-generated. One line per person: their own order of work, which overrides the plan order for their tasks only. -->\n\n`;
      md += '```planr-queues\nv2\n' + lines.join('') + '```\n';
    }
  }

  // Dated changes (utils/effective.js): what changes about people, teams and
  // meeting plans on which date. One line per date, names instead of ids for
  // the same reason as in the scenarios below.
  if (Array.isArray(data?.changes) && data.changes.length) {
    md += `\n## Changes\n\n<!-- Auto-generated. One line per date: what changes about people, teams and meeting plans from that day on. Edit in Planr (pick the date in the top bar), not here. -->\n\n`;
    md += '```planr-changes\nv1\n';
    md += formatChangesBlock(data.changes, { members, teams, meetingPlans: data.meetingPlans || [] });
    md += '\n```\n';
  }

  // Scenarios (utils/scenario.js): each one is the list of what differs from
  // the plan above, never a copy of it. People and teams are written by name,
  // because a Markdown plan has no ids for them that survive a reload.
  if (Array.isArray(data?.scenarios) && data.scenarios.length) {
    md += `\n## Scenarios\n\n<!-- Auto-generated. One line per scenario: what it changes against the plan above. Edit scenarios in Planr, not here. -->\n\n`;
    md += '```planr-scenarios\nv1\n';
    md += formatScenariosBlock(data.scenarios, { members, teams, meetingPlans: data.meetingPlans || [] });
    md += '\n```\n';
  }

  // The day log (utils/dayLog.js): per day on which the plan changed, what
  // takes it back to how it stood that morning. It is what "the plan on an
  // earlier day" is read from.
  if (Array.isArray(data?.dayLog) && data.dayLog.length) {
    md += `\n## Log\n\n<!-- Auto-generated. One line per day on which the plan changed: what leads back to the plan as it was before that day. Planr reads earlier days from it. Do not edit. -->\n\n`;
    md += '```planr-log\nv1\n';
    md += formatDayLogBlock(data.dayLog, { members, teams, meetingPlans: data.meetingPlans || [] });
    md += '\n```\n';
  }

  return md;
}

// One line of the `## Resources` section:
//   - **Full Name** `SHORT` — Team, Role (cap%), 40h/w, 25d/y, ab YYYY-MM-DD, bis YYYY-MM-DD
// Several teams are joined with " + " (primary first); a single name is the
// legacy form. Returns team NAMES — the caller resolves them to ids once the
// whole file (and so the team table) is known. Null when the line is not a
// member bullet.
export function parseResourceLine(line) {
  const rm = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*(?:\s+`([^`]+)`)?\s*—?\s*(.*)/);
  if (!rm) return null;
  const meta = rm[3] || '';
  const parts = meta.split(',').map(s => s.trim());
  const teamPart = (parts[0] || '').replace(/\s*\(\d+%\)\s*/g, '').trim();
  const roleParts = parts.slice(1)
    .filter(p => !/^\(?\d+%\)?$/.test(p) && !/^ab\s/.test(p) && !/^bis\s/.test(p) && !/^\d+(?:\.\d+)?d\/y$/.test(p) && !/^\d+(?:\.\d+)?h\/w$/.test(p))
    .map(p => p.replace(/\s*\(\d+%\)\s*/g, '').trim())
    .filter(Boolean);
  const capM = meta.match(/\((\d+)%\)/);
  const hoursM = meta.match(/(\d+(?:\.\d+)?)h\/w/);
  const vacM = meta.match(/(\d+(?:\.\d+)?)d\/y/);
  const startM = meta.match(/ab\s+(\d{4}-\d{2}-\d{2})/);
  const endM = meta.match(/bis\s+(\d{4}-\d{2}-\d{2})/);
  const teams = teamPart.split(/\s+\+\s+/).map(s => s.trim()).filter(Boolean);
  const out = {
    name: rm[1].trim(), short: rm[2] || '', teams, team: teams[0] || '',
    role: roleParts.join(', '), cap: capM ? +capM[1] / 100 : 1, vac: vacM ? +vacM[1] : 25,
    start: startM?.[1] || '', end: endM?.[1] || '',
  };
  if (hoursM) { out.weeklyHours = parseFloat(hoursM[1]); out.capMode = 'derived'; out.meetings = []; }
  return out;
}
