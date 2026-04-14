import { useState, useMemo, useEffect, useRef } from 'react';
import { SBadge, PBadge, TBadge } from '../shared/Badges.jsx';
import { hasChildren, isLeafNode, leafNodes } from '../../utils/scheduler.js';

export function TreeView({ tree, selected, onSelect, onDbl, search, teamFilter, stats, teams, cpSet, onQuickAdd, onDelete }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const selRef = useRef(null);

  // When navigating to a child of a collapsed parent, expand ancestors first, then scroll
  useEffect(() => {
    if (!selected?.id) return;
    const parts = selected.id.split('.');
    const toExpand = [];
    for (let i = 1; i < parts.length; i++) {
      const anc = parts.slice(0, i).join('.');
      if (collapsed.has(anc)) toExpand.push(anc);
    }
    if (toExpand.length) setCollapsed(s => { const n = new Set(s); toExpand.forEach(a => n.delete(a)); return n; });
    setTimeout(() => { if (selRef.current) selRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }, [selected?.id]);

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
      <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>ID</th>
      <th style={{ background: 'var(--bg)', width: '100%' }}>Name</th>
      <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Actions</th>
      <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Status</th>
      <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>%</th>
      <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Team</th>
      <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Best</th>
      <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Real</th>
      <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Worst</th>
      <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Prio</th>
    </tr></thead>
    <tbody>
      {filt.map(r => {
        const s = stats[r.id] || r; const isLeaf = isLeafNode(tree, r.id); const isCp = isLeaf && cpSet?.has(r.id); const canAdd = true;
        const childNodes = hasChildren(tree, r.id);
        const isCollapsed = collapsed.has(r.id);
        return <tr key={r.id} ref={selected?.id === r.id ? selRef : null} className={`tr l${r.lvl}${selected?.id === r.id ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
          onClick={() => onSelect(r)} onDoubleClick={() => onDbl(r)}>
          <td><span className="tid">{r.id}</span></td>
          <td style={{ whiteSpace: 'normal' }}>
            <span style={{ display: 'inline-block', width: (r.lvl - 1) * 16 }} />
            {childNodes && <span style={{ display: 'inline-block', width: 16, cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', userSelect: 'none', textAlign: 'center' }}
              onClick={e => { e.stopPropagation(); toggle(r.id); }}>{isCollapsed ? '▶' : '▼'}</span>}
            <span className={`tn l${r.lvl}`}>{r.name}</span>
            {isCollapsed && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6 }}>({leafNodes(tree).filter(c => c.id.startsWith(r.id + '.')).length} leafs)</span>}
            {isCp && <span style={{ fontSize: 9, color: 'var(--re)', marginLeft: 5 }}>crit</span>}
            {r.note && <span className="note-inline">{r.note}</span>}
          </td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {canAdd && <button className="btn btn-sec btn-xs action-btn"
              title={`Add child under ${r.id}`} onClick={e => { e.stopPropagation(); onQuickAdd(r); }}>+ Child</button>}
            <button className="btn btn-danger btn-xs action-btn"
              title={`Delete ${r.id}`} onClick={e => { e.stopPropagation(); if (confirm(`Delete ${r.id}${childNodes ? ' and all children' : ''}?`)) onDelete(r.id); }}>Remove</button>
          </td>
          <td><SBadge s={r.status} /></td>
          <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: (s._progress || 0) >= 100 ? 'var(--gr)' : (s._progress || 0) > 0 ? 'var(--am)' : 'var(--tx3)' }}>{(s._progress || 0) > 0 ? `${s._progress}%` : ''}</td>
          <td><TBadge t={r.team} teams={teams} /></td>
          {!isLeaf ? <td colSpan={3} className="nc" style={{ fontSize: 10 }}>
            {s._r > 0 && <span style={{ fontFamily: 'var(--mono)' }}>{s._r.toFixed(0)}d</span>}
            {s._startD && <span style={{ color: 'var(--tx3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>
              {s._startD.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })} — {s._endD.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>}
          </td> : <>
            <td className="nc">{s._b > 0 ? s._b : ''}</td>
            <td className="nc g">{s._r > 0 ? s._r.toFixed(1) : ''}</td>
            <td className="nc">{s._w > 0 ? s._w.toFixed(0) : ''}</td>
          </>}
          <td>{isLeaf && <PBadge p={r.prio} />}</td>
        </tr>;
      })}
    </tbody>
  </table>;
}
