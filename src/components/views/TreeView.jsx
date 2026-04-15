import { useState, useMemo, useEffect, useRef } from 'react';
import { hasChildren, isLeafNode, leafNodes, pt } from '../../utils/scheduler.js';
import { GT } from '../../constants.js';

function depth(id) { return id.split('.').length; }

// Status icon: ○ open, ◐ wip, ● done
const STATUS_ICON = { open: { c: '○', col: 'var(--tx3)' }, wip: { c: '◐', col: 'var(--am)' }, done: { c: '●', col: 'var(--gr)' } };
// Priority dot color
const PRIO_COL = { 1: 'var(--re)', 2: 'var(--am)', 3: 'var(--ac)', 4: 'var(--tx3)' };
const PRIO_LBL = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
// Severity glyph for root items
const SEV_GLYPH = { critical: '!!', high: '!', medium: '' };

export function TreeView({ tree, selected, multiSel, onSelect, search, teamFilter, stats, teams, members, cpSet, onQuickAdd, onDelete }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const selRef = useRef(null);

  const sorted = useMemo(() => {
    const byParent = {};
    tree.forEach(r => {
      const pid = r.id.split('.').slice(0, -1).join('.') || '';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(r);
    });
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

  const toggle = (id) => setCollapsed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
    return f.filter(r => {
      const parts = r.id.split('.');
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join('.');
        if (collapsed.has(ancestor)) return false;
      }
      return true;
    });
  }, [sorted, search, teamFilter, collapsed]);

  // Resolve member ID to short initials (e.g. "Steffen Lüling" → "SL", with collision suffix)
  const shortMap = useMemo(() => {
    const map = {};
    const counts = {};
    (members || []).forEach(m => {
      const words = (m.name || '').trim().split(/\s+/).filter(Boolean);
      let base = words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map(w => w[0]).join('').toUpperCase();
      if (!base) base = '?';
      counts[base] = (counts[base] || 0) + 1;
      map[m.id] = counts[base] > 1 ? base + counts[base] : base;
    });
    return map;
  }, [members]);
  const memberShort = (id) => shortMap[id] || (members || []).find(x => x.id === id)?.name || id;
  const memberFullName = (id) => (members || []).find(x => x.id === id)?.name || id;
  const teamColor = (tid) => {
    const t = teams?.find(x => x.id === pt(tid));
    return t?.color || 'var(--tx3)';
  };
  const teamName = (tid) => {
    const t = teams?.find(x => x.id === pt(tid));
    return t?.name || tid || '';
  };

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
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Team</th>
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Assignee</th>
        <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>%</th>
        <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Best</th>
        <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Real</th>
        <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Worst</th>
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap', textAlign: 'center' }}>Prio</th>
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap' }}>Actions</th>
      </tr></thead>
      <tbody>
        {filt.map(r => {
          const s = stats[r.id] || r;
          const isLeaf = isLeafNode(tree, r.id);
          const isCp = isLeaf && cpSet?.has(r.id);
          const childNodes = hasChildren(tree, r.id);
          const isCollapsed = collapsed.has(r.id);
          const d = depth(r.id);
          const isMulti = multiSel?.has(r.id);
          // Effective status (parents derive from children → use auto status)
          const effStatus = isLeaf ? r.status : (s._autoStatus || r.status || 'open');
          const si = STATUS_ICON[effStatus] || STATUS_ICON.open;
          const assignees = r.assign || [];
          const assigneesShort = assignees.map(memberShort);
          const assigneesFull = assignees.map(memberFullName);
          return <tr key={r.id} ref={selected?.id === r.id ? selRef : null} className={`tr${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}${selected?.id === r.id || isMulti ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
            onClick={e => onSelect(r, e, filt.map(x => x.id))}>
            <td><span className="tid">{r.id}</span></td>
            <td style={{ whiteSpace: 'normal' }}>
              <span style={{ display: 'inline-block', width: (d - 1) * 16 }} />
              {childNodes
                ? <span style={{ display: 'inline-block', width: 16, cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', userSelect: 'none', textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggle(r.id); }}>{isCollapsed ? '▶' : '▼'}</span>
                : <span style={{ display: 'inline-block', width: 16 }} />}
              {/* Status icon — replaces the Status badge column */}
              <span title={effStatus} style={{ display: 'inline-block', width: 14, color: si.col, fontSize: 12, fontFamily: 'var(--mono)', marginRight: 4, lineHeight: 1 }}>{si.c}</span>
              {d === 1 && r.type && <span style={{ fontSize: 11, marginRight: 4 }}>{GT[r.type]}</span>}
              <span className={`tn${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}`}>{r.name}</span>
              {d === 1 && r.severity && SEV_GLYPH[r.severity] && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: r.severity === 'critical' ? 'var(--re)' : 'var(--am)', fontFamily: 'var(--mono)' }} title={r.severity}>{SEV_GLYPH[r.severity]}</span>}
              {d === 1 && r.date && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6, fontFamily: 'var(--mono)' }}>{r.date}</span>}
              {isCollapsed && <span style={{ fontSize: 9, color: 'var(--tx3)', marginLeft: 6 }}>({leafNodes(tree).filter(c => c.id.startsWith(r.id + '.')).length} leafs)</span>}
              {isCp && <span style={{ fontSize: 9, color: 'var(--re)', marginLeft: 5, fontWeight: 600 }} title="On critical path">⚡</span>}
              {d === 1 && r.description && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{r.description}</div>}
              {d > 1 && r.note && <span className="note-inline">{r.note}</span>}
            </td>
            {/* Team — colored text instead of pill */}
            <td style={{ whiteSpace: 'nowrap' }}>
              {r.team && <span style={{ fontSize: 11, color: teamColor(r.team), fontWeight: 500 }}>{teamName(r.team)}</span>}
            </td>
            {/* Assignee — short initials with full names on hover */}
            <td style={{ whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {assigneesShort.length > 0 && <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'var(--mono)' }} title={assigneesFull.join(', ')}>{assigneesShort.join(', ')}</span>}
            </td>
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: (s._progress || 0) >= 100 ? 'var(--gr)' : (s._progress || 0) > 0 ? 'var(--am)' : 'var(--tx3)' }}>{(s._progress || 0) > 0 ? `${s._progress}%` : ''}</td>
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
            {/* Priority — small colored dot with number */}
            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
              {isLeaf && r.prio && <span title={`${PRIO_LBL[r.prio]} priority`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontFamily: 'var(--mono)', color: PRIO_COL[r.prio] || 'var(--tx3)' }}>
                <span style={{ fontSize: 12, lineHeight: 1 }}>●</span>{r.prio}
              </span>}
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn btn-sec btn-xs action-btn" title={`Add child under ${r.id}`} onClick={e => { e.stopPropagation(); onQuickAdd(r); }}>+</button>
              <button className="btn btn-danger btn-xs action-btn" title={`Delete ${r.id}`} onClick={e => { e.stopPropagation(); if (confirm(`Delete ${r.id}${childNodes ? ' and all children' : ''}?`)) onDelete(r.id); }}>×</button>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
