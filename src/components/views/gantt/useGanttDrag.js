import { useRef, useEffect } from 'react';
import { iso, addD, localDate } from '../../../utils/date.js';
import { fixedDurationDays } from '../../../utils/scheduler.js';

// Pointer interaction on the Gantt body: moving and resizing bars, panning the
// timeline, project-group reordering, rubber-band selection, link dragging, and
// the Escape key that cancels any of them.
export function useGanttDrag({
  dismissTooltip,
  iMap,
  onReorderSibling,
  compact,
  rowIdx,
  drag,
  setDrag,
  dDelta,
  setDDelta,
  bR,
  hR,
  lR,
  setSelectRect,
  selectedIds,
  setSelectedIds,
  selectedTaskIds,
  scheduledWorkDaysOf,
  resizePxPerDay,
  showDays,
  DPX,
  WPX,
  RH,
  linkDrag,
  setLinkDrag,
  visibleRows,
  taskBarRectForRow,
  onSeqUpdate,
  weeks,
  vacByPerson,
  wdSet,
  onExtendViewStart,
  pinnedLineKey,
  setPinnedLineKey,
  onAddDep,
}) {
  // dragRef mirrors the latest drag state synchronously so onMU can read it
  // without waiting for React's batched state commit — same pattern as NetGraph's
  // zoomRef/panRef that fixed the stale-closure zoom-jump bug.
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const selectRef = useRef(null);
  const justDraggedRef = useRef(false);

  function onBMD(e, row) {
    e.stopPropagation();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const node = row.node || iMap[s.treeId || s.id];
    // Done bars represent reality, not plan. Drag-move shifts the whole
    // completed window (completedStart + completedEnd) so the user can record
    // "this actually happened later than I logged". Pin is meaningless for
    // done work and stays disabled.
    const isDoneTask = row.type === 'task' && s.status === 'done' && !!node && !s._unestimated && !s.isHandoff;
    const d = {
      id: s.id,
      treeId: s.treeId || s.id,
      startWi: s.startWi,
      endWi: s.endWi,
      startD: s.startD,
      ox: e.clientX,
      oy: e.clientY,
      seq: s.seq,
      team: s.team,
      prio: s.prio,
      // Assignees needed for vacation-aware snap on drop.
      assign: s.assign || [],
      personId: s.personId,
      rowType: row.type,
      canPin: row.type === 'task' && s.status !== 'done' && !s._unestimated,
      canMoveDone: isDoneTask,
      origCompletedStart: isDoneTask ? node?.completedStart || node?.completedAt || node?.completedEnd || iso(s.startD) : null,
      origCompletedEnd: isDoneTask ? node?.completedEnd || node?.completedAt || node?.completedStart || iso(s.endD) : null,
      // Not in compact: there, vertical position says which LANE a bar is in
      // — what else runs at the same time — and not where it sits in the
      // order. Dragging up or down would look like a reorder and mean
      // something the lanes cannot show. The gesture stays in the tree and
      // the work order, where the order lives.
      reorderMode: onReorderSibling && !compact ? 'tree' : null,
      lockVertical: row.type === 'summary',
      rowIdx: (rowIdx[s.id] ?? [])[0] ?? 0,
      lastDy: 0,
      isReorder: false,
      kind: 'move',
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }
  function clearTimelinePan() {
    if (!panRef.current) return;
    panRef.current = null;
    if (bR.current) bR.current.style.cursor = '';
    if (hR.current) hR.current.style.cursor = '';
  }
  function onTimelinePanStart(e) {
    if (e.button !== 0 && e.button !== 1) return;
    if (!bR.current) return;
    const interactive = e.target?.closest?.('.gbar,[data-link-target],button,a,input,select,textarea,[role="button"]');
    if (interactive) return;
    e.preventDefault();
    dismissTooltip(true);
    const isBody = e.currentTarget === bR.current;
    const selectOnBody = isBody && e.button === 0 && !e.altKey;
    if (selectOnBody) {
      const rect = bR.current.getBoundingClientRect();
      const x = bR.current.scrollLeft + e.clientX - rect.left;
      const y = bR.current.scrollTop + e.clientY - rect.top;
      selectRef.current = { x1: x, y1: y, x2: x, y2: y, append: e.metaKey || e.ctrlKey };
      setSelectRect(selectRef.current);
      if (!e.metaKey && !e.ctrlKey) setSelectedIds(new Set());
      return;
    }
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: bR.current.scrollLeft,
      top: bR.current.scrollTop,
    };
    bR.current.style.cursor = 'grabbing';
    if (hR.current) hR.current.style.cursor = 'grabbing';
  }
  function onResizeEndMD(e, row) {
    e.stopPropagation();
    e.preventDefault();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const node = row.node || iMap[s.treeId || s.id];
    if (!node || row.type !== 'task' || s._unestimated || s.isHandoff) return;
    // Done bar resize edits reality (completedEnd shifts). Open/wip bars edit
    // the planned fixed duration. Different drop targets, same handle UX.
    const isDoneTask = s.status === 'done';
    const currentDays = fixedDurationDays(node) || scheduledWorkDaysOf(s);
    const d = {
      id: s.id,
      treeId: s.treeId || s.id,
      ox: e.clientX,
      oy: e.clientY,
      baseDurationDays: Math.max(1, Math.ceil(currentDays || 1)),
      minDelta: 1 - Math.max(1, Math.ceil(currentDays || 1)),
      rowType: row.type,
      canPin: false,
      reorderMode: null,
      lockVertical: false,
      lastDy: 0,
      isReorder: false,
      kind: isDoneTask ? 'resizeEndDone' : 'resizeEnd',
      origCompletedStart: isDoneTask ? node?.completedStart || node?.completedAt || node?.completedEnd || iso(s.startD) : null,
      origCompletedEnd: isDoneTask ? node?.completedEnd || node?.completedAt || node?.completedStart || iso(s.endD) : null,
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }

  // Left-edge resize: only meaningful for done bars (extends/shrinks the
  // recorded start date). Open/wip bars take their start from the scheduler
  // and have no editable left edge.
  function onResizeStartDoneMD(e, row) {
    e.stopPropagation();
    e.preventDefault();
    dismissTooltip(true);
    justDraggedRef.current = false;
    const s = row.s;
    const node = row.node || iMap[s.treeId || s.id];
    if (!node || row.type !== 'task' || s.status !== 'done' || s._unestimated || s.isHandoff) return;
    const currentDays = Math.max(1, Math.ceil(scheduledWorkDaysOf(s) || 1));
    const d = {
      id: s.id,
      treeId: s.treeId || s.id,
      ox: e.clientX,
      oy: e.clientY,
      baseDurationDays: currentDays,
      rowType: row.type,
      canPin: false,
      reorderMode: null,
      lockVertical: false,
      lastDy: 0,
      isReorder: false,
      kind: 'resizeStartDone',
      origCompletedStart: node?.completedStart || node?.completedAt || node?.completedEnd || iso(s.startD),
      origCompletedEnd: node?.completedEnd || node?.completedAt || node?.completedStart || iso(s.endD),
    };
    dragRef.current = d;
    setDrag(d);
    setDDelta(0);
  }
  function onMM(e) {
    if (selectRef.current && bR.current) {
      const rect = bR.current.getBoundingClientRect();
      selectRef.current = {
        ...selectRef.current,
        x2: bR.current.scrollLeft + e.clientX - rect.left,
        y2: bR.current.scrollTop + e.clientY - rect.top,
      };
      setSelectRect(selectRef.current);
      return;
    }
    if (panRef.current && bR.current) {
      const p = panRef.current;
      bR.current.scrollLeft = Math.max(0, p.left - (e.clientX - p.x));
      bR.current.scrollTop = Math.max(0, p.top - (e.clientY - p.y));
      if (hR.current) hR.current.scrollLeft = bR.current.scrollLeft;
      if (lR.current) lR.current.scrollTop = bR.current.scrollTop;
      return;
    }
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.ox;
      const dy = e.clientY - d.oy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) justDraggedRef.current = true;
      // Once in reorder mode, STAY there (sticky) — prevents mode-flipping when the
      // mouse wobbles horizontally during a vertical drag.
      const enterReorder = !!d.reorderMode && !d.isReorder && Math.abs(dy) > 10 && (d.lockVertical || Math.abs(dy) > Math.abs(dx));
      if (d.isReorder || enterReorder) {
        d.isReorder = true;
        d.lastDy = dy;
        setDrag({ ...d }); // re-render for cursor + visual feedback
      } else if (d.kind === 'resizeEnd') {
        const delta = Math.round(dx / resizePxPerDay);
        setDDelta(Math.max(d.minDelta || 0, delta));
      } else if (d.kind === 'resizeEndDone' || d.kind === 'resizeStartDone') {
        // Done-bar resize uses the same px-per-unit as the move handlers
        // (day mode → days, week mode → weeks). Drop handler multiplies
        // by 7 in week mode and clamps against start/end + today.
        const stepPx = showDays ? DPX : WPX;
        setDDelta(Math.round(dx / stepPx));
      } else if (d.canPin || d.canMoveDone) {
        // canPin = open/wip bars (drag = set pinnedStart).
        // canMoveDone = done bars (drag = shift completedStart/End block).
        const stepPx = showDays ? DPX : WPX;
        setDDelta(Math.round(dx / stepPx));
      }
    }
    if (linkDrag) {
      setLinkDrag(ld => (ld ? { ...ld, mouseX: e.clientX, mouseY: e.clientY } : null));
      // Auto-scroll the Gantt body when cursor approaches the viewport edges
      // so users can drop links onto bars that live off-screen. Step scales
      // with how close the cursor is to the edge.
      const el = bR.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge = 80;
        const maxStep = 28;
        if (e.clientX < rect.left + edge) {
          const t = (rect.left + edge - e.clientX) / edge;
          el.scrollLeft -= Math.ceil(maxStep * Math.min(1, t));
        } else if (e.clientX > rect.right - edge) {
          const t = (e.clientX - (rect.right - edge)) / edge;
          el.scrollLeft += Math.ceil(maxStep * Math.min(1, t));
        }
        if (e.clientY < rect.top + edge) {
          const t = (rect.top + edge - e.clientY) / edge;
          el.scrollTop -= Math.ceil(maxStep * Math.min(1, t));
        } else if (e.clientY > rect.bottom - edge) {
          const t = (e.clientY - (rect.bottom - edge)) / edge;
          el.scrollTop += Math.ceil(maxStep * Math.min(1, t));
        }
      }
    }
  }
  function onMU() {
    if (selectRef.current) {
      const rect = selectRef.current;
      const x1 = Math.min(rect.x1, rect.x2);
      const x2 = Math.max(rect.x1, rect.x2);
      const y1 = Math.min(rect.y1, rect.y2);
      const y2 = Math.max(rect.y1, rect.y2);
      const picked = rect.append ? new Set(selectedIds) : new Set();
      visibleRows.forEach((row, index) => {
        const bar = taskBarRectForRow(row, index);
        if (!bar || bar.isSummary) return;
        const intersects = bar.left <= x2 && bar.left + bar.width >= x1 && bar.top <= y2 && bar.top + bar.height >= y1;
        if (intersects) picked.add(bar.id);
      });
      selectRef.current = null;
      setSelectRect(null);
      setSelectedIds(picked);
      return;
    }
    clearTimelinePan();
    const d = dragRef.current;
    if (d) {
      if (d.kind === 'resizeEnd') {
        if (dDelta !== 0) {
          onSeqUpdate?.(d.treeId || d.id, { fixedDurationDays: Math.max(1, Math.ceil((d.baseDurationDays || 1) + dDelta)) });
        }
      } else if (d.kind === 'resizeEndDone' && dDelta !== 0 && d.origCompletedEnd) {
        // Shift completedEnd by N days. Clamp at today (no future-completion)
        // and at completedStart (can't shrink past the recorded start).
        const newEnd = addD(localDate(d.origCompletedEnd), showDays ? dDelta : dDelta * 7);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startCap = d.origCompletedStart ? localDate(d.origCompletedStart) : null;
        let clamped = newEnd > today ? today : newEnd;
        if (startCap && clamped < startCap) clamped = startCap;
        onSeqUpdate?.(d.treeId || d.id, { completedEnd: iso(clamped), completedAt: iso(clamped) });
      } else if (d.kind === 'resizeStartDone' && dDelta !== 0 && d.origCompletedStart) {
        // Shift completedStart. Floor at very old date, cap at completedEnd
        // (can't push start past the recorded end).
        const newStart = addD(localDate(d.origCompletedStart), showDays ? dDelta : dDelta * 7);
        const endCap = d.origCompletedEnd ? localDate(d.origCompletedEnd) : null;
        const clamped = endCap && newStart > endCap ? endCap : newStart;
        onSeqUpdate?.(d.treeId || d.id, { completedStart: iso(clamped) });
      } else if (d.kind === 'move' && d.canMoveDone && dDelta !== 0 && d.origCompletedStart && d.origCompletedEnd) {
        // Move the whole done window as a block: shift start and end by the
        // same delta. Cap end at today so reality stays in the past.
        const shift = showDays ? dDelta : dDelta * 7;
        const newStart = addD(localDate(d.origCompletedStart), shift);
        const newEnd = addD(localDate(d.origCompletedEnd), shift);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cappedEnd = newEnd > today ? today : newEnd;
        const span = +localDate(d.origCompletedEnd) - +localDate(d.origCompletedStart);
        let cappedStart = newStart;
        if (cappedEnd !== newEnd) cappedStart = new Date(+cappedEnd - span);
        onSeqUpdate?.(d.treeId || d.id, {
          completedStart: iso(cappedStart),
          completedEnd: iso(cappedEnd),
          completedAt: iso(cappedEnd),
        });
      } else if (d.isReorder && d.lastDy) {
        // Dragging a bar up or down moves the item in the TREE, whichever view
        // the drag started in. The resource view used to write a `seq` value
        // instead, plus a "match the neighbour's priority so the scheduler
        // honours it" patch — a second ordering system that existed only
        // because the scheduler ignored the tree. It follows the tree now
        // (utils/displayOrder.js, `treeOrderRank`), so there is one order, and
        // dragging a bar and pressing ⌥↓ on the row do the same thing.
        const rowShift = Math.max(1, Math.abs(Math.round(d.lastDy / RH)));
        const dir = d.lastDy > 0 ? (rowShift > 1 ? 'last' : 'down') : rowShift > 1 ? 'first' : 'up';
        const ids = selectedIds.has(d.id) && selectedTaskIds.length > 1 ? selectedTaskIds : [d.treeId || d.id];
        // Moving down, start from the bottom of the selection: otherwise the
        // first move puts the top item past the second, and the second move
        // puts it back.
        const ordered = dir === 'down' || dir === 'last' ? [...ids].reverse() : ids;
        ordered.forEach(id => onReorderSibling?.(id, dir));
      } else if (d.canPin && dDelta !== 0) {
        // Day mode: offset from the bar's actual start date (not the week's Monday).
        // Week mode: offset from the start week's Monday (bar is week-aligned).
        const baseDate = showDays && d.startD ? new Date(d.startD) : new Date(weeks[d.startWi].mon);
        let targetDate = showDays ? addD(baseDate, dDelta) : addD(baseDate, dDelta * 7);
        // Snap to nearest valid pin date: skip weekends, holidays, and any
        // vacation day for this task's assignees. Direction follows the drag.
        // Fall back to opposite direction if we walk off the planning horizon.
        if (showDays) {
          const dir = dDelta > 0 ? 1 : -1;
          const horizonStart = weeks[0]?.mon;
          const horizonEnd = weeks[weeks.length - 1]?.mon;
          // Build vacation-day set for this bar's assignees so the pin doesn't
          // land on a known vacation. Holidays already drop out of wdsByTime.
          const assignees = [...new Set([...(d.assign || []), ...(d.personId ? [d.personId] : [])])];
          const vacBlocks = assignees.flatMap(id => vacByPerson[id] || []);
          const isVacation = date => {
            const t = date.getTime();
            return vacBlocks.some(v => {
              const f = new Date(v.from).getTime();
              const u = new Date(v.to).getTime();
              return t >= f && t <= u;
            });
          };
          const isWorkable = date => {
            if (!wdSet.has(date.getDay())) return false;
            // Holiday check via global workable-day set built from weeks[].wds.
            const ws = weeks.find(w => date >= w.mon && date <= addD(w.mon, 6));
            if (!ws) return wdSet.has(date.getDay()); // outside horizon: weekday-only
            return ws.wds.some(d2 => d2.getTime() === date.getTime());
          };
          let steps = 0;
          while ((!isWorkable(targetDate) || isVacation(targetDate)) && steps < 60) {
            targetDate = addD(targetDate, dir);
            steps++;
          }
          // If we walked off-horizon trying primary direction, try the other.
          if (steps >= 60 || (horizonStart && targetDate < addD(horizonStart, -30)) || (horizonEnd && targetDate > addD(horizonEnd, 30))) {
            targetDate = showDays ? addD(baseDate, dDelta) : addD(baseDate, dDelta * 7);
            const opp = -dir;
            steps = 0;
            while ((!isWorkable(targetDate) || isVacation(targetDate)) && steps < 60) {
              targetDate = addD(targetDate, opp);
              steps++;
            }
          }
        }
        const planStartDate = weeks[0]?.mon;
        if (planStartDate && targetDate < planStartDate) {
          onExtendViewStart?.(iso(targetDate));
        }
        onSeqUpdate(d.id, { pinnedStart: iso(targetDate) });
      }
      dragRef.current = null;
      setDrag(null);
      setDDelta(0);
    }
    if (linkDrag) {
      dismissTooltip(true);
      setLinkDrag(null);
    }
  }
  // Escape key cancels any in-progress drag or link operation.
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        clearTimelinePan();
        if (selectRef.current) {
          selectRef.current = null;
          setSelectRect(null);
        }
        if (selectedIds.size) setSelectedIds(new Set());
        if (dragRef.current || drag) {
          dragRef.current = null;
          setDrag(null);
          setDDelta(0);
          justDraggedRef.current = false;
        }
        if (linkDrag) setLinkDrag(null);
        if (pinnedLineKey) setPinnedLineKey(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  // Start a link-drag from a bar's right-edge handle
  function onLinkStart(e, fromId) {
    e.stopPropagation();
    e.preventDefault();
    dismissTooltip(true);
    setLinkDrag({ fromId, mouseX: e.clientX, mouseY: e.clientY });
  }
  // Complete a link-drag onto a target bar. Two fan-out modes use the current
  // multi-selection — they're mirrors of each other:
  //   • drag SOURCE is selected → every selected id becomes a predecessor of
  //     the drop target ("link these to that").
  //   • drop TARGET is selected → the dragged source becomes a predecessor of
  //     every selected id ("link this to all of those").
  //   • both / neither → plain 1→1.
  function onLinkDrop(targetId) {
    if (!linkDrag || linkDrag.fromId === targetId) {
      setLinkDrag(null);
      return;
    }
    const fromInSel = selectedIds.has(linkDrag.fromId);
    const targetInSel = selectedIds.has(targetId);
    if (fromInSel) {
      const sources = [linkDrag.fromId, ...selectedTaskIds.filter(id => id !== linkDrag.fromId && id !== targetId)];
      sources.forEach(fromId => {
        if (fromId && fromId !== targetId) onAddDep?.(targetId, fromId);
      });
    } else if (targetInSel) {
      const targets = [targetId, ...selectedTaskIds.filter(id => id !== targetId && id !== linkDrag.fromId)];
      targets.forEach(t => {
        if (t && t !== linkDrag.fromId) onAddDep?.(t, linkDrag.fromId);
      });
    } else {
      onAddDep?.(targetId, linkDrag.fromId);
    }
    setLinkDrag(null);
  }
  useEffect(() => {
    if (!linkDrag) return undefined;
    const finishLinkDrag = e => {
      const hitElements =
        typeof document.elementsFromPoint === 'function'
          ? document.elementsFromPoint(e.clientX, e.clientY)
          : [document.elementFromPoint(e.clientX, e.clientY)];
      const targetEl = hitElements.map(el => el?.closest?.('[data-link-target]')).find(Boolean);
      const targetId = targetEl?.getAttribute?.('data-link-target');
      if (targetId) {
        dismissTooltip(true);
        onLinkDrop(targetId);
        return;
      }
      setLinkDrag(null);
    };
    window.addEventListener('mouseup', finishLinkDrag, true);
    return () => window.removeEventListener('mouseup', finishLinkDrag, true);
  }, [linkDrag]);
  return {
    onBMD,
    onTimelinePanStart,
    onResizeEndMD,
    onResizeStartDoneMD,
    onMM,
    onMU,
    onLinkStart,
    onLinkDrop,
    dragRef,
    selectRef,
    justDraggedRef,
    clearTimelinePan,
  };
}
