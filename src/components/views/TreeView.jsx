import { useState, useMemo, useEffect, useLayoutEffect, useRef, memo } from 'react';
import { pt } from '../../utils/scheduler.js';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { useT } from '../../i18n.jsx';
import { stateAsOf } from '../../utils/history.js';
import { sortTree, filterCollapsedRows, parsePastedRows } from '../../utils/treeEdit.js';
import { stickyTops, layoutScale, isTypingTarget } from '../../utils/tree/layout.js';
import { diffBadgeFor, collectDiffKeepIds } from '../../utils/tree/diff.js';
import { filterRows, collapseTargets } from '../../utils/tree/rows.js';
import { shortInitials, scheduleRanges, siblingPosition } from '../../utils/tree/derive.js';
import { keepRowInView } from '../../utils/tree/scroll.js';
import { TreeToolbar } from './tree/TreeToolbar.jsx';
import { TreeSelectionBar } from './tree/TreeSelectionBar.jsx';
import { TreeHead } from './tree/TreeHead.jsx';
import { TreeBulkBar } from './tree/TreeBulkBar.jsx';
import { renderTreeRow } from './tree/renderTreeRow.jsx';
import { useTreeDrag } from './tree/useTreeDrag.js';
import { useTreeCommands } from './tree/useTreeCommands.js';
import { useTreeEditing } from './tree/useTreeEditing.js';
import { handleContainerKey, handleEditKey, handleFieldKey } from './tree/treeKeys.js';

// Other modules and tests import these from here.
export { stickyTops, layoutScale, isTypingTarget };

