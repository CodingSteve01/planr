import { useState, useEffect, useMemo } from 'react';
import { SBadge } from '../shared/Badges.jsx';
import { SL, GT, GL } from '../../constants.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { hasChildren, isLeafNode, leafNodes, leafProgress, re } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';

export function NodeModal({ node, tree, members, teams, scheduled, cpSet, stats, onClose, onUpdate, onDelete, onEstimate, onDuplicate, onMove, onReorderInQueue }) {
  const [f, setF] = useState({ ...node });
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => setF({ ...node }), [node?.id]);
  const sc = scheduled?.find(s => s.id === node?.id);
  const isCp = cpSet?.has(node?.id);
  const isDirty = useMemo(() => node && JSON.stringify({ ...node }) !== JSON.stringify(f), [node, f]);
  const safeClose = () => { if (isDirty && !confirm('You have unsaved changes. Discard and close?')) return; onClose(); };
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') safeClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDirty]);
  if (!node) return null;
  const isLeaf = isLeafNode(tree, node.id);
  const isRoot = !node.id.includes('.');
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));
  const allIds = tree.map(r => r.id).filter(i => i !== node.id);

  // Ancestors for the breadcrumb (compact, ID-only)
  const ancestors = [];
  if (!isRoot) {
    const parts = node.id.split('.');
    for (let i = 1; i < parts.length; i++) {
      const aid = parts.slice(0, i).join('.');
      const a = tree.find(r => r.id === aid);
      if (a) ancestors.push(a);
    }
  }
  // Parent options (excluding self + descendants)
  const parentOptions = [
    { id: '', label: '— Top level —' },
    ...tree.filter(r => r.id !== node.id && !r.id.startsWith(node.id + '.')).map(r => ({ id: r.id, label: r.name })),
  ];
  const currentParentId = node.id.split('.').slice(0, -1).join('.');

  // Predecessors (deps): items THIS depends on
  // Successors: items that depend on THIS
  const successors = tree.filter(r => (r.deps || []).includes(node.id));
  const successorIds = new Set(successors.map(r => r.id));

  // Helpers
  const findById = id => tree.find(r => r.id === id);
  const memberLabel = m => `${m.name || m.id}${m.team ? ' — ' + (teams.find(t => t.id === m.team)?.name || m.team) : ''}`;

  const SIZES = [['XS', 1, 1.3], ['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]];
  const stat = !isLeaf ? stats?.[node.id] : null;
  const leafCountUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.')).length : 0;
  const doneUnder = !isLeaf ? leafNodes(tree).filter(c => c.id.startsWith(node.id + '.') && c.status === 'done').length : 0;
  const progPct = !isLeaf ? (leafCountUnder ? Math.round(doneUnder / leafCountUnder * 100) : 0) : (f.progress ?? leafProgress(f));

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      {/* Compact header: breadcrumb + ID + name as primary input */}
      {ancestors.length > 0 && <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 6, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ancestors.map(a => `${a.id} ${a.name}`).join(' › ')}>
        {ancestors.map((a, i) => <span key={a.id}>{i > 0 && <span style={{ color: 'var(--b3)' }}> › </span>}{a.id}</span>)}
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx2)', fontSize: 13, fontWeight: 600 }}>{node.id}</span>
        {isLeaf && <SBadge s={node.status} />}
        {isCp && <span className="badge b-cp" title="On the critical path — any delay here delays the project end">⚡ CP</span>}
        {f.parallel && <span className="badge bo" title="Parallel: bypasses person capacity (legacy field)">≡ parallel</span>}
        {f.pinnedStart && <span className="badge bo" style={{ cursor: 'pointer' }} title={`Pinned to ${f.pinnedStart} — click to unpin`} onClick={() => s('pinnedStart', '')}>📌 {f.pinnedStart} ×</span>}
      </div>
      <div className="field"><label>Name</label><input value={f.name || ''} onChange={e => s('name', e.target.value)} autoFocus /></div>

      {/* Root-only: focus type / severity / date / description */}
      {isRoot && <>
        <div className="frow">
          <div className="field"><label>Focus type</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['', 'goal', 'painpoint', 'deadline'].map(t =>
                <button key={t} className={`goal-type-btn${(f.type || '') === t ? ' active' : ''}`} onClick={() => s('type', t)}>{t ? `${GT[t]} ${GL[t]}` : '— None'}</button>)}
            </div>
          </div>
          {f.type && <div className="field" style={{ flex: '0 0 110px' }}><label>Severity</label>
            <SearchSelect value={f.severity || 'high'} options={[{ id: 'critical', label: 'Critical' }, { id: 'high', label: 'High' }, { id: 'medium', label: 'Medium' }]} onSelect={v => s('severity', v)} />
          </div>}
          {f.type === 'deadline' && <div className="field" style={{ flex: '0 0 140px' }}><label>Date</label><input type="date" value={f.date || ''} onChange={e => s('date', e.target.value)} /></div>}
        </div>
        {f.type && <div className="field"><label>Description</label><input value={f.description || ''} onChange={e => s('description', e.target.value)} placeholder="Why does this matter?" /></div>}
      </>}

      {/* Status / Team — only for leaf items the status is editable */}
      <div className="frow">
        <div className="field"><label>Status{!isLeaf && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6 }}>(auto)</span>}</label>
          {isLeaf
            ? <SearchSelect value={f.status || 'open'} options={[{ id: 'open', label: 'Open' }, { id: 'wip', label: 'In Progress' }, { id: 'done', label: 'Done' }]} onSelect={v => s('status', v)} />
            : <span className={`badge b${(f.status || 'open')[0]}`} style={{ fontSize: 11, padding: '6px 10px', display: 'inline-block' }}>{SL[f.status] || f.status}</span>}
        </div>
        <div className="field"><label>Team</label>
          <SearchSelect value={f.team || ''} options={teams.map(t => ({ id: t.id, label: t.name || t.id }))} onSelect={v => s('team', v)} placeholder="Choose team..." allowEmpty />
        </div>
      </div>

      {/* Leaf-only: progress + assignee */}
      {isLeaf && <>
        <div className="field">
          <label>Progress {progPct}%</label>
          <input type="range" min="0" max="100" step="5" value={progPct}
            onChange={e => { const v = +e.target.value; s('progress', v); if (v >= 100 && f.status !== 'done') s('status', 'done'); else if (v > 0 && v < 100 && f.status !== 'wip') s('status', 'wip'); else if (v === 0 && f.status !== 'open') s('status', 'open'); }}
            style={{ width: '100%', accentColor: 'var(--ac)' }} />
        </div>
        <div className="field"><label>Assignee</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {(f.assign || []).map(a => { const m = members.find(x => x.id === a); return <span key={a} className="tag">{m?.name || a}<span className="tag-x" onClick={() => s('assign', (f.assign || []).filter(x => x !== a))}>×</span></span>; })}
          </div>
          <SearchSelect
            options={members.filter(m => !(f.assign || []).includes(m.id)).map(m => ({ id: m.id, label: memberLabel(m) }))}
            onSelect={id => { const m = members.find(x => x.id === id); setF(x => ({ ...x, assign: [...new Set([...(x.assign || []), id])], team: m?.team || x.team })); }}
            placeholder="Search and assign person..."
          />
        </div>
        {/* Effort: quick estimate buttons + inline summary */}
        <div className="field">
          <label>Effort
            <span style={{ marginLeft: 10, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {re(f.best || 0, f.factor || 1.5).toFixed(1)}d realistic · {((f.best || 0) * (f.factor || 1.5)).toFixed(0)}d worst
              {sc && <> · scheduled {iso(sc.startD)} → {iso(sc.endD)}</>}
            </span>
          </label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {SIZES.map(([sz, d, fc]) =>
              <button key={sz} className={`btn ${f.best === d ? 'btn-pri' : 'btn-sec'} btn-sm`}
                onClick={() => { s('best', d); s('factor', fc); }}>{sz}<span style={{ fontSize: 9, opacity: .6, marginLeft: 2 }}>{d}d</span></button>)}
            <input type="number" min="0" value={f.best || 0} onChange={e => s('best', +e.target.value)} style={{ width: 60, marginLeft: 6 }} title="Best-case days" />
            {onEstimate && <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onEstimate(node); }} title="Open the full estimation wizard">Wizard…</button>}
          </div>
        </div>
        <div className="field" style={{ maxWidth: 200 }}><label>Priority</label>
          <SearchSelect value={String(f.prio || 2)} options={[{ id: '1', label: '⏫ 1 Critical' }, { id: '2', label: '▲ 2 High' }, { id: '3', label: '▬ 3 Medium' }, { id: '4', label: '▼ 4 Low' }]} onSelect={v => s('prio', +v)} />
        </div>
      </>}

      {/* Non-leaf: aggregated stats card (read-only) */}
      {!isLeaf && stat && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
        <div style={{ color: 'var(--tx2)', marginBottom: 6 }}>{doneUnder}/{leafCountUnder} leaf items done · {progPct}%</div>
        <div className="prog-wrap" style={{ marginBottom: 6 }}><div className="prog-fill" style={{ width: `${progPct}%`, background: progPct >= 100 ? 'var(--gr)' : 'var(--am)' }} /></div>
        <div style={{ color: 'var(--tx3)' }}>
          {stat._r > 0 && <span style={{ color: 'var(--am)' }}>{stat._r.toFixed(0)}d realistic · </span>}
          {stat._b > 0 && <span>{stat._b.toFixed(0)}d best · {stat._w?.toFixed(0)}d worst</span>}
          {stat._startD && <span> · {stat._startD.toLocaleDateString('de-DE')} → {stat._endD.toLocaleDateString('de-DE')}</span>}
        </div>
      </div>}

      {/* Predecessors and Successors — both fully editable */}
      <div className="frow" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Predecessors {!isLeaf && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>(applies to all leaves)</span>}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {(f.deps || []).map(d => { const dn = findById(d); return <div key={d} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', flexShrink: 0, fontWeight: 600 }}>{d}</span>
                {dn?.name && <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dn.name}</span>}
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} title="Remove predecessor" onClick={() => setF(x => { const newDeps = (x.deps || []).filter(y => y !== d); const newLabels = { ...(x._depLabels || {}) }; delete newLabels[d]; return { ...x, deps: newDeps, _depLabels: newLabels }; })}>×</span>
            </div>; })}
          </div>
          <SearchSelect
            options={allIds.filter(i => !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))}
            onSelect={id => s('deps', [...new Set([...(f.deps || []), id])])}
            placeholder="+ Add predecessor"
            showIds
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Successors</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
            {successors.map(succ => <div key={succ.id} className="dep-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)', flexShrink: 0, fontWeight: 600 }}>{succ.id}</span>
                <span style={{ fontSize: 11, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{succ.name}</span>
              </div>
              <span className="tag-x" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx3)' }} title="Release this successor" onClick={() => onUpdate({ ...succ, deps: (succ.deps || []).filter(d => d !== node.id) })}>×</span>
            </div>)}
          </div>
          <SearchSelect
            options={allIds.filter(i => !successorIds.has(i) && i !== node.id && !(f.deps || []).includes(i)).map(i => ({ id: i, label: findById(i)?.name || '' }))}
            onSelect={id => { const target = findById(id); if (target) onUpdate({ ...target, deps: [...new Set([...(target.deps || []), node.id])] }); }}
            placeholder="+ Add successor"
            showIds
          />
        </div>
      </div>

      <div className="field"><label>Notes</label><textarea value={f.note || ''} onChange={e => s('note', e.target.value)} rows={2} /></div>

      {/* Scheduling controls — always visible, not hidden behind a toggle. */}
      {isLeaf && <>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!f.parallel} onChange={e => s('parallel', e.target.checked)} style={{ accentColor: 'var(--ac)' }} />
            Run in parallel
            {f.parallel && <span style={{ fontSize: 10, color: 'var(--am)' }}>≡ capacity bypass</span>}
          </label>
        </div>
        {onReorderInQueue && !f.parallel && <div className="field">
          <label>Queue position</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'first')} style={{ flex: 1 }}>⤒ First</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'earlier')} style={{ flex: 1 }}>▲ Earlier</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'later')} style={{ flex: 1 }}>▼ Later</button>
            <button className="btn btn-sec btn-xs" onClick={() => onReorderInQueue(node.id, 'last')} style={{ flex: 1 }}>⤓ Last</button>
          </div>
        </div>}
        <div className="frow">
          <div className="field"><label>Decide by</label>
            <input type="date" value={f.decideBy || ''} onChange={e => s('decideBy', e.target.value)} />
          </div>
          <div className="field"><label>Pinned start {f.pinnedStart && <span style={{ fontSize: 10, color: 'var(--am)' }}>📌</span>}</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="date" value={f.pinnedStart || ''} onChange={e => s('pinnedStart', e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-sec btn-xs" onClick={() => s('pinnedStart', iso(new Date()))} title="Pin to today">Today</button>
              {f.pinnedStart && <button className="btn btn-ghost btn-xs" onClick={() => s('pinnedStart', '')} title="Unpin">×</button>}
            </div>
          </div>
        </div>
      </>}

      {/* Advanced section: parent move, seq, factor */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--b)' }}>
        <button className="btn btn-ghost btn-xs" onClick={() => setAdvanced(v => !v)} style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
          {advanced ? '▼' : '▶'} Advanced
        </button>
        {advanced && <div style={{ marginTop: 10 }}>
          {onMove && <div className="field"><label>Parent (move this item + descendants)</label>
            <SearchSelect value={currentParentId} options={parentOptions} onSelect={newPid => {
              if (newPid === currentParentId) return;
              if (isDirty) { alert('Save or discard pending changes before moving.'); return; }
              const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
              if (!confirm(`Move "${node.name}" + ${sub - 1} descendant${sub === 1 ? '' : 's'} under "${newPid || 'top level'}"? IDs and dep references will be updated.`)) return;
              onMove(node.id, newPid);
            }} placeholder="— Top level —" showIds />
          </div>}
          {isLeaf && <div className="frow">
            <div className="field"><label title="Risk factor multiplier (default 1.5)">Factor</label><input type="number" step="0.1" min="1" max="5" value={f.factor || 1.5} onChange={e => s('factor', +e.target.value)} /></div>
            <div className="field"><label title="Manual sort order within team (rare; usually leave at 0)">Seq</label><input type="number" value={f.seq || 0} onChange={e => s('seq', +e.target.value)} /></div>
          </div>}
        </div>}
      </div>

      <div className="modal-footer">
        {onDelete && <button className="btn btn-danger" onClick={() => { if (confirm(`Delete ${node.id}${hasChildren(tree, node.id) ? ' and all children' : ''}?`)) { onDelete(node.id); onClose(); } }}>Delete</button>}
        {onDuplicate && <button className="btn btn-sec" onClick={() => {
          if (isDirty && !confirm('Unsaved changes will not be copied. Duplicate the saved version anyway?')) return;
          const sub = tree.filter(r => r.id === node.id || r.id.startsWith(node.id + '.')).length;
          if (confirm(sub > 1 ? `Duplicate "${node.name}" + ${sub - 1} descendant${sub === 2 ? '' : 's'}?` : `Duplicate "${node.name}"?`)) onDuplicate(node.id);
        }} title="Create a copy of this item and all its children">⧉ Duplicate</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={safeClose}>Cancel</button>
        <button className="btn btn-pri" onClick={() => { onUpdate(f); onClose(); }} disabled={!isDirty}>{isDirty ? 'Save' : 'No changes'}</button>
      </div>
    </div>
  </div>;
}
