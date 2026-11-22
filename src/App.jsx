import { useState, useMemo, useRef, useEffect } from 'react';
import { useNodeActions } from './app/actions/useNodeActions.js';
import { mergeNamed } from './app/actions/bindActions.js';
import { flushSnapshot } from './app/snapshots.js';
import { useTreeEditorActions } from './app/actions/useTreeEditorActions.js';
import { useOpenActions } from './app/actions/useOpenActions.js';
import { useQueueActions } from './app/actions/useQueueActions.js';
import { useResourceActions } from './app/actions/useResourceActions.js';
import { isMarkdownName } from './utils/fileKind.js';
import { useTabBar } from './app/useTabBar.js';
import { useViewFilters } from './app/useViewFilters.js';
import { useRoadmapFocus, useUiPrefs } from './app/useUiPrefs.js';
import { useSelection } from './app/useSelection.js';
import { useModalState } from './app/useModalState.js';
import { useSearch } from './app/useSearch.js';
import { useTour } from './app/useTour.js';
import { useReviewWindow } from './app/useReviewWindow.js';
import { useFileSession } from './app/useFileSession.js';
import { useFileSync, SAVE_DEBOUNCE_MS } from './app/useFileSync.js';
import { useDocumentState } from './app/useDocumentState.js';
import { useScenarios } from './app/useScenarios.js';
import { useCompletedWindows } from './app/completedWindows.js';
import { useGlobalKeys } from './app/useGlobalKeys.js';
import { buildLogWriters } from './app/logWriters.js';
import { useEarlierDay } from './app/useEarlierDay.js';
import { fileLoaders } from './app/fileLoaders.js';
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
import { initialShell, loadLocalProject } from './app/shell.js';
import { GT_MARKS } from './constants.js';
import { useT } from './i18n.jsx';
import { buildMarkdownText as _buildMd } from './utils/markdown.js';
import { buildMemberShortMap } from './utils/memberShort.js';
import { exportScenarioComparePDF } from './utils/scenarioReport.js';
import { CapacityProvider } from './utils/capacityLens.js';
import { leafSnapshot } from './utils/history.js';
import { buildExportCtx } from './utils/exportCtx.js';
import { sortTree } from './utils/treeEdit.js';
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
  const selection = useSelection();
  const { selId, setSel, setMultiSel } = selection;
  const modalState = useModalState();
  const { modal, setModal, setMN, setModalFocus } = modalState;
  const searchState = useSearch();
  const { search, setSearch, searchIdx, setSearchIdx } = searchState;
  const viewFilters = useViewFilters();
  const { teamFilter, setTeamFilter, rootFilter, setRootFilter, personFilter, setPersonFilter, hideDone, setHideDone } = viewFilters;
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const doc = useDocumentState({ data, setData, setSaved });
  const { history, setHistory, scn, scnRef, past, effDate, scnNotice, setScnNotice, dataRef, mutate } = doc;
  const { lastSavedPlanRef, lastSavedLeavesRef, leafBaselineStaleRef, resetDocumentState, handleUndo, handleRedo } = doc;
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
  } = useScenarios(
    mergeNamed(doc, {
      data,
      setData,
      setSaved,
      setMultiSel,
      setModal,
      _t,
    }),
  );
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
  const { reloadFromFile, saveToFile, loadFromFile, ...fileSyncState } = useFileSync(
    mergeNamed(doc, {
      data,
      saved,
      setSaved,
      setData,
      setSel,
      resetHistory,
      session: fileSession,
      fRef,
      fileDataRef,
      composeFileForSave,
      commitSaveSideEffects,
    }),
  );

  useGlobalKeys({ saveToFile, loadFromFile, setTab, setModal, tab, searchRef, search, setSearchIdx, handleUndo, handleRedo });

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
  const visible = useVisibleTree(
    mergeNamed(viewFilters, {
      tree,
      members,
      scheduled,
      stats,
      overbookedTaskIds,
      sinceDate,
      diffChangedSet,
    }),
  );
  const { archive, activeMembers, rootItems, netRootOptions, visibleViewIdSet } = visible;
  const filterChips = useFilterChips(
    mergeNamed(viewFilters, {
      _t,
      teams,
      archive,
      activeMembers,
      netRootOptions,
      overbookedTaskIds,
      setSearchIdx,
    }),
  );
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
  const { pickEffDate, effFold, pastStart, effDropDate, effContext } = useEarlierDay(
    mergeNamed(doc, {
      data,
      setData,
      setSaved,
      setTab,
      fileDataRef,
    }),
  );

  useCompletedWindows({
    tree,
    scheduled,
    members,
    vacations,
    hm,
    workDays,
    planStart,
    setData,
    setSaved,
    prevTreeRef,
    prevScheduledRef,
  });

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
    if (selId && !visibleViewIdSet.has(selId)) setSel(null);
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

  // Export context — shared data bag for all export functions in utils/export/ (imported through utils/exports.js).
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
  const isMdFile = isMarkdownName(fileName);
  const logWriters = buildLogWriters(
    mergeNamed(doc, {
      data,
      tree,
      isMdFile,
      setData,
      fileDataRef,
    }),
  );
  logWritersRef.current = logWriters;
  const { loadFile, newProject, restoreMountedFile } = fileLoaders({
    setData,
    resetHistory,
    setSel,
    setSaved,
    setModal,
    setTab,
    setFileName,
    setFileWriteOk,
    setAutoSave,
    setLastSavedAt,
    forgetHandle,
    fileHandleRef,
    diskTextRef,
    ensureHandlePermission,
  });
  const openActions = useOpenActions({ tree, scheduled, setModalFocus, setMN, setModal, setSel, setTab, exportCtx: _exportCtx });

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

  const view = mergeNamed(uiPrefs, fileSyncState, filterChips, viewFilters, selection, modalState, searchState, {
    autoSave,
    bulkEditModalOpen,
    diffOnlyChanged,
    fileName,
    fileSynced,
    fileWriteOk,
    ganttRoadmapFocus,
    horizonOnlyPlanned,
    lastSavedAt,
    resLens,
    saved,
    scnNotice,
    selected,
    setAutoSave,
    setBulkEditModalOpen,
    setGanttRoadmapFocus,
    setScnNotice,
    setTab,
    setTourStep,
    showNewFeat,
    sinceDays,
    tab,
    tabFades,
    tourStep,
  });
  // The two raw writes a component may ask for, by name. `mutate`, `setData`
  // and `setSaved` themselves stay in here: a component that held them could
  // write past undo without anybody noticing.
  const setHistoryEvents = events => mutate(d => ({ ...d, historyEvents: events }));
  // Another document on screen: a new project, or a snapshot brought back.
  const showLoadedDocument = d => {
    flushSnapshot();
    setData(d);
    resetHistory();
    setSaved(false);
  };
  // One object for the components, built so that the same name twice is an
  // error on the first render instead of one action silently replacing another.
  const handlers = mergeNamed(act, treeEditor, queueActions, resActions, openActions, {
    closeTour,
    dismissNewFeat,
    exportScenarioPDF,
    handleRedo,
    handleUndo,
    loadFile,
    loadFromFile,
    newProject,
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
