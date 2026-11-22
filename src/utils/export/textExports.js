import { iso } from '../date.js';
import { treeIndex } from '../scheduler.js';
import { download, slug } from './fileHelpers.js';

export function exportJSON({ data, meta }) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slug(meta.name)}-${iso(new Date())}.json`);
}

// ── Sprint Markdown ──────────────────────────────────────────────────────────
export function exportSprintMarkdown({ scheduled, tree, teams, meta, horizonDays }) {
  if (!scheduled.length) return alert('No scheduled tasks.');
  const horizon = horizonDays
    ? Math.max(1, parseInt(horizonDays) || 30)
    : (() => {
        const horizonStr = prompt('Sprint horizon in days from today?', '30');
        if (horizonStr === null) return null;
        return Math.max(1, parseInt(horizonStr) || 30);
      })();
  if (!horizon) return;
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + horizon);
  const up = scheduled
    .filter(s => s.status !== 'done' && s.startD && s.startD <= end)
    .sort((a, b) => a.startD - b.startD || (a.prio || 4) - (b.prio || 4));
  if (!up.length) return alert(`No tasks within ${horizon} days.`);
  const tn = id => teams.find(t => t.id === id)?.name || id;
  const groups = new Map();
  up.forEach(s => {
    const key = s.personId || `team:${s.team || 'none'}`;
    if (!groups.has(key))
      groups.set(key, { key, isPerson: !!s.personId, label: s.personId ? s.person : `${tn(s.team) || 'No team'} (unassigned)`, items: [] });
    groups.get(key).items.push(s);
  });
  const sorted = [...groups.values()].sort((a, b) => (a.isPerson === b.isPerson ? a.label.localeCompare(b.label) : a.isPerson ? -1 : 1));
  let md = `# ${meta.name || 'Project'} — Sprint Plan\n\n_Horizon: ${horizon} days (${iso(now)} → ${iso(end)})_\n_${up.length} tasks, ${sorted.length} lanes_\n\n`;
  sorted.forEach(g => {
    md += `## ${g.label}\n\n| Start | Task | Team | Effort | Status |\n|---|---|---|---|---|\n`;
    g.items.forEach(s => {
      const node = tree.find(r => r.id === (s.treeId || s.id));
      md += `| ${iso(s.startD)} | ${s.id} ${s.name.replace(/\|/g, '\\|')}${node?.decideBy ? ` ⏰ ${node.decideBy}` : ''} | ${tn(s.team)} | ${s.effort?.toFixed(1)}d | ${s.status === 'wip' ? '🟡 WIP' : 'Open'} |\n`;
    });
    md += '\n';
  });
  download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug(meta.name)}-sprint-${horizon}d.md`);
}

// ── Mermaid ──────────────────────────────────────────────────────────────────
export function exportMermaid({ tree, meta }) {
  if (!tree.length) return alert('No items.');
  const sid = id => id.replace(/[^A-Za-z0-9_]/g, '_');
  const sl = s => (s || '').replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 60);
  let out = '```mermaid\nflowchart TD\n';
  tree.forEach(r => {
    const lbl = `${r.id}: ${sl(r.name)}`;
    out += `  ${sid(r.id)}${!r.id.includes('.') ? `(["${lbl}"])` : r.status === 'done' ? `("${lbl}")` : `["${lbl}"]`}\n`;
  });
  out += '\n';
  tree.forEach(r => {
    if (r.id.includes('.')) out += `  ${sid(r.id.split('.').slice(0, -1).join('.'))} --> ${sid(r.id)}\n`;
  });
  out += '\n';
  tree.forEach(r => {
    (r.deps || []).forEach(d => {
      out += `  ${sid(d)} -.->|dep| ${sid(r.id)}\n`;
    });
  });
  out +=
    '\n  classDef done fill:#dcfce7,stroke:#16a34a,color:#15803d\n  classDef wip fill:#fef3c7,stroke:#d97706,color:#a16207\n  classDef root fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a,font-weight:bold\n  classDef dropped fill:#f1f5f9,stroke:#94a3b8,color:#64748b,stroke-dasharray:4 3\n';
  tree
    .filter(r => r.status === 'done')
    .forEach(r => {
      out += `  class ${sid(r.id)} done\n`;
    });
  tree
    .filter(r => r.status === 'wip')
    .forEach(r => {
      out += `  class ${sid(r.id)} wip\n`;
    });
  tree
    .filter(r => !r.id.includes('.'))
    .forEach(r => {
      out += `  class ${sid(r.id)} root\n`;
    });
  // Last, so it wins over the status classes: a dropped item is not work
  // ahead of the team, whatever status it still carries.
  treeIndex(tree).droppedIds.forEach(id => {
    out += `  class ${sid(id)} dropped\n`;
  });
  out += '```\n';
  download(new Blob([out], { type: 'text/plain;charset=utf-8' }), `${slug(meta.name)}-mermaid.md`);
}
