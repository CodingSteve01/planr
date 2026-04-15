import { useState, useMemo, useEffect, useRef } from 'react';
import { SBadge, PBadge, TBadge } from '../shared/Badges.jsx';
import { hasChildren, isLeafNode, leafNodes } from '../../utils/scheduler.js';
import { GT } from '../../constants.js';

function depth(id) { return id.split('.').length; }

export function TreeView({ tree, selected, multiSel, onSelect, onDbl, search, teamFilter, stats, teams, cpSet, onQuickAdd, onDelete }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const selRef = useRef(null);

  // Sort tree hierarchically: parent before children, siblings by numeric suffix
  const sorted = useMemo(() => {
    const byParent = {};
    tree.forEach(r => {
      const pid = r.id.split('.').slice(0, -1).join('.') || '';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(r);
    });
    // Sort siblings: numeric suffix, then string
    Object.values(byParent).forEach(arr => arr.sort((a, b) => {
      const aLast = a.id.split('.').pop(), bLast = b.id.split('.').pop();
      const an = parseInt(aLast.replace(/\D/g, '')) || 0, bn = parseInt(bLast.replace(/\D/g, '')) || 0;
      return an !== bn ? an - bn : aLast.localeCompare(bLast);
    }));
    const result = [];
    const visit = pid => { (byParent[pid] || []).forEach(r => { result.push(r); visit(r.id); }); };
    visit('');
    return result;
  }, [tree]);

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

  const collapseAll = () => setCollapsed(new Set(tree.filter(r => hasChildren(tree, r.id)).map(r => r.id)));
  const expandAll = () => setCollapsed(new Set());

  const filt = useMemo(() => {
    let f = sorted;
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
  }, [sorted, search, teamFilter, collapsed]);

  return <div>
    <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--b)', background: 'var(--bg)' }}>
      <button className="btn btn-sec btn-xs" onClick={collapseAll}>Collapse all</button>
      <button className="btn btn-sec btn-xs" onClick={expandAll}>Expand all</button>
      <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{filt.length}/{tree.length} items</span>
    </div>
    <table className="tree-tbl">
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
        const d = depth(r.id);
        const isMulti = multiSel?.has(r.id);
        return <tr key={r.id} ref={selected?.id === r.id ? selRef : null} className={`tr${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}${selected?.id === r.id || isMulti ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
          onClick={e => onSelect(r, e)} onDoubleClick={() => onDbl(r)}>
          <td><span className="tid">{r.id}</span></td>
          <td style={{ whiteSpace: 'normal' }}>
            <span style={{ display: 'inline-block', width: (d - 1) * 16 }} />
            {childNodes && <span style={{ display: 'inline-block', width: 16, cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', userSelect: 'none', textAlign: 'center' }}
              onClick={e => { e.stopPropagation(); toggle(r.id); }}>{isCollapsed ? '▶' : '▼'}</span>}
            {!childNodes && <span style={{ display: 'inline-block', width: 16 }} />}
            {d === 1 && r.type && <span style={{ fontSize: 11, marginRight: 4 }}>{GT[r.type]}</span>}
            <span className={`tn${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}`}>{r.name}</span>
            {d === 1 && r.severity && <span className={`badge b${r.severity === 'critical' ? 'c' : 'h'}`} style={{ marginLeft: 6, fontSize: 8 }}>{r.severity}</span>}
            {d === 1 && r.date && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6, fontFamily: 'var(--mono)' }}>{r.date}</span>}
            {isCollapsed && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6 }}>({leafNodes(tree).filter(c => c.id.startsWith(r.id + '.')).length} leafs)</span>}
            {isCp && <span style={{ fontSize: 9, color: 'var(--re)', marginLeft: 5 }}>crit</span>}
            {d === 1 && r.description && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{r.description}</div>}
            {d > 1 && r.note && <span className="note-inline">{r.note}</span>}
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
  </table></div>;
}
