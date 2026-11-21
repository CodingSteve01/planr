import { iso } from '../date.js';
import { treeIndex } from '../scheduler.js';
import { download, slug } from './fileHelpers.js';

// ── Jira CSV (importable via Jira's built-in CSV importer) ───────────────────
export function exportJiraCSV({ tree, scheduled, members, teams, meta, selectedIds }) {
  const PRIO = { 1: 'Highest', 2: 'High', 3: 'Medium', 4: 'Low' };
  const sMap = Object.fromEntries((scheduled || []).map(s => [s.id, s]));
  const mMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  const tMap = Object.fromEntries((teams || []).map(t => [t.id, t]));

  // Pick tasks: selected or all non-done leaves. Dropped work never goes out —
  // a ticket created from it would outlive the decision to drop it, and this
  // is the one export that writes into another system.
  const dropped = treeIndex(tree).droppedIds;
  const items = tree.filter(r => {
    if (dropped.has(r.id)) return false;
    if (selectedIds?.size) return selectedIds.has(r.id);
    const isLeaf = !tree.some(c => c.id !== r.id && c.id.startsWith(r.id + '.'));
    return isLeaf && r.status !== 'done' && r.best > 0;
  });

  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
  // Jira Issue Key column lets re-imports *update* existing tickets instead of
  // creating duplicates. Detect a custom field that stores the ticket key
  // (`jira`, `issueKey`, `ticket` …) and emit its value alongside the Planr ID.
  const jiraFieldId = (() => {
    const pool = tree.flatMap(r => (r.customValues ? Object.keys(r.customValues) : []));
    return [...new Set(pool)].find(k => /jira|issue[_-]?key|ticket/i.test(k)) || '';
  })();
  const hdr = [
    'Summary',
    'Description',
    'Issue Type',
    'Priority',
    'Labels',
    'Component',
    'Original Estimate',
    'Assignee',
    'Epic Name',
    'Issue Key',
    'Planr ID',
  ];
  const rows = items.map(r => {
    const sc = sMap[r.id];
    const assignee = (r.assign || [])[0]
      ? mMap[(r.assign || [])[0]]?.name || ''
      : sc?.autoAssigned && sc.personId
        ? mMap[sc.personId]?.name || ''
        : '';
    const teamName = tMap[r.team]?.name || r.team || '';
    const rootId = r.id.split('.')[0];
    const root = tree.find(x => x.id === rootId);
    const estimate = r.best ? `${Math.round(r.best * (r.factor || 1.5))}d` : '';
    const phases = r.phases?.length
      ? r.phases.map(p => `${p.status === 'done' ? '✓' : p.status === 'wip' ? '◐' : '○'} ${p.name}`).join(', ')
      : '';
    const desc = [r.note, phases ? `Phases: ${phases}` : ''].filter(Boolean).join('\n');
    const issueKey = jiraFieldId && r.customValues?.[jiraFieldId] ? String(r.customValues[jiraFieldId]) : '';
    return [
      esc(r.name),
      esc(desc),
      'Task',
      PRIO[r.prio] || 'Medium',
      esc(teamName),
      esc(teamName),
      estimate,
      esc(assignee),
      esc(root?.name || rootId),
      esc(issueKey),
      r.id,
    ].join(',');
  });

  download(
    new Blob(['\uFEFF' + [hdr.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }),
    `${slug(meta.name)}-jira-${iso(new Date())}.csv`,
  );
}
