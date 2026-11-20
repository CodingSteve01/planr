import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { useStableCallback } from './app/useStableCallback.js';
import { useNodeActions } from './app/actions/useNodeActions.js';
import { mergeNamed } from './app/actions/bindActions.js';
import { useTreeEditorActions } from './app/actions/useTreeEditorActions.js';
import { useQueueActions } from './app/actions/useQueueActions.js';
import { useResourceActions } from './app/actions/useResourceActions.js';
import { useTabBar } from './app/useTabBar.js';
import { useViewFilters } from './app/useViewFilters.js';
import { useRoadmapFocus, useUiPrefs } from './app/useUiPrefs.js';
import { useTour } from './app/useTour.js';
import { useReviewWindow } from './app/useReviewWindow.js';
import { useFileSession } from './app/useFileSession.js';
import { useFileSync, SAVE_DEBOUNCE_MS } from './app/useFileSync.js';
import { useDocumentState } from './app/useDocumentState.js';
import { useScenarios } from './app/useScenarios.js';
import { useLogWriters } from './app/useLogWriters.js';
import { useEarlierDay } from './app/useEarlierDay.js';
import { usePlanModel } from './app/derived/usePlanModel.js';
import { useVisibleTree } from './app/derived/useVisibleTree.js';
import { useFilterChips } from './app/derived/useFilterChips.js';
import { useResourceLoad, useResourceLens } from './app/derived/useResourceLoad.js';
import { useScenarioView } from './app/derived/useScenarioView.js';
import { useReviewDiff } from './app/derived/useReviewDiff.js';
import { migratedAutoHolidays, withDerivedTeamsAndStatuses } from './app/planRepairs.js';
import { TopBarFile } from './components/app/TopBarFile.jsx';
import { ExternalChangeBanner } from './components/app/ExternalChangeBanner.jsx';
import { TopBarState } from './components/app/TopBarState.jsx';
import { ScenarioStrip } from './components/app/ScenarioStrip.jsx';
import { TabBar } from './components/app/TabBar.jsx';
import { FilterBar } from './components/app/FilterBar.jsx';
import { SummaryPane } from './components/app/SummaryPane.jsx';
import { BriefingPane } from './components/app/BriefingPane.jsx';
import { PlanPane } from './components/app/PlanPane.jsx';
import { TreeList } from './components/app/TreeList.jsx';
import { TreeSide } from './components/app/TreeSide.jsx';
import { GanttPane } from './components/app/GanttPane.jsx';
import { RoadmapPane } from './components/app/RoadmapPane.jsx';
import { NetPane } from './components/app/NetPane.jsx';
import { OrderPane } from './components/app/OrderPane.jsx';
import { ResourcesPane } from './components/app/ResourcesPane.jsx';
import { ItemModals } from './components/app/ItemModals.jsx';
import { ScenarioModals } from './components/app/ScenarioModals.jsx';
import { SettingsModals } from './components/app/SettingsModals.jsx';
import { ProjectFileModals } from './components/app/ProjectFileModals.jsx';
import { OnboardingModals } from './components/app/OnboardingModals.jsx';
import { buildPaletteCommands } from './app/paletteCommands.js';
import { buildTabs, buildTourSteps, buildNewFeatures } from './app/shellContent.js';
import { buildExportHandlerProps } from './app/exportHandlerProps.js';
import { initialShell, loadLocalProject, isValidProjectData, SEARCH_TABS, MATCH_STEP_TABS } from './app/shell.js';
import { flushSync } from 'react-dom';
import { GT_MARKS } from './constants.js';
import { iso } from './utils/date.js';
import { useT } from './i18n.jsx';
import { normalizeLoadedData } from './utils/loadedData.js';
import { exportSprintMarkdown } from './utils/exports.js';
import { parseMdToProject } from './utils/markdownParse.js';
import { buildMarkdownText as _buildMd } from './utils/markdown.js';
import { buildMemberShortMap } from './utils/memberShort.js';
import { exportScenarioComparePDF } from './utils/scenarioReport.js';
import { CapacityProvider } from './utils/capacityLens.js';
import { leafSnapshot } from './utils/history.js';
import { buildExportCtx } from './utils/exportCtx.js';
import { isLeafNode } from './utils/scheduler.js';
import { sortTree } from './utils/treeEdit.js';
import { deriveCompletedWindow, inferCompletedAt, inferCompletedPersonId } from './utils/completion.js';
import { requestHandlePermission } from './utils/fileHandleStore.js';
import { TAB_IDS } from './utils/modes.js';
import { usePortalRoot } from './utils/embedHost.js';
import { Frozen } from './components/shared/Frozen.jsx';
import { HolView } from './components/views/HolView.jsx';
import { BootScreen, RestoreMountScreen } from './components/app/BootScreen.jsx';
import { EmptyState } from './components/app/EmptyState.jsx';
import { HoverTipProvider } from './components/shared/HoverTip.jsx';
import { CommandPalette } from './components/shared/CommandPalette.jsx';
import { KeyboardMap } from './components/shared/KeyboardMap.jsx';
import { useScenarioReport } from './components/shared/Scenario.jsx';
import { ReportView } from './components/views/ReportView.jsx';

// Lives in utils/memberShort.js; re-exported because that is where callers look.
export { buildMemberShortMap };

// Every tab the shell knows about, in bar order — declared in utils/modes.js
// and re-exported here because that is where the rest of the app looks for it.
export { TAB_IDS };

