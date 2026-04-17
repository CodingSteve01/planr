import { useState, useMemo } from 'react';
import { leafNodes, isLeafNode } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { exportJiraCSV } from '../../utils/exports.js';
import { useT } from '../../i18n.jsx';

export function JiraExportModal({ tree, scheduled, members, teams, meta, onClose }) {
  const { t } = useT();
  const [selectedRoots, setSelectedRoots] = useState(new Set(tree.filter(r => !r.id.includes('.')).map(r => r.id)));
  const [mapping, setMapping] = useState({ 1: 'Epic', 2: 'Story', leaf: 'Task' });
  const [includeAutoAssign, setIncludeAutoAssign] = useState(true);
  const [skipDone, setSkipDone] = useState(true);

  const roots = useMemo(() => tree.filter(r => !r.id.includes('.')), [tree]);
  const sMap = useMemo(() => Object.fromEntries((scheduled || []).map(s => [s.id, s])), [scheduled]);

  const preview = useMemo(() => {
    let items = tree.filter(r => {
      const root = r.id.split('.')[0];
      if (!selectedRoots.has(root)) return false;
      if (skipDone && r.status === 'done') return false;
      return true;
    });
    return items.map(r => {
      const depth = r.id.split('.').length;
      const isLeaf = isLeafNode(tree, r.id);
      const type = isLeaf ? mapping.leaf : (mapping[depth] || 'Story');
      const sc = sMap[r.id];
      const assignee = (r.assign || [])[0] || (includeAutoAssign && sc?.autoAssigned ? sc.personId : null);
      const member = assignee ? members.find(m => m.id === assignee) : null;
      return { ...r, jiraType: type, depth, isLeaf, assigneeName: member?.name || '', sc };
    });
  }, [tree, selectedRoots, mapping, skipDone, includeAutoAssign, sMap]);

  const toggleRoot = id => setSelectedRoots(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const doExport = () => {
    // Build custom CSV with hierarchy mapping
    const PRIO = { 1: 'Highest', 2: 'High', 3: 'Medium', 4: 'Low' };
    const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const tMap = Object.fromEntries((teams || []).map(tm => [tm.id, tm]));

    const hdr = ['Summary', 'Issue Type', 'Priority', 'Description', 'Component', 'Original Estimate', 'Assignee', 'Epic Name', 'Epic Link', 'Labels', 'Planr ID'];
    const rows = preview.map(r => {
      const teamName = tMap[r.team]?.name || r.team || '';
      const rootId = r.id.split('.')[0];
      const root = tree.find(x => x.id === rootId);
      const estimate = r.best ? `${Math.round(r.best * (r.factor || 1.5))}d` : '';
      const phases = r.phases?.length ? r.phases.map(p => `${p.status === 'done' ? '✓' : p.status === 'wip' ? '◐' : '○'} ${p.name}`).join(', ') : '';
      const desc = [r.note, phases ? `Phasen: ${phases}` : ''].filter(Boolean).join('\n');
      const epicName = r.jiraType === 'Epic' ? r.name : '';
      const epicLink = r.jiraType !== 'Epic' ? (root?.name || rootId) : '';
      return [esc(r.name), r.jiraType, PRIO[r.prio] || 'Medium', esc(desc), esc(teamName), estimate, esc(r.assigneeName), esc(epicName), esc(epicLink), esc(teamName), r.id].join(',');
    });

    const blob = new Blob(['\uFEFF' + [hdr.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(meta.name || 'planr').toLowerCase().replace(/\s+/g, '-')}-jira-${iso(new Date())}.csv`; a.click();
    onClose();
  };

  const typeCounts = {};
  preview.forEach(r => { typeCounts[r.jiraType] = (typeCounts[r.jiraType] || 0) + 1; });

  return <div className="overlay" onClick={onClose}>
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      <h2>Jira Export</h2>

      {/* Root selection */}
      <div className="field"><label>Pakete auswählen</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {roots.map(r => {
            const on = selectedRoots.has(r.id);
            const leaves = leafNodes(tree).filter(l => l.id.startsWith(r.id + '.'));
            const done = leaves.filter(l => l.status === 'done').length;
            return <button key={r.id} className={`btn btn-xs ${on ? 'btn-pri' : 'btn-sec'}`}
              style={{ padding: '4px 8px' }} onClick={() => toggleRoot(r.id)}>
              {r.id} {r.name} <span style={{ fontSize: 9, opacity: .6 }}>{done}/{leaves.length}</span>
            </button>;
          })}
        </div>
      </div>

      {/* Hierarchy mapping */}
      <div className="field"><label>Hierarchie-Mapping</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 11, alignItems: 'center' }}>
          <span style={{ color: 'var(--tx3)' }}>Level 1 (Root)</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {['Epic', 'Story', 'Task'].map(v => <button key={v} className={`btn btn-xs ${mapping[1] === v ? 'btn-pri' : 'btn-sec'}`}
              onClick={() => setMapping(m => ({ ...m, 1: v }))}>{v}</button>)}
          </div>
          <span style={{ color: 'var(--tx3)' }}>Level 2+</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {['Epic', 'Story', 'Task'].map(v => <button key={v} className={`btn btn-xs ${mapping[2] === v ? 'btn-pri' : 'btn-sec'}`}
              onClick={() => setMapping(m => ({ ...m, 2: v }))}>{v}</button>)}
          </div>
          <span style={{ color: 'var(--tx3)' }}>Leaves (Arbeitspakete)</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {['Story', 'Task', 'Sub-task'].map(v => <button key={v} className={`btn btn-xs ${mapping.leaf === v ? 'btn-pri' : 'btn-sec'}`}
              onClick={() => setMapping(m => ({ ...m, leaf: v }))}>{v}</button>)}
          </div>
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 11 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={skipDone} onChange={e => setSkipDone(e.target.checked)} /> Erledigte überspringen
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeAutoAssign} onChange={e => setIncludeAutoAssign(e.target.checked)} /> Scheduler-Vorschläge als Assignee
        </label>
      </div>

      {/* Preview */}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, maxHeight: 280, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 10, color: 'var(--tx3)' }}>
          <span style={{ fontWeight: 600 }}>{preview.length} Items</span>
          {Object.entries(typeCounts).map(([type, count]) => <span key={type}>{type}: {count}</span>)}
        </div>
        {preview.slice(0, 30).map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0', fontSize: 10, paddingLeft: (r.depth - 1) * 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: r.jiraType === 'Epic' ? 'var(--ac)' : r.jiraType === 'Story' ? 'var(--gr)' : 'var(--tx3)', fontWeight: 600, flexShrink: 0, width: 45 }}>{r.jiraType}</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', flexShrink: 0, width: 70 }}>{r.id}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            {r.assigneeName && <span style={{ color: 'var(--ac)', flexShrink: 0 }}>{r.assigneeName.split(' ')[0]}</span>}
          </div>
        ))}
        {preview.length > 30 && <div style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: 4 }}>+ {preview.length - 30} weitere</div>}
      </div>

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={doExport} disabled={!preview.length}>Export ({preview.length} Items)</button>
      </div>
    </div>
  </div>;
}
