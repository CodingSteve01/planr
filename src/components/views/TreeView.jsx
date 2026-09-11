import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { hasChildren, isLeafNode, leafNodes, pt } from '../../utils/scheduler.js';
import { getLineColor } from '../../utils/roadmap.js';
import { progressPctLabel } from '../../utils/progress.js';
import { statusChangePatch } from '../../utils/completion.js';
import { currentPhase, setPhaseCursor, statusFromPhases, phaseProgress } from '../../utils/phases.js';
import { GT } from '../../constants.js';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
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
import { sortTree, filterCollapsedRows, indentTarget, outdentTarget, moveStep, visibleSiblingTarget, visibleIndentTarget, fieldPatchForKey, parsePastedRows } from '../../utils/treeEdit.js';
import { withKey, keyHint, ALT } from '../../utils/shortcuts.js';
import { KEYMAP_OPEN_EVENT } from '../shared/KeyboardMap.jsx';

function depth(id) { return id.split('.').length; }
// STATUS_LBL is built inside the component so it can use t() — see statusLbl below
// Priority indicator: chevron-style glyphs (up = urgent, down = low)
const PRIO_GLYPH = { 1: '⏫', 2: '▲', 3: '▬', 4: '▼' };
const PRIO_COL = { 1: 'var(--re)', 2: 'var(--am)', 3: 'var(--ac)', 4: 'var(--tx3)' };
function TreeViewImpl({ tree, selected, multiSel, onSelect, search, teamFilter, rootFilter, personFilter, stats, teams, members, scheduled, cpSet, cpLabels = {}, customFields, sizes = [], historyEvents = [], sinceDays = '', persistSince, sinceDate = null, diff = null, onlyChanged = false, horizonIds = null, horizonEnd = null, horizonOnlyPlanned = true, roadmapAssignment = null, onDelete, onReorder, onTaskUpdate, onClearSelection, onOpenBulkEdit, onMove, onInsertAfter, onInsertChild, onBulkDelete, onPasteRows }) {
  const { t } = useT();
  const statusLbl = { open: t('tv.statusOpen'), wip: t('tv.statusWip'), done: t('tv.statusDone') };
  const prioLbl = { 1: t('tv.prioCrit'), 2: t('tv.prioHigh'), 3: t('tv.prioMed'), 4: t('tv.prioLow') };
  const [collapsed, setCollapsed] = useState(new Set());
  const [orderDrop, setOrderDrop] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const selRef = useRef(null);
  const firstMatchRef = useRef(null);
  // ── Keyboard cursor & inline editing (docs/principles.md, principle 5) ──
  // `selected` (existing prop, App.jsx state) IS the keyboard cursor — see
  // the module docstring in utils/treeEdit.js. `editing` is the one truly
  // new piece of UI state this phase adds: which row's name cell is
  // currently a real <input> instead of a <span>, the text it holds, and
  // whether that row was just created by this session's own Enter/⇧Enter
  // (so an empty commit deletes it again instead of leaving a nameless row).
  const [editing, setEditing] = useState(null); // { id, draft, isNew, fromId } | null
  // The whole editor cell, so focus moving BETWEEN its fields is not read
  // as leaving the editor — see handleEditorFocusOut.
  const editCellRef = useRef(null);
  const teamSelRef = useRef(null);
  const wasEditingRef = useRef(false);
  // id → { sig, el } for the row cache; see the comment at the row map.
  const rowCacheRef = useRef(new Map());
  const containerRef = useRef(null);
  const editInputRef = useRef(null);
  // Guards against handleEditBlur double-committing when Enter/Escape
  // already resolved the edit and the outgoing <input> unmounts (browsers /
  // happy-dom differ on whether that still fires a native blur).
  const suppressBlurRef = useRef(false);

  useEffect(() => {
    // When the editor closes, its <input> unmounts and focus falls to the
    // document body — so the container's keydown handler stops firing and
    // the arrow keys go nowhere. Enter, Escape, dead arrows. Hand focus back,
    // but ONLY when nothing else claimed it: clicking into the search box
    // also closes the editor, and yanking focus out of it would be worse
    // than the bug.
    if (wasEditingRef.current && !editing) {
      const active = document.activeElement;
      if (!active || active === document.body || containerRef.current?.contains(active)) {
        containerRef.current?.focus();
      }
    }
    wasEditingRef.current = !!editing;
    if (editing?.id && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing?.id]);

  // The diff cutoff (sinceDays/persistSince/sinceDate) and the precomputed
  // diff bag flow in from App.jsx so every view stays in sync. We still
  // resolve the per-leaf past state locally — used by the per-row diff badge
  // and the "Only changed" filter below.
  const pastLeafState = useMemo(() => sinceDate && historyEvents.length ? stateAsOf(historyEvents, sinceDate) : (diff?.pastLeafState || null), [historyEvents, sinceDate, diff]);
  // "Only with changes" filter — global state, set inside ViewFilters
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

  // Parent-then-children, displayOrder-aware sort — see utils/treeEdit.js
  // sortTree(), which is the same algorithm this used to carry inline (now
  // shared with the keyboard cursor's row-order tests).
  const sorted = useMemo(() => sortTree(tree), [tree]);

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
    return filterCollapsedRows(f, collapsed);
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

  // ── Keyboard model (docs/principles.md, principle 5) ────────────────────
  // The row order the cursor travels through is exactly what's on screen —
  // `filt` already carries every search/team/collapse filter.
  const visibleIds = useMemo(() => filt.map(r => r.id), [filt]);
  // The project's own sizes, falling back to the shared default set —
  // the same resolution `resolveSize` does for the S/M/L/X shortcuts, so
  // the dropdown can never offer a size the key would refuse.
  const sizeCatalogue = useMemo(() => (sizes?.length ? sizes : DEFAULT_SIZES), [sizes]);
  // Tracks the row the cursor last moved to during a Shift+↑/↓ run. Needed
  // because onSelect's shift-extend (shared with mouse shift-click) keeps
  // `selected` pinned at the ANCHOR the whole time — without this, a second
  // Shift+↓ would compute "one past the anchor" again instead of extending
  // one row further. Not new user-visible state, just where the next arrow
  // press should count from; `selected` stays the one cursor the user sees.
  const shiftCursorRef = useRef(null);

  function moveCursor(dir, extend) {
    if (!visibleIds.length) return;
    const fromId = extend ? (shiftCursorRef.current || selected?.id) : selected?.id;
    const curIdx = fromId ? visibleIds.indexOf(fromId) : -1;
    let nextIdx;
    if (curIdx < 0) nextIdx = dir === 'down' ? 0 : visibleIds.length - 1;
    else nextIdx = Math.max(0, Math.min(visibleIds.length - 1, curIdx + (dir === 'down' ? 1 : -1)));
    const nextRow = filt[nextIdx];
    if (!nextRow) return;
    shiftCursorRef.current = extend ? nextRow.id : null;
    onSelect(nextRow, { shiftKey: !!extend }, visibleIds);
  }

  // Applies a field patch to the active row, or to the whole multi-selection
  // when there is one — same "loop onTaskUpdate" path the selection bar's
  // own status buttons already use below. App.jsx's mutate() coalesces
  // same-tick pushes (see utils/undo.js), so N calls here still cost the
  // user exactly one ⌘Z.
  // `opts` reaches fieldPatchForKey — today only { back }, for ⇧Space.
  function applyToTargets(patchOf) {
    if (!onTaskUpdate) return;
    const ids = hasSelection ? multiSel : (selected?.id ? new Set([selected.id]) : null);
    if (!ids || !ids.size) return;
    tree.forEach(node => {
      if (!ids.has(node.id)) return;
      const patch = patchOf(node);
      if (patch) onTaskUpdate({ ...node, ...patch });
    });
  }

  // The row being named is always the row the cursor is on. Clicking another
  // row therefore ends edit mode and keeps what was typed. This is a rule,
  // not a focus side effect: relying on the <input> blurring did not survive
  // a click on a <tr>, which is not focusable and does not always take focus
  // away from the field.
  //
  // Safe against every internal advance (Enter, ⇧Enter, ↑/↓, Tab off the
  // last field, ⌥←/⌥→), because each of those sets `editing` and `selected`
  // to the same row in one tick — so this never sees them disagree.
  useEffect(() => {
    if (!editing || !selected?.id || selected.id === editing.id) return;
    finishEditing();
  }, [selected?.id]);

  function startEdit(id) {
    const node = tree.find(r => r.id === id);
    if (!node) return;
    setEditing({ id, draft: node.name || '', isNew: false });
  }

  // The mouse mirror of ⇧Enter / Enter-at-the-end. Both hand the new row
  // straight to the inline editor, so creating an item is one click and then
  // typing — never a placeholder name to go back and fix. Same callbacks the
  // keyboard uses; no second write path (principle 2).
  // ⌥↑/⌥↓ (and ⌥⇧↑/⌥⇧↓ for the ends) move a row among the siblings you can
  // SEE. Computing the step from the whole tree meant a press could swap the
  // row with a hidden one — a finished task, an archived project, a
  // collapsed branch — and look like nothing happened.
  // Indent / outdent, from what is on screen. `null` means the move is a
  // no-op here — already first in its visible run, or already a root.
  function reparentTarget(id, outward) {
    return outward ? outdentTarget(id) : visibleIndentTarget(visibleIds, id);
  }

  function reparentVisible(id, outward) {
    if (!onMove || !id) return;
    const target = reparentTarget(id, outward);
    if (target !== null) onMove(id, target);
  }

  function reorderVisible(id, direction) {
    if (!onReorder || !id) return;
    const target = visibleSiblingTarget(visibleIds, id, direction);
    if (target) onReorder(id, target);
  }

  function startNewSibling(afterIdVal) {
    if (!onInsertAfter) return;
    const newId = onInsertAfter(afterIdVal);
    if (!newId) return;
    setEditing({ id: newId, draft: '', isNew: true, fromId: afterIdVal });
    onSelect({ id: newId }, {}, visibleIds);
  }

  function startNewChild(parentIdVal) {
    if (!onInsertChild) return;
    const newId = onInsertChild(parentIdVal);
    if (!newId) return;
    setEditing({ id: newId, draft: '', isNew: true, fromId: parentIdVal });
    onSelect({ id: newId }, {}, visibleIds);
  }

  // Enter (from inside the inline editor) — commit the current draft, then
  // start the NEXT row: a sibling below, or (⇧Enter) a child. An empty
  // commit on a row this session itself just created removes it again
  // instead of leaving a nameless row (so Enter-Enter never litters the
  // tree); an empty commit on a pre-existing row is left alone — clearing
  // an established item's name isn't something a stray Enter should do.
  function commitEdit(advance) {
    if (!editing) return;
    const { id, draft, isNew } = editing;
    const name = draft.trim();
    suppressBlurRef.current = true;
    if (!name) {
      if (isNew) onDelete?.(id);
      setEditing(null);
      return;
    }
    const node = tree.find(r => r.id === id);
    if (node && node.name !== name) onTaskUpdate?.({ ...node, name });
    const inserter = advance === 'child' ? onInsertChild : onInsertAfter;
    const newId = inserter?.(id);
    if (newId) {
      setEditing({ id: newId, draft: '', isNew: true, fromId: id });
      onSelect({ id: newId }, {}, visibleIds);
      return;
    }
    setEditing(null);
  }

  // Esc — leaves an existing row's name untouched (nothing was ever written
  // to it; only the local draft is discarded). A row still-new from this
  // same session is removed, same as an empty Enter-commit, so backing out
  // of an accidental new row doesn't litter the tree either.
  function cancelEdit() {
    if (!editing) return;
    suppressBlurRef.current = true;
    if (editing.isNew) {
      onDelete?.(editing.id);
      // The row the cursor was on is about to be deleted, so put it back
      // where the new row came from — otherwise backing out of an accidental
      // ⇧Enter leaves you with no cursor at all and a mouse trip to recover.
      const origin = editing.fromId && filt.find(r => r.id === editing.fromId);
      if (origin) onSelect(origin, {}, visibleIds.filter(id => id !== editing.id));
    }
    setEditing(null);
  }

  // Close the editor, keeping whatever was typed. An empty row this session
  // created is removed again rather than left nameless — the same rule Enter
  // and Escape follow.
  function finishEditing() {
    if (!editing) return;
    const { id, draft, isNew } = editing;
    const name = draft.trim();
    suppressBlurRef.current = true;
    if (!name) {
      if (isNew) onDelete?.(id);
    } else {
      const node = tree.find(r => r.id === id);
      if (node && node.name !== name) onTaskUpdate?.({ ...node, name });
    }
    setEditing(null);
  }

  function handleEditBlur() {
    if (suppressBlurRef.current) { suppressBlurRef.current = false; return; }
    finishEditing();
  }

  // Commit the draft WITHOUT closing the editor. Used by every in-editor
  // action below, so the name you have already typed is never the price of
  // reaching for a field. Returns the node as the store will have it.
  function commitDraftInPlace() {
    if (!editing) return null;
    const node = tree.find(r => r.id === editing.id);
    const name = editing.draft.trim();
    if (node && name && node.name !== name) onTaskUpdate?.({ ...node, name });
    return node;
  }

  // ↑/↓ inside the editor: commit and carry the field to the neighbouring
  // row. The spreadsheet gesture — editing follows the cursor instead of
  // being a mode you leave and re-enter for every row.
  function commitAndEditNeighbour(delta) {
    if (!editing) return;
    const { id, draft, isNew } = editing;
    const idx = visibleIds.indexOf(id);
    suppressBlurRef.current = true;
    if (!draft.trim()) {
      // An empty row this session created is removed, same rule Enter and
      // blur follow — and the row indices below it shift, so stop here.
      if (isNew) { onDelete?.(id); setEditing(null); return; }
    } else {
      commitDraftInPlace();
    }
    const nextRow = filt[idx + delta];
    if (!nextRow) { setEditing(null); return; }
    setEditing({ id: nextRow.id, draft: nextRow.name || '', isNew: false });
    onSelect(nextRow, {}, visibleIds);
  }

  // Tab / ⇧Tab inside the editor. moveNode renumbers the subtree, so the
  // field has to follow the row to its new id — App's onMove hands it back.
  // The name is committed first and moveNode applies its change
  // functionally, so the two writes in this one keypress don't race.
  function reparentWhileEditing(outward) {
    if (!editing || !onMove) return;
    const target = reparentTarget(editing.id, outward);
    if (target === null) return;
    const name = editing.draft;
    commitDraftInPlace();
    suppressBlurRef.current = true;
    const newId = onMove(editing.id, target);
    setEditing(cur => (cur ? { ...cur, id: newId || cur.id, draft: name, isNew: false } : cur));
  }

  // ⌥1–4, ⌥S/M/L/X, ⌥Space: set a field on the row being named, without
  // leaving the field. `fieldPatchForKey` is the same helper the row-level
  // shortcuts use, so "priority 2" means one thing in this app.
  function applyFieldWhileEditing(fieldKey, opts) {
    if (!editing) return;
    const node = tree.find(r => r.id === editing.id);
    if (!node) return;
    writeFieldWhileEditing(fieldPatchForKey(node, fieldKey, sizes, opts));
  }

  // One write carrying both the typed name and the field. Two calls in one
  // tick would have the second overwrite the first — the same race addNode
  // and moveNode each lost once.
  function writeFieldWhileEditing(patch) {
    if (!editing || !patch) return;
    const node = tree.find(r => r.id === editing.id);
    if (!node) return;
    const name = editing.draft.trim();
    onTaskUpdate?.({ ...node, ...(name && name !== node.name ? { name } : {}), ...patch });
  }

  function handleEditKeyDown(e) {
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };

    if (e.key === 'Escape') { stop(); cancelEdit(); return; }
    if (e.key === 'Enter' && !alt) { stop(); commitEdit(e.shiftKey ? 'child' : 'sibling'); return; }

    // Tab walks the row's fields — name → priority → size → status → team —
    // which is what Tab means inside a field everywhere else. Native focus
    // order does it; the only edges worth owning are the two ends:
    // ⇧Tab off the name goes back to the row above, Tab off the last field
    // finishes the row and opens the next one (see handleFieldKeyDown).
    if (e.key === 'Tab' && e.shiftKey && !alt) { stop(); commitAndEditNeighbour(-1); return; }
    if (e.key === 'Tab') return;   // let the browser move to the next field

    // ⌥←/⌥→ re-parent. Tab used to do this, but Tab belongs to the form now,
    // and ⌥+arrow already means "move this row in the structure" (⌥↑/⌥↓).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && alt) {
      stop(); reparentWhileEditing(e.key === 'ArrowLeft'); return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowDown' ? 'down' : 'up';
      if (alt) {
        // Reorder among siblings. reorderSibling writes displayOrder, so the
        // id is stable and the editor simply rides along.
        stop();
        reorderVisible(editing.id, e.shiftKey ? (dir === 'down' ? 'last' : 'first') : dir);
        return;
      }
      stop();
      commitAndEditNeighbour(dir === 'down' ? 1 : -1);
      return;
    }

    if (!alt) return;
    // ⌥+digit/letter reports a DIFFERENT e.key on macOS (⌥1 is "¡", ⌥s is
    // "ß"), so the physical key is the only reliable read here.
    const digit = /^Digit([1-4])$/.exec(e.code || '');
    if (digit) { stop(); applyFieldWhileEditing(digit[1]); return; }
    const letter = /^Key([SMLX])$/.exec(e.code || '');
    if (letter) { stop(); applyFieldWhileEditing(letter[1]); return; }
    if (e.code === 'Space') { stop(); applyFieldWhileEditing(' ', { back: e.shiftKey }); return; }
    if (e.code === 'KeyT') { stop(); teamSelRef.current?.focus(); }
  }

  // The dropdowns' own key handling. Plain ↑/↓ and Home/End are the select's
  // business (that is how you pick a value), so only the row-level gestures
  // are intercepted here.
  function handleFieldKeyDown(e, isLast) {
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { stop(); cancelEdit(); return; }
    if (e.key === 'Enter') { stop(); commitEdit(e.shiftKey ? 'child' : 'sibling'); return; }
    // Tab off the last field finishes this row and opens the next, so a whole
    // item is one uninterrupted run of Tabs.
    if (e.key === 'Tab' && !e.shiftKey && isLast) { stop(); commitEdit('sibling'); return; }
    if (e.key === 'Tab') return;
    if (!alt) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { stop(); reparentWhileEditing(e.key === 'ArrowLeft'); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      stop();
      const dir = e.key === 'ArrowDown' ? 'down' : 'up';
      reorderVisible(editing.id, e.shiftKey ? (dir === 'down' ? 'last' : 'first') : dir);
    }
  }

  // Focus moving between the editor's own fields is not leaving the editor.
  // Without this, Tab from the name into the priority dropdown would commit
  // and close the row — which is exactly what a form must not do.
  // Two ways the grid gets the keyboard without a click.
  //
  // On mount it takes FOCUS only — never the cursor. An earlier version also
  // selected the first row here, which quietly stomped whatever the user had
  // just clicked: the effect closes over `selected` as it was at mount, so
  // it always decided "nothing is selected" no matter what happened since.
  // The cursor does not need help anyway — `moveCursor` starts at the first
  // row when there is no selection, so the first ↓ lands correctly.
  //
  // On demand the search box hands over (TREE_FOCUS_EVENT) and the cursor
  // does move — to the first MATCHING row, because `filt` is already
  // filtered. That one is an explicit user action, so claiming the cursor is
  // what was asked for. It reads the CURRENT rows through a ref for the same
  // stale-closure reason.
  // The search box hands the keyboard over on Enter. It cannot simply pick
  // `filt[0]` when the event arrives: the committed query has not reached
  // this component yet (it travels through App's state and a deferred
  // value), so the rows are still the PREVIOUS result and the cursor would
  // land on the first row of the old list. Instead the event carries the
  // query it wants, and the jump waits until our own rows are that query's.
  const [jumpTo, setJumpTo] = useState(null);   // { query, at } | null

  useEffect(() => {
    const el = containerRef.current;
    if (el && el.offsetParent !== null) {
      const active = document.activeElement;
      if (!active || active === document.body) el.focus();
    }
    const onEvent = e => {
      const node = containerRef.current;
      if (!node || node.offsetParent === null) return;   // this tab isn't showing
      node.focus();
      setJumpTo({ query: e?.detail?.query ?? '', at: Date.now() });
    };
    window.addEventListener(TREE_FOCUS_EVENT, onEvent);
    return () => window.removeEventListener(TREE_FOCUS_EVENT, onEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jumpTo) return;
    if ((search || '') !== jumpTo.query) return;   // our rows are not that query's yet
    setJumpTo(null);
    const first = filt[0];
    // `filt` is already narrowed to matches, so its first row IS the first
    // hit. The existing scroll-on-selection effect brings it into view.
    if (first) onSelect(first, {}, visibleIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo, search, filt]);

  function handleEditorFocusOut(e) {
    const next = e.relatedTarget;
    if (next && editCellRef.current?.contains(next)) return;
    // A field's dropdown renders into a portal on document.body, to escape
    // the table's overflow clipping — so reaching for an option looks like
    // leaving the editor. It is not.
    if (typeof document !== 'undefined' && document.querySelector('[data-searchselect-popup]')) return;
    handleEditBlur();
  }

  // Where the cursor goes after a delete: the row above, else the row below,
  // else nothing. Landing on `null` meant every delete cost you a mouse trip
  // back into the tree — and with ⌫ now one keystroke, that is most of the
  // work. Computed BEFORE the delete, from the rows as they are on screen.
  function rowAfterDeleting(ids) {
    const gone = new Set(ids);
    const idx = visibleIds.findIndex(id => gone.has(id));
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) if (!gone.has(visibleIds[i])) return filt[i];
    for (let i = idx + 1; i < visibleIds.length; i++) if (!gone.has(visibleIds[i])) return filt[i];
    return null;
  }

  function doDelete() {
    const ids = hasSelection ? [...multiSel] : (selected?.id ? [selected.id] : []);
    if (!ids.length) return;
    // Descendants disappear with their parent, so they count as gone too.
    const alsoGone = tree.filter(r => ids.some(id => r.id.startsWith(id + '.'))).map(r => r.id);
    const next = rowAfterDeleting([...ids, ...alsoGone]);
    if (hasSelection) onBulkDelete?.(ids); else onDelete?.(ids[0]);
    // After App's own setSel(null) — so this wins, and the cursor stays put.
    if (next) onSelect(next, {}, visibleIds.filter(id => !ids.includes(id)));
  }

  function handleContainerKeyDown(e) {
    if (editing) return; // the inline <input> owns Enter/⇧Enter/Esc — see handleEditKeyDown
    const key = e.key;
    const bare = !e.ctrlKey && !e.metaKey; // leave Cmd/Ctrl combos (save, undo, find…) alone

    if ((key === 'ArrowUp' || key === 'ArrowDown') && e.altKey && bare) {
      e.preventDefault();
      if (!selected?.id) return;
      // ⇧ makes it the whole way: to the top or the bottom of the sibling
      // run, in one press, instead of holding the key down past everything
      // in between.
      const dir = e.shiftKey
        ? (key === 'ArrowDown' ? 'last' : 'first')
        : (key === 'ArrowDown' ? 'down' : 'up');
      reorderVisible(selected.id, dir);
      return;
    }
    if ((key === 'ArrowUp' || key === 'ArrowDown') && !e.altKey && bare) {
      e.preventDefault();
      moveCursor(key === 'ArrowDown' ? 'down' : 'up', e.shiftKey);
      return;
    }
    // ⌥←/⌥→ — outdent / indent, the SAME gesture as inside the editor. Tab
    // and ⇧Tab do it too (the outliner idiom, and free here because the grid
    // is not a form), but one gesture has to work in both places or you have
    // to remember which mode you are in.
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && e.altKey && bare) {
      e.preventDefault();
      if (selected?.id) reparentVisible(selected.id, key === 'ArrowLeft');
      return;
    }
    if (!bare || e.altKey || !selected?.id) return;

    // ⇧←/⇧→ — the big version of ←/→: collapse or expand everything, or just
    // the selection when there is one, exactly like the two toolbar buttons.
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && e.shiftKey) {
      e.preventDefault();
      if (key === 'ArrowLeft') collapseAll(); else expandAll();
      return;
    }
    // ←/→ — the tree idiom every file browser and outliner shares: → opens a
    // closed branch and then steps into it, ← closes an open one and then
    // steps out to the parent. Structure navigation without leaving the
    // home row for the mouse.
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      e.preventDefault();
      const id = selected.id;
      const kids = hasChildren(tree, id);
      if (key === 'ArrowRight') {
        if (kids && collapsed.has(id)) { toggle(id); return; }
        const firstChild = filt.find(r => r.id.startsWith(id + '.') && depth(r.id) === depth(id) + 1);
        if (firstChild) onSelect(firstChild, {}, visibleIds);
        return;
      }
      if (kids && !collapsed.has(id)) { toggle(id); return; }
      const pid = id.split('.').slice(0, -1).join('.');
      const parentRow = pid ? filt.find(r => r.id === pid) : null;
      if (parentRow) onSelect(parentRow, {}, visibleIds);
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      reparentVisible(selected.id, e.shiftKey);
      return;
    }
    if (key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) startNewChild(selected.id);
      else startEdit(selected.id);
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      doDelete();
      return;
    }
    if (key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      // ⇧Space walks back. On a task with phases both step through the phase
      // list one at a time; on a task without, they are the status cycle in
      // its two directions.
      applyToTargets(node => fieldPatchForKey(node, ' ', sizes, { back: e.shiftKey }));
      return;
    }
    if (['1', '2', '3', '4'].includes(key)) {
      e.preventDefault();
      applyToTargets(node => fieldPatchForKey(node, key, sizes));
      return;
    }
    if (key.length === 1 && /^[a-zA-Z]$/.test(key) && ['S', 'M', 'L', 'X'].includes(key.toUpperCase())) {
      e.preventDefault();
      const upper = key.toUpperCase();
      applyToTargets(node => fieldPatchForKey(node, upper, sizes));
    }
  }

  // Paste a list — one new row per non-empty line, nested under the active
  // row's parent (siblings of the active row), in one undo step. Only
  // handled while no inline edit is focused; the <input> keeps native paste.
  function handlePaste(e) {
    if (editing) return;
    if (!selected?.id || !onPasteRows) return;
    const text = e.clipboardData?.getData('text/plain') ?? e.clipboardData?.getData('text') ?? '';
    const rows = parsePastedRows(text);
    if (!rows.length) return;
    e.preventDefault();
    onPasteRows(selected.id, rows);
  }

  // The row itself. Called only for rows whose signature changed — see
  // the cache at the call site.
  function renderRow(r, idx) {
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
          // Subway-Map line color for root items — same hex the Roadmap view
          // assigns to the line's start/end badges. Falls back to null when no
          // assignment has been computed yet (user hasn't opened Subway view).
          // For child rows we colorize the leading root segment of the id
          // (e.g. the "P1" in "P1.2.3") so the chain back to the line stays
          // visible without spamming color on every cell.
          const rootIdSeg = r.id.split('.')[0];
          const lineColor = getLineColor(rootIdSeg, roadmapAssignment);
          return <tr key={r.id} ref={selected?.id === r.id ? selRef : (search && idx === 0 ? firstMatchRef : null)}
            className={`tr${isLeaf ? '' : d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}${idx % 2 ? ' alt' : ''}${selected?.id === r.id || isMulti ? ' sel' : ''}${isCp ? ' cp-row' : ''}`}
            data-prio={r.prio || ''}
            data-status={effStatus}
            data-team={r.team || ''}
            onClick={e => { onSelect(r, e, filt.map(x => x.id)); containerRef.current?.focus(); }}
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
            <td {...(cpTip ? { 'data-htip': `${t('tv.criticalPath')}: ${cpTip}` } : {})}>
              {onReorder && <span
                className="tv-drag-handle"
                draggable
                data-htip={withKey(t('tv.dragTip', r.id), 'reorder')}
                onDragStart={e => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', r.id);
                  setOrderDrop({ dragId: r.id, targetId: null, position: 'before' });
                }}
                onDragEnd={() => setOrderDrop(null)}>⋮⋮</span>}
              {d === 1 && lineColor
                ? <span className="tid" style={{ background: lineColor, color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700, letterSpacing: '.02em' }} data-htip={t('tv.lineTip', rootIdSeg)}>{r.id}</span>
                : lineColor
                  ? <span className="tid"><span style={{ color: lineColor, fontWeight: 600 }}>{rootIdSeg}</span>{r.id.slice(rootIdSeg.length)}</span>
                  : <span className="tid">{r.id}</span>}
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

              {/* Name — a real <input> while this row is the keyboard editor's
                  active edit (see handleContainerKeyDown's Enter/⇧Enter and
                  the commit/cancel helpers above). */}
              {editing?.id === r.id
                ? <span className="tv-edit-row" ref={editCellRef}
                    onBlur={handleEditorFocusOut}
                    onClick={e => e.stopPropagation()}>
                  <input
                    ref={editInputRef}
                    className="tn-edit-input"
                    value={editing.draft}
                    data-testid={`tree-name-input-${r.id}`}
                    onChange={e => { const v = e.target.value; setEditing(cur => cur ? { ...cur, draft: v } : cur); }}
                    onKeyDown={handleEditKeyDown}
                    style={{ font: 'inherit', fontSize: 12, padding: '1px 5px', border: '1px solid var(--ac)', borderRadius: 3, background: 'var(--bg)', color: 'var(--tx)', minWidth: 150 }}
                  />
                  {/* The rest of the row, as a form. Tab walks it in order —
                      name → priority → size → status → team — with a label
                      on each, because a glyph you have to decode is not a
                      label. Each is a SearchSelect rather than a <select> so
                      typing filters: with a dozen teams, hunting a native
                      dropdown by eye is the slow path. */}
                  {[
                    { key: 'prio', label: t('tv.fldPrio'), value: r.prio ? String(r.prio) : '',
                      options: [1, 2, 3, 4].map(pv => ({ id: String(pv), label: `${PRIO_GLYPH[pv]} ${prioLbl[pv]}` })),
                      // A row you just typed has no priority yet — say so,
                      // rather than pre-filling one and calling it a decision.
                      emptyLabel: t('tv.prioNone'),
                      onSelect: v => writeFieldWhileEditing({ prio: v ? Number(v) : undefined }) },
                    { key: 'size', label: t('tv.fldSize'),
                      value: sizeCatalogue.find(sz => sz.days === r.best && sz.factor === r.factor)?.label || '',
                      options: sizeCatalogue.map(sz => ({ id: sz.label, label: `${sz.label} · ${sz.days}d` })),
                      // An estimate from the wizard matches no catalogue
                      // entry — say so rather than showing the nearest size.
                      emptyLabel: t('tv.sizeCustom'),
                      onSelect: v => { const sz = sizeCatalogue.find(x => x.label === v); if (sz) writeFieldWhileEditing({ best: sz.days, factor: sz.factor }); } },
                    // A task with phases derives its status FROM them, so a
                    // Status dropdown here would write a value the next read
                    // overwrites. The field becomes the phase list instead:
                    // it shows where the task stands, and Space walks the
                    // same sequence one step at a time.
                    r.phases?.length
                      ? { key: 'phase', label: t('tv.fldPhase'),
                          value: currentPhase(r.phases)?.id || '',
                          options: r.phases.map(ph => ({
                            id: ph.id,
                            label: `${ph.status === 'done' ? '●' : ph.status === 'wip' ? '◐' : '○'} ${ph.name || ph.id}`,
                          })),
                          emptyLabel: t('tv.phaseAllDone'),
                          onSelect: v => {
                            const phases = v ? setPhaseCursor(r.phases, v) : r.phases.map(ph => ({ ...ph, status: 'done' }));
                            if (!phases) return;
                            const st = statusFromPhases(phases);
                            writeFieldWhileEditing({ ...statusChangePatch(r, st), phases, progress: phaseProgress(phases) });
                          } }
                      : { key: 'status', label: t('tv.fldStatus'), value: r.status || 'open',
                          options: ['open', 'wip', 'done'].map(st => ({ id: st, label: statusLbl[st] })),
                          onSelect: v => writeFieldWhileEditing(statusChangePatch(r, v)) },
                    { key: 'team', label: t('tv.fldTeam'), value: r.team || '',
                      options: (teams || []).map(tm => ({ id: tm.id, label: tm.name })),
                      emptyLabel: t('tv.teamNone'),
                      onSelect: v => writeFieldWhileEditing({ team: v || '' }) },
                  ].map((f, i, all) => (
                    <label className="tv-field" key={f.key}>
                      <span className="tv-field-lbl">{f.label}</span>
                      {/* SearchSelect owns ↑/↓/Enter/Esc while its popup is
                          open and calls preventDefault when it acts, so the
                          row-level gestures run only on what it left alone. */}
                      <span className="tv-field-sel-wrap"
                        onKeyDown={e => { if (!e.defaultPrevented) handleFieldKeyDown(e, i === all.length - 1); }}>
                        <SearchSelect
                          compact
                          testId={`tree-edit-${f.key}`}
                          inputRef={f.key === 'team' ? teamSelRef : undefined}
                          value={f.value}
                          options={f.options}
                          allowEmpty={!!f.emptyLabel}
                          emptyLabel={f.emptyLabel}
                          onSelect={f.onSelect}
                        />
                      </span>
                    </label>
                  ))}
                </span>
                : <span
                    className={`tn tn-editable${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}`}
                    data-testid="tree-row-name"
                    data-htip={selected?.id === r.id ? t('tv.clickToRename') : undefined}
                    onClick={e => {
                      // First click selects the row (the <tr> handler), a click
                      // on the name of the row that is ALREADY selected opens
                      // the editor. Finder's rename gesture — and it leaves
                      // click/⇧-click selection of other rows untouched.
                      if (selected?.id !== r.id || isMulti) return;
                      e.stopPropagation();
                      startEdit(r.id);
                    }}>{r.name || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('tv.unnamed')}</span>}</span>}

              {/* Team — small colored dot + name (subtle). Suppressed when team equals
                  the inherited parent team to avoid repeating the same label down a subtree. */}
              {tName && showTeam && <span style={{ marginLeft: 8, fontSize: 10, color: tColor, fontWeight: 500, opacity: .85 }} data-htip={`${t('tv.team')}: ${tName}`}>● {tName}</span>}

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
              {d === 1 && r.date && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }} data-htip={t('tv.dateTip', r.date)}>{r.date}</span>}

              {r.decideBy && <span style={{ marginLeft: 8, fontSize: 10, color: new Date(r.decideBy) < new Date() && r.status !== 'done' ? 'var(--re)' : 'var(--am)', fontFamily: 'var(--mono)' }} data-htip={t('tv.decideByTip', r.decideBy)}>{r.decideBy}</span>}

              {r.due && (() => {
                const sc = sMap[r.id];
                const overdue = !!sc?.dueOverdue;
                const endIso = sc?.endD ? (sc.endD instanceof Date ? sc.endD.toISOString().slice(0, 10) : String(sc.endD).slice(0, 10)) : '';
                return <span style={{ marginLeft: 8, fontSize: 10, color: overdue ? 'var(--re)' : 'var(--am)', fontFamily: 'var(--mono)', fontWeight: overdue ? 700 : 400 }}
                  data-htip={overdue ? t('tv.dueOverdueTip', r.due, endIso) : t('tv.dueTip', r.due)}>{r.due}</span>;
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
              {/* Collapsed leaf count comes from stats, which is built on the
                  UNFILTERED tree. Counting the local `tree` prop instead
                  reported the post-filter remainder ("30 leafs" for a 51-leaf
                  package with hide-done on) next to a full-tree percentage. */}
              {isCollapsed && (() => {
                const visibleLeaves = leafNodes(tree).filter(c => c.id.startsWith(r.id + '.')).length;
                const allLeaves = s._leafCount ?? visibleLeaves;
                return <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
                  data-htip={visibleLeaves < allLeaves ? `${visibleLeaves} ${t('tv.ofVisible')} ${allLeaves}` : null}>
                  ({allLeaves} leafs{visibleLeaves < allLeaves ? `, ${visibleLeaves} ${t('tv.visible')}` : ''})
                </span>;
              })()}

              </div>
              {/* Description and note are hidden in tree view; visible in QuickEdit/NodeModal. */}
            </td>

            {/* Effort: single number (realistic days) */}
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isLeaf ? 'var(--gr)' : 'var(--tx2)' }}>{effortDays}</td>

            {/* Progress */}
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: prog >= 99.95 ? 'var(--gr)' : prog > 0 ? 'var(--am)' : 'var(--tx3)' }}>{prog > 0 ? `${progressPctLabel(prog)}%` : ''}</td>

            {/* Schedule range — start to end */}
            <td className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
              {scheduleRangeById[r.id]?.start && scheduleRangeById[r.id]?.end && <>{fmtDate(scheduleRangeById[r.id].start)} → {fmtDate(scheduleRangeById[r.id].end)}</>}
            </td>

            {/* Actions — the three creation/rename moves, on the row itself.
                They fade in with the row (CSS .tv-row-act) so a resting table
                stays quiet, and each one is the same callback the keyboard
                uses. Reorder, indent and delete live in the contextual
                toolbar above and act on the selected item. */}
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0 4px' }}>
              <span className="tv-row-act">
                <button className="tv-act-btn" data-testid={`tree-row-rename-${r.id}`}
                  data-htip={withKey(t('tv.renameTip', r.id), 'rename')}
                  onClick={e => { e.stopPropagation(); onSelect(r, {}, visibleIds); startEdit(r.id); }}>✎</button>
                <button className="tv-act-btn" data-testid={`tree-row-add-sibling-${r.id}`}
                  data-htip={withKey(t('tv.newRowTip', r.id), 'editNext')}
                  onClick={e => { e.stopPropagation(); startNewSibling(r.id); }}>+</button>
                <button className="tv-act-btn" data-testid={`tree-row-add-child-${r.id}`}
                  data-htip={withKey(t('tv.newChildTip', r.id), 'newChild')}
                  onClick={e => { e.stopPropagation(); startNewChild(r.id); }}>↳</button>
              </span>
            </td>
          </tr>;
  }

  return <div
    ref={containerRef}
    tabIndex={0}
    onKeyDown={handleContainerKeyDown}
    onPaste={handlePaste}
    style={{ outline: 'none' }}
    data-testid="tree-editor-surface">
    <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--b)', background: 'var(--bg2)', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
      <button className="btn btn-sec btn-xs" onClick={collapseAll} data-htip={withKey(hasSelection ? t('tv.collapseSelectionTitle', multiSel.size) : t('tv.collapseAll'), 'collapseAll')}>{hasSelection ? t('tv.collapseSelection', multiSel.size) : t('tv.collapseAll')}</button>
      <button className="btn btn-sec btn-xs" onClick={expandAll} data-htip={withKey(hasSelection ? t('tv.expandSelectionTitle', multiSel.size) : t('tv.expandAll'), 'expandAll')}>{hasSelection ? t('tv.expandSelection', multiSel.size) : t('tv.expandAll')}</button>
      {/* One help affordance, not two. The shortcuts used to be printed above
          the table as a dense line of glyphs, and the symbol legend was a
          separate hover-only `?` beside it — same question, two places. Both
          now open the same dialog, under the key that opens it. */}
      <button className="btn btn-sec btn-xs" data-testid="tree-keymap-btn"
        onClick={() => window.dispatchEvent(new Event(KEYMAP_OPEN_EVENT))}
        data-htip={withKey(t('km.title'), 'keymap')}
        style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>?</button>
      {/* Diff picker lives in the App-level sub-toolbar so it stays
          available next to the root/team/person filters. Toggling the
          "Only changed" checkbox there reaches this view via the
          `onlyChanged` prop. */}
      <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{filt.length}/{tree.length} {t('tv.items')}</span>
    </div>

    {/* Contextual action row — only when a single item is selected. Acts on that item. */}
    {selected?.id && selPos && (
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 3, gap: 4, padding: '4px 10px', borderBottom: '1px solid var(--b)', background: 'var(--bg3)', alignItems: 'center', position: 'sticky', top: 33, zIndex: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>{t('tv.selected')}</span>
        <span style={{ fontSize: 11, color: 'var(--tx2)', fontFamily: 'var(--mono)', marginRight: 4 }}>{selected.id}</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', marginRight: 8, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
        {/* Edit & create — the mouse twin of Enter / ⇧Enter. */}
        {toolBtn(`✎ ${t('tv.rename')}`, withKey(t('tv.renameTip', selected.id), 'rename'), () => startEdit(selected.id))}
        {onInsertAfter && toolBtn(`+ ${t('tv.newRow')}`, withKey(t('tv.newRowTip', selected.id), 'editNext'), () => startNewSibling(selected.id))}
        {onInsertChild && toolBtn(`↳ ${t('tv.newChild')}`, withKey(t('tv.newChildTip', selected.id), 'newChild'), () => startNewChild(selected.id))}
        {/* Re-parent — the mouse twin of Tab / ⇧Tab. `null` from the helper
            means the move is a no-op here (already at the top level, or no
            previous sibling to become the new parent), so the button is
            disabled rather than silently doing nothing. Note '' is a valid
            target (the root), which is why this tests against null. */}
        {onMove && <>
          <span className="sab-divider" style={{ height: 16, margin: '0 2px' }} />
          {toolBtn('⇤', withKey(t('tv.outdentTip', selected.id), 'outdent'), () => reparentVisible(selected.id, true), reparentTarget(selected.id, true) === null)}
          {toolBtn('⇥', withKey(t('tv.indentTip', selected.id), 'indent'), () => reparentVisible(selected.id, false), reparentTarget(selected.id, false) === null)}
        </>}
        {onReorder && selPos.count > 1 && <>
          <span className="sab-divider" style={{ height: 16, margin: '0 2px' }} />
          {toolBtn('⤒ First', withKey(t('tv.moveFirstTip', selected.id), 'reorderEnds'), () => reorderVisible(selected.id, 'first'), !visibleSiblingTarget(visibleIds, selected.id, 'first'))}
          {toolBtn('▲ Up', withKey(t('tv.moveUpTip', selected.id), 'reorder'), () => reorderVisible(selected.id, 'up'), !visibleSiblingTarget(visibleIds, selected.id, 'up'))}
          {toolBtn('▼ Down', withKey(t('tv.moveDownTip', selected.id), 'reorder'), () => reorderVisible(selected.id, 'down'), !visibleSiblingTarget(visibleIds, selected.id, 'down'))}
          {toolBtn('⤓ Last', withKey(t('tv.moveLastTip', selected.id), 'reorderEnds'), () => reorderVisible(selected.id, 'last'), !visibleSiblingTarget(visibleIds, selected.id, 'last'))}
        </>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-sec btn-xs" onClick={() => onDelete(selected.id)}
          data-htip={withKey((hasChildren(tree, selected.id) ? t('tv.deleteSubtreeTip', selected.id) : t('tv.deleteRowTip', selected.id)), 'delete')}
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
          // ── Why this row is cached ────────────────────────────────────
          // Moving the cursor one row changes exactly two rows, but it
          // re-rendered every visible one: measured at 82 ms per arrow press
          // on a 300-row plan (13 rows: no long task at all — the cost
          // scales with what is on screen, which is what ruled out saving,
          // syncing and the side panel). Holding the key queues presses at
          // 82 ms each, which is where "half a second to a second behind"
          // comes from.
          //
          // React bails out of re-rendering a subtree when it is handed the
          // SAME element reference, so unchanged rows return their previous
          // element. The signature below therefore has to name everything
          // this row's output reads — anything missed here shows up as a
          // row that quietly stops updating, which is worse than the lag.
          // Per-row state is kept per-row on purpose: taking `editing` or
          // `orderDrop` whole would rebuild all rows on every keystroke of
          // a rename.
          const isSel = selected?.id === r.id;
          const isEditingRow = editing?.id === r.id;
          const dropOn = orderDrop?.targetId === r.id && canDropOrder(orderDrop.dragId, r.id) ? orderDrop.position : '';
          const sig = [
            r, idx, isSel, multiSel?.has(r.id), collapsed.has(r.id),
            isEditingRow ? editing.draft : false,
            dropOn, search && idx === 0,
            // Anything shared that changes the row's content.
            stats, sMap, scheduleRangeById, cpSet, cpLabels, roadmapAssignment,
            customFields, teams, sizeCatalogue, tree, t,
          ];
          const cached = rowCacheRef.current.get(r.id);
          if (cached && cached.sig.length === sig.length && cached.sig.every((v, i) => v === sig[i])) {
            return cached.el;
          }
          const el = renderRow(r, idx);
          rowCacheRef.current.set(r.id, { sig, el });
          return el;
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
        onClick={() => onOpenBulkEdit?.()}
        data-htip={t('g.bulkEditTip')}
        data-testid="tree-bulk-edit-trigger">
        <span className="sab-icon">⎘</span>
        <span>{t('g.bulkEdit') || 'Massenänderung…'}</span>
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
              // statusChangePatch, not a bare { status } — see the Space
              // branch in utils/treeEdit.js. Setting a row to done here has
              // to stamp the same dates the dropdown does, or the Soll/Ist
              // comparison silently misses everything changed in bulk.
              onTaskUpdate({ ...node, ...statusChangePatch(node, stVal) });
            });
          }}
          data-htip={t('tv.bulkStatusTip', label)}>{label}</button>
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

// Hand the keyboard to the tree: focus its grid and put the cursor on the
// first visible row. Dispatched by the search box on Enter, so a search ends
// where its results are rather than leaving you in the input.
export const TREE_FOCUS_EVENT = 'planr:tree:focus';
