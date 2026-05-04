// Queues — per-person pending-task list with simple reorder controls.
//
// The scheduler honours `seq` as a soft tiebreaker within the same priority.
// This view exposes that lever directly: each row gets ▲ (earlier) / ▼ (later)
// / ⤒ (first) / ⤓ (last) buttons plus HTML5 drag-drop within the same person's
// list. Clicking a row opens the regular item dialog. Done tasks are hidden;
// pending tasks are sorted in the same order the scheduler will run them.
//
// Filters: respects the global topbar `personFilter` + `teamFilter`. When no
// person filter is set, every person + every team-slot queue is rendered.
import { useMemo, memo, useState } from 'react';
import { leafNodes, pt } from '../../utils/scheduler.js';
import { iso } from '../../utils/date.js';
import { useT } from '../../i18n.jsx';

function queueKeyOf(r, members) {
  if ((r.assign || []).length) return [...r.assign].sort().join(',');
  const tm = pt(r.team);
  const tM = (members || []).filter(m => pt(m.team) === tm);
  if (tM.length === 1) return tM[0].id;
  return `team:${r.team || ''}`;
}

function QueuesViewImpl({ tree, members, teams, scheduled, teamFilter = '', personFilter = '', onOpenItem, onReorderInQueue }) {
  const { t } = useT();
  const [hoverId, setHoverId] = useState(null);

  const sMap = useMemo(() => Object.fromEntries((scheduled || []).map(s => [s.id, s])), [scheduled]);
  const memberById = useMemo(() => Object.fromEntries((members || []).map(m => [m.id, m])), [members]);
  const teamById = useMemo(() => Object.fromEntries((teams || []).map(tm => [tm.id, tm])), [teams]);

  // Group leaf tasks by their queue key. Same logic the scheduler uses, so
  // ▲▼ buttons move work between adjacent tasks the scheduler actually
  // considers neighbours.
  const queues = useMemo(() => {
    const all = leafNodes(tree).filter(r => r.status !== 'done' && r.best > 0);
    const map = {};
    all.forEach(r => {
      const k = queueKeyOf(r, members);
      (map[k] ||= []).push(r);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => {
      return (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id);
    }));
    return map;
  }, [tree, members]);

  // Visible queues: every member becomes a queue header (even if empty), plus
  // any unassigned-team-slot keys. Filters narrow the set.
  const visibleQueues = useMemo(() => {
    const list = [];
    (members || []).forEach(m => {
      if (personFilter && m.id !== personFilter) return;
      if (teamFilter && (m.team || '') !== teamFilter) return;
      const directKey = m.id; // assigned + single-team-member fallback
      const tasksDirect = queues[directKey] || [];
      // Multi-assigned tasks live under sorted-keys like "M1,M2" — fold every
      // such key into each member's queue. The user reordering one of them
      // affects all assignees identically (same seq is shared).
      const multiKeys = Object.keys(queues).filter(k => k !== directKey && k.split(',').includes(m.id));
      const tasksMulti = multiKeys.flatMap(k => queues[k]);
      const tasks = [...tasksDirect, ...tasksMulti].sort((a, b) =>
        (a.prio || 4) - (b.prio || 4) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id));
      list.push({ kind: 'person', key: 'p:' + m.id, label: m.name, member: m, tasks });
    });
    // Team-slot queues (key starts with "team:") — tasks not pinned to anyone,
    // teams with >1 member where the scheduler has to pick.
    Object.keys(queues).filter(k => k.startsWith('team:')).forEach(k => {
      const teamId = k.slice(5);
      if (teamFilter && teamId !== teamFilter) return;
      if (personFilter) return; // team queues hidden when person filter pins one
      const team = teamById[teamId];
      list.push({ kind: 'team', key: 't:' + teamId, label: (team?.name || t('noTeam')) + ' (' + t('rv.unassigned') + ')', team, tasks: queues[k] });
    });
    return list;
  }, [queues, members, personFilter, teamFilter, teamById, t]);

  const fmtDate = d => d ? (d instanceof Date ? iso(d) : d) : '—';

  const onDragStart = (e, taskId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };
  const onDragOver = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = (e, targetTaskId, queueTasks) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetTaskId) return;
    const srcIdx = queueTasks.findIndex(r => r.id === sourceId);
    const tgtIdx = queueTasks.findIndex(r => r.id === targetTaskId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    onReorderInQueue?.(sourceId, tgtIdx);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <p className="helper" style={{ marginBottom: 14 }}>{t('q.intro')}</p>

      {visibleQueues.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)', fontSize: 12 }}>
          {t('q.empty')}
        </div>
      )}

      {visibleQueues.map(q => {
        const color = q.member ? (teamById[q.member.team]?.color || 'var(--ac)') : (q.team?.color || 'var(--tx3)');
        return (
          <div key={q.key} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${color}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{q.label}</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{q.tasks.length}</span>
            </div>
            {q.tasks.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic', padding: '4px 8px' }}>{t('q.queueEmpty')}</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {q.tasks.map((r, i) => {
                  const sc = sMap[r.id];
                  return (
                    <li key={r.id}
                      draggable
                      onDragStart={e => onDragStart(e, r.id)}
                      onDragOver={onDragOver}
                      onDrop={e => onDrop(e, r.id, q.tasks)}
                      onMouseEnter={() => setHoverId(r.id)}
                      onMouseLeave={() => setHoverId(prev => (prev === r.id ? null : prev))}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '14px 70px 1fr 130px 90px 30px 30px 30px 30px',
                        alignItems: 'center', gap: 6,
                        padding: '5px 8px',
                        borderBottom: '1px solid var(--b)',
                        background: hoverId === r.id ? 'var(--bg2)' : 'transparent',
                        cursor: 'grab',
                        fontSize: 11,
                      }}>
                      <span style={{ color: 'var(--tx3)', cursor: 'grab', userSelect: 'none' }} data-htip={t('q.dragTip')}>≡</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--ac)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(r.id)}>{r.id}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        onClick={() => onOpenItem?.(r.id)}>{r.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
                        {sc?.startD ? `${fmtDate(sc.startD)} → ${fmtDate(sc.endD)}` : '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right' }}>
                        {sc?.effort ? `${sc.effort.toFixed(1)}d` : `${(r.best || 0)}d`}
                      </span>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.first')}
                        disabled={i === 0}
                        onClick={() => onReorderInQueue?.(r.id, 'first')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>⤒</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.earlier')}
                        disabled={i === 0}
                        onClick={() => onReorderInQueue?.(r.id, 'earlier')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.later')}
                        disabled={i === q.tasks.length - 1}
                        onClick={() => onReorderInQueue?.(r.id, 'later')}
                        style={{ padding: '0 4px', fontSize: 11, opacity: i === q.tasks.length - 1 ? 0.3 : 1 }}>▼</button>
                      <button className="btn btn-ghost btn-xs"
                        data-htip={t('q.last')}
                        disabled={i === q.tasks.length - 1}
                        onClick={() => onReorderInQueue?.(r.id, 'last')}
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
