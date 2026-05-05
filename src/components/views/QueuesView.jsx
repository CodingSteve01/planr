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
import { useMemo, memo, useState, useEffect } from 'react';
import { iso } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';

function QueuesViewImpl({ tree, members, teams, scheduled, teamFilter = '', personFilter = '', onOpenItem, onReorderInQueue }) {
  const { t } = useT();
  const [hoverId, setHoverId] = useState(null);
  // {id, position}: drop indicator. position = 'before' or 'after' relative
  // to the row id. Updated on dragOver, cleared on dragLeave / dragEnd.
  const [drop, setDrop] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [localMember, setLocalMember] = useState(() => {
    try { return localStorage.getItem('planr_q_member') || ''; } catch { return ''; }
  });
  const [showOffboarded, setShowOffboarded] = useState(false);
  useEffect(() => { try { localStorage.setItem('planr_q_member', localMember); } catch { /* ignore */ } }, [localMember]);

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
    (scheduled || []).forEach(s => {
      // Skip handoff-shadow rows (tree row already represents the work; the
      // shadow is a render artifact).
      if (s.isHandoff) return;
      const node = treeById[s.treeId || s.id];
      if (!node || node.status === 'done' || !node.best) return;
      // Prefer scheduler's chosen person, fall back to first explicit assign,
      // then to a team-slot key.
      let key;
      if (s.personId) key = 'p:' + s.personId;
      else if ((node.assign || []).length) key = 'p:' + node.assign[0];
      else key = 't:' + (node.team || '');
      (map[key] ||= []).push({ s, node });
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
  }, [scheduled, treeById]);

  // Build the list the view renders. Topbar filters cascade: personFilter
  // pins one queue (and one only); teamFilter pins one team's members.
  // Local-only `localMember` further narrows when the topbar is unset.
  const visibleQueues = useMemo(() => {
    const list = [];
    const showPerson = personFilter || localMember;
    visibleMembers.forEach(m => {
      if (showPerson && m.id !== showPerson) return;
      if (teamFilter && (m.team || '') !== teamFilter) return;
      const tasks = queues['p:' + m.id] || [];
      list.push({ kind: 'person', key: 'p:' + m.id, label: m.name, member: m, tasks });
    });
    // Team slots: tasks without an assignee. Hidden when person filter is
    // pinned (the user's looking at one specific person).
    if (!showPerson) {
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
  }, [queues, visibleMembers, personFilter, teamFilter, localMember, teamById, t]);

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
        <div style={{ width: 220 }}>
          <SearchSelect
            value={localMember}
            options={visibleMembers.map(m => ({ id: m.id, label: m.name || m.id }))}
            onSelect={setLocalMember}
            placeholder={t('tv.allPeople')}
            allowEmpty emptyLabel={t('tv.allPeople')}
          />
        </div>
        {localMember && (
          <button className="btn btn-ghost btn-xs" onClick={() => setLocalMember('')}
            data-htip={t('rv.clearFilters')}
            style={{ padding: '2px 7px', fontSize: 11 }}>×</button>
        )}
        {offboardedCount > 0 && (
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

      {visibleQueues.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)', fontSize: 12 }}>
          {t('q.empty')}
        </div>
      )}

      {visibleQueues.map(q => {
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
                {q.tasks.map(({ s, node }, i) => {
                  const isAuto = s.autoAssigned && !(node.assign || []).length;
                  const dueRed = s.dueOverdue || (node.due && node.due < todayIso && node.status !== 'done');
                  return (
                    <li key={node.id}
                      draggable
                      onDragStart={e => onDragStart(e, node.id)}
                      onDragEnd={onDragEnd}
                      onDragOver={e => onDragOver(e, node.id)}
                      onDragLeave={() => setDrop(prev => prev?.id === node.id ? null : prev)}
                      onDrop={e => onDrop(e, node.id, q.tasks)}
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
                        cursor: 'grab',
                        opacity: dragId === node.id ? 0.4 : 1,
                        fontSize: 11,
                      }}>
                      {/* Drop indicator: 2px accent line above or below this
                          row depending on the cursor's vertical position. */}
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
                      <span style={{ color: 'var(--tx3)', cursor: 'grab', userSelect: 'none' }} data-htip={t('q.dragTip')}>≡</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(node.id)}>{node.id}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(node.id)}>
                        {node.name}
                        {isAuto && <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--am)', fontWeight: 600 }}>AUTO</span>}
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
                        disabled={i === 0}
                        onClick={() => onReorderInQueue?.(node.id, 'first')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>⤒</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.earlier')}
                        disabled={i === 0}
                        onClick={() => onReorderInQueue?.(node.id, 'earlier')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.later')}
                        disabled={i === q.tasks.length - 1}
                        onClick={() => onReorderInQueue?.(node.id, 'later')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === q.tasks.length - 1 ? 0.3 : 1 }}>▼</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.last')}
                        disabled={i === q.tasks.length - 1}
                        onClick={() => onReorderInQueue?.(node.id, 'last')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === q.tasks.length - 1 ? 0.3 : 1 }}>⤓</button>
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

export const QueuesView = memo(QueuesViewImpl);
