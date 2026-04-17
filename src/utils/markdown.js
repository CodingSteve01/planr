// Markdown import/export extracted from App.jsx.
// parseMdToProject: reads .md text → project data object
// buildMarkdownText: project data → .md text (for saving)
import { iso } from './date.js';
import { buildMemberShortMap } from '../App.jsx';

// ── Export: data → Markdown ──────────────────────────────────────────────────
export function buildMarkdownText({ tree, members, teams, vacations, data, meta }) {
  const teamName = id => teams.find(t => t.id === id)?.name || id;
  const memberName = id => members.find(m => m.id === id)?.name || id;
  const shortMap = buildMemberShortMap(members);
  const memberShort = id => shortMap[id] || memberName(id);
  const SZ = { 1: 'XS', 3: 'S', 7: 'M', 15: 'L', 30: 'XL', 45: 'XXL' };
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
      const cap = m.cap < 1 ? ` (${Math.round(m.cap * 100)}%)` : '';
      const vac = (m.vac && m.vac !== 25) ? `, ${m.vac}d/y` : '';
      md += `- **${m.name}** \`${shortMap[m.id]}\` — ${teamName(m.team)}${m.role ? ', ' + m.role : ''}${cap}${vac}${m.start ? ', ab ' + m.start : ''}${m.end ? ', bis ' + m.end : ''}\n`;
    });
    md += '\n';
  }
  if ((vacations || []).length) {
    md += `## Vacation Weeks\n\n| Person | Week (Mon) | Note |\n|---|---|---|\n`;
    vacations.forEach(v => { md += `| ${esc(memberName(v.person))} | ${v.week || ''} | ${esc(v.note)} |\n`; });
    md += '\n';
  }
  if ((data?.holidays || []).length) {
    md += `## Holidays\n\n| Date | Name | Source |\n|---|---|---|\n`;
    data.holidays.forEach(h => { md += `| ${h.date} | ${esc(h.name)} | ${h.auto ? 'auto' : 'custom'} |\n`; });
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
    const tagStr = tags.length ? ` {${tags.join(', ')}}` : '';
    const depItems = (r.deps || []).map(d => { const lbl = (r._depLabels || {})[d]; return lbl ? `${d} (${lbl})` : d; });
    const deps = depItems.length ? `\n${indent}  *Benötigt: ${depItems.join(', ')}*` : '';
    const note = r.note ? `\n${indent}  *${r.note}*` : '';
    const type = r.type ? ` ${r.type === 'deadline' ? '⏰' : r.type === 'painpoint' ? '⚡' : '🎯'}` : '';
    const date = r.date ? ` (${r.date})` : '';
    const decideBy = r.decideBy ? ` ⏰decide:${r.decideBy}` : '';
    const pinned = r.pinnedStart ? ` 📌${r.pinnedStart}` : '';
    const parallel = r.parallel ? ` ≡` : '';
    const desc = r.description ? `\n${indent}  ${r.description}` : '';
    md += `${indent}- ${done}**${r.id}** ${r.name}${type}${date}${est}${prog}${team}${assign}${tagStr}${decideBy}${pinned}${parallel}${deps}${note}${desc}\n`;
  });
  return md;
}
