import { useState, useMemo, useEffect, useLayoutEffect, useRef, memo } from 'react';
import { hasChildren, pt } from '../../utils/scheduler.js';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { useT } from '../../i18n.jsx';
import { stateAsOf } from '../../utils/history.js';
import { sortTree, filterCollapsedRows, fieldPatchForKey, parsePastedRows, scrollAdjustment } from '../../utils/treeEdit.js';
import { depth, stickyTops, layoutScale, isTypingTarget } from '../../utils/tree/layout.js';
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

  // Enter (from inside the inline editor) — save the row. On a row this
  // session just added, Enter carries on and starts the NEXT row — the
  // outliner rhythm of typing a list — and ⇧Enter starts a child from any
  // row. Renaming an existing row with Enter or F2 is one edit, though: it
  // saves and hands the keyboard back to the tree, instead of conjuring an
  // empty row under something you only meant to correct. An empty
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
    // 'next' (⌘↵, or Tab off the last field) always goes on to a new row.
    if (advance === 'sibling' && !isNew) {
      setEditing(null);
      return;
    }
    const inserter = advance === 'child' ? onInsertChild : onInsertAfter; // 'sibling' | 'next'
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
      if (origin)
        onSelect(
          origin,
          {},
          visibleIds.filter(id => id !== editing.id),
        );
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
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false;
      return;
    }
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
  // `at: 'last'` lands in the neighbour's last field instead of its name —
  // what ⇧Tab needs to walk backwards through the fields without skipping.
  function commitAndEditNeighbour(delta, { at } = {}) {
    if (!editing) return;
    const { id, draft, isNew } = editing;
    const idx = visibleIds.indexOf(id);
    suppressBlurRef.current = true;
    if (!draft.trim()) {
      // An empty row this session created is removed, same rule Enter and
      // blur follow — and the row indices below it shift, so stop here.
      if (isNew) {
        onDelete?.(id);
        setEditing(null);
        return;
      }
    } else {
      commitDraftInPlace();
    }
    const nextRow = filt[idx + delta];
    if (!nextRow) {
      setEditing(null);
      return;
    }
    setEditing({ id: nextRow.id, draft: nextRow.name || '', isNew: false, ...(at ? { at } : {}) });
    onSelect(nextRow, {}, visibleIds);
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

  // ⇧↵ a child, ⌘↵ the next row, plain ↵ saves (and carries on only on a
  // row that was just added — see commitEdit).
  const enterAdvance = e => (e.shiftKey ? 'child' : e.metaKey || e.ctrlKey ? 'next' : 'sibling');

  function handleEditKeyDown(e) {
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (e.key === 'Escape') {
      stop();
      cancelEdit();
      return;
    }
    if (e.key === 'Enter' && !alt) {
      stop();
      commitEdit(enterAdvance(e));
      return;
    }

    // Tab walks the row's fields — name → priority → size → status → team —
    // which is what Tab means inside a field everywhere else. Native focus
    // order does it; the only edges worth owning are the two ends:
    // ⇧Tab off the name goes back to the LAST field of the row above, Tab
    // off the last field on to the name of the row below (see
    // handleFieldKeyDown) — one path through every field of every row, in
    // either direction.
    if (e.key === 'Tab' && e.shiftKey && !alt) {
      stop();
      commitAndEditNeighbour(-1, { at: 'last' });
      return;
    }
    if (e.key === 'Tab') return; // let the browser move to the next field

    // No structural gestures in here. Moving or re-parenting a row happens
    // from the tree with the row selected — ⌥←/⌥→ and ⌘⇧+arrows mean
    // word jumps and selections inside a text field, and a keystroke that
    // quietly moved the item instead is not something to learn around.
    // Plain ↑/↓ is navigation: commit, and edit the row above or below.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      stop();
      commitAndEditNeighbour(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (!alt) return;
    // ⌥+digit/letter reports a DIFFERENT e.key on macOS (⌥1 is "¡", ⌥s is
    // "ß"), so the physical key is the only reliable read here.
    const digit = /^Digit([1-4])$/.exec(e.code || '');
    if (digit) {
      stop();
      applyFieldWhileEditing(digit[1]);
      return;
    }
    const letter = /^Key([SMLX])$/.exec(e.code || '');
    if (letter) {
      stop();
      applyFieldWhileEditing(letter[1]);
      return;
    }
    if (e.code === 'Space') {
      stop();
      applyFieldWhileEditing(' ', { back: e.shiftKey });
      return;
    }
    if (e.code === 'KeyT') {
      stop();
      teamSelRef.current?.focus();
    }
  }

  // The dropdowns' own key handling. Plain ↑/↓ and Home/End are the select's
  // business (that is how you pick a value), so only the row-level gestures
  // are intercepted here.
  function handleFieldKeyDown(e, isLast) {
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'Escape') {
      stop();
      cancelEdit();
      return;
    }
    if (e.key === 'Enter') {
      stop();
      commitEdit(enterAdvance(e));
      return;
    }
    // Tab off the last field finishes this row and goes on, so a whole item
    // is one uninterrupted run of Tabs. On to the NEXT ROW when there is one
    // — the mirror of ⇧Tab off the name, which goes to the row above. It
    // always inserted a new empty row instead, so Tabbing through existing
    // items stopped at the first one with a blank row nobody asked for.
    // A new row, or the last row, still opens a new one: that is typing a
    // plan top to bottom.
    if (e.key === 'Tab' && !e.shiftKey && isLast) {
      stop();
      const at = editing ? visibleIds.indexOf(editing.id) : -1;
      if (editing && !editing.isNew && at >= 0 && at < visibleIds.length - 1) commitAndEditNeighbour(1);
      else commitEdit('next');
      return;
    }
    // Everything else is the field's own: ↑/↓ picks a value, and there are
    // no structural gestures while a control owns the keyboard.
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

  // Bound to the editing <tr>: focus moving between the row's own cells is
  // not leaving the editor.
  function handleEditorFocusOut(e) {
    const next = e.relatedTarget;
    if (next && e.currentTarget.contains(next)) return;
    // A field's dropdown renders into a portal on document.body, to escape
    // the table's overflow clipping — so reaching for an option looks like
    // leaving the editor. It is not.
    if (typeof document !== 'undefined' && document.querySelector('[data-searchselect-popup]')) return;
    handleEditBlur();
  }

  function handleContainerKeyDown(e) {
    if (editing) return; // the inline <input> owns Enter/⇧Enter/Esc — see handleEditKeyDown
    // Anything typed into a field bubbles up to here, and `editing` only knows
    // about the inline name editor. Every other input inside the tree — the
    // search box, a custom field, whatever a row grows next — was handing its
    // keystrokes to the row shortcuts: one ⌥← while a caret was in a box and
    // the item moved. A key pressed inside a text entry belongs to that entry.
    if (isTypingTarget(e.target)) return;
    const key = e.key;
    const bare = !e.ctrlKey && !e.metaKey; // leave Cmd/Ctrl combos (save, undo, find…) alone
    // ⌘A — every row on screen, i.e. what the filters and folds left. The
    // start of any "all of these" edit: status, priority, the bulk editor, a
    // drag. Only from the grid itself; inside a field it is the field's.
    if (!bare && !e.shiftKey && !e.altKey && (key === 'a' || key === 'A') && onSelectAll) {
      e.preventDefault();
      e.stopPropagation();
      onSelectAll(filt.map(x => x.id));
      return;
    }
    const ARROW_COMMAND = { ArrowUp: 'moveUp', ArrowDown: 'moveDown', ArrowRight: 'indent', ArrowLeft: 'outdent' };

    // ⌘⇧+arrow (Ctrl⇧ elsewhere) — the four structural commands, one per
    // arrow: ↑/↓ reorder, →/← indent/outdent. ⌥+arrow is the same set, kept
    // because it is what this tree has always answered to.
    if (ARROW_COMMAND[key] && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
      e.preventDefault();
      runCommand(ARROW_COMMAND[key]);
      return;
    }
    if ((key === 'ArrowUp' || key === 'ArrowDown') && e.altKey && bare) {
      e.preventDefault();
      // ⇧ makes it the whole way: to the top or the bottom of the sibling
      // run, in one press, instead of holding the key down past everything
      // in between.
      runCommand(e.shiftKey ? (key === 'ArrowDown' ? 'moveLast' : 'moveFirst') : ARROW_COMMAND[key]);
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
      runCommand(ARROW_COMMAND[key]);
      return;
    }
    // ⌘↵ — a new row under this one, open for typing. With plain ↵ now
    // meaning "edit this row", this is how a list gets started.
    if (key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (selected?.id) startNewSibling(selected.id);
      return;
    }
    // Home / End — the first and the last row on screen.
    if ((key === 'Home' || key === 'End') && bare && !e.altKey && !e.shiftKey) {
      const row = key === 'Home' ? filt[0] : filt[filt.length - 1];
      if (!row) return;
      e.preventDefault();
      onSelect(row, {}, visibleIds);
      return;
    }
    // ⇧←/⇧→ — the big version of ←/→: collapse or expand everything, or just
    // the selection when there is one, exactly like the two toolbar buttons.
    // Before the "needs a selected row" check below, because "everything" is
    // what it does with none — it used to do nothing until a row was picked.
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && e.shiftKey && bare && !e.altKey) {
      e.preventDefault();
      if (key === 'ArrowLeft') collapseAll();
      else expandAll();
      return;
    }
    if (!bare || e.altKey || !selected?.id) return;
    // ←/→ — the tree idiom every file browser and outliner shares: → opens a
    // closed branch and then steps into it, ← closes an open one and then
    // steps out to the parent. Structure navigation without leaving the
    // home row for the mouse.
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      e.preventDefault();
      const id = selected.id;
      const kids = hasChildren(tree, id);
      if (key === 'ArrowRight') {
        if (kids && collapsed.has(id)) {
          toggle(id);
          return;
        }
        const firstChild = filt.find(r => r.id.startsWith(id + '.') && depth(r.id) === depth(id) + 1);
        if (firstChild) onSelect(firstChild, {}, visibleIds);
        return;
      }
      if (kids && !collapsed.has(id)) {
        toggle(id);
        return;
      }
      const pid = id.split('.').slice(0, -1).join('.');
      const parentRow = pid ? filt.find(r => r.id === pid) : null;
      if (parentRow) onSelect(parentRow, {}, visibleIds);
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      runCommand(e.shiftKey ? 'outdent' : 'indent');
      return;
    }
    // F2 — rename, the key every spreadsheet and file manager uses for it.
    if (key === 'F2') {
      e.preventDefault();
      startEdit(selected.id);
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
    // The full editor had a button and nothing else. Enter starts the inline
    // edit, which covers the name and the four fields beside it; everything
    // deeper — dependencies, phases, history, custom fields — was a click
    // away and only a click away, on the one surface that is otherwise
    // entirely keyboard-driven.
    if ((key === 'e' || key === 'E') && bare && !e.altKey && onFullEdit) {
      e.preventDefault();
      if (selected?.id) onFullEdit(selected);
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
    if (key === '0') {
      // Next to the priorities, and the opposite of them: 1–4 say how much
      // this matters, 0 says it is not going to happen. A separate field
      // rather than a status, so taking it back gives you the item you had
      // (utils/scheduler.js, `isDropped`).
      e.preventDefault();
      applyToTargets(node => ({ dropped: node.dropped ? undefined : true }));
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
