// Markdown import/export extracted from App.jsx.
// parseMdToProject: reads .md text → project data object
// buildMarkdownText: project data → .md text (for saving)
import { iso } from './date.js';
import { buildMemberShortMap } from '../App.jsx';
import { formatPhaseToken, formatTemplatePhaseLine } from './phases.js';
import { DEFAULT_SIZES } from './sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from './customFields.js';

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
    md += `## Teams\n\n| Name | Color |\n|---|---|\n`;
    teams.forEach(t => { md += `| ${esc(t.name)} | \`${t.color || '#3b82f6'}\` |\n`; });
    md += '\n';
  }
  if (members.length) {
    md += `## Resources\n`;
    members.forEach(m => {
      const isDerived = m.capMode === 'derived';
      const cap = (!isDerived && m.cap < 1) ? ` (${Math.round(m.cap * 100)}%)` : '';
      const hours = isDerived && typeof m.weeklyHours === 'number' ? `, ${m.weeklyHours}h/w` : '';
      const vac = (m.vac && m.vac !== 25) ? `, ${m.vac}d/y` : '';
      md += `- **${m.name}** \`${shortMap[m.id]}\` — ${teamName(m.team)}${m.role ? ', ' + m.role : ''}${cap}${hours}${vac}${m.start ? ', ab ' + m.start : ''}${m.end ? ', bis ' + m.end : ''}\n`;
      if (isDerived && (m.meetings || []).length) {
        const freqSuffix = f => f === 'daily' ? '/d' : f === 'biweekly' ? '/2w' : f === 'monthly' ? '/mo' : '/w';
        md += `  *Meetings: ${m.meetings.map(mt => `${mt.name}${mt.hours != null ? ` ${mt.hours}h` : ''}${freqSuffix(mt.frequency)}`).join(', ')}*\n`;
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
    if (r.seq) tags.push(`seq:${r.seq}`);
    if (!r.id.includes('.') && r.severity && r.severity !== 'high') tags.push(r.severity);
    if (r.confidence) tags.push(`conf:${r.confidence}`);
    if (r.completedAt) tags.push(`done:${r.completedAt}`);
    if (r.completedStart) tags.push(`done-start:${r.completedStart}`);
    if (r.completedEnd) tags.push(`done-end:${r.completedEnd}`);
    if (r.plannedStart) tags.push(`plan-start:${r.plannedStart}`);
    if (r.plannedEnd) tags.push(`plan-end:${r.plannedEnd}`);
    if (r.deadlineRelevant === false) tags.push('deadline:false');
    // Custom field values inline: {jira:PROJ-123, customer:Acme}
    const cvEntries = r.customValues ? Object.entries(r.customValues).filter(([, v]) => v != null && v !== '') : [];
    if (cvEntries.length) tags.push(...cvEntries.map(([k, v]) => `cv.${k}:${String(v).replace(/[,}]/g, ' ')}`));
    const tagStr = tags.length ? ` {${tags.join(', ')}}` : '';
    const depItems = (r.deps || []).map(d => { const lbl = (r._depLabels || {})[d]; return lbl ? `${d} (${lbl})` : d; });
    const deps = depItems.length ? `\n${indent}  *Benötigt: ${depItems.join(', ')}*` : '';
    const phases = (r.phases || []).length ? `\n${indent}  *Phasen: ${r.phases.map(p => formatPhaseToken(p, {
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
    const type = r.type ? ` ${r.type === 'deadline' ? '⏰' : r.type === 'painpoint' ? '⚡' : '🎯'}` : '';
    const date = r.date ? ` (${r.date})` : '';
    const decideBy = r.decideBy ? ` ⏰decide:${r.decideBy}` : '';
    const pinned = r.pinnedStart ? ` 📌${r.pinnedStart}` : '';
    const parallel = r.parallel ? ` ≡` : '';
    const desc = r.description ? `\n${indent}  ${r.description}` : '';
    md += `${indent}- ${done}**${r.id}** ${r.name}${type}${date}${est}${prog}${team}${assign}${tagStr}${decideBy}${pinned}${parallel}${deps}${phases}${handoff}${note}${desc}\n`;
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

  return md;
}
