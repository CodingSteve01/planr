import { Fragment, useMemo, useRef, useState, memo } from 'react';
import { PersonChip } from '../shared/PersonChip.jsx';
import { useT } from '../../i18n.jsx';
import { StatusIcon } from '../shared/StatusIcon.jsx';
import { Icon } from '../shared/Icon.jsx';
import { leafNodes, treeIndex } from '../../utils/scheduler.js';
import { assigneeOf, queueOwnerOf, reconcileQueue } from '../../utils/personQueue.js';
import { queueBlockers } from '../../utils/queueBlockers.js';
import { fieldPatchForKey } from '../../utils/treeEdit.js';
import { withKey } from '../../utils/shortcuts.js';
import { statusChangePatch } from '../../utils/completion.js';
import { setDragBadge } from '../../utils/dragBadge.js';
import { SelectionActionBar } from '../shared/SelectionActionBar.jsx';

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
function WorkOrderViewImpl({ tree, members, teams, scheduled = [], sizes = [], rootFilter = '', teamFilter = '', personFilter = '', personQueues, onQueueReorder, onQueueReset, onTaskUpdate, onFullEdit, onOpenBulkEdit }) {
  const { t } = useT();
  const [cursor, setCursor] = useState(null);
  // The tree's selection model, because it is the same act: click, shift for a
  // range, cmd for a pick. A move then takes the whole selection in one step —
  // five items moved one at a time is five keystrokes and a different result,
  // because each would step over the next.
  const [picked, setPicked] = useState(() => new Set());
  // Where a ⇧↑/⇧↓ run started and where it has got to — the tree's model:
  // the anchor stays, the far end moves.
  const extendRef = useRef(null);
  const viewRef = useRef(null);
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
  // What is in the hand (one row, or the whole selection) and where it would
  // land: before or after a row, by which half of it the pointer is over —
  // "before" alone left no way to drop anything at the end of a queue.
  const [dragIds, setDragIds] = useState(null);
  const [drop, setDrop] = useState(null);   // { id, position } | null

  const allById = useMemo(() => new Map(tree.map(n => [n.id, n])), [tree]);
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
      const node = allById.get(parts.slice(0, i).join('.'));
      if (node) out.push(node.name || node.id);
    }
    return out;
  };

  const leafIds = useMemo(() => new Set(leafNodes(tree).map(l => l.id)), [tree]);
  // Dropped work, or work under something dropped, is not going to be done
  // and has no place in an order of work — same as finished work. The tree
  // keeps showing it, struck through, so it can be taken back.
  const droppedIds = useMemo(() => treeIndex(tree).droppedIds, [tree]);
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
      if (node.status === 'done' || droppedIds.has(node.id)) continue;
      const owner = queueOwnerOf(node);
      if (!owner) continue;
      if (!out.has(owner)) out.set(owner, []);
      out.get(owner).push(node);
    }
    return out;
  }, [tree, leafIds, droppedIds]);

  const shown = useMemo(() => {
    const out = new Map();
    for (const node of tree) {
      if (!leafIds.has(node.id)) continue;
      // An order is a statement about work still to be done; a finished task
      // has no ordering decision left in it. Out of the list rather than
      // sorted to the bottom, where it would still be scrolled past. It stays
      // in the STORED queue, though — a task finishing must not quietly
      // rewrite a decision somebody made.
      if (node.status === 'done' || droppedIds.has(node.id)) continue;
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
  }, [tree, leafIds, droppedIds, rootFilter, teamFilter, personFilter, doerById]);

  const ownerLabel = owner => {
    if (owner.startsWith('team:')) {
      const team = teams.find(tm => tm.id === owner.slice(5));
      return { name: team?.name || owner.slice(5), color: team?.color, team: true };
    }
    const member = members.find(m => m.id === owner);
    const team = member ? teams.find(tm => tm.id === member.team) : null;
    return { name: member?.name || owner, color: team?.color, team: false };
  };

  // The keyboard is the tree's (docs/principles.md, principle 5): ↑/↓ walk
  // the rows — across owners too, the list reads top to bottom — ⇧↑/⇧↓
  // extend the pick within the owner's list, Home/End jump to its ends, Esc
  // drops the pick, Enter opens the item. Reordering keeps ⌥↑/⌥↓ and gains
  // the tree's ⌘⇧↑/⌘⇧↓, so the same hand does the same thing in both views.
  const rowEls = () => [...(viewRef.current?.querySelectorAll('[data-queue-row]') || [])];
  const focusRow = id => {
    const el = rowEls().find(r => r.getAttribute('data-queue-row') === id);
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: 'nearest' });
  };
  const ownerRows = id => {
    const el = rowEls().find(r => r.getAttribute('data-queue-row') === id);
    const table = el?.closest('table');
    return table ? [...table.querySelectorAll('[data-queue-row]')].map(r => r.getAttribute('data-queue-row')) : [];
  };
  const navigate = (e, id) => {
    if (e.key === 'Escape') {
      if (!picked.size) return false;
      setPicked(new Set()); extendRef.current = null; return true;
    }
    if (e.key === 'Home' || e.key === 'End') {
      const list = ownerRows(id);
      const target = e.key === 'Home' ? list[0] : list[list.length - 1];
      if (!target) return false;
      setPicked(new Set()); extendRef.current = null; setCursor(target); focusRow(target); return true;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    if (e.shiftKey) {
      const list = ownerRows(id);
      const anchor = extendRef.current?.anchor && list.includes(extendRef.current.anchor) ? extendRef.current.anchor : id;
      const from = extendRef.current?.end && list.includes(extendRef.current.end) ? extendRef.current.end : id;
      const end = list[Math.max(0, Math.min(list.length - 1, list.indexOf(from) + dir))];
      const a = list.indexOf(anchor), b = list.indexOf(end);
      setPicked(new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1)));
      extendRef.current = { anchor, end };
      setCursor(end);
      focusRow(end);
      return true;
    }
    const all = rowEls().map(r => r.getAttribute('data-queue-row'));
    const next = all[all.indexOf(id) + dir];
    if (!next) return true;   // at an end: swallow it, the page must not scroll instead
    setPicked(new Set()); extendRef.current = null;
    setCursor(next);
    focusRow(next);
    return true;
  };

  // The rows a field key acts on: the whole selection when the row is part
  // of it, as in the tree. Space on five picked rows used to change one.
  const actOn = node => (picked.size > 1 && picked.has(node.id)
    ? [...picked].map(id => allById.get(id)).filter(Boolean)
    : [node]);

  const onKeyDown = (e, node) => {
    // ⌘A — this owner's whole queue. A queue is one person's (or team's)
    // order, and a move only makes sense inside one, so "all" means all of
    // this list rather than every row on the page.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      e.stopPropagation();
      const list = ownerRows(node.id);
      if (list.length) { setPicked(new Set(list)); extendRef.current = null; }
      return;
    }
    // ⌘⇧↑/⌘⇧↓ — the tree's reorder chord, same as ⌥↑/⌥↓ here.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onQueueReorder?.(movingFrom(node.id), e.key === 'ArrowDown' ? 'down' : 'up');
      return;
    }
    const bare = !e.ctrlKey && !e.metaKey;
    if (!bare) return;
    if (!e.altKey && navigate(e, node.id)) { e.preventDefault(); return; }
    if (!e.altKey && e.key === 'Enter') { e.preventDefault(); onFullEdit?.(node); return; }
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
    if (!patch) return;
    e.preventDefault();
    // Each row takes the key on its own terms — Space steps every row from
    // where IT is — which is what the tree does with a selection.
    for (const target of actOn(node)) {
      const own = target.id === node.id ? patch
        : e.key === ' ' || e.key === 'Spacebar' ? fieldPatchForKey(target, ' ', sizes, { back: e.shiftKey })
          : fieldPatchForKey(target, ['1', '2', '3', '4'].includes(e.key) ? e.key : String(e.key).toUpperCase(), sizes);
      if (own) onTaskUpdate?.({ ...target, ...own });
    }
  };

  // An owner is worth a block when they hold more than one thing; what is
  // SHOWN of it is the filters' business.
  const owners = [...shown.entries()].filter(([owner]) => (byOwner.get(owner) || []).length > 1);
  if (!owners.length) {
    return <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <p className="helper" style={{ fontSize: 12 }}>{t('wo.empty')}</p>
    </div>;
  }

  return <div ref={viewRef} style={{ maxWidth: 960, margin: '0 auto' }}>
    <p className="helper" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>
      {withKey(t('wo.help'), 'ganttReorder')}
    </p>
    {owners.map(([owner, rows]) => {
      const label = ownerLabel(owner);
      const ordered = reconcileQueue(personQueues?.[owner], rows.map(n => n.id));
      const byId = new Map(rows.map(n => [n.id, n]));
      // What this order cannot decide. Resolved against the WHOLE plan, not
      // this owner's rows — most of what holds somebody up is somebody else's
      // work, and a lookup limited to their own queue would report none of it.
      const held = queueBlockers(ordered, allById);
      // One list per person, and nothing between the rows.
      //
      // It used to break each queue into package headers — "settle the big
      // blocks, then the details" — and that was a good instinct applied in
      // the wrong place. The tree is where the big blocks are settled, and it
      // is settled there ALREADY: this list arrives in the order the tree
      // gives it. What this view is for is the one thing the tree cannot say,
      // which is "this task from B, before those three from A" — and a
      // hierarchy header is precisely the thing that puts that move behind a
      // wall. A queue crossing packages had its rows split into blocks that
      // could not interleave, which is the shape it exists to express.
      //
      // So: no headers. Dragging a row past anything is one move, whatever
      // package or project either of them belongs to. The multi-select still
      // moves a block, which covers "take these five with me" without
      // deciding in advance which five that is.
      const sorted = !!personQueues?.[owner];
      return <div key={owner} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--b)' }}>
          <span style={{ width: 8, height: 8, borderRadius: label.team ? 2 : 8, background: label.color || 'var(--ac)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{label.name}</span>
          {label.team && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{t('wo.unassigned')}</span>}
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>{ordered.length}</span>
          {(() => {
            // Multi-select is the tree's, and just as invisible here as it was
            // there: the rows highlight and nothing says a move takes all of
            // them. Only shown from two — one picked row is just the cursor.
            const mine = ordered.filter(id => picked.has(id)).length;
            if (mine < 2) return null;
            return <span data-testid="wo-picked" data-htip={t('wo.pickedTip')}
              style={{ fontSize: 10, color: 'var(--ac)', background: 'var(--ac2)', border: '1px solid var(--ac)', borderRadius: 3, padding: '0 5px', fontWeight: 600 }}>
              {t('wo.picked', mine)}
            </span>;
          })()}
          {sorted && <>
            <span style={{ fontSize: 10, color: 'var(--tx2)', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 3, padding: '0 5px' }}
              data-htip={t('g.queueSortedTip')}>{t('g.queueSorted')}</span>
            <button type="button" className="btn btn-ghost btn-xs" data-testid={`queue-reset-${owner}`}
              data-htip={t('g.queueReset')} onClick={() => onQueueReset?.(owner)}
              style={{ padding: '1px 6px', fontSize: 11 }}>{t('g.queueReset')}</button>
          </>}
        </div>
        <table className="tree-tbl">
          <tbody>
            {ordered.map((id, i) => {
              const node = byId.get(id);
              if (!node) return null;
              const prevId = i > 0 ? ordered[i - 1] : null;
              const prog = node.progress ?? (node.status === 'done' ? 100 : node.status === 'wip' ? 50 : 0);
              return <Fragment key={id}>
                <tr
                data-queue-row={id}
                data-status={node.status || 'open'}
                data-prio={node.prio || ''}
                className={`tr${cursor === id || picked.has(id) ? ' sel' : ''}`}
                tabIndex={0}
                onFocus={() => { if (!picked.size) setCursor(id); }}
                onClick={e => selectRow(id, e, ordered)}
                // A single click is the cursor — multi-select and the keys
                // hang off it — so opening the editor takes the second one.
                // E and the button at the end of the row do the same.
                onDoubleClick={e => {
                  if (e.target.closest?.('button')) return;
                  setCursor(id); onFullEdit?.(node);
                }}
                onKeyDown={e => onKeyDown(e, node)}
                draggable
                onDragStart={e => {
                  const moving = [].concat(movingFrom(id));
                  setDragIds(moving);
                  e.dataTransfer?.setData?.('text/plain', moving.join(','));
                  if (moving.length > 1) setDragBadge(e, t('tv.dragRows', moving.length));
                }}
                onDragOver={e => {
                  if (!dragIds || dragIds.includes(id)) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position = rect.height && e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
                  setDrop(cur => (cur?.id === id && cur.position === position ? cur : { id, position }));
                }}
                onDragLeave={() => setDrop(cur => (cur?.id === id ? null : cur))}
                onDragEnd={() => { setDragIds(null); setDrop(null); }}
                onDrop={e => {
                  e.preventDefault();
                  const moving = dragIds || (e.dataTransfer?.getData?.('text/plain') || '').split(',').filter(Boolean);
                  const position = drop?.id === id ? drop.position : 'before';
                  setDragIds(null); setDrop(null);
                  if (moving.length && !moving.includes(id)) onQueueReorder?.(moving.length > 1 ? moving : moving[0], { [position]: id });
                }}
                data-dragging={dragIds?.includes(id) ? 'true' : undefined}
                data-drop={drop?.id === id ? drop.position : undefined}
                style={{ outline: 'none' }}>
                <td style={{ width: 44, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}
                  data-htip={t('wo.dragTip')}>
                  <span className="tv-drag-handle"><Icon name="grip" size={11} /></span>{i + 1}
                </td>
                <td style={{ width: 20, verticalAlign: 'middle' }}><StatusIcon status={node.status || 'open'} progress={prog} /></td>
                <td data-col="who" className="nc" style={{ width: 90, verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
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
                  {/* Where it lives, in the two parts that answer it: which
                      PROJECT — which is the question this list is for, since
                      it is the one place two of them interleave — and which
                      package. The middle of the chain went to the tooltip.
                      Printing the whole path on every row was tolerable while
                      a package header carried it once and the row echoed it;
                      with the header gone it is simply the same four names on
                      forty rows, and the names of the tasks disappeared into
                      it. */}
                  {(() => {
                    const chain = pathOf(id);
                    const project = chain[0] || '';
                    const parent = chain.length > 1 ? chain[chain.length - 1] : '';
                    // …and only where it CHANGES. Forty rows from one package
                    // printed the same two names forty times and the task
                    // names drowned in them. Saying it once and then only when
                    // it moves makes the crossings visible, which is the thing
                    // this list is for: you can see where one project's work
                    // gives way to another's.
                    const prevChain = prevId ? pathOf(prevId) : [];
                    const sameProject = project && prevChain[0] === project;
                    const sameParent = sameProject && parent
                      && (prevChain.length > 1 ? prevChain[prevChain.length - 1] : '') === parent;
                    // Always both, and the CHANGE is what stands out. Printing
                    // them only where they changed made the list quiet but
                    // left most rows without a parent at all — reported as
                    // "I don't always see the parents". A row read on its
                    // own has to say where it lives; the crossings from one
                    // project or package to the next are carried by weight
                    // and colour instead of by absence.
                    const mark = changed => changed ? { color: 'var(--tx2)', fontWeight: 600 } : undefined;
                    return <div data-queue-path data-htip={[id, ...chain].join(' › ')}
                      style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'var(--mono)' }}>{id}</span>
                      {project && <><span style={{ color: 'var(--b3)' }}> · </span><span data-queue-project data-changed={sameProject ? undefined : 'true'} style={mark(!sameProject)}>{project}</span></>}
                      {parent && <><span style={{ color: 'var(--b3)' }}> › </span><span data-queue-parent data-changed={sameParent ? undefined : 'true'} style={mark(!sameParent)}>{parent}</span></>}
                    </div>;
                  })()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div data-queue-title className="tn" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name || id}</div>
                  {/* What this order cannot decide.
                      A queue says "this one first"; a dependency says "not
                      before that one", and the schedule honours the second
                      ahead of the first. This list never mentioned it, so a
                      row could sit at the top of a queue and wait for
                      something four rows below it with nothing to show for
                      it. Two marks, because two different things are true:
                      it waits for work still outstanding, and — louder — the
                      work it waits for is BELOW it here, so the order as
                      arranged cannot happen. */}
                  {(() => {
                    const wait = held.get(id);
                    if (!wait) return null;
                    const late = wait.later.length > 0;
                    const names = wait.waitsFor
                      .map(d => { const n = allById.get(d); return n?.name ? `${d} · ${n.name}` : d; });
                    return <span data-queue-blocked={late ? 'order' : 'dep'}
                      data-htip={`${late ? t('wo.blockedLaterTip') : t('wo.blockedTip')}\n${names.join('\n')}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                        fontSize: 10, fontFamily: 'var(--mono)', borderRadius: 3, padding: '0 4px',
                        color: late ? 'var(--st-risk)' : 'var(--tx3)',
                        background: late ? 'var(--st-risk-soft)' : 'var(--bg3)',
                        border: `1px solid ${late ? 'var(--st-risk)' : 'var(--b2)'}`,
                      }}>
                      <Icon name="link" size={9} />{wait.waitsFor[0]}{wait.waitsFor.length > 1 ? ` +${wait.waitsFor.length - 1}` : ''}
                    </span>;
                  })()}
                </div>
                </td>
                <td style={{ width: 60, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', textAlign: 'right', verticalAlign: 'middle' }}>
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
    {/* The tree's selection bar, for the same reason it has one: a picked
        block is something you then want to DO something with, and keys
        alone are invisible. Moves act on the block's owner queue. */}
    <SelectionActionBar count={picked.size > 1 ? picked.size : 0}
      onClear={() => { setPicked(new Set()); extendRef.current = null; }}
      testId="wo-selection-actionbar">
      {onOpenBulkEdit && <button type="button" className="sab-assign-trigger"
        onClick={() => onOpenBulkEdit([...picked])} data-htip={t('g.bulkEditTip')} data-testid="wo-bulk-edit">
        <span className="sab-icon"><Icon name="checkSquare" size={13} /></span>
        <span>{t('g.bulkEdit')}</span>
      </button>}
      <span className="sab-divider" />
      <button type="button" className="btn btn-sec" data-testid="wo-move-first"
        onClick={() => onQueueReorder?.([...picked], 'first')}>{t('g.ctxRunFirst')}</button>
      <button type="button" className="btn btn-sec" data-testid="wo-move-last"
        onClick={() => onQueueReorder?.([...picked], 'last')}>{t('g.ctxRunLast')}</button>
      <span className="sab-divider" />
      {[['open', t('tv.statusOpen')], ['wip', t('tv.statusWip')], ['done', t('tv.statusDone')]].map(([status, label]) => (
        <button key={status} type="button" className="btn btn-sec" data-testid={`wo-status-${status}`}
          data-htip={t('tv.bulkStatusTip', label)}
          onClick={() => {
            for (const id of picked) {
              const node = allById.get(id);
              if (node && node.status !== status) onTaskUpdate?.({ ...node, ...statusChangePatch(node, status) });
            }
          }}>{label}</button>
      ))}
    </SelectionActionBar>
  </div>;
}

export const WorkOrderView = memo(WorkOrderViewImpl);
