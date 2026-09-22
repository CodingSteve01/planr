import { useMemo, useState, memo } from 'react';
import { useT } from '../../i18n.jsx';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { leafNodes } from '../../utils/scheduler.js';
import { queueOwnerOf, reconcileQueue } from '../../utils/personQueue.js';
import { fieldPatchForKey } from '../../utils/treeEdit.js';
import { withKey } from '../../utils/shortcuts.js';

// In which order does who work.
//
// This lived as a section under Resources for about an hour, and it was the
// wrong shelf: Resources is where people, teams and holidays are administered,
// and "in which order does who work" is planning. It was filed under admin
// because that is where the person records happened to live, which is a reason
// about the code rather than about the question.
//
// The rows are the tree's rows on purpose. Deciding an order and adjusting
// what you are ordering is one sitting — you move a task up, notice it is
// still estimated at three days, and fix that without going anywhere. So the
// same keys do the same things here: Space cycles status, 1–4 priority,
// S M L X size, E opens the full editor, ⌥↑↓ moves. The only key that means
// something different is ⌥↑↓, and only because the list is different.
//
// The owner of an order is the person on the item, or the team it sits with
// when nobody is (utils/personQueue.js, `queueOwnerOf`) — a plan's early items
// mostly have a team and nobody, and those are exactly the ones where the
// question matters most.
function WorkOrderViewImpl({ tree, members, teams, sizes = [], personQueues, onQueueReorder, onQueueReset, onTaskUpdate, onFullEdit }) {
  const { t } = useT();
  const [cursor, setCursor] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);

  const byId = useMemo(() => new Map(tree.map(n => [n.id, n])), [tree]);
  // Where an item lives, as the item dialog writes it. A title alone is not
  // enough to tell two tasks apart — "Page: Wochenpflege" means one thing
  // under Abrechnung and another under Kundenportal — and the id is a label
  // for the path rather than the path itself.
  const pathOf = id => {
    const parts = id.split('.');
    const out = [];
    for (let i = 1; i < parts.length; i++) {
      const node = byId.get(parts.slice(0, i).join('.'));
      if (node) out.push(node.name || node.id);
    }
    return out;
  };

  const leafIds = useMemo(() => new Set(leafNodes(tree).map(l => l.id)), [tree]);
  const byOwner = useMemo(() => {
    const out = new Map();
    for (const node of tree) {
      if (!leafIds.has(node.id)) continue;
      const owner = queueOwnerOf(node);
      if (!owner) continue;
      if (!out.has(owner)) out.set(owner, []);
      out.get(owner).push(node);
    }
    return out;
  }, [tree, leafIds]);

  const ownerLabel = owner => {
    if (owner.startsWith('team:')) {
      const team = teams.find(tm => tm.id === owner.slice(5));
      return { name: team?.name || owner.slice(5), color: team?.color, team: true };
    }
    const member = members.find(m => m.id === owner);
    const team = member ? teams.find(tm => tm.id === member.team) : null;
    return { name: member?.name || owner, color: team?.color, team: false };
  };

  const onKeyDown = (e, node) => {
    const bare = !e.ctrlKey && !e.metaKey;
    if (!bare) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const dir = e.shiftKey
        ? (e.key === 'ArrowDown' ? 'last' : 'first')
        : (e.key === 'ArrowDown' ? 'down' : 'up');
      onQueueReorder?.(node.id, dir);
      return;
    }
    if (e.altKey) return;
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); onFullEdit?.(node); return; }
    const patch = e.key === ' ' || e.key === 'Spacebar'
      ? fieldPatchForKey(node, ' ', sizes, { back: e.shiftKey })
      : ['1', '2', '3', '4'].includes(e.key) ? fieldPatchForKey(node, e.key, sizes)
        : ['S', 'M', 'L', 'X'].includes(String(e.key).toUpperCase()) && /^[a-zA-Z]$/.test(e.key)
          ? fieldPatchForKey(node, String(e.key).toUpperCase(), sizes) : null;
    if (patch) { e.preventDefault(); onTaskUpdate?.({ ...node, ...patch }); }
  };

  const owners = [...byOwner.entries()].filter(([, rows]) => rows.length > 1);
  if (!owners.length) {
    return <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <p className="helper" style={{ fontSize: 12 }}>{t('wo.empty')}</p>
    </div>;
  }

  return <div style={{ maxWidth: 960, margin: '0 auto' }}>
    <p className="helper" style={{ fontSize: 11, marginTop: 0, marginBottom: 14 }}>
      {withKey(t('wo.help'), 'reorder')}
    </p>
    {owners.map(([owner, rows]) => {
      const label = ownerLabel(owner);
      const ordered = reconcileQueue(personQueues?.[owner], rows.map(n => n.id));
      const byId = new Map(rows.map(n => [n.id, n]));
      const sorted = !!personQueues?.[owner];
      return <div key={owner} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--b)' }}>
          <span style={{ width: 8, height: 8, borderRadius: label.team ? 2 : 8, background: label.color || 'var(--ac)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{label.name}</span>
          {label.team && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{t('wo.unassigned')}</span>}
          <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{ordered.length}</span>
          {sorted && <>
            <span style={{ fontSize: 9, color: 'var(--tx2)', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 3, padding: '0 5px' }}
              data-htip={t('g.queueSortedTip')}>{t('g.queueSorted')}</span>
            <button type="button" className="btn btn-ghost btn-xs" data-testid={`queue-reset-${owner}`}
              data-htip={t('g.queueReset')} onClick={() => onQueueReset?.(owner)}
              style={{ padding: '1px 6px', fontSize: 10 }}>{t('g.queueReset')}</button>
          </>}
        </div>
        <table className="tree-tbl">
          <tbody>
            {ordered.map((id, i) => {
              const node = byId.get(id);
              if (!node) return null;
              const prog = node.progress ?? (node.status === 'done' ? 100 : node.status === 'wip' ? 50 : 0);
              return <tr key={id}
                data-queue-row={id}
                data-status={node.status || 'open'}
                data-prio={node.prio || ''}
                className={`tr${cursor === id ? ' sel' : ''}`}
                tabIndex={0}
                onFocus={() => setCursor(id)}
                onClick={() => setCursor(id)}
                onKeyDown={e => onKeyDown(e, node)}
                draggable
                onDragStart={e => { setDragId(id); e.dataTransfer?.setData?.('text/plain', id); }}
                onDragOver={e => { if (dragId && dragId !== id) { e.preventDefault(); setDropId(id); } }}
                onDragLeave={() => setDropId(cur => (cur === id ? null : cur))}
                onDragEnd={() => { setDragId(null); setDropId(null); }}
                onDrop={e => {
                  e.preventDefault();
                  const moved = dragId || e.dataTransfer?.getData?.('text/plain');
                  setDragId(null); setDropId(null);
                  if (moved && moved !== id) onQueueReorder?.(moved, { before: id });
                }}
                style={{ outline: 'none', opacity: dragId === id ? .4 : 1,
                  boxShadow: dropId === id ? 'inset 0 2px 0 0 var(--ac)' : undefined }}>
                <td style={{ width: 30, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right', cursor: 'grab', verticalAlign: 'middle' }}
                  data-htip={t('wo.dragTip')}>{i + 1}</td>
                <td style={{ width: 20, verticalAlign: 'middle' }}><StatusIcon status={node.status || 'open'} progress={prog} /></td>
                <td style={{ padding: '3px 6px' }}>
                  <div data-queue-path style={{ fontSize: 9, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'var(--mono)' }}>{id}</span>
                    {pathOf(id).map((name, pi) => <span key={pi}>
                      <span style={{ color: 'var(--b3)' }}> › </span>{name}
                    </span>)}
                  </div>
                  <div data-queue-title className="tn" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name || id}</div>
                </td>
                <td style={{ width: 60, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right', verticalAlign: 'middle' }}>
                  {node.best ? `${node.best}T` : ''}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>;
    })}
  </div>;
}

export const WorkOrderView = memo(WorkOrderViewImpl);
