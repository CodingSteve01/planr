import { Fragment, useMemo, useState, memo } from 'react';
import { PersonChip } from '../shared/PersonChip.jsx';
import { useT } from '../../i18n.jsx';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { Icon } from '../shared/Icon.jsx';
import { leafNodes } from '../../utils/scheduler.js';
import { assigneeOf, queueOwnerOf, reconcileQueue } from '../../utils/personQueue.js';
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
function WorkOrderViewImpl({ tree, members, teams, scheduled = [], sizes = [], rootFilter = '', teamFilter = '', personFilter = '', personQueues, onQueueReorder, onQueueReset, onTaskUpdate, onFullEdit }) {
  const { t } = useT();
  const [cursor, setCursor] = useState(null);
  // The tree's selection model, because it is the same act: click, shift for a
  // range, cmd for a pick. A move then takes the whole selection in one step —
  // five items moved one at a time is five keystrokes and a different result,
  // because each would step over the next.
  const [picked, setPicked] = useState(() => new Set());
  const selectRow = (id, e, visible) => {
    const ctrlLike = !!(e?.ctrlKey || e?.metaKey);
    if (e?.shiftKey && cursor) {
      const a = visible.indexOf(cursor), b = visible.indexOf(id);
      if (a >= 0 && b >= 0) setPicked(new Set(visible.slice(Math.min(a, b), Math.max(a, b) + 1)));
    } else if (ctrlLike) {
      setPicked(prev => {
        const next = new Set(prev.size ? prev : (cursor ? [cursor] : []));
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      setCursor(id);
    } else {
      setPicked(new Set());
      setCursor(id);
    }
  };
  const movingFrom = id => (picked.size > 1 && picked.has(id) ? [...picked] : id);
  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);

  const byId = useMemo(() => new Map(tree.map(n => [n.id, n])), [tree]);
  // Who will actually do it. An item with a team and nobody on it belongs to
  // the TEAM's queue, and the schedule then picks whoever comes free first —
  // so the row says who that turned out to be, marked as the schedule's answer
  // rather than yours.
  //
  // The order cannot live on that person: the auto-assignment is an output of
  // the schedule and the queue is an input to it, so reordering can change who
  // comes free first, and blocks keyed on it would reshuffle themselves while
  // you drag. The team queue is the same decision without the circle.
  const doerById = useMemo(() => {
    const out = new Map();
    for (const row of scheduled) {
      if (row.isHandoff || !row.personId) continue;
      const id = row.treeId || row.id;
      if (!out.has(id)) out.set(id, { id: row.personId, name: row.personShort || row.person, auto: !!row.autoAssigned });
    }
    return out;
  }, [scheduled]);
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
  // The same three filters every other working surface carries. A list of
  // everything everybody has is the one place you most want to narrow to one
  // team — and it narrows what is SHOWN, never the order that is stored: a
  // queue is the plan's, not the filter's (principle 3).
  // Two lists on purpose. `byOwner` is everything an owner holds — it decides
  // whether there is an order to speak of at all, and it is what the queue is
  // reconciled against. `shown` is what the filters left. Deciding "has this
  // owner enough to order?" on the FILTERED list was wrong: narrowing to one
  // person often leaves them a single row, and the whole view went blank.
  const byOwner = useMemo(() => {
    const out = new Map();
    for (const node of tree) {
      if (!leafIds.has(node.id)) continue;
      if (node.status === 'done') continue;
      const owner = queueOwnerOf(node);
      if (!owner) continue;
      if (!out.has(owner)) out.set(owner, []);
      out.get(owner).push(node);
    }
    return out;
  }, [tree, leafIds]);

  const shown = useMemo(() => {
    const out = new Map();
    for (const node of tree) {
      if (!leafIds.has(node.id)) continue;
      // An order is a statement about work still to be done; a finished task
      // has no ordering decision left in it. Out of the list rather than
      // sorted to the bottom, where it would still be scrolled past. It stays
      // in the STORED queue, though — a task finishing must not quietly
      // rewrite a decision somebody made.
      if (node.status === 'done') continue;
      if (rootFilter && node.id.split('.')[0] !== rootFilter) continue;
      if (teamFilter && (node.team || '') !== teamFilter) continue;
      // Who will actually do it, not only who was hand-assigned. Filtering to
      // somebody used to show an empty screen when nothing was assigned yet —
      // which is most of a plan early on, and exactly when reading it per
      // resource matters most.
      if (personFilter && (doerById.get(node.id)?.id || assigneeOf(node)) !== personFilter) continue;
      const owner = queueOwnerOf(node);
      if (!owner) continue;
      if (!out.has(owner)) out.set(owner, []);
      out.get(owner).push(node);
    }
    return out;
  }, [tree, leafIds, rootFilter, teamFilter, personFilter, doerById]);

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
      onQueueReorder?.(movingFrom(node.id), dir);
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

  // An owner is worth a block when they hold more than one thing; what is
  // SHOWN of it is the filters' business.
  const owners = [...shown.entries()].filter(([owner]) => (byOwner.get(owner) || []).length > 1);
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
      // Settle the big blocks, then the details — which is how anybody plans,
      // and what a flat list of forty tasks turns into a sorting exercise.
      // Each package the person has work in gets a header where its first item
      // sits; moving the header moves the package's items as one block, the
      // same move a multi-selection makes. Inside it the items order as
      // before.
      const pkgOf = id => id.split('.').slice(0, -1).join('.');
      const groups = [];
      for (const id of ordered) {
        const pkg = pkgOf(id);
        if (pkg && !groups.some(g => g.pkg === pkg)) groups.push({ pkg, first: id });
      }
      // A package whose items are scattered still owns all of them: the block
      // move closes the gaps, so the header acts on every one.
      const idsOfPkg = pkg => ordered.filter(id => pkgOf(id) === pkg);
      // "One place earlier" for a package means past the package above it, not
      // past one of its items — otherwise moving a five-item package up ten
      // times is how you get it past two neighbours.
      const moveGroup = (pkg, dir) => {
        const at = groups.findIndex(g => g.pkg === pkg);
        if (at < 0) return;
        const ids = idsOfPkg(pkg);
        if (dir === 'first' || dir === 'last') { onQueueReorder?.(ids, dir); return; }
        if (dir === 'up') {
          if (at === 0) return;
          onQueueReorder?.(ids, { before: groups[at - 1].first });
          return;
        }
        if (at >= groups.length - 1) { onQueueReorder?.(ids, 'last'); return; }
        const after = groups[at + 2];
        onQueueReorder?.(ids, after ? { before: after.first } : 'last');
      };
      const sorted = !!personQueues?.[owner];
      return <div key={owner} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--b)' }}>
          <span style={{ width: 8, height: 8, borderRadius: label.team ? 2 : 8, background: label.color || 'var(--ac)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{label.name}</span>
          {label.team && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{t('wo.unassigned')}</span>}
          <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{ordered.length}</span>
          {(() => {
            // Multi-select is the tree's, and just as invisible here as it was
            // there: the rows highlight and nothing says a move takes all of
            // them. Only shown from two — one picked row is just the cursor.
            const mine = ordered.filter(id => picked.has(id)).length;
            if (mine < 2) return null;
            return <span data-testid="wo-picked" data-htip={t('wo.pickedTip')}
              style={{ fontSize: 9, color: 'var(--ac)', background: 'var(--ac2)', border: '1px solid var(--ac)', borderRadius: 3, padding: '0 5px', fontWeight: 600 }}>
              {t('wo.picked', mine)}
            </span>;
          })()}
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
              const pkg = id.split('.').slice(0, -1).join('.');
              const header = groups.find(g => g.pkg === pkg && g.first === id);
              const prog = node.progress ?? (node.status === 'done' ? 100 : node.status === 'wip' ? 50 : 0);
              return <Fragment key={id}>
                {header && <tr
                  data-queue-group={pkg}
                  tabIndex={0}
                  onKeyDown={e => {
                    if (!e.altKey || e.ctrlKey || e.metaKey) return;
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    const dir = e.shiftKey
                      ? (e.key === 'ArrowDown' ? 'last' : 'first')
                      : (e.key === 'ArrowDown' ? 'down' : 'up');
                    moveGroup(pkg, dir);
                  }}
                  onClick={() => { setPicked(new Set(idsOfPkg(pkg))); setCursor(id); }}
                  style={{ outline: 'none', cursor: 'pointer' }}>
                  <td colSpan={7} style={{ padding: '6px 6px 2px', fontSize: 10, color: 'var(--tx3)', borderTop: '1px solid var(--b)' }}
                    data-htip={withKey(t('wo.groupTip'), 'reorder')}>
                    <span style={{ fontFamily: 'var(--mono)' }}>{pkg}</span>
                    {pathOf(id).map((name, pi) => <span key={pi}>
                      <span style={{ color: 'var(--b3)' }}> › </span>{name}
                    </span>)}
                    <span style={{ marginLeft: 6, fontFamily: 'var(--mono)' }}>({idsOfPkg(pkg).length})</span>
                  </td>
                </tr>}
                <tr
                data-queue-row={id}
                data-status={node.status || 'open'}
                data-prio={node.prio || ''}
                className={`tr${cursor === id || picked.has(id) ? ' sel' : ''}`}
                tabIndex={0}
                onFocus={() => { if (!picked.size) setCursor(id); }}
                onClick={e => selectRow(id, e, ordered)}
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
                  if (moved && moved !== id) onQueueReorder?.(movingFrom(moved), { before: id });
                }}
                data-dragging={dragId === id ? 'true' : undefined}
                data-drop={dropId === id ? 'before' : undefined}
                style={{ outline: 'none' }}>
                <td style={{ width: 44, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}
                  data-htip={t('wo.dragTip')}>
                  <span className="tv-drag-handle"><Icon name="grip" size={11} /></span>{i + 1}
                </td>
                <td style={{ width: 20, verticalAlign: 'middle' }}><StatusIcon status={node.status || 'open'} progress={prog} /></td>
                <td data-col="who" className="nc" style={{ width: 90, verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const doer = doerById.get(id);
                    if (!doer) return null;
                    // Same chip as the tree, the Gantt and the Planning tab.
                    // This view invented the `~name` vocabulary that all of
                    // them now share; it may as well use the component.
                    return <span data-queue-who data-auto={doer.auto ? 'true' : undefined}>
                      <PersonChip auto={doer.auto} short={doer.name}
                        title={doer.auto ? t('wo.autoWho') : t('wo.fixedWho')} />
                    </span>;
                  })()}
                </td>
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
                <td style={{ width: 28, verticalAlign: 'middle' }}>
                  {/* `E` did this from the first version, which is fine once
                      you know and invisible until then — the tree carries the
                      same icon for the same reason. */}
                  <button type="button" className="tv-act-btn" data-testid={`wo-edit-${id}`}
                    data-htip={withKey(t('nm.fullEditTip'), 'fullEdit')}
                    onClick={e => { e.stopPropagation(); setCursor(id); onFullEdit?.(node); }}
                    onDragStart={e => e.preventDefault()}
                    aria-label={t('nm.fullEditTip')}
                  ><Icon name="maximize" size={12} /></button>
                </td>
              </tr>
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>;
    })}
  </div>;
}

export const WorkOrderView = memo(WorkOrderViewImpl);
