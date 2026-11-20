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
import { initialShell, loadLocalProject, isValidProjectData, NEW_BADGE_TAB_IDS, SEARCH_TABS, MATCH_STEP_TABS } from './app/shell.js';
import { flushSync } from 'react-dom';
import { GT_MARKS } from './constants.js';
import { iso } from './utils/date.js';
import { useT } from './i18n.jsx';
import { normalizeLoadedData } from './utils/loadedData.js';
import {
  exportJSON,
  exportNetworkPNG,
  exportGanttPNG,
  exportSprintMarkdown,
  exportMermaid,
  exportReportDocx,
  exportSummaryPDF,
  exportGanttPDF,
  exportTodoPDF,
  exportWhatWhenPDF,
} from './utils/exports.js';
import { parseMdToProject } from './utils/markdownParse.js';
import { buildMarkdownText as _buildMd } from './utils/markdown.js';
import { buildMemberShortMap } from './utils/memberShort.js';
import { applyPastEdit, localDay, logStart, planOn, recordToday } from './utils/dayLog.js';
import {
  applyPatch,
  isEmptyPatch,
  carryScenarioList,
  deepEqual,
  describeChanges,
  diffPlan,
  newScenarioId,
  revertChange,
  uniqueScenarioName,
  withScenarioPatch,
} from './utils/scenario.js';
import { exportScenarioComparePDF } from './utils/scenarioReport.js';
import { dropChange } from './utils/effective.js';
import { CapacityProvider } from './utils/capacityLens.js';
import { leafSnapshot, diffSnapshots, supersededByBackdate, stampPendingDates, withoutPendingDates } from './utils/history.js';
import { createHistory, push as pushHistory, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from './utils/undo.js';
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

const NO_SCENARIOS = [];
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
  // ── Undo/redo ────────────────────────────────────────────────────────────
  // `history` holds only past/future — the present lives in `data` itself.
  // `mutate` is the single gateway every USER-initiated edit routes through
  // (see utils/undo.js for the coalescing/redo-clearing rules). Automatic
  // writes — parent-status derivation, completion-metadata sync, roadmap-
  // assignment merge, autosave, migrations — stay on plain setData so they
  // never show up as an undo step. Loading a different document (file open,
  // new project, snapshot restore) calls resetHistory() instead.
  const [history, setHistory] = useState(() => createHistory({ limit: 100 }));
  // A different document is on screen: its undo stack is gone, and so is any
  // scenario that was open over the previous one.
  function resetHistory() {
    diskTextRef.current = null;
    busyRoundsRef.current = 0;
    clearTimeout(saveRetryTimerRef.current);
    setEffDate('');
    setPast(null);
    lastSavedPlanRef.current = null;
    dayUndoRef.current = null;
    setHistory(createHistory({ limit: 100 }));
    setScn(null);
    planHistoryRef.current = null;
    setScnNotice(null);
    leafBaselineStaleRef.current = true;
  }
  // ── Scenarios ────────────────────────────────────────────────────────────
  // While a scenario is on screen, `data` IS the scenario — the plan with the
  // scenario's changes applied — and every view, edit, undo and export works
  // on it exactly as it does on the plan. The plan itself waits in `scn.base`.
  // The file always holds the plan plus, per scenario, what differs
  // (`fileData` below); nothing a scenario does reaches the plan until it is
  // applied. See utils/scenario.js and docs/scenarios.md.
  const [scn, setScn] = useState(null); // { id, base, conflicts } | null
  const scnRef = useRef(scn);
  scnRef.current = scn;
  // ── An earlier day ───────────────────────────────────────────────────
  // The same arrangement for time: while an earlier day is chosen, `data` IS
  // the plan as it stood on that day, and every view and edit works on it as
  // always. The real plan waits in `past.base`; what belongs in the file is
  // that plan with what was edited on screen applied from the chosen day on
  // (`fileData`, utils/dayLog.js). Not available inside a scenario.
  const [past, setPast] = useState(null); // { day, base, baseScreen } | null
  const pastRef = useRef(past);
  pastRef.current = past;
  // The plan as the last save (or the load) left it: what today's log entry
  // is measured against.
  const lastSavedPlanRef = useRef(null);
  // The plan's undo stack, set aside while an earlier day is on screen. It
  // comes back when the visit changed nothing; a visit that did change the
  // plan starts a new stack, because the old snapshots no longer lead to it.
  const dayUndoRef = useRef(null); // { history, real }
  // The plan's undo stack, set aside while a scenario is on screen, so that a
  // look at a what-if does not cost the plan its history.
  const planHistoryRef = useRef(null); // { history, ids }
  // Which tab of the comparison was open: kept for the app's lifetime so a
  // jump to a task and back lands where it left.
  const scnCompareMemory = useRef({ tab: 'projects', onlyMoved: true });
  // What just happened to a scenario — applied, deleted — said out loud for a
  // moment, with the way back. Leaving a mode must not look like nothing.
  const [scnNotice, setScnNotice] = useState(null); // { kind, name, changes }
  useEffect(() => {
    if (!scnNotice) return undefined;
    const timer = setTimeout(() => setScnNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [scnNotice]);
  // Always the data of the latest completed render — see mutate() below.
  const dataRef = useRef(data);
  dataRef.current = data;
  // The snapshot comes from a ref, not from the render closure. This file's
  // mutation helpers are deliberately written as functional updaters because
  // callbacks fired in rapid succession would otherwise see a stale `data`
  // (see the comments on updateNode / removeDep) — and a stale SNAPSHOT is
  // the same bug wearing a different hat: ⌘Z would jump back further than the
  // one edit the user just made. Coalescing hides it most of the time, which
  // is exactly what would make it hard to find later.
  function mutate(updater) {
    // The notice offers "undo" for the apply or delete it reports; after
    // another edit that button would undo the edit instead.
    setScnNotice(null);
    setHistory(h => pushHistory(h, dataRef.current, { coalesceMs: 300 }));
    setData(updater);
    setSaved(false);
  }
  function handleUndo() {
    if (!canUndo(history)) return;
    const { history: nextHistory, snapshot } = undoHistory(history, data);
    if (snapshot === undefined) return;
    setHistory(nextHistory);
    setData(snapshot);
    setSaved(false);
    setScnNotice(null);
  }
  function handleRedo() {
    if (!canRedo(history)) return;
    const { history: nextHistory, snapshot } = redoHistory(history, data);
    if (snapshot === undefined) return;
    setHistory(nextHistory);
    setData(snapshot);
    setSaved(false);
    setScnNotice(null);
  }
  const scnPatch = useMemo(() => (scn && data ? diffPlan(scn.base, data) : null), [scn, data]);
  const scnChanges = useMemo(() => (scn && data ? describeChanges(scn.base, data, scnPatch) : NO_SCENARIOS), [scn, data, scnPatch]);
  // What belongs in the file: the plan, and each scenario as its patch.
  const fileData = useMemo(() => {
    if (past && data) return applyPastEdit(past.base, past.baseScreen, data, past.day);
    if (!scn || !data) return data;
    // Nothing changed in this visit: the entry keeps its stored patch, its
    // count of changes that no longer fit, and its date. Opening a scenario
    // whose plan has moved on would otherwise save the shortened patch on
    // sight and lose the record that something was left out.
    if (deepEqual(scnPatch, scn.entryPatch)) return { ...scn.base, scenarios: data.scenarios || [] };
    return { ...scn.base, scenarios: withScenarioPatch(data.scenarios || [], scn.id, scnPatch, scnChanges.length) };
  }, [scn, past, data, scnPatch, scnChanges]);
  const fileDataRef = useRef(fileData);
  fileDataRef.current = fileData;
  // Put a document on screen: the plan (`scenarioId` null) or one of its
  // scenarios. `fd` is always file-shaped — the plan with its scenario list.
  // `undoTo`, when given, becomes the one step ⌘Z can take back: used where
  // leaving a scenario also changes the plan (apply) or drops it (discard).
  function showDocument(fd, scenarioId, undoTo = null) {
    const target = scenarioId ? (fd.scenarios || []).find(s => s.id === scenarioId) : null;
    if (target) {
      const { data: work, conflicts } = applyPatch(fd, target.patch);
      // `entryPatch` is what the scenario amounts to as it was opened. While
      // the visit has not changed that, the stored entry is left exactly as
      // it is (see fileData) — looking at a scenario must not rewrite it.
      setScn({ id: target.id, base: fd, conflicts: conflicts.length + (target.lost || 0), entryPatch: diffPlan(fd, work) });
      setData(work);
    } else {
      setScn(null);
      setData(fd);
    }
    // Undo. A scenario starts each visit with an empty stack — its earlier
    // snapshots were measured against a plan that may have moved since. The
    // plan gets its own stack back, with the scenario list in every snapshot
    // brought up to date (carryScenarioList), so ⌘Z after a visit undoes the
    // last edit to the plan and nothing that was done in the scenario.
    const wasInPlan = !scnRef.current;
    let next = createHistory({ limit: 100 });
    if (target) {
      if (wasInPlan) planHistoryRef.current = { history, ids: new Set((dataRef.current?.scenarios || []).map(s => s.id)) };
    } else {
      const kept = planHistoryRef.current;
      planHistoryRef.current = null;
      if (wasInPlan) next = history;
      else if (kept) {
        const list = (undoTo || fd).scenarios || [];
        next = {
          ...kept.history,
          past: kept.history.past.map(snap => carryScenarioList(snap, list, kept.ids)),
          future: [],
          lastPushAt: null,
        };
      }
      if (undoTo) next = pushHistory({ ...next, lastPushAt: null }, undoTo, { coalesceMs: 0 });
    }
    setHistory(next);
    setMultiSel(new Set());
    setScnNotice(null);
  }
  const scenarioList = data?.scenarios || NO_SCENARIOS;
  const activeScenario = scn ? scenarioList.find(s => s.id === scn.id) || null : null;
  function scenarioSwitch(id) {
    if (pastRef.current) return;
    if ((scn?.id || null) === (id || null)) return;
    showDocument(fileDataRef.current, id || null);
  }
  function scenarioCreate(name, { copyOf = null } = {}) {
    const fd = fileDataRef.current;
    if (!fd || pastRef.current) return null;
    const list = fd.scenarios || [];
    const source = copyOf ? list.find(s => s.id === copyOf) : null;
    const id = newScenarioId(list);
    const fallback = source ? _t('scn.copyName', source.name) : _t('scn.defaultName', list.length + 1);
    const entry = {
      id,
      name: uniqueScenarioName((name || '').trim() || fallback, list),
      createdAt: new Date().toISOString(),
      patch: source?.patch || null,
    };
    showDocument({ ...fd, scenarios: [...list, entry] }, id);
    setSaved(false);
    return id;
  }
  function scenarioRename(id, name) {
    const clean = (name || '').trim();
    if (!clean) return;
    mutate(d => ({
      ...d,
      scenarios: (d.scenarios || []).map(s => (s.id === id ? { ...s, name: uniqueScenarioName(clean, d.scenarios || [], id) } : s)),
    }));
  }
  // Deleting the scenario on screen leaves it for the plan; ⌘Z brings it back.
  function scenarioDelete(id) {
    if (scn?.id === id) {
      const fd = fileDataRef.current;
      const gone = (fd.scenarios || []).find(s => s.id === id);
      const rest = { ...fd, scenarios: (fd.scenarios || []).filter(s => s.id !== id) };
      if (!rest.scenarios.length) delete rest.scenarios;
      showDocument(rest, null, fd);
      setScnNotice({ kind: 'deleted', name: gone?.name || '', changes: scnChanges.length });
      setSaved(false);
      return;
    }
    mutate(d => ({ ...d, scenarios: (d.scenarios || []).filter(s => s.id !== id) }));
  }
  // The scenario becomes the plan. Everything else in the list stays, and now
  // measures against the new plan. One ⌘Z takes it back, scenario included.
  function scenarioApply() {
    if (!scn || !data) return;
    const before = fileDataRef.current;
    const plan = { ...data, scenarios: (data.scenarios || []).filter(s => s.id !== scn.id) };
    if (!plan.scenarios.length) delete plan.scenarios;
    const name = activeScenario?.name || '';
    const changes = scnChanges.length;
    showDocument(plan, null, before);
    setScnNotice({ kind: 'applied', name, changes });
    setSaved(false);
    setModal(m => (m === 'scenario' ? null : m));
  }
  function scenarioRevertChange(change) {
    if (!scn) return;
    const { data: work } = applyPatch(scn.base, revertChange(scnPatch, change));
    mutate(d => ({ ...work, scenarios: d.scenarios, historyEvents: d.historyEvents, roadmapAssignment: d.roadmapAssignment }));
  }
  const fRef = useRef(null);
  const searchRef = useRef(null);
  const prevTreeRef = useRef([]);
  const prevScheduledRef = useRef([]);
  // Leaf-state snapshot at the moment of the last successful persist (load or
  // save). Drives the history-event diff: every save compares the current tree
  // to this snapshot and appends only the changes. Reseeded on file load so
  // we don't emit fake "added" events for the whole tree.
  const lastSavedLeavesRef = useRef(null);
  const leafBaselineStaleRef = useRef(true);
  const { editorDock, setEditorDock, appRef, editorAsDialog, uiScale, setUiScale, showTreeIds, setShowTreeIds } = useUiPrefs(portalRoot);
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
  const { saving, saveCountdown, externalChangeAvailable, setExternalChangeAvailable, reloadFromFile, saveToFile, loadFromFile } =
    useFileSync({
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
  const {
    tree,
    goals,
    hm,
    planStart,
    planEnd,
    workDays,
    capacityAt,
    personQueues,
    scheduled,
    weeks,
    reschedule,
    projectWaitsOf,
    stats,
    cpData,
    cpSet,
    cpLabels,
    goalPaths,
    leaves,
    droppedCount,
    confidence,
    confReasons,
  } = usePlanModel({ data, members, vacations, meta, past });
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
  const {
    sinceDate,
    horizonEnd,
    horizonIds,
    futureProgressByRootId,
    diff,
    diffDoneSet,
    diffChangedSet,
    diffProgressedSet,
    horizonFilterSet,
    diffFilterSet,
    diffVisibleSet,
  } = useReviewDiff({
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
  const {
    archive,
    activeTree,
    activeMembers,
    activeScheduled,
    rootItems,
    netRootOptions,
    visibleTreeForViews,
    visibleViewIdSet,
    viewScheduled,
    viewGoals,
    viewStats,
  } = useVisibleTree({
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
  const { quickFilters, activeQuickFilters, scopeFields, activeScopeChips } = useFilterChips({
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
  const { scnComparison, scnBaseline, scnShifts, scnChangedIds } = useScenarioView({ scn, data, scheduled, scnChanges });
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
  const [effDate, setEffDate] = useState('');
  const { resLens, effDates, effCount } = useResourceLens({ data, effDate });
  // A day before today is a look at the plan as it was (and a place to
  // correct it from then on); a day after today is where capacity changes.
  // The same plan, whatever a save added to its logs in between.
  const sameDocument = (a, b) => a === b || isEmptyPatch(diffPlan(a, b));
  const pickEffDate = day => {
    const wanted = day || '';
    const goPast = !!wanted && wanted < localDay() && !scnRef.current;
    const from = pastRef.current;
    if (from || goPast) {
      // Back to the real plan first, with whatever was edited on that day.
      let real = from ? fileDataRef.current : recordToday(lastSavedPlanRef.current, dataRef.current);
      if (!real) return;
      // What was changed today and not saved yet is written to the history
      // now, as of today: once the earlier day is on screen, every entry a
      // save finds counts for that day.
      if (!from && lastSavedLeavesRef.current) {
        const snapshot = leafSnapshot(sortTree(real.tree || []));
        const ts = new Date().toISOString();
        const events = stampPendingDates(diffSnapshots(lastSavedLeavesRef.current, snapshot, ts, null), real.asOfPending, snapshot, ts);
        lastSavedLeavesRef.current = snapshot;
        real = recordSavedEvents(real, events, real.asOfPending || null);
      }
      lastSavedPlanRef.current = real;
      if (goPast) {
        const screen = planOn(real, wanted);
        setPast({ day: wanted, base: real, baseScreen: screen });
        setData(screen);
      } else {
        setPast(null);
        setData(real);
      }
      // Snapshots of one day are not edits of another.
      if (!from) dayUndoRef.current = { history, real };
      const kept = dayUndoRef.current;
      const untouched = !goPast && kept && sameDocument(kept.real, real);
      if (!goPast) dayUndoRef.current = null;
      setHistory(untouched ? kept.history : createHistory({ limit: 100 }));
      if (from && !untouched) setSaved(false);
    }
    setEffDate(wanted);
    if (wanted && !goPast) setTab('resources');
  };
  // On an earlier day the screen already is that day: an edit there is an
  // ordinary edit, and the day log carries it forward.
  const effFold = past ? null : effDate || null;
  const pastStart = useMemo(() => (past ? logStart(past.base) : null), [past]);
  const effDropDate = from => mutate(d => dropChange(d, from));
  const effContext = useMemo(
    () => ({
      date: effDate,
      changes: data?.changes || [],
      onGo: day => pickEffDate(day || ''),
      onDrop: (from, kind, id) => mutate(d => dropChange(d, from, kind, id)),
    }),
    [effDate, data?.changes, past?.day, scn?.id],
  );

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
  // Build the file content together with any new history events. The events
  // capture the delta between the leaf state at the last successful persist
  // (`lastSavedLeavesRef`) and the current tree. Returns { content, newEvents,
  // snapshot } so the caller can commit the ref+state after a successful write.
  function composeFileForSave() {
    // A scenario on screen: the file gets the plan it rests on plus the
    // scenario's patch, and no history — nothing in a what-if has happened.
    if (scnRef.current) {
      const fd = fileDataRef.current;
      const content = isMdFile
        ? _buildMd({
            tree: sortTree(fd.tree || []),
            members: fd.members || [],
            teams: fd.teams || [],
            vacations: fd.vacations || [],
            data: fd,
            meta: fd.meta || {},
          })
        : JSON.stringify(fd, null, 2);
      return { content, newEvents: [], snapshot: lastSavedLeavesRef.current };
    }
    // An earlier day on screen: the file gets the real plan, with what was
    // edited here applied from that day on. Its history entries count for
    // that day, and the day log was rebuilt with the edit (utils/dayLog.js).
    const visit = pastRef.current;
    const real = visit ? fileDataRef.current : recordToday(lastSavedPlanRef.current, data);
    const realTree = visit ? sortTree(real.tree || []) : tree;
    const ts = new Date().toISOString();
    const currSnapshot = leafSnapshot(realTree);
    let newEvents = [];
    if (lastSavedLeavesRef.current) {
      newEvents = stampPendingDates(
        diffSnapshots(lastSavedLeavesRef.current, currSnapshot, ts, visit ? visit.day : null),
        real?.asOfPending,
        currSnapshot,
        ts,
      );
    }
    // A backdated entry supersedes the later ones it contradicts, or the
    // replay walks done → wip → done and every review in between reports the
    // wrong state (utils/history.js).
    const { kept } = supersededByBackdate(real?.historyEvents || [], newEvents);
    const eventsForFile = newEvents.length ? [...kept, ...newEvents] : kept;
    const plain = withoutPendingDates(real);
    const dataForFile = eventsForFile.length ? { ...plain, historyEvents: eventsForFile } : plain;
    const content = isMdFile
      ? _buildMd({
          tree: realTree,
          members: real.members || [],
          teams: real.teams || [],
          vacations: real.vacations || [],
          data: dataForFile,
          meta: real.meta || {},
        })
      : JSON.stringify(dataForFile, null, 2);
    return {
      content,
      newEvents,
      snapshot: currSnapshot,
      pendingRead: real?.asOfPending || null,
      savedPlan: real,
      visit: visit ? { day: visit.day, screen: data } : null,
    };
  }
  // The same diff the file-save path takes, for when there is no file. Kept
  // separate because composeFileForSave also serialises the whole project,
  // which this does not need.
  function recordHistoryForLocalSave() {
    // An earlier day on screen: recorded once the visit is over, from the
    // real plan (its dated entries wait in `asOfPending`).
    if (!Array.isArray(tree) || scnRef.current || pastRef.current) return;
    const snapshot = leafSnapshot(tree);
    if (!lastSavedLeavesRef.current) {
      lastSavedLeavesRef.current = snapshot;
      return;
    }
    const pendingRead = data?.asOfPending || null;
    const ts = new Date().toISOString();
    const newEvents = stampPendingDates(diffSnapshots(lastSavedLeavesRef.current, snapshot, ts, null), pendingRead, snapshot, ts);
    lastSavedLeavesRef.current = snapshot;
    const savedPlan = recordToday(lastSavedPlanRef.current, data);
    lastSavedPlanRef.current = savedPlan;
    setData(d => withDayLog(recordSavedEvents(d, newEvents, pendingRead), savedPlan.dayLog));
  }
  // The document with the day log a save wrote; the same object when nothing
  // differs, so that a save which changed nothing does not start another.
  function withDayLog(next, log) {
    if (deepEqual(next.dayLog || [], log || [])) return next;
    if (!log || !log.length) {
      const { dayLog, ...rest } = next;
      return rest;
    }
    return { ...next, dayLog: log };
  }
  // What a finished save leaves in the document: its events, and none of the
  // dates it read. A date set while the save was under way is another one and
  // stays for the next save.
  function recordSavedEvents(d, newEvents, pendingRead) {
    const left = withoutPendingDates(d, pendingRead);
    return newEvents && newEvents.length
      ? { ...left, historyEvents: [...supersededByBackdate(left?.historyEvents || [], newEvents).kept, ...newEvents] }
      : left;
  }
  function commitSaveSideEffects({ newEvents, snapshot, pendingRead, savedPlan, visit }) {
    lastSavedLeavesRef.current = snapshot;
    if (visit) {
      // The visit goes on from what was just written: the real plan with its
      // new entries, and the screen as it was when the save read it.
      const base = recordSavedEvents(savedPlan, newEvents, pendingRead);
      if (pastRef.current?.day !== visit.day) {
        // The day was left while the file was being written: what the save
        // recorded goes to wherever the real plan is now. What today's log
        // entry is measured against was set on leaving, and includes edits
        // made after this save read the screen.
        if (pastRef.current) setPast(p => (p ? { ...p, base: recordSavedEvents(p.base, newEvents, pendingRead) } : p));
        else if (!scnRef.current) setData(d => recordSavedEvents(d, newEvents, pendingRead));
        return;
      }
      lastSavedPlanRef.current = base;
      const baseScreen = { ...visit.screen, historyEvents: base.historyEvents };
      setPast({ day: visit.day, base, baseScreen });
      setData(d => (d === visit.screen ? baseScreen : { ...d, historyEvents: base.historyEvents }));
      return;
    }
    if (savedPlan) lastSavedPlanRef.current = savedPlan;
    if (scnRef.current) return;
    setData(d => withDayLog(recordSavedEvents(d, newEvents, pendingRead), savedPlan?.dayLog));
  }
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

  // "New!" badge: shown on tabs until the user dismisses the new-feature popover
  const showNewBadge = showNewFeat;
  const TABS = TAB_IDS.map(id => ({
    id,
    label: _t(`tab.${id}`),
    isNew: showNewBadge && NEW_BADGE_TAB_IDS.has(id),
  }));

  // ── Tour steps (resolved at render time so they pick up the active language) ──
  const TOUR_STEPS = [0, 1, 2, 3].map(i => ({
    icon: _t(`tour.s${i}.icon`),
    title: _t(`tour.s${i}.title`),
    body: _t(`tour.s${i}.body`),
  }));

  // ── New-feature list (shown once to existing users) ──
  const NEW_FEATURES = [
    _t('new.roadmap'),
    _t('new.dayZoom'),
    _t('new.confidence'),
    _t('new.dragLink'),
    _t('new.planReview'),
    _t('new.archive'),
    _t('new.jiraSync'),
    // TODO: add Network Graph improvements once documented
  ];

  // Shared between the Export dialog and Report mode (ReportView.jsx) — both
  // render the same ExportCards grid with the same handlers, so this object
  // is built once and spread into whichever one is mounted.
  const exportHandlerProps = {
    tab,
    onOpenJira: () => setModal('jira'),
    onSummaryPDF: opts => exportSummaryPDF(_exportCtx(), opts),
    onScenarioPDF: exportScenarioPDFOrThrow,
    onGanttPDF: () => exportGanttPDF(_exportCtx()),
    onWhatWhenPDF: () => exportWhatWhenPDF(_exportCtx()),
    onTodoPDF: horizonDays => exportTodoPDF(_exportCtx(), horizonDays),
    onReportDocx: () => exportReportDocx(_exportCtx()),
    onSprintMarkdown: horizonDays => exportSprintMarkdown({ ..._exportCtx(), horizonDays }),
    onMermaid: () => exportMermaid(_exportCtx()),
    onNetworkPNG: () => exportNetworkPNG(_exportCtx()),
    onGanttPNG: () => exportGanttPNG(_exportCtx()),
    // The JSON export is the file in another format: the plan and its
    // scenarios, whichever of them happens to be on screen.
    onJSON: () => exportJSON({ ..._exportCtx(), data: withoutPendingDates(fileDataRef.current || data) }),
    // The two picture exports are taken from a live view, so from anywhere
    // else their card can only say no. Given the way there, it stops being a
    // dead card and becomes one click of setup.
  };

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

  // What the render layer reads, in three bundles. They are rebuilt every render on
  // purpose: the components below hold no state and are not memoised, so a stable
  // identity would buy nothing, and the inner views get their members one by one.
  const plan = {
    activeScenario,
    activeScheduled,
    activeTree,
    archive,
    confReasons,
    confidence,
    cpData,
    cpLabels,
    cpSet,
    data,
    diff,
    diffDoneSet,
    diffFilterSet,
    diffProgressedSet,
    diffVisibleSet,
    droppedCount,
    effContext,
    effCount,
    effDate,
    effDates,
    effDropDate,
    futureProgressByRootId,
    goalPaths,
    goals,
    hm,
    horizonDays,
    horizonEnd,
    horizonFilterSet,
    horizonIds,
    leaves,
    members,
    meta,
    past,
    pastStart,
    personQueues,
    planStart,
    projectWaitsOf,
    scenarioList,
    scheduled,
    scn,
    scnBaseline,
    scnChangedIds,
    scnChanges,
    scnCompareMemory,
    scnComparison,
    scnShifts,
    searchIdx,
    sinceDate,
    stats,
    teams,
    tree,
    vacations,
    viewCpEdges,
    viewCpSet,
    viewGoals,
    viewScheduled,
    viewStats,
    visibleTreeForViews,
    weeks,
    workDays,
  };
  const view = {
    activeQuickFilters,
    activeScopeChips,
    archiveDays,
    autoSave,
    bulkEditModalOpen,
    deferredSearch,
    diffOnlyChanged,
    editorAsDialog,
    editorDock,
    externalChangeAvailable,
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
    quickFilters,
    resLens,
    rootFilter,
    saveCountdown,
    saved,
    saving,
    scnNotice,
    scopeFields,
    search,
    selected,
    setArchiveDays,
    setAutoSave,
    setBulkEditModalOpen,
    setEditorDock,
    setExternalChangeAvailable,
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
    setShowTreeIds,
    setSideTab,
    setTab,
    setTourStep,
    setUiScale,
    showArchived,
    showNewFeat,
    showTreeIds,
    sideTab,
    sinceDays,
    tab,
    tabFades,
    teamFilter,
    tourStep,
    uiScale,
  };
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
