import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { hasChildren, isLeafNode, leafNodes, pt } from '../../utils/scheduler.js';
import { GT } from '../../constants.js';
import { useT } from '../../i18n.jsx';
import { resolveUri } from '../../utils/customFields.js';
import { localDate } from '../../utils/date.js';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { AutoAssignBadge } from '../shared/AutoAssignBadge.jsx';
import { CriticalPathBadge } from '../shared/CriticalPathBadge.jsx';
import { hasChain, chainShorts, chainTooltip } from '../../utils/handoff.js';

function depth(id) { return id.split('.').length; }
// STATUS_LBL is built inside the component so it can use t() — see statusLbl below
// Priority indicator: chevron-style glyphs (up = urgent, down = low)
const PRIO_GLYPH = { 1: '⏫', 2: '▲', 3: '▬', 4: '▼' };
const PRIO_COL = { 1: 'var(--re)', 2: 'var(--am)', 3: 'var(--ac)', 4: 'var(--tx3)' };
function TreeViewImpl({ tree, selected, multiSel, onSelect, search, teamFilter, rootFilter, personFilter, stats, teams, members, scheduled, cpSet, cpLabels = {}, customFields, onQuickAdd, onDelete, onReorder }) {
  const { t } = useT();
  const statusLbl = { open: t('tv.statusOpen'), wip: t('tv.statusWip'), done: t('tv.statusDone') };
  const prioLbl = { 1: t('tv.prioCrit'), 2: t('tv.prioHigh'), 3: t('tv.prioMed'), 4: t('tv.prioLow') };
  const [collapsed, setCollapsed] = useState(new Set());
  const selRef = useRef(null);
  const firstMatchRef = useRef(null);

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
    setTimeout(() => {
      if (!selRef.current) return;
      const rect = selRef.current.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
      if (!inView) selRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }, 50);
  }, [selected?.id]);

  // Scroll to first search match whenever the query changes (and the filtered list updates).
  useEffect(() => {
    if (!search) return;
    setTimeout(() => { firstMatchRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' }); }, 50);
  }, [search]);

  const toggle = (id) => setCollapsed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // If there's a selection, collapse/expand only acts on selected items + their descendants. Otherwise, all items.
  const targetIds = () => {
    if (!multiSel || multiSel.size === 0) return tree.filter(r => hasChildren(tree, r.id)).map(r => r.id);
    const ids = new Set();
    multiSel.forEach(id => {
      if (hasChildren(tree, id)) ids.add(id);
      tree.forEach(r => { if (r.id.startsWith(id + '.') && hasChildren(tree, r.id)) ids.add(r.id); });
    });
    return [...ids];
  };
  const collapseAll = () => setCollapsed(s => { const n = new Set(s); targetIds().forEach(id => n.add(id)); return n; });
  const expandAll = () => setCollapsed(s => { const n = new Set(s); targetIds().forEach(id => n.delete(id)); return n; });

  const filt = useMemo(() => {
    let f = sorted;
    if (rootFilter) {
      f = f.filter(r => r.id === rootFilter || r.id.startsWith(rootFilter + '.'));
    }
    if (teamFilter) {
      const matchIds = new Set();
      f.forEach(r => {
        if ((r.team || '') === teamFilter) {
          matchIds.add(r.id);
          const parts = r.id.split('.'); for (let i = 1; i < parts.length; i++) { matchIds.add(parts.slice(0, i).join('.')); }
        }
      });
      f = f.filter(r => matchIds.has(r.id));
    }
    if (personFilter) {
      const matchIds = new Set();
      f.forEach(r => {
        if ((r.assign || []).includes(personFilter)) {
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
  }, [sorted, search, teamFilter, rootFilter, personFilter, collapsed]);

  // Resolve member ID to short initials with collision handling
  const shortMap = useMemo(() => {
    const map = {}, counts = {};
    const bases = (members || []).map(m => {
      const words = (m.name || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return '?';
      return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map(w => w[0]).join('').toUpperCase();
    });
    bases.forEach(b => { counts[b] = (counts[b] || 0) + 1; });
    const seen = {};
    (members || []).forEach((m, i) => {
      const base = bases[i];
      if (counts[base] === 1) map[m.id] = base;
      else { seen[base] = (seen[base] || 0) + 1; map[m.id] = base + seen[base]; }
    });
    return map;
  }, [members]);
  const memberShort = (id) => shortMap[id] || '?';
  const sMap = useMemo(() => scheduled ? Object.fromEntries(scheduled.map(s => [s.id, s])) : {}, [scheduled]);
  const memberFullName = (id) => (members || []).find(x => x.id === id)?.name || id;
  const teamColor = (tid) => teams?.find(x => x.id === pt(tid))?.color || 'var(--tx3)';
  const teamName = (tid) => teams?.find(x => x.id === pt(tid))?.name || tid || '';
  const fmtDate = d => d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) : '';
  const scheduleRangeById = useMemo(() => {
    const childrenByParent = {};
    tree.forEach(node => {
      const pid = node.id.split('.').slice(0, -1).join('.') || '';
      if (!childrenByParent[pid]) childrenByParent[pid] = [];
      childrenByParent[pid].push(node.id);
    });
    const makeWindow = (startValue, endValue) => {
      const start = startValue ? (startValue instanceof Date ? startValue : localDate(startValue)) : null;
      const end = endValue ? (endValue instanceof Date ? endValue : localDate(endValue)) : start;
      if (!start || !end) return null;
      return start <= end ? { start, end } : { start: end, end: start };
    };
    const map = {};
    const visit = id => {
      if (Object.prototype.hasOwnProperty.call(map, id)) return map[id];
      const node = tree.find(entry => entry.id === id);
      if (!node) return null;
      const childIds = childrenByParent[id] || [];
      if (!childIds.length) {
        const actual = node.status === 'done'
          ? makeWindow(node.completedStart || node.completedAt, node.completedAt || node.completedEnd || node.completedStart)
          : null;
        const scheduledWindow = sMap[id]?.startD && sMap[id]?.endD
          ? makeWindow(sMap[id].startD, sMap[id].endD)
          : null;
        map[id] = actual || scheduledWindow;
        return map[id];
      }
      const childWindows = childIds.map(visit).filter(Boolean);
      if (!childWindows.length) {
        map[id] = null;
        return null;
      }
      map[id] = {
        start: new Date(Math.min(...childWindows.map(window => window.start.getTime()))),
        end: new Date(Math.max(...childWindows.map(window => window.end.getTime()))),
      };
      return map[id];
    };
    (childrenByParent[''] || []).forEach(visit);
    return map;
  }, [tree, sMap]);

  const hasSelection = multiSel && multiSel.size > 0;
  // Compute position of `selected` within its sibling group — drives first/last button disabled state.
  const selPos = useMemo(() => {
    if (!selected?.id) return null;
    const parts = selected.id.split('.');
    const isRoot = parts.length === 1;
    const myPrefix = isRoot ? (selected.id.match(/^[A-Za-z]+/)?.[0] || '') : '';
    const siblings = tree.filter(x => {
      if (isRoot) return !x.id.includes('.') && (x.id.match(/^[A-Za-z]+/)?.[0] || '') === myPrefix;
      return x.id.split('.').slice(0, -1).join('.') === parts.slice(0, -1).join('.');
    }).sort((a, b) => {
      const an = parseInt(a.id.split('.').pop().replace(/\D/g, '')) || 0;
      const bn = parseInt(b.id.split('.').pop().replace(/\D/g, '')) || 0;
      return an - bn;
    });
    const idx = siblings.findIndex(x => x.id === selected.id);
    return { idx, count: siblings.length };
  }, [selected?.id, tree]);
  const toolBtn = (label, title, onClick, disabled) => <button
    className="btn btn-sec btn-xs" disabled={disabled} onClick={onClick} data-htip={title}
    style={{ padding: '2px 7px', fontSize: 11, opacity: disabled ? .35 : 1, cursor: disabled ? 'default' : 'pointer' }}>{label}</button>;

  return <div>
    <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--b)', background: 'var(--bg2)', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
      <button className="btn btn-sec btn-xs" onClick={collapseAll} data-htip={hasSelection ? t('tv.collapseSelectionTitle', multiSel.size) : t('tv.collapseAll')}>{hasSelection ? t('tv.collapseSelection', multiSel.size) : t('tv.collapseAll')}</button>
      <button className="btn btn-sec btn-xs" onClick={expandAll} data-htip={hasSelection ? t('tv.expandSelectionTitle', multiSel.size) : t('tv.expandAll')}>{hasSelection ? t('tv.expandSelection', multiSel.size) : t('tv.expandAll')}</button>
      <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} data-htip="Status icons">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><StatusIcon status="open" /> {t('tv.statusOpen').toLowerCase()}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><StatusIcon status="wip" progress={50} /> {t('wip').toLowerCase()}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><StatusIcon status="done" /> {t('tv.statusDone').toLowerCase()}</span>
      </span>
      <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} data-htip="Priority icons">
        <span style={{ color: 'var(--re)' }}>⏫</span>{t('tv.prioCrit')}
        <span style={{ color: 'var(--am)' }}>▲</span>{t('tv.prioHigh')}
        <span style={{ color: 'var(--ac)' }}>▬</span>{t('tv.prioMed')}
        <span style={{ color: 'var(--tx3)' }}>▼</span>{t('tv.prioLow')}
      </span>
      <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{filt.length}/{tree.length} {t('tv.items')}</span>
    </div>
    {/* Contextual action row — only when a single item is selected. Acts on that item. */}
    {selected?.id && selPos && (
      <div style={{ display: 'flex', gap: 4, padding: '4px 10px', borderBottom: '1px solid var(--b)', background: 'var(--bg3)', alignItems: 'center', position: 'sticky', top: 33, zIndex: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>{t('tv.selected')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'var(--mono)', marginRight: 4 }}>{selected.id}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', marginRight: 8, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
        {onReorder && selPos.count > 1 && <>
          {toolBtn('⤒ First', `Move ${selected.id} to first position among its siblings`, () => onReorder(selected.id, 'first'), selPos.idx === 0)}
          {toolBtn('▲ Up', `Move ${selected.id} up one position`, () => onReorder(selected.id, 'up'), selPos.idx === 0)}
          {toolBtn('▼ Down', `Move ${selected.id} down one position`, () => onReorder(selected.id, 'down'), selPos.idx === selPos.count - 1)}
          {toolBtn('⤓ Last', `Move ${selected.id} to last position among its siblings`, () => onReorder(selected.id, 'last'), selPos.idx === selPos.count - 1)}
        </>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-sec btn-xs" onClick={() => { if (confirm(`Delete ${selected.id}${hasChildren(tree, selected.id) ? ' and all its children' : ''}?`)) onDelete(selected.id); }}
          data-htip={`Delete ${selected.id}${hasChildren(tree, selected.id) ? ' and all its children' : ''}`}
          style={{ padding: '2px 7px', fontSize: 11, color: 'var(--re)' }}>{t('tv.deleteItem')}</button>
      </div>
    )}
    <table className="tree-tbl">
      <thead><tr>
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap', top: 32 }}>ID</th>
        <th style={{ background: 'var(--bg)', width: '100%', top: 32 }}>Name</th>
        <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap', top: 32 }}>Effort</th>
        <th className="r" style={{ background: 'var(--bg)', whiteSpace: 'nowrap', top: 32 }}>%</th>
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap', top: 32 }}>Schedule</th>
        <th style={{ background: 'var(--bg)', whiteSpace: 'nowrap', textAlign: 'center', top: 32 }}></th>
      </tr></thead>
      <tbody>
        {filt.map((r, idx) => {
          const s = stats[r.id] || r;
          const isLeaf = isLeafNode(tree, r.id);
          const isCp = isLeaf && cpSet?.has(r.id);
          const childNodes = hasChildren(tree, r.id);
          const isCollapsed = collapsed.has(r.id);
          const d = depth(r.id);
          const isMulti = multiSel?.has(r.id);
          const effStatus = isLeaf ? r.status : (s._autoStatus || r.status || 'open');
          const assignees = r.assign || [];
          const tColor = r.team ? teamColor(r.team) : null;
          const tName = r.team ? teamName(r.team) : '';
          const prog = s._progress || 0;
          const effortDays = isLeaf ? (s._r > 0 ? s._r.toFixed(1) : '') : (s._r > 0 ? s._r.toFixed(0) + 'd' : '');
          return <tr key={r.id} ref={selected?.id === r.id ? selRef : (search && idx === 0 ? firstMatchRef : null)}
            className={`tr${isLeaf ? '' : d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}${selected?.id === r.id || isMulti ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
            onClick={e => onSelect(r, e, filt.map(x => x.id))}>
            {/* ID column */}
            <td><span className="tid">{r.id}</span></td>

            {/* Name column — flex container so badges wrap as a single trailing
                group instead of breaking individually under the name when the row
                runs out of horizontal space. */}
            <td style={{ whiteSpace: 'normal' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, rowGap: 2 }}>
              <span style={{ display: 'inline-block', width: (d - 1) * 14, flexShrink: 0 }} />
              {childNodes
                ? <span style={{ display: 'inline-block', width: 14, cursor: 'pointer', fontSize: 9, color: 'var(--tx3)', userSelect: 'none', textAlign: 'center', flexShrink: 0 }} onClick={e => { e.stopPropagation(); toggle(r.id); }}>{isCollapsed ? '▶' : '▼'}</span>
                : <span style={{ display: 'inline-block', width: 14, flexShrink: 0 }} />}

              {/* Status icon — SVG matching the network graph's symbology */}
              <span style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} data-htip={statusLbl[effStatus]}>
                <StatusIcon status={effStatus} progress={prog} />
              </span>

              {/* Root type emoji */}
              {d === 1 && r.type && <span style={{ fontSize: 12, marginRight: 4 }}>{GT[r.type]}</span>}

              {/* Name */}
              <span className={`tn${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}`}>{r.name}</span>

              {/* Team — small colored dot + name (subtle) */}
              {tName && <span style={{ marginLeft: 8, fontSize: 10, color: tColor, fontWeight: 500, opacity: .85 }} data-htip={`Team: ${tName}`}>● {tName}</span>}

              {/* Assignees — initials, with handoff chain appended when the
                  scheduler split work across multiple people. */}
              {assignees.length > 0 && (() => {
                const sc = sMap[r.id];
                const primary = assignees.map(memberShort).join(' ');
                const chain = hasChain(sc);
                const label = chain ? chainShorts(sc, shortMap, primary) : primary;
                const tip = chain ? chainTooltip(sc, memberFullName) : assignees.map(memberFullName).join(', ');
                return <span style={{ marginLeft: 8, fontSize: 10, color: chain ? 'var(--am)' : 'var(--tx2)', fontFamily: 'var(--mono)', fontWeight: chain ? 600 : 400 }} data-htip={tip}>
                  {chain && <span style={{ marginRight: 3 }}>⇄</span>}
                  {label}
                </span>;
              })()}
              {/* Auto-assigned suggestion from scheduler */}
              {assignees.length === 0 && sMap[r.id]?.autoAssigned && sMap[r.id]?.personId && (() => {
                const sc = sMap[r.id];
                const primary = memberShort(sc.personId);
                const label = hasChain(sc) ? chainShorts(sc, shortMap, primary) : primary;
                const tip = hasChain(sc) ? chainTooltip(sc, memberFullName) : `${t('aa.suggestion')} ${memberFullName(sc.personId)}`;
                return <AutoAssignBadge title={tip} style={{ marginLeft: 8, fontSize: 10, fontFamily: 'var(--mono)', padding: '0 4px' }}>{label}</AutoAssignBadge>;
              })()}

              {/* Priority — chevron icon for all leaves */}
              {isLeaf && r.prio && <span style={{ marginLeft: 8, fontSize: 11, color: PRIO_COL[r.prio], lineHeight: 1 }} data-htip={`${t('tv.priority')}: ${prioLbl[r.prio]}`}>{PRIO_GLYPH[r.prio]}</span>}

              {/* Severity for roots */}
              {d === 1 && r.severity && r.severity !== 'high' && <span style={{ marginLeft: 8, fontSize: 10, color: r.severity === 'critical' ? 'var(--re)' : 'var(--am)', fontWeight: 600, textTransform: 'uppercase' }}>{r.severity}</span>}

              {/* Date for deadlines */}
              {d === 1 && r.date && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>📅 {r.date}</span>}

              {/* Decide-by date — overdue check */}
              {r.decideBy && <span style={{ marginLeft: 8, fontSize: 10, color: new Date(r.decideBy) < new Date() && r.status !== 'done' ? 'var(--re)' : 'var(--am)', fontFamily: 'var(--mono)' }} data-htip={`Decide/start by ${r.decideBy}`}>⏰ {r.decideBy}</span>}

              {/* Critical path indicator */}
              {isCp && <CriticalPathBadge id={r.id} labels={cpLabels} compact style={{ marginLeft: 8 }} />}

              {/* Custom field indicator — show link icon if any uri field has a value */}
              {customFields?.length > 0 && (() => {
                const vals = r.customValues || {};
                const filledUriFields = customFields.filter(cf => cf.type === 'uri' && vals[cf.id]);
                const filledOtherFields = customFields.filter(cf => cf.type !== 'uri' && vals[cf.id] != null && vals[cf.id] !== '');
                if (!filledUriFields.length && !filledOtherFields.length) return null;
                const tipParts = [
                  ...filledUriFields.map(cf => `${cf.name}: ${vals[cf.id]}`),
                  ...filledOtherFields.map(cf => `${cf.name}: ${vals[cf.id]}`),
                ];
                return <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--tx3)', opacity: 0.8 }}
                  data-htip={tipParts.join(' · ')}>
                  {filledUriFields.length > 0 && '↗'}{filledOtherFields.length > 0 && filledUriFields.length === 0 && '·'}
                </span>;
              })()}

              {/* Collapsed children count */}
              {isCollapsed && <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>({leafNodes(tree).filter(c => c.id.startsWith(r.id + '.')).length} leafs)</span>}

              </div>
              {/* Description (root only) */}
              {d === 1 && r.description && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2, marginLeft: 32 }}>{r.description}</div>}

              {/* Note removed from tree — visible in QuickEdit/NodeModal only */}
            </td>

            {/* Effort: single number (realistic days) */}
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isLeaf ? 'var(--gr)' : 'var(--tx2)' }}>{effortDays}</td>

            {/* Progress */}
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: prog >= 100 ? 'var(--gr)' : prog > 0 ? 'var(--am)' : 'var(--tx3)' }}>{prog > 0 ? `${prog}%` : ''}</td>

            {/* Schedule range — start to end */}
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
              {scheduleRangeById[r.id]?.start && scheduleRangeById[r.id]?.end && <>{fmtDate(scheduleRangeById[r.id].start)} → {fmtDate(scheduleRangeById[r.id].end)}</>}
            </td>

            {/* Actions — only quick-add stays as a per-row affordance. Reorder and delete
                live in the contextual toolbar above and act on the currently selected item. */}
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0 4px' }}>
              <button data-htip={`Add child under ${r.id}`} onClick={e => { e.stopPropagation(); onQuickAdd(r); }}
                style={{ width: 20, height: 20, padding: 0, background: 'transparent', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, borderRadius: 3 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg4)'; e.currentTarget.style.color = 'var(--ac)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx3)'; }}>+</button>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export const TreeView = memo(TreeViewImpl);
