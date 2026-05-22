// Queues — per-person pending-task list with simple reorder controls.
//
// Grouping comes from `scheduled[].personId` (the scheduler's chosen
// assignee — covers explicit assigns AND auto-assigned team-slot work)
// rather than the raw tree's `assign` field. That means a Backend
// task with no person assigned but a single Backend member shows up
// under that person automatically, matching what the Gantt actually
// renders.
//
// Filters: respects the global topbar `personFilter` + `teamFilter`,
// plus a local-only member dropdown for quick narrowing without
// touching the topbar. Offboarded members (`member.end < today`) are
// hidden by default — toggleable.
import { useMemo, memo, useState } from 'react';
import { iso } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

function QueuesViewImpl({ tree, members, teams, scheduled, teamFilter = '', personFilter = '', rootFilter = '', hideDone = false, horizonIds = null, diffChangedIds = null, sinceDate = null, onOpenItem, onReorderInQueue, onReorderInProject }) {
  const { t } = useT();
  const [hoverId, setHoverId] = useState(null);
  // {id, position}: drop indicator. position = 'before' or 'after' relative
  // to the row id. Updated on dragOver, cleared on dragLeave / dragEnd.
  const [drop, setDrop] = useState(null);
  const [dragId, setDragId] = useState(null);
  // Person filtering uses the global sub-toolbar control (`personFilter`);
  // the duplicated local picker is gone. Offboarded toggle stays as an
  // operational filter — different concern from "narrow to one person".
  const [showOffboarded, setShowOffboarded] = useState(false);
  // Mode: 'persons' (one queue per assigned person, the original view) or
  // 'projects' (one backlog per top-level root, sortable by `seq`, with
  // dep-conflict markers). Persisted so the user keeps their preferred
  // lens across reloads.
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('planr_queues_mode') || 'persons'; } catch { return 'persons'; }
  });
  const setModePersisted = (v) => { setMode(v); try { localStorage.setItem('planr_queues_mode', v); } catch {} };

  const treeById = useMemo(() => Object.fromEntries((tree || []).map(r => [r.id, r])), [tree]);
  const teamById = useMemo(() => Object.fromEntries((teams || []).map(tm => [tm.id, tm])), [teams]);
  const memberById = useMemo(() => Object.fromEntries((members || []).map(m => [m.id, m])), [members]);

  // Today as ISO so we can string-compare against `member.end`.
  const todayIso = useMemo(() => iso(new Date()), []);

  // Effective member set: drop offboarded unless the toggle says otherwise.
  const visibleMembers = useMemo(() => (members || []).filter(m => {
    if (m.end && m.end < todayIso && !showOffboarded) return false;
    return true;
  }), [members, todayIso, showOffboarded]);

  // Pending tasks: status != done, leaf, has effort. Grouped by the actual
  // scheduled assignee. Tasks without a scheduled personId fall under the
  // team they belong to (and ultimately under "no team" if even that's
  // missing).
  const queues = useMemo(() => {
    const map = {};
    const horizonSet = horizonIds instanceof Set ? horizonIds
      : Array.isArray(horizonIds) ? new Set(horizonIds) : null;
    const diffSet = diffChangedIds instanceof Set ? diffChangedIds
      : Array.isArray(diffChangedIds) ? new Set(diffChangedIds) : null;
    (scheduled || []).forEach(s => {
      // Skip handoff-shadow rows (tree row already represents the work; the
      // shadow is a render artifact).
      if (s.isHandoff) return;
      const node = treeById[s.treeId || s.id];
      if (!node || !node.best) return;
      // Queues only ever surface pending work — done tasks have no slot.
      if (node.status === 'done') return;
      // Honour the global sub-toolbar filters so Queues respects the same
      // scoping every other view does. Big projects become navigable.
      if (rootFilter && !(node.id === rootFilter || node.id.startsWith(rootFilter + '.'))) return;
      if (horizonSet && !horizonSet.has(node.id)) return;
      if (diffSet && !diffSet.has(node.id)) return;
      // Determine the primary lane (scheduler's chosen person) plus every
      // additional lane the task should mirror into. Multi-assign and
      // teamLock tasks need to show up in every involved person's queue,
      // not just the picked-one — otherwise people miss work assigned to
      // them. The primary lane keeps the full task with drag-reorder; the
      // mirrors render as read-only `_mirror` entries with a shared icon.
      const allAssignees = Array.isArray(s.assign) && s.assign.length
        ? s.assign
        : (Array.isArray(node.assign) ? node.assign : []);
      const primaryId = s.personId || allAssignees[0] || null;
      if (primaryId) {
        (map['p:' + primaryId] ||= []).push({ s, node, _primaryId: primaryId });
      } else {
        (map['t:' + (node.team || '')] ||= []).push({ s, node, _primaryId: null });
      }
      // Mirrors — same task in every other assignee's queue, flagged so
      // the UI can mute them and skip drag affordance.
      if (primaryId && allAssignees.length > 1) {
        for (const aid of allAssignees) {
          if (aid === primaryId) continue;
          (map['p:' + aid] ||= []).push({ s, node, _mirror: true, _primaryId: primaryId });
        }
      }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => {
      const sa = a.s, sb = b.s;
      // Pending start, then prio, then seq, then id. Matches the scheduler's
      // run order for tasks within the same queue.
      const aStart = sa.startD ? +sa.startD : Infinity;
      const bStart = sb.startD ? +sb.startD : Infinity;
      return aStart - bStart || (a.node.prio || 4) - (b.node.prio || 4) || (a.node.seq || 0) - (b.node.seq || 0) || a.node.id.localeCompare(b.node.id);
    }));
    return map;
  }, [scheduled, treeById, rootFilter, hideDone, horizonIds, diffChangedIds]);
  void sinceDate; // sinceDate kept in the prop signature for future banner extension

  // Build the list the view renders. Sub-toolbar filters cascade:
  // personFilter pins one queue, teamFilter pins one team's members.
  const visibleQueues = useMemo(() => {
    const list = [];
    visibleMembers.forEach(m => {
      if (personFilter && m.id !== personFilter) return;
      if (teamFilter && (m.team || '') !== teamFilter) return;
      const tasks = queues['p:' + m.id] || [];
      list.push({ kind: 'person', key: 'p:' + m.id, label: m.name, member: m, tasks });
    });
    // Team slots: tasks without an assignee. Hidden when a person filter is
    // pinned (the user's looking at one specific person).
    if (!personFilter) {
      Object.keys(queues).filter(k => k.startsWith('t:')).forEach(k => {
        const teamId = k.slice(2);
        if (teamFilter && teamId !== teamFilter) return;
        const team = teamById[teamId];
        list.push({
          kind: 'team', key: k,
          label: (team?.name || t('noTeam')) + ' (' + t('rv.unassigned') + ')',
          team, tasks: queues[k],
        });
      });
    }
    return list;
  }, [queues, visibleMembers, personFilter, teamFilter, teamById, t]);

  const fmtDate = d => d ? (d instanceof Date ? iso(d) : d) : '—';

  const onDragStart = (e, taskId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setDragId(taskId);
  };
  const onDragEnd = () => { setDragId(null); setDrop(null); };
  const onDragOver = (e, targetTaskId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Decide above/below by the cursor's relative position inside the row.
    const rect = e.currentTarget.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    setDrop(prev => (prev?.id === targetTaskId && prev.position === (above ? 'before' : 'after'))
      ? prev : { id: targetTaskId, position: above ? 'before' : 'after' });
  };
  const onDrop = (e, targetTaskId, queueTasks) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDrop(null); setDragId(null);
    if (!sourceId || sourceId === targetTaskId) return;
    const tgtIdx = queueTasks.findIndex(x => x.node.id === targetTaskId);
    if (tgtIdx < 0) return;
    // The user dragged "after" the target row → drop below it. Account for
    // the source moving into the gap above when source comes from above.
    const above = drop?.id === targetTaskId && drop.position === 'before';
    const srcIdx = queueTasks.findIndex(x => x.node.id === sourceId);
    let newIdx = above ? tgtIdx : tgtIdx + 1;
    if (srcIdx >= 0 && srcIdx < newIdx) newIdx -= 1;
    onReorderInQueue?.(sourceId, newIdx);
  };

  const offboardedCount = (members || []).filter(m => m.end && m.end < todayIso).length;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <p className="helper" style={{ marginBottom: 10 }}>{t('q.intro')}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Mode toggle: per-person queues vs per-project backlogs. */}
        <div style={{ display: 'inline-flex', gap: 2 }}>
          <button className={`btn btn-xs ${mode === 'persons' ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '3px 9px', fontSize: 11 }}
            onClick={() => setModePersisted('persons')}>{t('q.modePersons')}</button>
          <button className={`btn btn-xs ${mode === 'projects' ? 'btn-pri' : 'btn-sec'}`}
            style={{ padding: '3px 9px', fontSize: 11 }}
            onClick={() => setModePersisted('projects')}>{t('q.modeProjects')}</button>
        </div>
        {offboardedCount > 0 && mode === 'persons' && (
          <label className="toggle-mini" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }}
            data-htip={t('q.includeOffboardedTip')}>
            <input type="checkbox" checked={showOffboarded} onChange={e => setShowOffboarded(e.target.checked)} />
            {t('q.includeOffboarded')} ({offboardedCount})
          </label>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
          {visibleQueues.length} {t('q.queueCount')}
        </span>
      </div>

      {mode === 'persons' && visibleQueues.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)', fontSize: 12 }}>
          {t('q.empty')}
        </div>
      )}

      {mode === 'projects' && <ProjectsBacklog
        tree={tree}
        scheduled={scheduled}
        members={members}
        teams={teams}
        rootFilter={rootFilter}
        teamFilter={teamFilter}
        personFilter={personFilter}
        horizonIds={horizonIds}
        diffChangedIds={diffChangedIds}
        onOpenItem={onOpenItem}
        onReorderInProject={onReorderInProject}
        t={t}
        memberById={memberById}
      />}

      {mode === 'persons' && visibleQueues.map(q => {
        const color = q.member ? (teamById[q.member.team]?.color || 'var(--ac)') : (q.team?.color || 'var(--tx3)');
        const isOff = q.member?.end && q.member.end < todayIso;
        return (
          <div key={q.key} style={{ marginBottom: 18, opacity: isOff ? 0.55 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${color}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{q.label}</span>
              {isOff && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--re)', color: '#fff' }}>{t('rv.offboarded')}</span>}
              <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{q.tasks.length}</span>
            </div>
            {q.tasks.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic', padding: '4px 8px' }}>{t('q.queueEmpty')}</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {q.tasks.map(({ s, node, _mirror, _primaryId }, i) => {
                  const isAuto = s.autoAssigned && !(node.assign || []).length;
                  const dueRed = s.dueOverdue || (node.due && node.due < todayIso && node.status !== 'done');
                  // Mirror rows belong to a multi-assign / team-lock task and
                  // are owned by another queue. Show them muted, with the
                  // primary-assignee name, and disable drag-reorder so all
                  // ordering changes happen in the owning lane.
                  const primaryName = _mirror ? (memberById[_primaryId]?.name || _primaryId) : '';
                  return (
                    <li key={node.id + (_mirror ? ':m' : '')}
                      draggable={!_mirror}
                      onDragStart={e => !_mirror && onDragStart(e, node.id)}
                      onDragEnd={onDragEnd}
                      onDragOver={e => !_mirror && onDragOver(e, node.id)}
                      onDragLeave={() => setDrop(prev => prev?.id === node.id ? null : prev)}
                      onDrop={e => !_mirror && onDrop(e, node.id, q.tasks)}
                      onMouseEnter={() => setHoverId(node.id)}
                      onMouseLeave={() => setHoverId(prev => (prev === node.id ? null : prev))}
                      style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: '14px 70px 1fr 140px 90px 60px 30px 30px 30px 30px',
                        alignItems: 'center', gap: 6,
                        padding: '5px 8px',
                        borderBottom: '1px solid var(--b)',
                        background: hoverId === node.id ? 'var(--bg2)' : 'transparent',
                        cursor: _mirror ? 'pointer' : 'grab',
                        opacity: dragId === node.id ? 0.4 : (_mirror ? 0.65 : 1),
                        fontSize: 11,
                      }}>
                      {drop?.id === node.id && !_mirror && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          [drop.position === 'before' ? 'top' : 'bottom']: -1,
                          height: 2,
                          background: 'var(--ac)',
                          boxShadow: '0 0 6px var(--ac)',
                          pointerEvents: 'none',
                          zIndex: 2,
                        }} />
                      )}
                      <span style={{ color: 'var(--tx3)', cursor: _mirror ? 'help' : 'grab', userSelect: 'none' }}
                        data-htip={_mirror ? t('q.mirrorTip', primaryName) : t('q.dragTip')}>{_mirror ? '⇋' : '≡'}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(node.id)}>{node.id}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(node.id)}>
                        {node.name}
                        {isAuto && <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--am)', fontWeight: 600 }}>AUTO</span>}
                        {_mirror && <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--tx3)', fontWeight: 600 }} data-htip={t('q.mirrorTip', primaryName)}>↳ {primaryName}</span>}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
                        {s.startD ? `${fmtDate(s.startD)} → ${fmtDate(s.endD)}` : '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right' }}>
                        {s.effort ? `${s.effort.toFixed(1)}d` : `${(node.best || 0)}d`}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: dueRed ? 'var(--re)' : 'var(--tx3)', fontWeight: dueRed ? 600 : 400 }}>
                        {node.due ? `⏳ ${node.due.slice(5)}` : ''}
                      </span>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.first')}
                        disabled={i === 0 || _mirror}
                        onClick={() => !_mirror && onReorderInQueue?.(node.id, 'first')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: (i === 0 || _mirror) ? 0.3 : 1 }}>⤒</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.earlier')}
                        disabled={i === 0 || _mirror}
                        onClick={() => !_mirror && onReorderInQueue?.(node.id, 'earlier')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: (i === 0 || _mirror) ? 0.3 : 1 }}>▲</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.later')}
                        disabled={i === q.tasks.length - 1 || _mirror}
                        onClick={() => !_mirror && onReorderInQueue?.(node.id, 'later')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: (i === q.tasks.length - 1 || _mirror) ? 0.3 : 1 }}>▼</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.last')}
                        disabled={i === q.tasks.length - 1 || _mirror}
                        onClick={() => !_mirror && onReorderInQueue?.(node.id, 'last')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: (i === q.tasks.length - 1 || _mirror) ? 0.3 : 1 }}>⤓</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ProjectsBacklog ─────────────────────────────────────────────────────────
// One backlog per top-level root. Each backlog lists all leaves in the
// root subtree sorted by the planner's intended `seq`. Buttons reorder
// (App.jsx renumbers seq). Dep-conflict markers highlight rows whose
// declared deps land later in the manual sequence than themselves — a
// strong signal that the planner's preferred order won't survive the
// scheduler. The scheduler's effective order (post-dep resolution) is
// shown as a faint "#N" column so user sees Soll vs Ist at a glance.
function ProjectsBacklog({ tree, scheduled, members, teams, rootFilter, teamFilter, personFilter, horizonIds, diffChangedIds, onOpenItem, onReorderInProject, t, memberById }) {
  const [collapsedRoots, setCollapsedRoots] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('planr_pb_collapsed') || '[]')); } catch { return new Set(); }
  });
  // Drag-state per row so the indicator line only renders on the row
  // currently hovered.
  const [dragId, setDragId] = useState(null);
  const [drop, setDrop] = useState(null); // {id, position: 'before'|'after'}
  const toggleRoot = (rid) => {
    setCollapsedRoots(prev => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid); else next.add(rid);
      try { localStorage.setItem('planr_pb_collapsed', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const roots = useMemo(() => tree.filter(r => !r.id.includes('.')), [tree]);
  const isLeaf = (id) => !tree.some(o => o.id !== id && o.id.startsWith(id + '.'));
  const teamColor = (id) => teams.find(tm => tm.id === id)?.color || 'var(--tx3)';

  // Build scheduler-effective order: sort scheduled by startD, then by id.
  // Map taskId → rank for soft "scheduler position" rendering next to the
  // planner's intended position.
  const schedRank = useMemo(() => {
    const sorted = [...(scheduled || [])]
      .filter(s => s.startD)
      .sort((a, b) => +new Date(a.startD) - +new Date(b.startD) || a.id.localeCompare(b.id));
    const m = new Map();
    sorted.forEach((s, i) => m.set(s.treeId || s.id, i + 1));
    return m;
  }, [scheduled]);

  const horizonSet = horizonIds instanceof Set ? horizonIds
    : Array.isArray(horizonIds) ? new Set(horizonIds) : null;
  const diffSet = diffChangedIds instanceof Set ? diffChangedIds
    : Array.isArray(diffChangedIds) ? new Set(diffChangedIds) : null;

  // Pick which roots show: explicit root-filter pin, otherwise all that
  // contain at least one leaf passing the team/person/horizon/diff filter.
  const visibleRoots = useMemo(() => {
    return roots.filter(root => {
      if (rootFilter && rootFilter !== root.id && !rootFilter.startsWith(root.id + '.')) return false;
      const leaves = tree.filter(r => isLeaf(r.id) && (r.id === root.id || r.id.startsWith(root.id + '.')));
      const matching = leaves.filter(r => {
        if (teamFilter && (r.team || '') !== teamFilter) return false;
        if (personFilter && !(r.assign || []).includes(personFilter)) return false;
        if (horizonSet && !horizonSet.has(r.id)) return false;
        if (diffSet && !diffSet.has(r.id)) return false;
        return true;
      });
      return matching.length > 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, tree, rootFilter, teamFilter, personFilter, horizonIds, diffChangedIds]);

  if (!visibleRoots.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)', fontSize: 12 }}>
        {t('q.projectsEmpty')}
      </div>
    );
  }

  return (
    <>
      {visibleRoots.map(root => {
        const collapsed = collapsedRoots.has(root.id);
        const allLeaves = tree
          .filter(r => isLeaf(r.id) && (r.id === root.id || r.id.startsWith(root.id + '.')))
          .filter(r => {
            if (teamFilter && (r.team || '') !== teamFilter) return false;
            if (personFilter && !(r.assign || []).includes(personFilter)) return false;
            if (horizonSet && !horizonSet.has(r.id)) return false;
            if (diffSet && !diffSet.has(r.id)) return false;
            return true;
          });
        // Sort by planner intent: prio → seq → id.
        const ordered = [...allLeaves].sort((a, b) =>
          (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id));
        // Map id → manual index for dep-conflict detection.
        const idxOf = new Map(ordered.map((r, i) => [r.id, i]));
        const rootColor = teamColor(root.team);
        const rootDone = allLeaves.filter(r => r.status === 'done').length;
        const rootTotal = allLeaves.length;
        return (
          <div key={root.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${rootColor}` }}>
              <button className="btn btn-ghost btn-xs" onClick={() => toggleRoot(root.id)} style={{ padding: '0 4px', fontSize: 11 }}>{collapsed ? '▶' : '▼'}</button>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: rootColor, fontSize: 12 }}>{root.id}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{root.name}</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{rootDone}/{rootTotal}</span>
            </div>
            {!collapsed && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ordered.map((node, i) => {
                  const sch = (scheduled || []).find(s => (s.treeId || s.id) === node.id);
                  const assignee = sch?.person || (node.assign || []).map(id => memberById[id]?.name || id).join(', ');
                  const schDate = sch?.startD;
                  const schPos = schedRank.get(node.id);
                  // Dep-conflict: any dep that lands at a HIGHER index than
                  // this row → dep is queued AFTER, scheduler will swap.
                  const conflicts = (node.deps || []).filter(d => {
                    const di = idxOf.get(d);
                    return typeof di === 'number' && di > i;
                  });
                  const hasConflict = conflicts.length > 0;
                  return (
                    <li key={node.id}
                      draggable
                      onDragStart={e => { setDragId(node.id); try { e.dataTransfer.setData('text/plain', node.id); e.dataTransfer.effectAllowed = 'move'; } catch {} }}
                      onDragEnd={() => { setDragId(null); setDrop(null); }}
                      onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const before = (e.clientY - rect.top) < rect.height / 2;
                        setDrop({ id: node.id, position: before ? 'before' : 'after' });
                      }}
                      onDragLeave={() => setDrop(prev => prev?.id === node.id ? null : prev)}
                      onDrop={e => {
                        e.preventDefault();
                        const sourceId = (() => { try { return e.dataTransfer.getData('text/plain') || dragId; } catch { return dragId; } })();
                        setDragId(null); setDrop(null);
                        if (!sourceId || sourceId === node.id) return;
                        const tgtIdx = ordered.findIndex(x => x.id === node.id);
                        if (tgtIdx < 0) return;
                        const above = drop?.id === node.id && drop.position === 'before';
                        const srcIdx = ordered.findIndex(x => x.id === sourceId);
                        let newIdx = above ? tgtIdx : tgtIdx + 1;
                        if (srcIdx >= 0 && srcIdx < newIdx) newIdx -= 1;
                        onReorderInProject?.(sourceId, newIdx);
                      }}
                      style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: '28px 70px 1fr 140px 120px 50px 60px 30px 30px 30px 30px',
                        alignItems: 'center', gap: 6,
                        padding: '5px 8px',
                        borderBottom: '1px solid var(--b)',
                        background: hasConflict ? 'rgba(239,68,68,.06)' : 'transparent',
                        cursor: 'grab',
                        opacity: dragId === node.id ? 0.4 : 1,
                        fontSize: 11,
                      }}>
                      {drop?.id === node.id && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          [drop.position === 'before' ? 'top' : 'bottom']: -1,
                          height: 2,
                          background: 'var(--ac)',
                          boxShadow: '0 0 6px var(--ac)',
                          pointerEvents: 'none',
                          zIndex: 2,
                        }} />
                      )}
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 10 }}>{i + 1}.</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(node.id)}>{node.id}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
                        textDecoration: node.status === 'done' ? 'line-through' : 'none',
                        opacity: node.status === 'done' ? 0.6 : 1 }}
                        onClick={() => onOpenItem?.(node.id)}>
                        {node.name}
                        {hasConflict && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--re)', fontWeight: 700 }}
                          data-htip={t('q.depConflictTip', conflicts.join(', '))}>⚠ {t('q.depConflict')}</span>}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee || '—'}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
                        {schDate ? (schDate instanceof Date ? schDate.toISOString().slice(0,10) : String(schDate).slice(0,10)) : '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right' }}>
                        {node.best ? `${node.best}d` : '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: schPos && schPos !== i + 1 ? 'var(--am)' : 'var(--tx3)' }}
                        data-htip={schPos ? t('q.schedPosTip', schPos) : ''}>
                        {schPos ? `#${schPos}` : ''}
                      </span>
                      <button className="btn btn-ghost btn-xs" data-htip={t('q.first')} disabled={i === 0}
                        onClick={() => onReorderInProject?.(node.id, 'first')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>⤒</button>
                      <button className="btn btn-ghost btn-xs" data-htip={t('q.earlier')} disabled={i === 0}
                        onClick={() => onReorderInProject?.(node.id, 'earlier')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                      <button className="btn btn-ghost btn-xs" data-htip={t('q.later')} disabled={i === ordered.length - 1}
                        onClick={() => onReorderInProject?.(node.id, 'later')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === ordered.length - 1 ? 0.3 : 1 }}>▼</button>
                      <button className="btn btn-ghost btn-xs" data-htip={t('q.last')} disabled={i === ordered.length - 1}
                        onClick={() => onReorderInProject?.(node.id, 'last')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === ordered.length - 1 ? 0.3 : 1 }}>⤓</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

export const QueuesView = memo(QueuesViewImpl);
