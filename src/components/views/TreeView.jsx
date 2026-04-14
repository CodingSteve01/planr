import { useState, useMemo } from 'react';
import { SBadge, PBadge, TBadge } from '../shared/Badges.jsx';

export function TreeView({ tree, selected, onSelect, onDbl, search, teamFilter, stats, teams, cpSet, onQuickAdd, onDelete }) {
  const [collapsed, setCollapsed] = useState(new Set());

  const toggle = (id) => setCollapsed(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const filt = useMemo(() => {
    let f = tree;
    if (teamFilter) {
      const matchIds = new Set();
      f.forEach(r => {
        if ((r.team || '').includes(teamFilter)) {
          matchIds.add(r.id);
          const parts = r.id.split('.'); for (let i = 1; i < parts.length; i++) { matchIds.add(parts.slice(0, i).join('.')); }
        }
      });
      f = f.filter(r => matchIds.has(r.id));
    }
    if (search) { const q = search.toLowerCase(); f = f.filter(r => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q)); }
    // Apply collapse: hide children of collapsed parents
    return f.filter(r => {
      const parts = r.id.split('.');
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join('.');
        if (collapsed.has(ancestor)) return false;
      }
      return true;
    });
  }, [tree, search, teamFilter, collapsed]);

  return <table className="tree-tbl">
    <thead><tr>
      <th style={{ width: 100, background: 'var(--bg)' }}>ID</th>
      <th style={{ background: 'var(--bg)' }}>Name</th>
      <th style={{ width: 55, background: 'var(--bg)' }}></th>
      <th style={{ width: 70, background: 'var(--bg)' }}>Status</th>
      <th style={{ width: 70, background: 'var(--bg)' }}>Team</th>
      <th className="r" style={{ width: 50, background: 'var(--bg)' }}>Best</th>
      <th className="r" style={{ width: 55, background: 'var(--bg)' }}>Real</th>
      <th className="r" style={{ width: 50, background: 'var(--bg)' }}>Worst</th>
      <th style={{ width: 65, background: 'var(--bg)' }}>Prio</th>
    </tr></thead>
    <tbody>
      {filt.map(r => {
        const s = stats[r.id] || r; const isCp = r.lvl === 3 && cpSet?.has(r.id); const canAdd = r.lvl < 3;
        const hasChildren = r.lvl < 3 && tree.some(c => c.id.startsWith(r.id + '.'));
        const isCollapsed = collapsed.has(r.id);
        return <tr key={r.id} className={`tr l${r.lvl}${selected?.id === r.id ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
          onClick={() => onSelect(r)} onDoubleClick={() => onDbl(r)}>
          <td><span className="tid">{r.id}</span></td>
          <td>
            <span style={{ display: 'inline-block', width: (r.lvl - 1) * 16 }} />
            {hasChildren && <span style={{ display: 'inline-block', width: 16, cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', userSelect: 'none', textAlign: 'center' }}
              onClick={e => { e.stopPropagation(); toggle(r.id); }}>{isCollapsed ? '▶' : '▼'}</span>}
            <span className={`tn l${r.lvl}`}>{r.name}</span>
            {isCollapsed && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6 }}>({tree.filter(c => c.id.startsWith(r.id + '.') && c.lvl === 3).length} tasks)</span>}
            {isCp && <span style={{ fontSize: 9, color: 'var(--re)', marginLeft: 5 }}>crit</span>}
            {r.note && <span className="note-inline">{r.note}</span>}
          </td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {canAdd && <button className="btn btn-ghost btn-xs" style={{ opacity: .35, fontSize: 12, padding: '1px 3px' }}
              title={`Add child under ${r.id}`} onClick={e => { e.stopPropagation(); onQuickAdd(r); }}>+</button>}
            <button className="btn btn-ghost btn-xs" style={{ opacity: .25, fontSize: 10, padding: '1px 3px', color: 'var(--re)' }}
              title={`Delete ${r.id}`} onClick={e => { e.stopPropagation(); if (confirm(`Delete ${r.id}${r.lvl < 3 ? ' and all children' : ''}?`)) onDelete(r.id); }}>×</button>
          </td>
          <td><SBadge s={r.status} /></td><td><TBadge t={r.team} teams={teams} /></td>
          <td className="nc">{s._b > 0 ? s._b : ''}</td>
          <td className="nc g">{s._r > 0 ? s._r.toFixed(1) : ''}</td>
          <td className="nc">{s._w > 0 ? s._w.toFixed(0) : ''}</td>
          <td>{r.lvl === 3 && <PBadge p={r.prio} />}</td>
        </tr>;
      })}
    </tbody>
  </table>;
}