// `mount` is how a host hands this app instance its document. Without one —
// the web build — the app restores whatever was last opened, from IndexedDB
// and a localStorage snapshot, and owns that choice itself. With one, the host
// owns it: this instance edits exactly the file it was given, keeps nothing in
// the shared snapshot (two plans open side by side would overwrite each
// other's), and reports back through `onFileChange` when Save As moves the
// document somewhere else, so the host's tab can follow.
export default function App({ mount = null, onFileChange = null } = {}) {
  const hosted = !!onFileChange;
  const { t: _t, lang: _lang } = useT();
  const portalRoot = usePortalRoot();
  const [data, setData] = useState(() => (hosted ? null : loadLocalProject()));
  const [tab, _setTab] = useState(() => initialShell().tab);
  const setTab = t => {
    _setTab(t);
    try {
      localStorage.setItem('planr_tab', t);
    } catch {}
  };

  const { tabBarRef, activeTabRef, tabFades, syncTabFades, visitedTabs } = useTabBar(tab);
  const [ganttRoadmapFocus, setGanttRoadmapFocus] = useRoadmapFocus();
  // Store only the selected node's ID; derive the actual node from the tree.
  // This ensures `selected` always reflects the latest tree state — fixes a bug
  // where QuickEdit would overwrite changes (e.g. assign) made via NodeModal,
  // because the old code held a stale node object in state.
  const [sideTab, setSideTab] = useState('insights');
  const [selId, _setSelId] = useState(null);
  const setSel = n => _setSelId(n == null ? null : typeof n === 'string' ? n : n.id);
  const [multiSel, setMultiSel] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [modalNode, setMN] = useState(null);
  const [modalFocus, setModalFocus] = useState(null);
  // Committed, debounced search only — the raw input state lives inside
  // <SearchBox> so keystrokes don't trigger an App-level render and cascade
  // through every mounted tab pane.
  const [search, setSearch] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const {
    teamFilter,
    setTeamFilter,
    rootFilter,
    setRootFilter,
    personFilter,
    setPersonFilter,
    hideDone,
    setHideDone,
    showArchived,
    setShowArchived,
    archiveDays,
    setArchiveDays,
    onlyAutoAssigned,
    setOnlyAutoAssigned,
    onlyOverdue,
    setOnlyOverdue,
    onlyUnestimated,
    setOnlyUnestimated,
    onlyOverbooked,
    setOnlyOverbooked,
  } = useViewFilters();
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const {
    history,
    setHistory,
    scn,
    setScn,
    scnRef,
    past,
    setPast,
    pastRef,
    effDate,
    setEffDate,
    lastSavedPlanRef,
    dayUndoRef,
    planHistoryRef,
    lastSavedLeavesRef,
    leafBaselineStaleRef,
    scnNotice,
    setScnNotice,
    resetDocumentState,
    dataRef,
    mutate,
    handleUndo,
    handleRedo,
  } = useDocumentState({ data, setData, setSaved });
  // A different document is on screen: its undo stack is gone, and so is any
  // scenario that was open over the previous one.
  function resetHistory() {
    diskTextRef.current = null;
    busyRoundsRef.current = 0;
    clearTimeout(saveRetryTimerRef.current);
    resetDocumentState();
  }
  // Which tab of the comparison was open: kept for the app's lifetime so a
  // jump to a task and back lands where it left.
  const scnCompareMemory = useRef({ tab: 'projects', onlyMoved: true });
  const {
    scnChanges,
    fileDataRef,
    scenarioList,
    activeScenario,
    scenarioSwitch,
    scenarioCreate,
    scenarioRename,
    scenarioDelete,
    scenarioApply,
    scenarioRevertChange,
  } = useScenarios({
    data,
    setData,
    setSaved,
    setMultiSel,
    setModal,
    _t,
    mutate,
    history,
    setHistory,
    scn,
    setScn,
    scnRef,
    past,
    pastRef,
    dataRef,
    planHistoryRef,
    setScnNotice,
  });
  const fRef = useRef(null);
  const searchRef = useRef(null);
  const prevTreeRef = useRef([]);
  const prevScheduledRef = useRef([]);
  // The three functions that write the history log are defined further down,
  // where `tree` and `isMdFile` exist. The file layer is set up before that, so
  // it gets these wrappers, which call whatever the latest render defined.
  const logWritersRef = useRef(null);
  const composeFileForSave = () => logWritersRef.current.composeFileForSave();
  const recordHistoryForLocalSave = () => logWritersRef.current.recordHistoryForLocalSave();
  const commitSaveSideEffects = args => logWritersRef.current.commitSaveSideEffects(args);
  const { appRef, ...uiPrefs } = useUiPrefs(portalRoot);
  const fileSession = useFileSession({
    data,
    hosted,
    mount,
    onFileChange,
    setData,
    setSel,
    setSaved,
    resetHistory,
    fileDataRef,
    scnRef,
    recordHistoryForLocalSave,
  });
  const {
    fileHandleRef,
    fileName,
    setFileName,
    autoSave,
    setAutoSave,
    lastSavedAt,
    setLastSavedAt,
    bootstrapped,
    fileWriteOk,
    setFileWriteOk,
    fileSynced,
    diskTextRef,
    busyRoundsRef,
    saveRetryTimerRef,
    forgetHandle,
    ensureHandlePermission,
  } = fileSession;
  const { tourStep, setTourStep, showNewFeat, dismissNewFeat, startTour, closeTour } = useTour();

  // Reseed the leaf-state baseline whenever a different file is loaded so the
  // first save after load only emits real edits made in this session, not the
  // entire tree as "added".
  //
  // Taken when the DOCUMENT arrives, not when its file name does. It used to
  // hang on `fileName`, which is set before the file has been read: the
  // baseline was the previous document's tree, or an empty one in a host that
  // starts with no document, and the first save after every open recorded
  // every item as "added" all over again. A real plan had 11,731 events of
  // which 563 were changes. `resetHistory()` — called wherever a different
  // document is loaded — marks the baseline stale; the first `data` after
  // that is the new baseline. A scenario on screen never is: its baseline is
  // the plan's.
  useEffect(() => {
    if (!data || !leafBaselineStaleRef.current || scnRef.current) return;
    lastSavedLeavesRef.current = leafSnapshot(sortTree(data.tree || []));
    lastSavedPlanRef.current = data;
    leafBaselineStaleRef.current = false;
  }, [data]);
  const { reloadFromFile, saveToFile, loadFromFile, ...fileSyncState } = useFileSync({
    data,
    saved,
    setSaved,
    setData,
    setSel,
    resetHistory,
    session: fileSession,
    fRef,
    fileDataRef,
    pastRef,
    scnRef,
    lastSavedPlanRef,
    lastSavedLeavesRef,
    leafBaselineStaleRef,
    composeFileForSave,
    commitSaveSideEffects,
  });

  // Global keyboard shortcuts. The file ones are the platform conventions
  // people already have in their fingers — ⌘O open, ⌘S save, ⇧⌘S save as,
  // ⌘E export, ⌘, settings — declared in utils/shortcuts.js so the keymap
  // and the menus name exactly what is bound here.
  //
  // ⌘N (new) is deliberately NOT bound: browsers keep it for "new window"
  // and never deliver it to the page, so binding it would look like a
  // feature and do nothing. New project lives in the File menu and the
  // palette instead.
  useEffect(() => {
    const h = e => {
      const mod = e.ctrlKey || e.metaKey;
      const key = (e.key || '').toLowerCase();
      // Never steal a file shortcut from a text field the user is typing in
      // — except Save, which people expect to work from anywhere.
      const active = document.activeElement;
      const tag = active?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable;

      if (mod && key === 's' && e.shiftKey) {
        e.preventDefault();
        saveToFile(true);
        return;
      }
      if (mod && key === 'o' && !typing) {
        e.preventDefault();
        loadFromFile();
        return;
      }
      if (mod && key === 'e' && !typing) {
        e.preventDefault();
        setTab('report');
        return;
      }
      if (mod && e.key === ',' && !typing) {
        e.preventDefault();
        setModal('settings');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveToFile();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only intercept when a searchable view is active
        if (SEARCH_TABS.has(tab)) {
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }
      // Cmd/Ctrl+Arrow Up/Down: cycle through search matches
      // ⇧ is not ours: ⌘⇧↑/↓ moves a row in the tree.
      // Not from a text field: the search box steps on its own (this used to
      // step a second time, so each press skipped a match), and anywhere else
      // ⌘↑/⌘↓ is the caret's jump to the start or end of the text.
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !typing &&
        search &&
        MATCH_STEP_TABS.has(tab) &&
        (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      ) {
        e.preventDefault();
        setSearchIdx(i => (e.key === 'ArrowDown' ? i + 1 : i - 1));
      }
      // Undo/redo — never while focus is in a text-editing control, so
      // native text-field undo wins there instead of ours.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        const active = document.activeElement;
        const tag = active?.tagName;
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable;
        // No structure command can be issued from inside a field any more, so
        // there is never plan history hiding behind a text field's ⌘Z.
        if (!isEditable) {
          const isRedo = e.key === 'y' || e.key === 'Y' || e.shiftKey;
          e.preventDefault();
          if (isRedo) handleRedo();
          else handleUndo();
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const { members = [], teams = [], vacations = [], meta = {} } = data || {};
  const { reschedule, ...planModel } = usePlanModel({ data, members, vacations, meta, past });
  const {
    tree,
    hm,
    planStart,
    planEnd,
    workDays,
    capacityAt,
    scheduled,
    weeks,
    projectWaitsOf,
    stats,
    cpData,
    cpSet,
    goalPaths,
    leaves,
    confidence,
  } = planModel;
  // Derive selected node from tree — always fresh after any tree mutation.
  const selected = useMemo(() => (selId ? tree.find(r => r.id === selId) || null : null), [tree, selId]);
  const { overbookedTaskIds } = useResourceLoad({ data, members, teams, vacations, scheduled, weeks, capacityAt });
  const {
    sinceDays,
    persistSince,
    diffOnlyChanged,
    setDiffOnlyChanged,
    persistDiffOnlyChanged,
    horizonDays,
    persistHorizon,
    horizonOnlyPlanned,
    setHorizonOnlyPlanned,
    persistHorizonOnly,
  } = useReviewWindow();
  const reviewDiff = useReviewDiff({
    data,
    scn,
    tree,
    scheduled,
    members,
    vacations,
    hm,
    workDays,
    sinceDays,
    horizonDays,
    horizonOnlyPlanned,
    diffOnlyChanged,
  });
  const { sinceDate, horizonEnd, horizonIds, futureProgressByRootId, diff, diffChangedSet } = reviewDiff;
  const visible = useVisibleTree({
    tree,
    members,
    scheduled,
    stats,
    archiveDays,
    showArchived,
    hideDone,
    rootFilter,
    teamFilter,
    personFilter,
    onlyUnestimated,
    onlyAutoAssigned,
    onlyOverdue,
    onlyOverbooked,
    overbookedTaskIds,
    sinceDate,
    diffChangedSet,
  });
  const { archive, activeMembers, rootItems, netRootOptions, visibleViewIdSet } = visible;
  const filterChips = useFilterChips({
    _t,
    teams,
    archive,
    activeMembers,
    netRootOptions,
    overbookedTaskIds,
    hideDone,
    setHideDone,
    showArchived,
    setShowArchived,
    onlyAutoAssigned,
    setOnlyAutoAssigned,
    onlyOverdue,
    setOnlyOverdue,
    onlyUnestimated,
    setOnlyUnestimated,
    onlyOverbooked,
    setOnlyOverbooked,
    rootFilter,
    setRootFilter,
    teamFilter,
    setTeamFilter,
    personFilter,
    setPersonFilter,
    setSearchIdx,
  });
  const scenarioView = useScenarioView({ scn, data, scheduled, scnChanges });
  const { scnComparison } = scenarioView;
  useEffect(() => {
    if (rootFilter && !rootItems.some(r => r.id === rootFilter)) setRootFilter('');
  }, [rootItems, rootFilter]);
  useEffect(() => {
    if (teamFilter && !teams.some(t => t.id === teamFilter)) setTeamFilter('');
  }, [teams, teamFilter]);
  useEffect(() => {
    if (personFilter && !members.some(m => m.id === personFilter)) setPersonFilter('');
  }, [members, personFilter]);
  // Repair names the markdown round trip damaged. buildMarkdownText wrote the
  // root's type as an emoji while parseMdToProject looked for a different
  // marker, so every save-then-load moved the emoji from the type field into
  // the NAME and left it there. Both sides agree now; this clears what the
  // disagreement already wrote into saved plans. Runs once, and only when
  // there is something to clear.
  useEffect(() => {
    const MARKS = Object.values(GT_MARKS)
      .flat()
      .filter(mk => mk !== '!');
    const clean = n =>
      MARKS.reduce((acc, mk) => acc.split(mk).join(' '), String(n || ''))
        .replace(/\s{2,}/g, ' ')
        .trim();
    const dirty = tree.filter(r => !String(r.id).includes('.') && clean(r.name) !== r.name);
    if (!dirty.length) return;
    const ids = new Set(dirty.map(r => r.id));
    setData(d => ({ ...d, tree: d.tree.map(r => (ids.has(r.id) ? { ...r, name: clean(r.name) } : r)) }));
  }, []);

  // Backward compat: migrate old deadlines[] into tree roots
  useEffect(() => {
    if (!data?.deadlines?.length) return;
    const dl = data.deadlines;
    const updated = [...tree];
    dl.forEach(g => {
      // Find matching root by name similarity
      const root = updated.find(r => !r.id.includes('.') && (r.name.includes(g.name) || g.name.includes(r.name.split(' ')[0])));
      if (root && !root.type) {
        root.type = g.type || 'goal';
        root.severity = g.severity || 'high';
        if (g.date) root.date = g.date;
        if (g.description) root.description = g.description;
      }
    });
    setData(d => {
      const { deadlines, ...rest } = d;
      return { ...rest, tree: updated };
    });
  }, []);
  // ── The day you are working on ───────────────────────────────────────────
  // Empty = today. Set, the Resources view shows people, teams and meeting
  // plans as they will be on that day, and what is edited there goes into the
  // change at that date instead of into the plan as it always was. Not
  // persisted: like backdating, a date you forgot about would quietly send
  // every later edit to the wrong place.
  const { resLens, ...lensDates } = useResourceLens({ data, effDate });
  const { pickEffDate, effFold, pastStart, effDropDate, effContext } = useEarlierDay({
    data,
    history,
    setHistory,
    setData,
    setSaved,
    setTab,
    setPast,
    setEffDate,
    mutate,
    scn,
    past,
    effDate,
    scnRef,
    pastRef,
    dataRef,
    fileDataRef,
    lastSavedPlanRef,
    lastSavedLeavesRef,
    dayUndoRef,
  });

  // Persist the last visible schedule window for completed tasks so they stay visible
  // in the Gantt after being marked done, without reintroducing them into future planning.
  useEffect(() => {
    const prevTree = prevTreeRef.current || [];
    const prevTreeMap = new Map(prevTree.map(r => [r.id, r]));
    const prevScheduledMap = new Map((prevScheduledRef.current || []).map(s => [s.id, s]));
    const currentScheduledMap = new Map((scheduled || []).map(s => [s.id, s]));
    const patches = new Map();
    const todayIso = iso(new Date());

    tree.forEach(r => {
      if (!isLeafNode(tree, r.id)) return;
      const hasCompletionMeta = !!(
        r.completedAt ||
        r.completedStart ||
        r.completedEnd ||
        r.completedPersonId ||
        r.completedPerson ||
        r.completedAutoAssigned ||
        r.plannedStart ||
        r.plannedEnd
      );
      const prev = prevTreeMap.get(r.id);
      const snap = prevScheduledMap.get(r.id);

      if (r.status === 'done') {
        const completedPersonId = inferCompletedPersonId(r, members, snap);
        const completedAt =
          prev?.status !== 'done' && !r.completedAt
            ? todayIso
            : inferCompletedAt({
                item: r,
                tree,
                scheduledMap: currentScheduledMap,
                scheduledSnap: snap,
                workDays,
                planStart,
                completedPersonId,
                members,
                vacations,
                hm,
              });
        if (!completedAt) return;
        // Persisted done-window takes precedence over re-inference. The user
        // may reconstruct history by editing done-start/done-end directly, so
        // do not recalculate that window just because completedAt changed in
        // the same edit. Refresh only when no window exists, when a task is
        // newly completed, or when the cached window is clearly stale.
        const hasExistingWindow = !!r.completedStart && !!r.completedEnd;
        const windowWasEdited = !!prev && (prev.completedStart !== r.completedStart || prev.completedEnd !== r.completedEnd);
        const completedAtChanged = !!prev && prev.completedAt !== completedAt;
        const windowMatchesCompletedAt = hasExistingWindow && r.completedEnd === completedAt;
        const shouldRefreshWindow =
          !hasExistingWindow ||
          (prev && prev.status !== 'done') ||
          (completedAtChanged && !windowWasEdited && !windowMatchesCompletedAt) ||
          (prev && prev.completedPersonId !== completedPersonId && !windowWasEdited);
        const window = shouldRefreshWindow
          ? deriveCompletedWindow({ item: r, completedAt, completedPersonId, members, vacations, hm, workDays })
          : { completedStart: r.completedStart, completedEnd: r.completedEnd };
        const completedPerson =
          r.completedPerson ||
          (completedPersonId ? members.find(m => m.id === completedPersonId)?.name || completedPersonId : snap?.person || '');
        const plannedStart = r.plannedStart || (snap?.startD ? iso(snap.startD) : '');
        const plannedEnd = r.plannedEnd || (snap?.endD ? iso(snap.endD) : '');
        const patch = {
          completedAt,
          completedStart: window.completedStart,
          completedEnd: window.completedEnd,
        };
        if (completedPersonId) patch.completedPersonId = completedPersonId;
        if (completedPerson) patch.completedPerson = completedPerson;
        if (snap?.autoAssigned || r.completedAutoAssigned) patch.completedAutoAssigned = true;
        if (plannedStart) patch.plannedStart = plannedStart;
        if (plannedEnd) patch.plannedEnd = plannedEnd;
        const needsPatch = Object.entries(patch).some(([key, value]) => r[key] !== value);
        if (!needsPatch) return;
        patches.set(r.id, patch);
        return;
      }
      if (hasCompletionMeta) patches.set(r.id, { _clearCompletedWindow: true });
    });

    prevTreeRef.current = tree;
    prevScheduledRef.current = scheduled;

    if (!patches.size) return;

    let didChange = false;
    setData(d => {
      if (!d?.tree?.length) return d;
      const nextTree = d.tree.map(r => {
        const patch = patches.get(r.id);
        if (!patch) return r;
        if (patch._clearCompletedWindow) {
          const {
            completedAt,
            completedStart,
            completedEnd,
            completedPersonId,
            completedPerson,
            completedAutoAssigned,
            plannedStart,
            plannedEnd,
            ...rest
          } = r;
          if (
            completedAt == null &&
            completedStart == null &&
            completedEnd == null &&
            completedPersonId == null &&
            completedPerson == null &&
            completedAutoAssigned == null &&
            plannedStart == null &&
            plannedEnd == null
          )
            return r;
          didChange = true;
          return rest;
        }
        const alreadyApplied = Object.entries(patch).every(([k, v]) => r[k] === v);
        if (alreadyApplied) return r;
        didChange = true;
        return { ...r, ...patch };
      });
      return didChange ? { ...d, tree: nextTree } : d;
    });
    setSaved(false);
  }, [tree, scheduled, members, vacations, hm, workDays, planStart]);

  // The comparison as a PDF. The model is built where the dialog is (one set
  // of figures and words for both); null while no scenario is on screen.
  const scnReport = useScenarioReport({
    scenario: activeScenario,
    planName: data?.meta?.name || '',
    base: scn?.base || null,
    work: scn ? data : null,
    comparison: scnComparison,
    changes: scnChanges,
    conflicts: scn?.conflicts || 0,
  });
  // A failed export is said out loud from every way in, and said once. The
  // report card has its own handling (ExportCards `run`: message, and no
  // success tick), so it gets the function that throws; the dialog and the
  // palette have none, so they get the one that reports.
  const exportScenarioPDFOrThrow = scnReport ? () => exportScenarioComparePDF(scnReport()) : null;
  const exportScenarioPDF = exportScenarioPDFOrThrow
    ? async () => {
        try {
          await exportScenarioPDFOrThrow();
        } catch (e) {
          console.error(e);
          alert('Export failed: ' + (e?.message || e));
        }
      }
    : null;
  // Don't keep the cursor on a row nobody can see.
  //
  // This used to consult `visibleIdSet` — the hide-done list — while the tree
  // renders from `visibleTreeForViews`, which deliberately puts finished items
  // back when a Δ review window is open. Two lists, one for drawing and one
  // for guarding, and they disagreed about exactly the rows a review is for:
  // you clicked a done item that was plainly on screen and the highlight
  // vanished a beat later, because an effect had decided it was not there.
  // One list now — the one that decides what is drawn.
  useEffect(() => {
    if (!hideDone) return;
    if (selId && !visibleViewIdSet.has(selId)) _setSelId(null);
    setMultiSel(prev => {
      const next = new Set([...prev].filter(id => visibleViewIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [hideDone, selId, visibleViewIdSet]);
  const viewCpSet = cpData.critical;
  const viewCpEdges = cpData.edges;

  // One-shot migration: prior builds wrote auto holidays using a UTC-shifted iso(),
  // so NRW dates landed a day early in the file. Detect that and rewrite them
  // from a fresh computeNRW(). Runs idempotently — if everything already matches,
  // no state update fires.
  useEffect(() => {
    if (!data?.holidays?.length || !meta.planStart || !meta.planEnd) return;
    const migrated = migratedAutoHolidays(data.holidays, meta.planStart, meta.planEnd);
    if (migrated) setData(d => ({ ...d, holidays: migrated }));
  }, [data?.holidays?.length, meta.planStart, meta.planEnd]);

  // Auto-fix tree: derive parent statuses + reconcile team with assigned person.
  // IMPORTANT: these two mutations are combined into ONE setData call so they
  // cannot overwrite each other. The old two-effect pattern caused Effect B to
  // overwrite Effect A's tree, triggering A again → potential render storm.
  useEffect(() => {
    if (!data || !tree.length) return;
    // Use a functional updater so we always operate on the LATEST tree from
    // state, not the closure-captured snapshot (which may be stale if another
    // effect already queued an update).
    setData(d => withDerivedTeamsAndStatuses(d, members));
  }, [stats, members]);

  // The edits: nodes and the tree, the tree editor, queues, resources. The hooks
  // run before any early return, so React sees the same hook order whether
  // `data` is null (the onboarding splash) or loaded.
  const act = useNodeActions({
    mutate,
    setData,
    setHistory,
    setSaved,
    dataRef,
    scnRef,
    meta,
    tree,
    scheduled,
    t: _t,
    setSel,
    setModal,
    setTab,
  });
  const treeEditor = useTreeEditorActions({
    tree,
    selected,
    mutate,
    setSel,
    setMultiSel,
    setRootFilter,
    setTeamFilter,
    setPersonFilter,
    setSearch,
    setHideDone,
    setDiffOnlyChanged,
    setHorizonOnlyPlanned,
    act,
  });
  const queueActions = useQueueActions({ tree, leaves, mutate });
  const resActions = useResourceActions({ members, teams, planStart, effDate, effFold, resLens, mutate, act });
  const { onHolUpdate } = resActions;

  // Export context — shared data bag for all export functions in utils/exports.js.
  // diff / horizonIds / horizonEnd / futureProgressByRootId / roadmapAssignment
  // must be forwarded so the PDF Subway-Map renders the SAME line assignments
  // and overlays as the on-screen Roadmap.jsx — otherwise the export shows a
  // re-computed assignment and projects land on different lines.
  // NOTE: tree / members / teams / meta / roadmapAssignment are deliberately
  // NOT passed — buildExportCtx reads them off `data`, so the filtered view
  // copies (activeTree, visibleTree, …) can never reach an export. See
  // utils/exportCtx.js.
  // An export of a scenario says so in its title: a PDF travels without the
  // bar that marks the screen, and a what-if must never pass for the plan.
  const exportData =
    activeScenario && data
      ? { ...data, meta: { ...(data.meta || {}), name: _t('scn.exportSuffix', data.meta?.name || '', activeScenario.name) } }
      : data;
  const _exportCtx = () =>
    buildExportCtx({
      data: exportData,
      scheduled,
      weeks,
      cpSet,
      goalPaths,
      stats,
      confidence,
      lang: _lang,
      diff,
      horizonIds,
      horizonEnd,
      futureProgressByRootId,
      projectWaitsOf,
    });
  const isMdFile = fileName?.endsWith('.md');
  const logWriters = useLogWriters({
    data,
    tree,
    isMdFile,
    setData,
    setPast,
    scnRef,
    pastRef,
    fileDataRef,
    lastSavedPlanRef,
    lastSavedLeavesRef,
  });
  logWritersRef.current = logWriters;
  function loadFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async ev => {
      try {
        const text = ev.target.result;
        const isMd = f.name.endsWith('.md');
        const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
        if (!d.tree || !Array.isArray(d.tree) || d.tree.length === 0)
          throw new Error(isMd ? 'No work items found in this Markdown file.' : 'Invalid project file.');
        // Set data first, then clean up handle in background
        setData(d);
        resetHistory(); // different document — the old undo stack doesn't apply
        setSel(null);
        setSaved(true);
        setFileName(f.name);
        setFileWriteOk(false);
        setAutoSave(true);
        forgetHandle().catch(() => {});
      } catch (e) {
        alert(e.message || 'Invalid project file.');
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }
  function onBarClick(s, focusRequest = null) {
    const node = tree.find(r => r.id === (s.treeId || s.id));
    if (!node) return;
    let effectiveFocus = focusRequest;
    let modalNodeValue;
    if (s.isHandoff && typeof s.segmentIdx === 'number') {
      // Handoff-shadow click: open the PRIMARY's modal (not the shadow), jump
      // the user straight into the handoff editor on the right stage. We do
      // NOT spread the shadow over the node — that would put `#N` in the
      // title and make the top-level Team/Assign fields look like they edit
      // the shadow (they don't; they edit the primary tree item).
      effectiveFocus = {
        ...(focusRequest || {}),
        section: 'handoff',
        handoffStage: s.segmentIdx - 1,
        handoffShadowId: s.id,
      };
      modalNodeValue = node;
    } else {
      modalNodeValue = { ...node, ...s };
    }
    flushSync(() => {
      setModalFocus(effectiveFocus);
      setMN(modalNodeValue);
      setModal('node');
    });
  }
  async function newProject() {
    await forgetHandle();
    setFileWriteOk(false);
    setAutoSave(true);
    setSaved(true);
    setLastSavedAt(null);
    setData(null);
    resetHistory();
    setSel(null);
    setModal(null);
    setTab('summary');
  }

  // Restore mounted file after page reload (when bootstrap left us with a handle but no read permission)
  async function restoreMountedFile() {
    const handle = fileHandleRef.current;
    if (!handle) return;
    try {
      const granted = await requestHandlePermission(handle, 'readwrite');
      if (granted !== 'granted') {
        const readOnly = await requestHandlePermission(handle, 'read');
        if (readOnly !== 'granted') return;
      }
      const file = await handle.getFile();
      const text = await file.text();
      const d = normalizeLoadedData(handle.name?.endsWith('.md') ? parseMdToProject(text) : JSON.parse(text));
      if (!isValidProjectData(d)) throw new Error('Invalid project file in mounted location.');
      setData(d);
      resetHistory(); // different document — the old undo stack doesn't apply
      setSel(null);
      setSaved(true);
      setLastSavedAt(new Date());
      const canWrite = await ensureHandlePermission(handle, false);
      setFileWriteOk(canWrite);
      setAutoSave(true);
    } catch (e) {
      alert('Could not restore mounted file: ' + (e.message || e));
      await forgetHandle();
    }
  }

  const onGanttBarClick = useStableCallback((...a) => onBarClick(...a));
  const onNetNodeClick = useStableCallback(r => onBarClick(r));
  // Clicking an item — anywhere — opens that item's own edit dialog. The same
  // one a Gantt bar and a graph node open, because it is the same question:
  // what is this, and can I change it without leaving what I was reading.
  //
  // There were three of these. #27 gave the Roadmap tab this behaviour and
  // said why: routing a click through "set the root filter and jump to the
  // Tree" is navigation, not editing — you lose the map you were reading to
  // get a dialog you could have had in place. The Overview's subway map kept
  // the old handler, which is the map that gets looked at most, and Planning
  // had a third one that opened the bare tree node without the schedule's half
  // of the answer. One handler now (principle 7).
  //
  // Navigating to a row in the tree is still a thing you can want, and it is
  // still here — as `onNavigate`, a separate gesture with its own name, rather
  // than as what a click silently did to a work package but not to a leaf.
  const onOpenItemDialog = useStableCallback(id => {
    // A leaf has a scheduled row — dates, effort, assignment — and the dialog
    // wants it merged in; a work package has none and opens as the tree node.
    const row = scheduled.find(s2 => (s2.treeId || s2.id) === id && !s2.isHandoff);
    onBarClick(row || { id });
  });
  const onSumNavigate = useStableCallback((id, target) => {
    const node = tree.find(r => r.id === id);
    if (node) setSel(node);
    setTab(target || 'tree');
  });
  const onNetAddNode = useStableCallback(() => setModal('add'));
  const onSumExportTodo = useStableCallback(horizonDays => exportSprintMarkdown({ ..._exportCtx(), horizonDays }));

  if (!bootstrapped) return <BootScreen />;

  if (!data && fileName && fileHandleRef.current)
    return <RestoreMountScreen fileName={fileName} onRestore={restoreMountedFile} onForget={forgetHandle} />;

  if (!data)
    return (
      <EmptyState
        t={_t}
        modal={modal}
        setModal={setModal}
        fRef={fRef}
        onLoadFile={loadFromFile}
        onFileInput={loadFile}
        session={{ setData, resetHistory, setSaved }}
        setTab={setTab}
        setSel={setSel}
        setTourStep={setTourStep}
      />
    );

  // removed: topDownReady guide bubble (was blocking tree view)

  const TABS = buildTabs(_t, showNewFeat);
  const TOUR_STEPS = buildTourSteps(_t);
  const NEW_FEATURES = buildNewFeatures(_t);
  const exportHandlerProps = buildExportHandlerProps({
    tab,
    setModal,
    exportCtx: _exportCtx,
    onScenarioPDF: exportScenarioPDFOrThrow,
    fileDataRef,
    data,
  });

  const paletteCommands = buildPaletteCommands({
    _t,
    saved,
    scn,
    scenarioList,
    loadFromFile,
    saveToFile,
    setModal,
    setTab,
    newProject,
    startTour,
    scenarioSwitch,
    scenarioApply,
    exportScenarioPDF,
  });

  // What the render layer reads, in three bundles. Each is merged by name, so
  // two sources carrying the same name is an error on the first render. They are rebuilt every render on
  // purpose: the components below hold no state and are not memoised, so a stable
  // identity would buy nothing, and the inner views get their members one by one.
  const plan = mergeNamed(planModel, reviewDiff, visible, scenarioView, lensDates, {
    activeScenario,
    data,
    effContext,
    effDate,
    effDropDate,
    horizonDays,
    members,
    meta,
    past,
    pastStart,
    scenarioList,
    scn,
    scnChanges,
    scnCompareMemory,
    searchIdx,
    teams,
    vacations,
    viewCpEdges,
    viewCpSet,
  });

  const view = mergeNamed(uiPrefs, fileSyncState, filterChips, {
    archiveDays,
    autoSave,
    bulkEditModalOpen,
    deferredSearch,
    diffOnlyChanged,
    fileName,
    fileSynced,
    fileWriteOk,
    ganttRoadmapFocus,
    hideDone,
    horizonOnlyPlanned,
    lastSavedAt,
    modal,
    modalFocus,
    modalNode,
    multiSel,
    personFilter,
    resLens,
    rootFilter,
    saved,
    scnNotice,
    search,
    selected,
    setArchiveDays,
    setAutoSave,
    setBulkEditModalOpen,
    setGanttRoadmapFocus,
    setMN,
    setModal,
    setModalFocus,
    setMultiSel,
    setRootFilter,
    setScnNotice,
    setSearch,
    setSearchIdx,
    setSel,
    setShowArchived,
    setSideTab,
    setTab,
    setTourStep,
    showArchived,
    showNewFeat,
    sideTab,
    sinceDays,
    tab,
    tabFades,
    teamFilter,
    tourStep,
  });
  // The two raw writes a component may ask for, by name. `mutate`, `setData`
  // and `setSaved` themselves stay in here: a component that held them could
  // write past undo without anybody noticing.
  const setHistoryEvents = events => mutate(d => ({ ...d, historyEvents: events }));
  // Another document on screen: a new project, or a snapshot brought back.
  const showLoadedDocument = d => {
    setData(d);
    resetHistory();
    setSaved(false);
  };
  // One object for the components, built so that the same name twice is an
  // error on the first render instead of one action silently replacing another.
  const handlers = mergeNamed(act, treeEditor, queueActions, resActions, {
    closeTour,
    dismissNewFeat,
    exportScenarioPDF,
    handleRedo,
    handleUndo,
    loadFile,
    loadFromFile,
    newProject,
    onGanttBarClick,
    onNetAddNode,
    onNetNodeClick,
    onOpenItemDialog,
    onSumExportTodo,
    onSumNavigate,
    persistDiffOnlyChanged,
    persistHorizon,
    persistHorizonOnly,
    persistSince,
    pickEffDate,
    reloadFromFile,
    reschedule,
    saveToFile,
    scenarioApply,
    scenarioCreate,
    scenarioDelete,
    scenarioRename,
    scenarioRevertChange,
    scenarioSwitch,
    setHistoryEvents,
    showLoadedDocument,
    startTour,
    syncTabFades,
  });

  return (
    <>
      <CapacityProvider value={capacityAt}>
        <HoverTipProvider />
        <CommandPalette commands={paletteCommands} />
        <KeyboardMap />
        <div className={`app${scn ? ' in-scenario' : ''}`} ref={appRef}>
          <div className="topbar">
            <TopBarFile plan={plan} view={view} handlers={handlers} SAVE_DEBOUNCE_MS={SAVE_DEBOUNCE_MS} _t={_t} hosted={hosted} />
            <ExternalChangeBanner view={view} handlers={handlers} _t={_t} />
            <TopBarState plan={plan} view={view} handlers={handlers} _t={_t} history={history} fRef={fRef} />
          </div>
          <ScenarioStrip plan={plan} view={view} handlers={handlers} />
          <TabBar view={view} handlers={handlers} TABS={TABS} _t={_t} activeTabRef={activeTabRef} tabBarRef={tabBarRef} />
          <FilterBar plan={plan} view={view} handlers={handlers} _t={_t} searchRef={searchRef} />
          <div className="main">
            {visitedTabs.has('summary') && <SummaryPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('briefing') && <BriefingPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('plan') && <PlanPane plan={plan} view={view} handlers={handlers} />}
            {/* The tree pane was the one pane left outside Frozen. It is the most
          expensive of them all — 298 rows on a real plan — so it was the one
          re-rendering, unseen, on every switch to any other tab. Measured in
          Chromium on a 404-item plan: ~40 ms per switch, gone. */}
            {visitedTabs.has('tree') && (
              <div className="pane-full" style={{ display: tab === 'tree' ? 'flex' : 'none', flexDirection: 'row' }}>
                <Frozen active={tab === 'tree'}>
                  <TreeList plan={plan} view={view} handlers={handlers} />
                  <TreeSide plan={plan} view={view} handlers={handlers} _t={_t} />
                </Frozen>
              </div>
            )}
            {visitedTabs.has('gantt') && <GanttPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('roadmap') && <RoadmapPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('net') && <NetPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('order') && <OrderPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('resources') && <ResourcesPane plan={plan} view={view} handlers={handlers} />}
            {visitedTabs.has('holidays') && (
              <div className="pane" style={{ display: tab === 'holidays' ? undefined : 'none' }}>
                <Frozen active={tab === 'holidays'}>
                  <HolView holidays={data.holidays || []} planStart={planStart} planEnd={planEnd} onUpdate={onHolUpdate} />
                </Frozen>
              </div>
            )}
            {visitedTabs.has('report') && (
              <div className="pane" style={{ display: tab === 'report' ? undefined : 'none' }}>
                <Frozen active={tab === 'report'}>
                  <ReportView {...exportHandlerProps} />
                </Frozen>
              </div>
            )}
          </div>
          <ItemModals plan={plan} view={view} handlers={handlers} _t={_t} />
          <ScenarioModals plan={plan} view={view} handlers={handlers} />
          <SettingsModals plan={plan} view={view} handlers={handlers} />
          <ProjectFileModals plan={plan} view={view} handlers={handlers} exportHandlerProps={exportHandlerProps} />

          <OnboardingModals view={view} handlers={handlers} NEW_FEATURES={NEW_FEATURES} TOUR_STEPS={TOUR_STEPS} _t={_t} />
        </div>
      </CapacityProvider>
    </>
  );
}