// STATUS_LBL is built inside the component so it can use t() — see statusLbl below
function TreeViewImpl({
  tree,
  selected,
  multiSel,
  onSelect,
  search,
  teamFilter,
  rootFilter,
  personFilter,
  stats,
  teams,
  members,
  scheduled,
  cpSet,
  cpLabels = {},
  customFields,
  sizes = [],
  historyEvents = [],
  sinceDays = '',
  persistSince,
  sinceDate = null,
  diff = null,
  onlyChanged = false,
  horizonIds = null,
  horizonEnd = null,
  horizonOnlyPlanned = true,
  roadmapAssignment = null,
  onDelete,
  onTaskUpdate,
  onClearSelection,
  onOpenBulkEdit,
  onMove,
  onCommand,
  onCommandMany,
  onDropRows,
  onSelectAll,
  onRevealHidden,
  onInsertAfter,
  onInsertChild,
  onBulkDelete,
  onPasteRows,
  onFullEdit,
  editorInDialog = false,
  showIds = true,
  changedIds = null,
}) {
  const { t } = useT();
  const statusLbl = { open: t('tv.statusOpen'), wip: t('tv.statusWip'), done: t('tv.statusDone') };
  const prioLbl = { 1: t('tv.prioCrit'), 2: t('tv.prioHigh'), 3: t('tv.prioMed'), 4: t('tv.prioLow') };
  const [collapsed, setCollapsed] = useState(new Set());
  const [orderDrop, setOrderDrop] = useState(null);
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
  const teamSelRef = useRef(null);
  const wasEditingRef = useRef(false);
  // id → { sig, el } for the row cache; see the comment at the row map.
  const rowCacheRef = useRef(new Map());
  const containerRef = useRef(null);
  const toolbarRef = useRef(null);
  const selBarRef = useRef(null);
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
      // ⇧Tab from the row below arrives at this row's LAST field, so ⇧Tab
      // walks back through every field exactly as Tab walks forward.
      const fields =
        editing.at === 'last' ? [...(editInputRef.current.closest('tr')?.querySelectorAll('input[data-testid^="tree-edit-"]') || [])] : [];
      const target = fields[fields.length - 1] || editInputRef.current;
      target.focus();
      if (target === editInputRef.current) target.select();
    }
  }, [editing?.id]);

  // The diff cutoff (sinceDays/persistSince/sinceDate) and the precomputed
  // diff bag flow in from App.jsx so every view stays in sync. We still
  // resolve the per-leaf past state locally — used by the per-row diff badge
  // and the "Only changed" filter below.
  const pastLeafState = useMemo(
    () => (sinceDate && historyEvents.length ? stateAsOf(historyEvents, sinceDate) : diff?.pastLeafState || null),
    [historyEvents, sinceDate, diff],
  );
  // "Only with changes" filter — global state, set inside ViewFilters
  // popup. When on, hide every leaf whose state matches the cutoff (no new,
  // done-in-window, or progress jump). Parents kept when they have at least
  // one matching descendant so the tree shape reads.
  // Per-row diff: returns null when no change, else badge descriptor.
  const computeDiffBadge = r => diffBadgeFor(r, { tree, pastLeafState, t });
  // Set of ids the filter should keep visible: every leaf with a diff plus
  // each of its ancestors. Computed once per change in pastLeafState/tree.
  const diffKeepIds = useMemo(() => {
    if (!onlyChanged || !pastLeafState) return null;
    return collectDiffKeepIds(tree, computeDiffBadge);
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
    if (toExpand.length)
      setCollapsed(s => {
        const n = new Set(s);
        toExpand.forEach(a => n.delete(a));
        return n;
      });
    setTimeout(() => keepRowInView(selRef.current), 50);
  }, [selected?.id]);

  // Scroll to first search match whenever the query changes (and the filtered list updates).
  useEffect(() => {
    if (!search) return;
    setTimeout(() => {
      firstMatchRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 50);
  }, [search]);

  const toggle = id =>
    setCollapsed(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  // If there's a selection, collapse/expand only acts on selected items + their descendants. Otherwise, all items.
  const targetIds = () => collapseTargets(tree, multiSel);
  const collapseAll = () =>
    setCollapsed(s => {
      const n = new Set(s);
      targetIds().forEach(id => n.add(id));
      return n;
    });
  const expandAll = () =>
    setCollapsed(s => {
      const n = new Set(s);
      targetIds().forEach(id => n.delete(id));
      return n;
    });

  // Every filter EXCEPT the collapse state. Kept apart from `filt` below
  // because the two answer different questions: a row inside a folded branch
  // is one keystroke from being seen, a row a filter excludes is not there at
  // all. `noMoveIsLost` below depends on telling those apart.
  const filteredRows = useMemo(
    () => filterRows(sorted, { rootFilter, teamFilter, personFilter, search, diffKeepIds, horizonIds, horizonOnlyPlanned }),
    [sorted, search, teamFilter, rootFilter, personFilter, diffKeepIds, horizonIds, horizonOnlyPlanned],
  );
  const filt = useMemo(() => filterCollapsedRows(filteredRows, collapsed), [filteredRows, collapsed]);

  // A move never hides what it moved.
  //
  // Reported: items "simply disappear" while being pushed around the tree,
  // especially on the way out a level. They are not lost — re-parenting to
  // the top renumbers the subtree into a project of its own (P1.1 becomes
  // P4), and with the project filter set to P1 the filter then excludes the
  // very rows you were dragging. Same shape for a search over ids: the id
  // changes under the query. From where you are sitting the item is gone, and
  // nothing says where it went.
  //
  // Rather than enumerate the filters that can do this, watch the outcome:
  // the moved row is marked, and when the next filtered list does not contain
  // it the view asks to be widened. Collapse is deliberately not part of this
  // test — an ancestor gets expanded a few lines above, and a folded branch
  // is one keystroke from being open anyway.
  const revealRef = useRef(null);
  useEffect(() => {
    const id = revealRef.current;
    if (!id) return;
    revealRef.current = null;
    if (filteredRows.some(r => r.id === id)) return;
    onRevealHidden?.(id);
  }, [filteredRows]);

  // Resolve member ID to short initials with collision handling
  const shortMap = useMemo(() => shortInitials(members), [members]);
  const memberShort = id => shortMap[id] || '?';
  const sMap = useMemo(() => (scheduled ? Object.fromEntries(scheduled.map(s => [s.id, s])) : {}), [scheduled]);
  const memberFullName = id => (members || []).find(x => x.id === id)?.name || id;
  const teamColor = tid => teams?.find(x => x.id === pt(tid))?.color || 'var(--tx3)';
  const teamName = tid => teams?.find(x => x.id === pt(tid))?.name || tid || '';
  const fmtDate = d => (d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) : '');
  const scheduleRangeById = useMemo(() => scheduleRanges(tree, sMap), [tree, sMap]);

  const hasSelection = multiSel && multiSel.size > 0;
  // Compute position of `selected` within its sibling group — drives first/last button disabled state.
  const selPos = useMemo(() => siblingPosition(tree, selected?.id), [selected?.id, tree]);

  // The sticky stack measures itself.
  //
  // Toolbar, selection bar and table head all stick to the top of the same
  // scroller, so each one has to begin where the one above it ends. Those
  // offsets were written in as 0 / 33 / 32 — three numbers that were never
  // true together. The toolbar is 34px tall here and taller inside Obsidian,
  // where the host's own control metrics apply, so the head sat under it and
  // lost its top edge. And 32 is less than 33, which put the head ABOVE the
  // selection bar in the stack: with a row selected it vanished completely.
  //
  // Both bars wrap on a narrow pane, so their heights are not constants to
  // find once either. A ResizeObserver writes the running total onto the
  // container and the stylesheet reads it back.
  //
  // Measured rects are divided by the UI scale before they are written: at
  // 110% (the default inside Obsidian) a 43px toolbar measures 47px, and a
  // head placed from the zoomed sum sat 15px below where the table puts it —
  // over the top of the first row, at a scroll position that is already 0.
  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const bars = [toolbarRef, selBarRef];
    const measure = () => {
      const scale = layoutScale(box);
      const tops = stickyTops(bars.map(ref => (ref.current?.getBoundingClientRect().height || 0) / scale));
      bars.forEach((_, i) => box.style.setProperty(`--tv-bar${i}-top`, `${tops[i]}px`));
      box.style.setProperty('--tv-head-top', `${tops[bars.length]}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    bars.forEach(ref => {
      if (ref.current) ro.observe(ref.current);
    });
    return () => ro.disconnect();
  }, [selected?.id, !!selPos]);

  const { onRowDragStart, onOrderDragOver, onOrderDrop } = useTreeDrag({
    orderDrop,
    setOrderDrop,
    filt,
    tree,
    multiSel,
    onDropRows,
    setCollapsed,
    t,
  });

  // ── Keyboard model (docs/principles.md, principle 5) ────────────────────
  // The row order the cursor travels through is exactly what's on screen —
  // `filt` already carries every search/team/collapse filter.
  const visibleIds = useMemo(() => filt.map(r => r.id), [filt]);
  // The project's own sizes, falling back to the shared default set —
  // the same resolution `resolveSize` does for the S/M/L/X shortcuts, so
  // the dropdown can never offer a size the key would refuse.
  const sizeCatalogue = useMemo(() => (sizes?.length ? sizes : DEFAULT_SIZES), [sizes]);
  const { multiMove, moveCursor, applyToTargets, canRun, runCommand, doDelete } = useTreeCommands({
    tree,
    selected,
    multiSel,
    hasSelection,
    visibleIds,
    filt,
    onSelect,
    onTaskUpdate,
    onCommand,
    onCommandMany,
    onDelete,
    onBulkDelete,
    setCollapsed,
    revealRef,
    containerRef,
  });

  const {
    startEdit,
    startNewSibling,
    startNewChild,
    commitEdit,
    cancelEdit,
    finishEditing,
    commitAndEditNeighbour,
    applyFieldWhileEditing,
    writeFieldWhileEditing,
    handleEditorFocusOut,
  } = useTreeEditing({
    editing,
    setEditing,
    suppressBlurRef,
    selected,
    tree,
    filt,
    visibleIds,
    sizes,
    onDelete,
    onTaskUpdate,
    onInsertAfter,
    onInsertChild,
    onSelect,
  });

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
  const [jumpTo, setJumpTo] = useState(null); // { query, at } | null

  useEffect(() => {
    const el = containerRef.current;
    if (el && el.offsetParent !== null) {
      const active = document.activeElement;
      if (!active || active === document.body) el.focus();
    }
    const onEvent = e => {
      const node = containerRef.current;
      if (!node || node.offsetParent === null) return; // this tab isn't showing
      node.focus();
      setJumpTo({ query: e?.detail?.query ?? '', at: Date.now() });
    };
    window.addEventListener(TREE_FOCUS_EVENT, onEvent);
    return () => window.removeEventListener(TREE_FOCUS_EVENT, onEvent);
  }, []);

  useEffect(() => {
    if (!jumpTo) return;
    if ((search || '') !== jumpTo.query) return; // our rows are not that query's yet
    setJumpTo(null);
    const first = filt[0];
    // `filt` is already narrowed to matches, so its first row IS the first
    // hit. The existing scroll-on-selection effect brings it into view.
    if (first) onSelect(first, {}, visibleIds);
  }, [jumpTo, search, filt]);

  const keyCtx = {
    editing,
    selected,
    tree,
    filt,
    visibleIds,
    collapsed,
    sizes,
    onSelectAll,
    onFullEdit,
    onSelect,
    runCommand,
    moveCursor,
    collapseAll,
    expandAll,
    toggle,
    startEdit,
    startNewSibling,
    startNewChild,
    doDelete,
    applyToTargets,
    cancelEdit,
    commitEdit,
    commitAndEditNeighbour,
    applyFieldWhileEditing,
    teamSelRef,
  };
  const handleEditKeyDown = e => handleEditKey(keyCtx, e);
  const handleFieldKeyDown = (e, isLast) => handleFieldKey(keyCtx, e, isLast);
  const handleContainerKeyDown = e => handleContainerKey(keyCtx, e);

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

  const rowCtx = {
    cancelEdit,
    changedIds,
    collapsed,
    computeDiffBadge,
    containerRef,
    cpLabels,
    cpSet,
    customFields,
    editInputRef,
    editing,
    filt,
    finishEditing,
    firstMatchRef,
    fmtDate,
    handleEditKeyDown,
    handleEditorFocusOut,
    handleFieldKeyDown,
    memberFullName,
    memberShort,
    multiSel,
    onDropRows,
    onFullEdit,
    onOrderDragOver,
    onOrderDrop,
    onRowDragStart,
    onSelect,
    orderDrop,
    prioLbl,
    roadmapAssignment,
    sMap,
    scheduleRangeById,
    search,
    selRef,
    selected,
    setEditing,
    setOrderDrop,
    shortMap,
    showIds,
    sizeCatalogue,
    startEdit,
    startNewChild,
    startNewSibling,
    stats,
    statusLbl,
    t,
    teamColor,
    teamName,
    teamSelRef,
    teams,
    toggle,
    tree,
    visibleIds,
    writeFieldWhileEditing,
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onPaste={handlePaste}
      className="tv-surface"
      style={{ outline: 'none' }}
      data-testid="tree-editor-surface"
    >
      <TreeToolbar
        toolbarRef={toolbarRef}
        collapseAll={collapseAll}
        expandAll={expandAll}
        hasSelection={hasSelection}
        multiSel={multiSel}
        shownCount={filt.length}
        totalCount={tree.length}
        t={t}
      />

      {/* Contextual action row — only when a single item is selected. Acts on that item. */}
      {selected?.id && selPos && (
        <TreeSelectionBar
          selBarRef={selBarRef}
          selected={selected}
          multiMove={multiMove}
          multiSel={multiSel}
          onFullEdit={onFullEdit}
          editorInDialog={editorInDialog}
          onInsertAfter={onInsertAfter}
          onInsertChild={onInsertChild}
          onCommand={onCommand}
          onDelete={onDelete}
          tree={tree}
          canRun={canRun}
          runCommand={runCommand}
          startEdit={startEdit}
          startNewSibling={startNewSibling}
          startNewChild={startNewChild}
          t={t}
        />
      )}
      <table className="tree-tbl">
        <TreeHead showIds={showIds} t={t} />
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
            const dropOn = orderDrop?.targetId === r.id && orderDrop.valid ? orderDrop.position : '';
            const inHandSig = !!orderDrop?.dragIds?.includes(r.id);
            const sig = [
              r,
              idx,
              isSel,
              multiSel?.has(r.id),
              collapsed.has(r.id),
              isEditingRow ? editing.draft : false,
              dropOn,
              inHandSig,
              search && idx === 0,
              // Anything shared that changes the row's content.
              stats,
              sMap,
              scheduleRangeById,
              cpSet,
              cpLabels,
              roadmapAssignment,
              customFields,
              teams,
              sizeCatalogue,
              tree,
              t,
              // Read by the row in tree/renderTreeRow.jsx: the id column, the
              // scenario's mark, the initials and the review window's badge.
              showIds,
              changedIds,
              shortMap,
              pastLeafState,
            ];
            const cached = rowCacheRef.current.get(r.id);
            if (cached && cached.sig.length === sig.length && cached.sig.every((v, i) => v === sig[i])) {
              return cached.el;
            }
            const el = renderTreeRow(r, idx, rowCtx);
            rowCacheRef.current.set(r.id, { sig, el });
            return el;
          })}
        </tbody>
      </table>
      <TreeBulkBar
        multiSel={multiSel}
        tree={tree}
        onClearSelection={onClearSelection}
        onOpenBulkEdit={onOpenBulkEdit}
        onTaskUpdate={onTaskUpdate}
        t={t}
      />
    </div>
  );
}

export const TreeView = memo(TreeViewImpl);

// Hand the keyboard to the tree: focus its grid and put the cursor on the
// first visible row. Dispatched by the search box on Enter, so a search ends
// where its results are rather than leaving you in the input.
export const TREE_FOCUS_EVENT = 'planr:tree:focus';
