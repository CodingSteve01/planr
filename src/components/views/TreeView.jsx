import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { hasChildren, isLeafNode, leafNodes, pt } from '../../utils/scheduler.js';
import { GT } from '../../constants.js';
import { useT } from '../../i18n.jsx';
import { resolveUri } from '../../utils/customFields.js';
import { localDate } from '../../utils/date.js';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { AutoAssignBadge } from '../shared/AutoAssignBadge.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { SelectionActionBar } from '../shared/SelectionActionBar.jsx';
import { AssignModal } from '../modals/AssignModal.jsx';
import { hasChain, chainShorts, chainTooltip } from '../../utils/handoff.js';
import { stateAsOf } from '../../utils/history.js';

function depth(id) { return id.split('.').length; }
// STATUS_LBL is built inside the component so it can use t() — see statusLbl below
// Priority indicator: chevron-style glyphs (up = urgent, down = low)
const PRIO_GLYPH = { 1: '⏫', 2: '▲', 3: '▬', 4: '▼' };
const PRIO_COL = { 1: 'var(--re)', 2: 'var(--am)', 3: 'var(--ac)', 4: 'var(--tx3)' };
function TreeViewImpl({ tree, selected, multiSel, onSelect, search, teamFilter, rootFilter, personFilter, stats, teams, members, scheduled, cpSet, cpLabels = {}, customFields, historyEvents = [], sinceDays = '', persistSince, sinceDate = null, diff = null, onlyChanged = false, horizonIds = null, horizonEnd = null, horizonOnlyPlanned = true, onQuickAdd, onDelete, onReorder, onTaskUpdate, onClearSelection }) {
  const { t } = useT();
  const statusLbl = { open: t('tv.statusOpen'), wip: t('tv.statusWip'), done: t('tv.statusDone') };
  const prioLbl = { 1: t('tv.prioCrit'), 2: t('tv.prioHigh'), 3: t('tv.prioMed'), 4: t('tv.prioLow') };
  const [collapsed, setCollapsed] = useState(new Set());
  const [orderDrop, setOrderDrop] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const selRef = useRef(null);
  const firstMatchRef = useRef(null);

  // The diff cutoff (sinceDays/persistSince/sinceDate) and the precomputed
  // diff bag flow in from App.jsx so every view stays in sync. We still
  // resolve the per-leaf past state locally — used by the per-row diff badge
  // and the "Only changed" filter below.
  const pastLeafState = useMemo(() => sinceDate && historyEvents.length ? stateAsOf(historyEvents, sinceDate) : (diff?.pastLeafState || null), [historyEvents, sinceDate, diff]);
  // "Only with changes" filter — global state, set inside the DiffPicker
  // popup. When on, hide every leaf whose state matches the cutoff (no new,
  // done-in-window, or progress jump). Parents kept when they have at least
  // one matching descendant so the tree shape reads.
  // Per-row diff: returns null when no change, else badge descriptor.
  const computeDiffBadge = (r) => {
    if (!pastLeafState) return null;
    const isLeaf = !tree.some(o => o.id !== r.id && o.id.startsWith(r.id + '.'));
    if (!isLeaf) return null;
    const past = pastLeafState.get(r.id);
    const nowStatus = r.status || 'open';
    const nowProg = typeof r.progress === 'number' ? r.progress : (nowStatus === 'done' ? 100 : nowStatus === 'wip' ? 50 : 0);
    if (!past) return { kind: 'new', label: t('diff.labelNew'), tip: t('diff.tipNew') };
    if (past.status !== 'done' && nowStatus === 'done') return { kind: 'done', label: t('diff.labelDone'), tip: r.completedAt ? t('diff.tipDone') + ' (' + r.completedAt + ')' : t('diff.tipDone') };
    if (nowProg > (past.progress || 0)) {
      const delta = Math.round(nowProg - (past.progress || 0));
      if (delta >= 1) return { kind: 'progress', label: `+${delta}%`, tip: t('diff.tipProgress', past.progress || 0, nowProg) };
    }
    return null;
  };
  // Set of ids the filter should keep visible: every leaf with a diff plus
  // each of its ancestors. Computed once per change in pastLeafState/tree.
  const diffKeepIds = useMemo(() => {
    if (!onlyChanged || !pastLeafState) return null;
    const keep = new Set();
    for (const r of tree) {
      if (computeDiffBadge(r)) {
        keep.add(r.id);
        const parts = r.id.split('.');
        for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('.'));
      }
    }
    return keep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyChanged, pastLeafState, tree]);

  const sorted = useMemo(() => {
    const byParent = {};
    tree.forEach(r => {
      const pid = r.id.split('.').slice(0, -1).join('.') || '';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(r);
    });
    Object.values(byParent).forEach(arr => arr.sort((a, b) => {
      // Honour displayOrder when present (computed by `Reorganize layout`
      // for path-friendly Gantt rendering). Falls back to id-numeric.
      const da = typeof a.displayOrder === 'number' ? a.displayOrder : null;
      const db = typeof b.displayOrder === 'number' ? b.displayOrder : null;
      if (da != null && db != null && da !== db) return da - db;
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
    if (diffKeepIds) {
      f = f.filter(r => diffKeepIds.has(r.id));
    }
    // Planning-horizon filter: only narrows the row list when the user has
    // turned "Only planned in window" on. Without the toggle the rest of
    // the UI (badges, dimming) still reacts to the horizon, but nothing
    // is hidden from the tree.
    if (horizonIds && horizonOnlyPlanned) {
      const keep = new Set();
      for (const r of f) {
        if (horizonIds.has(r.id)) {
          keep.add(r.id);
          const parts = r.id.split('.');
          for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('.'));
        }
      }
      f = f.filter(r => keep.has(r.id));
    }
    return f.filter(r => {
      const parts = r.id.split('.');
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join('.');
        if (collapsed.has(ancestor)) return false;
      }
      return true;
    });
  }, [sorted, search, teamFilter, rootFilter, personFilter, collapsed, diffKeepIds, horizonIds, horizonOnlyPlanned]);

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
  // Effective team per node — own team falls back to nearest ancestor team.
  // Used to suppress the "● Team" pill when it is the same as the inherited
  // parent team (kills repeated "Backend" labels on every descendant row).
  const effTeam = useMemo(() => {
    const m = {};
    sorted.forEach(node => {
      const pid = node.id.split('.').slice(0, -1).join('.');
      const parentEff = pid ? (m[pid] || '') : '';
      m[node.id] = node.team || parentEff;
    });
    return m;
  }, [sorted]);
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
    const rank = r => typeof r.displayOrder === 'number'
      ? r.displayOrder
      : (parseInt(r.id.split('.').pop().replace(/\D/g, '')) || 0);
    const siblings = tree.filter(x => {
      if (isRoot) return !x.id.includes('.') && (x.id.match(/^[A-Za-z]+/)?.[0] || '') === myPrefix;
      return x.id.split('.').slice(0, -1).join('.') === parts.slice(0, -1).join('.');
    }).sort((a, b) => {
      return rank(a) - rank(b) || a.id.localeCompare(b.id, undefined, { numeric: true });
    });
    const idx = siblings.findIndex(x => x.id === selected.id);
    return { idx, count: siblings.length };
  }, [selected?.id, tree]);
  const siblingKeyOf = id => {
    const parent = id.split('.').slice(0, -1).join('.');
    if (parent) return parent;
    return `root:${id.match(/^[A-Za-z]+/)?.[0] || ''}`;
  };
  const canDropOrder = (dragId, targetId) => !!dragId && !!targetId && dragId !== targetId && siblingKeyOf(dragId) === siblingKeyOf(targetId);
  const onOrderDragOver = (e, targetId) => {
    if (!onReorder || !orderDrop?.dragId || !canDropOrder(orderDrop.dragId, targetId)) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setOrderDrop(prev => prev?.targetId === targetId && prev?.position === position ? prev : { ...prev, targetId, position });
  };
  const onOrderDrop = (e, targetId) => {
    if (!onReorder || !orderDrop?.dragId || !canDropOrder(orderDrop.dragId, targetId)) return;
    e.preventDefault();
    onReorder(orderDrop.dragId, { targetId, position: orderDrop.position || 'before' });
    setOrderDrop(null);
  };
  const toolBtn = (label, title, onClick, disabled) => <button
    className="btn btn-sec btn-xs" disabled={disabled} onClick={onClick} data-htip={title}
    style={{ padding: '2px 7px', fontSize: 11, opacity: disabled ? .35 : 1, cursor: disabled ? 'default' : 'pointer' }}>{label}</button>;

  return <div>
    <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--b)', background: 'var(--bg2)', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
      <button className="btn btn-sec btn-xs" onClick={collapseAll} data-htip={hasSelection ? t('tv.collapseSelectionTitle', multiSel.size) : t('tv.collapseAll')}>{hasSelection ? t('tv.collapseSelection', multiSel.size) : t('tv.collapseAll')}</button>
      <button className="btn btn-sec btn-xs" onClick={expandAll} data-htip={hasSelection ? t('tv.expandSelectionTitle', multiSel.size) : t('tv.expandAll')}>{hasSelection ? t('tv.expandSelection', multiSel.size) : t('tv.expandAll')}</button>
      {/* Legend collapsed into a single hover hint — keeps the toolbar quiet */}
      <span data-htip={`${t('tv.statusOpen')} ○  ${t('wip')} ◐  ${t('tv.statusDone')} ●     ⏫ ${t('tv.prioCrit')}  ▲ ${t('tv.prioHigh')}  ▬ ${t('tv.prioMed')}  ▼ ${t('tv.prioLow')}`}
        style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx3)', cursor: 'help', userSelect: 'none', border: '1px solid var(--b)', borderRadius: 3, padding: '0 5px', lineHeight: '16px' }}>?</span>
      {/* Diff picker lives in the App-level sub-toolbar so it stays
          available next to the root/team/person filters. Toggling the
          "Only changed" checkbox there reaches this view via the
          `onlyChanged` prop. */}
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
          // Always show team when set. Hiding inherited teams (parent matches)
          // saved a few pixels but made it impossible to read team assignment
          // at a glance on deep leaves where the parent label sat far away.
          const showTeam = !!r.team;
          const cpTip = isCp && cpLabels[r.id]?.length ? cpLabels[r.id].join(', ') : null;
          // Diff-since badge — shared helper keeps the same rule used by the
          // "only with changes" filter so the two views stay in sync.
          const diffBadge = computeDiffBadge(r);
          const dropHere = orderDrop?.targetId === r.id && canDropOrder(orderDrop.dragId, r.id) ? orderDrop.position : '';
          return <tr key={r.id} ref={selected?.id === r.id ? selRef : (search && idx === 0 ? firstMatchRef : null)}
            className={`tr${isLeaf ? '' : d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}${idx % 2 ? ' alt' : ''}${selected?.id === r.id || isMulti ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
            onClick={e => onSelect(r, e, filt.map(x => x.id))}
            onDragOver={e => onOrderDragOver(e, r.id)}
            onDragLeave={() => setOrderDrop(prev => prev?.targetId === r.id ? { ...prev, targetId: null } : prev)}
            onDrop={e => onOrderDrop(e, r.id)}
            style={{
              boxShadow: dropHere === 'before'
                ? 'inset 0 2px 0 var(--ac)'
                : dropHere === 'after'
                ? 'inset 0 -2px 0 var(--ac)'
                : undefined,
            }}>
            {/* ID column — when on critical path, show CP labels via tooltip on the ⚡ glyph */}
            <td {...(cpTip ? { 'data-htip': `Critical path: ${cpTip}` } : {})}>
              {onReorder && <span
                className="tv-drag-handle"
                draggable
                data-htip={`Drag to reorder ${r.id} within its siblings`}
                onDragStart={e => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', r.id);
                  setOrderDrop({ dragId: r.id, targetId: null, position: 'before' });
                }}
                onDragEnd={() => setOrderDrop(null)}>⋮⋮</span>}
              <span className="tid">{r.id}</span>
            </td>

            {/* Name column — flex container so badges wrap as a single trailing
                group instead of breaking individually under the name when the row
                runs out of horizontal space. */}
            <td style={{ whiteSpace: 'normal' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, rowGap: 2 }}>
              <span style={{ display: 'inline-block', width: (d - 1) * 20, flexShrink: 0 }} />
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

              {/* Team — small colored dot + name (subtle). Suppressed when team equals
                  the inherited parent team to avoid repeating the same label down a subtree. */}
              {tName && showTeam && <span style={{ marginLeft: 8, fontSize: 10, color: tColor, fontWeight: 500, opacity: .85 }} data-htip={`Team: ${tName}`}>● {tName}</span>}

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

              {/* Deadline / decide-by / due dates — color carries semantics
                  (red = overdue, amber = warn, dim = informational). No leading
                  emoji; tooltip explains the kind. */}
              {d === 1 && r.date && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }} data-htip={`Date: ${r.date}`}>{r.date}</span>}

              {r.decideBy && <span style={{ marginLeft: 8, fontSize: 10, color: new Date(r.decideBy) < new Date() && r.status !== 'done' ? 'var(--re)' : 'var(--am)', fontFamily: 'var(--mono)' }} data-htip={`Decide/start by ${r.decideBy}`}>{r.decideBy}</span>}

              {r.due && (() => {
                const sc = sMap[r.id];
                const overdue = !!sc?.dueOverdue;
                const endIso = sc?.endD ? (sc.endD instanceof Date ? sc.endD.toISOString().slice(0, 10) : String(sc.endD).slice(0, 10)) : '';
                return <span style={{ marginLeft: 8, fontSize: 10, color: overdue ? 'var(--re)' : 'var(--am)', fontFamily: 'var(--mono)', fontWeight: overdue ? 700 : 400 }}
                  data-htip={overdue ? `Fällig ${r.due} — geplantes Ende ${endIso} (überfällig)` : `Fällig bis ${r.due}`}>{r.due}</span>;
              })()}

              {/* Diff-since badge (newly done / new leaf / progress jump) */}
              {diffBadge && <span data-htip={diffBadge.tip}
                style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                  background: diffBadge.kind === 'new' ? '#f59e0b'
                    : diffBadge.kind === 'done' ? 'rgba(16,185,129,.85)'
                    : 'rgba(245,158,11,.85)',
                  color: '#1a1a1a',
                  fontFamily: 'var(--mono)' }}>{diffBadge.label}</span>}

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
              {/* Description and note are hidden in tree view; visible in QuickEdit/NodeModal. */}
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
    <SelectionActionBar
      count={multiSel?.size || 0}
      onClear={() => onClearSelection?.()}
      testId="tree-selection-actionbar"
    >
      <button
        type="button"
        className="sab-assign-trigger"
        onClick={() => setShowAssignModal(true)}
        data-htip={t('g.selectedAssignTip') || 'Team / Person zuweisen oder entfernen'}
        data-testid="tree-assign-trigger">
        <span className="sab-icon">⎘</span>
        <span>{t('g.assign') || 'Zuweisen…'}</span>
      </button>
      <span className="sab-divider" />
      {[['open', t('tv.statusOpen') || 'open'], ['wip', t('tv.statusWip') || 'wip'], ['done', t('tv.statusDone') || 'done']].map(([stVal, label]) => (
        <button
          key={stVal}
          type="button"
          className="btn btn-sec"
          onClick={() => {
            (tree || []).forEach(node => {
              if (!multiSel?.has(node.id) || !onTaskUpdate) return;
              if (node.status === stVal) return;
              onTaskUpdate({ ...node, status: stVal });
            });
          }}
          data-htip={`Set status to ${label} for all selected`}>{label}</button>
      ))}
    </SelectionActionBar>
    {showAssignModal && <AssignModal
      count={multiSel?.size || 0}
      teams={teams}
      members={members}
      onClose={() => setShowAssignModal(false)}
      onApply={({ team, persons }) => {
        (tree || []).forEach(node => {
          if (!multiSel?.has(node.id) || !onTaskUpdate) return;
          const patch = { ...node };
          let changed = false;
          if (team !== null && team !== undefined && (node.team || '') !== (team || '')) {
            patch.team = team || '';
            changed = true;
          }
          if (Array.isArray(persons)) {
            const cur = (node.assign || []).slice().sort().join(',');
            const nxt = persons.slice().sort().join(',');
            if (cur !== nxt) { patch.assign = persons.slice(); changed = true; }
          }
          if (changed) onTaskUpdate(patch);
        });
      }}
    />}
  </div>;
}

export const TreeView = memo(TreeViewImpl);
