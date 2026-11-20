import { useState, useMemo, useRef, useEffect, useDeferredValue, useCallback } from 'react';
import { useStableCallback } from './app/useStableCallback.js';
import { useTabBar } from './app/useTabBar.js';
import { useViewFilters } from './app/useViewFilters.js';
import { useRoadmapFocus, useUiPrefs } from './app/useUiPrefs.js';
import { TOUR_DONE_KEY, useTour } from './app/useTour.js';
import { useReviewWindow } from './app/useReviewWindow.js';
import { migratedAutoHolidays, trimmedToHorizon, withDerivedTeamsAndStatuses } from './app/planRepairs.js';
import { futureProgressByRoot } from './app/futureProgress.js';
import { overbookedIds, scheduleFiltered, scopeFiltered, withReviewedDone, withoutDone } from './app/viewTree.js';
import { pushSnapshot } from './app/snapshots.js';
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
import { EditModals } from './components/app/EditModals.jsx';
import { ScenarioModals } from './components/app/ScenarioModals.jsx';
import { ConfigModals } from './components/app/ConfigModals.jsx';
import { ProjectModals } from './components/app/ProjectModals.jsx';
import { OnboardingModals } from './components/app/OnboardingModals.jsx';
import { buildPaletteCommands } from './app/paletteCommands.js';
import {
  initialShell,
  loadLocalProject,
  isValidProjectData,
  scheduleIdleWrite,
  cancelIdleWrite,
  NEW_BADGE_TAB_IDS,
  SEARCH_TABS,
  MATCH_STEP_TABS,
} from './app/shell.js';
import { Icon } from './components/shared/Icon.jsx';
import { flushSync } from 'react-dom';
import { SK, GT_MARKS } from './constants.js';
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

import { mergeRoadmapAssignment } from './utils/roadmap.js';
import { buildMarkdownText as _buildMd } from './utils/markdown.js';
import { parseMdToProject } from './utils/markdownParse.js';
import { buildMemberShortMap } from './utils/memberShort.js';
import { isBusy, MAX_BUSY_ROUNDS, stillWritable, writeWithRetry } from './utils/fileWrite.js';
import { applyPastEdit, inIdsOf, localDay, logStart, planOn, recordToday } from './utils/dayLog.js';
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
import { baselineWindows, compareScenario, schedulePlanData } from './utils/scenarioCompare.js';
import { exportScenarioComparePDF } from './utils/scenarioReport.js';
import { addDays, changeDates, compileMembers, dropChange, foldEdit, pruneChanges, resourcesAsOf } from './utils/effective.js';

import { CapacityProvider, capacityLookup } from './utils/capacityLens.js';
import { leafSnapshot, diffSnapshots, supersededByBackdate, pendingDate, stampPendingDates, withoutPendingDates } from './utils/history.js';
import { computeDisplayOrder, applyDisplayOrder } from './utils/displayOrder.js';
import { moveInQueue, placeInQueue, queueOwnerOf, reconcileQueue } from './utils/personQueue.js';
import { computeDiff, parseSinceValue } from './utils/diff.js';
import { createHistory, push as pushHistory, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from './utils/undo.js';
import { buildHMap } from './utils/holidays.js';
import { parseHorizonValue, horizonScopedIds } from './utils/horizon.js';
import { inferGanttViewStart } from './utils/viewWindow.js';
import { scanArchive, stripArchivedRoots, stripArchivedMembers, isArchivedId } from './utils/archive.js';
import { buildExportCtx } from './utils/exportCtx.js';
import { projectWaits } from './utils/projectWaits.js';
import { applyRootOrder } from './utils/orderSearch.js';
import {
  schedule,
  treeStats,
  enrichParentSchedules,
  nextChildId,
  leafNodes,
  isLeafNode,
  parentId,
  computeConfidence,
  derivePhaseStatus,
} from './utils/scheduler.js';
import { buildPasteNodes, sortTree } from './utils/treeEdit.js';
import { applyTreeCommand, applyTreeCommandMany, dropRows, moveSubtree, placeAmongSiblings } from './utils/treeMove.js';
import { deriveCompletedWindow, inferCompletedAt, inferCompletedPersonId, statusChangePatch } from './utils/completion.js';
import { instantiateTemplatePhases } from './utils/phases.js';
import { rootCpm, goalCpm, criticalPathLabelMap } from './utils/cpm.js';
import { deadlineRootIdForNode, isDeadlineRelevantForRoot } from './utils/deadlines.js';
import {
  clearMountedFileHandle,
  loadMountedFileHandle,
  persistMountedFileHandle,
  queryHandlePermission,
  requestHandlePermission,
} from './utils/fileHandleStore.js';
import { TAB_IDS } from './utils/modes.js';

import { usePortalRoot } from './utils/embedHost.js';
import { filePickerAvailable, pickFileToOpen, pickFileToSave } from './utils/filePickers.js';

import { buildResourceLoadMatrix } from './components/shared/ResourceLoadMatrix.jsx';

import { Frozen } from './components/shared/Frozen.jsx';
import { HolView } from './components/views/HolView.jsx';

import { Onboard } from './components/views/Onboard.jsx';

import { NewProjModal } from './components/modals/NewProjModal.jsx';

import { JiraImportModal } from './components/modals/JiraImportModal.jsx';
import { buildImportedProject } from './utils/jiraImport.js';

import { SearchSelect } from './components/shared/SearchSelect.jsx';
import { LazyInput } from './components/shared/LazyInput.jsx';
import { HoverTipProvider } from './components/shared/HoverTip.jsx';
import { CommandPalette } from './components/shared/CommandPalette.jsx';
import { KeyboardMap } from './components/shared/KeyboardMap.jsx';

import { useScenarioReport } from './components/shared/Scenario.jsx';
import { ReportView } from './components/views/ReportView.jsx';

import { withoutTeam, teamForAssignment } from './utils/memberTeams.js';

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
  const fileHandleRef = useRef(null);
  const prevTreeRef = useRef([]);
  const prevScheduledRef = useRef([]);
  // Leaf-state snapshot at the moment of the last successful persist (load or
  // save). Drives the history-event diff: every save compares the current tree
  // to this snapshot and appends only the changes. Reseeded on file load so
  // we don't emit fake "added" events for the whole tree.
  const lastSavedLeavesRef = useRef(null);
  const leafBaselineStaleRef = useRef(true);
  const [fileName, setFileName] = useState(null);
  const { editorDock, setEditorDock, appRef, editorAsDialog, uiScale, setUiScale, showTreeIds, setShowTreeIds } = useUiPrefs(portalRoot);
  const [autoSave, setAutoSave] = useState(() => {
    try {
      const v = localStorage.getItem('planr_autosave');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('planr_autosave', String(autoSave));
    } catch {}
  }, [autoSave]);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const { tourStep, setTourStep, showNewFeat, dismissNewFeat, startTour, closeTour } = useTour();

  async function rememberHandle(handle) {
    fileHandleRef.current = handle;
    setFileName(handle?.name || null);
    if (hosted) {
      onFileChange(handle || null);
      return;
    }
    try {
      if (handle) await persistMountedFileHandle(handle);
      else await clearMountedFileHandle();
    } catch (e) {
      console.error('Could not persist mounted file handle:', e);
    }
  }

  async function forgetHandle() {
    fileHandleRef.current = null;
    setFileName(null);
    if (hosted) {
      onFileChange(null);
      return;
    }
    try {
      await clearMountedFileHandle();
    } catch (e) {
      console.error('Could not clear mounted file handle:', e);
    }
  }

  async function ensureHandlePermission(handle, interactive = false) {
    if (!handle) return false;
    if (!interactive) {
      // Non-interactive: only check existing permission, do not prompt
      const permission = await queryHandlePermission(handle, 'readwrite');
      return permission === 'granted';
    }
    // Interactive: try requestPermission directly (preserves Chrome user activation)
    // requestPermission returns 'granted' if already granted, otherwise prompts the user
    const permission = await requestHandlePermission(handle, 'readwrite');
    return permission === 'granted';
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = mount || (await loadMountedFileHandle());
        if (!handle) return;
        fileHandleRef.current = handle;
        if (!cancelled) setFileName(handle.name || null);

        const readPermission = await queryHandlePermission(handle, 'read');
        // Permission is "prompt" or "denied" → keep filename visible so user can re-grant
        if (readPermission !== 'granted') {
          if (!cancelled) setFileWriteOk(false);
          return;
        }

        const file = await handle.getFile();
        const text = await file.text();
        const restored = normalizeLoadedData(handle.name?.endsWith('.md') ? parseMdToProject(text) : JSON.parse(text));
        if (!isValidProjectData(restored)) throw new Error('Invalid mounted project file.');

        if (!cancelled) {
          setData(restored);
          resetHistory(); // different document — the old undo stack doesn't apply
          setSel(null);
          // Check if we have write permission (non-interactive)
          const canWrite = await ensureHandlePermission(handle, false);
          if (!cancelled) setFileWriteOk(canWrite);
        }
      } catch (e) {
        console.error('Mounted file restore failed:', e);
        fileHandleRef.current = null;
        if (!cancelled) setFileName(null);
        try {
          if (!hosted) await clearMountedFileHandle();
        } catch {}
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save to localStorage on every change (fast, in-memory) — separate from file save
  const [fileWriteOk, setFileWriteOk] = useState(true);
  const [fileSynced, setFileSynced] = useState(true); // whether the file on disk matches current data
  const lastOwnWriteRef = useRef(0); // timestamp of our last file write (to ignore in poll)
  const lastWrittenDataRef = useRef(null);
  useEffect(() => {
    if (!data) return;
    // A hosted instance is one of several: its document is the file, and the
    // shared snapshot key would just be whichever tab typed last. Nothing is
    // cached, so nothing is claimed saved either — the file write says that.
    if (hosted) return;
    // Bail early if `data` is the exact same reference we last wrote — saves
    // a JSON.stringify on the main thread for a project that may be ~100KB.
    // Reference equality is enough because every mutating helper produces a
    // fresh top-level object.
    if (data === lastWrittenDataRef.current) return;
    let idleId = null;
    const t = setTimeout(() => {
      idleId = scheduleIdleWrite(() => {
        // Never the scenario on screen: what is cached is what a file would
        // hold, so a reload opens on the plan with its scenarios intact.
        localStorage.setItem(SK, JSON.stringify(fileDataRef.current));
        lastWrittenDataRef.current = data;
        // localStorage save is always successful → data is "saved" (just maybe not to file yet)
        setSaved(true);
        setLastSavedAt(new Date());
        // Every history-recording path used to hang off a file handle, so with
        // nothing mounted the log stayed empty for ever — which silently took
        // the diff/review window and backdating with it: you could switch
        // backdating on, record a sprint's worth of catching up, and nothing
        // was written anywhere. This is the only persist that happens without
        // a file, so it is where the log has to be written.
        if (!fileHandleRef.current && !scnRef.current) recordHistoryForLocalSave();
      }, 1200);
    }, 800);
    return () => {
      clearTimeout(t);
      if (idleId != null) cancelIdleWrite(idleId);
    };
  }, [data]);
  // Mark file-out-of-sync whenever data changes
  useEffect(() => {
    if (data) setFileSynced(false);
  }, [data]);

  // Auto-save: debounced N seconds after the last change. Each new change
  // resets the timer, so rapid edits coalesce into a single write.
  // Manual force-save via the disk icon (saveToFile) bypasses this.
  const SAVE_DEBOUNCE_MS = 5000;
  const lastChangeTimeRef = useRef(Date.now());
  useEffect(() => {
    if (data) lastChangeTimeRef.current = Date.now();
  }, [data]);
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
  const [saving, setSaving] = useState(false);
  // Bumped to run the autosave again after a write that failed on a busy file.
  const [saveRetry, setSaveRetry] = useState(0);
  // What the file on disk says, as far as Planr knows: what it last wrote or
  // read. A changed modification time with this same text is a sync service
  // touching the file, not somebody changing it.
  const diskTextRef = useRef(null);
  // Rounds in a row a save found the file busy, and the timer for the next.
  const busyRoundsRef = useRef(0);
  const saveRetryTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(saveRetryTimerRef.current), []);
  useEffect(() => {
    if (!data || !autoSave || !fileHandleRef.current || fileSynced) return;
    const t = setTimeout(async () => {
      const handle = fileHandleRef.current;
      if (!handle) return;
      const canWrite = await ensureHandlePermission(handle, false);
      if (!canWrite) {
        setFileWriteOk(false);
        return;
      }
      setSaving(true);
      try {
        const { content, ...composed } = composeFileForSave();
        await writeWithRetry(handle, content);
        diskTextRef.current = content;
        busyRoundsRef.current = 0;
        setFileWriteOk(true);
        setFileSynced(true);
        lastOwnWriteRef.current = Date.now();
        setLastSavedAt(new Date());
        // Snapshot ring tracks file-save events, throttled internally.
        pushSnapshot(fileDataRef.current);
        commitSaveSideEffects(composed);
      } catch (e) {
        console.error('Auto-save failed:', e);
        // The file is busy (a sync service uploading it), not gone: keep the
        // handle and try again shortly. Only a lost permission asks for the
        // file to be picked again.
        busyRoundsRef.current += 1;
        if (isBusy(e) && busyRoundsRef.current <= MAX_BUSY_ROUNDS && (await stillWritable(handle))) {
          clearTimeout(saveRetryTimerRef.current);
          saveRetryTimerRef.current = setTimeout(() => setSaveRetry(n => n + 1), 15000);
        } else setFileWriteOk(false);
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, autoSave, fileSynced, saveRetry]);

  // 1-second tick to drive the live countdown. Only ticks while there's something to wait for.
  const [, setSaveTick] = useState(0);
  useEffect(() => {
    if (fileSynced || !autoSave || !fileHandleRef.current) return;
    const i = setInterval(() => setSaveTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [fileSynced, autoSave]);
  const saveCountdown =
    !fileSynced && autoSave && fileHandleRef.current
      ? Math.max(0, Math.ceil((lastChangeTimeRef.current + SAVE_DEBOUNCE_MS - Date.now()) / 1000))
      : 0;

  // Detect external file changes (poll every 5s). NEVER auto-load — only notify.
  // Writing is one-way (app → file). When the file changes externally, show a prompt
  // so the user decides whether to reload. Auto-loading was destructive: external edits
  // (or file-system sync hiccups) silently overwrote in-memory state.
  const lastModRef = useRef(null);
  const [externalChangeAvailable, setExternalChangeAvailable] = useState(false);
  useEffect(() => {
    if (!fileHandleRef.current) return;
    const poll = setInterval(async () => {
      try {
        const file = await fileHandleRef.current.getFile();
        const mod = file.lastModified;
        // Skip if this is our own write (within 3s window)
        const isOwnWrite = Date.now() - lastOwnWriteRef.current < 3000;
        if (diskTextRef.current == null) diskTextRef.current = await file.text();
        else if (lastModRef.current && mod > lastModRef.current && !isOwnWrite) {
          // Only a different text is a change. A sync service bumps the time
          // on its own.
          if ((await file.text()) !== diskTextRef.current) setExternalChangeAvailable(true);
        }
        lastModRef.current = mod;
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [fileName]);
  async function reloadFromFile() {
    try {
      const file = await fileHandleRef.current.getFile();
      const text = await file.text();
      const isMd = file.name.endsWith('.md');
      const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
      if (d?.tree && Array.isArray(d.tree) && d.tree.length > 0) {
        // What changed outside Planr belongs to the day it was picked up.
        // The plan as it was last saved here stays what the next save measures
        // against (in the ids this load handed out), and the status baseline
        // stays too, so the difference is recorded as a change of today.
        // What was edited here and not saved is gone with the reload and is
        // not part of that.
        const before = pastRef.current || scnRef.current ? null : lastSavedPlanRef.current;
        setData(d);
        resetHistory(); // reloaded from disk — treat as a fresh document
        if (before && lastSavedLeavesRef.current) {
          lastSavedPlanRef.current = inIdsOf(before, d);
          leafBaselineStaleRef.current = false;
        }
        // After resetHistory, which forgets what the previous document said.
        diskTextRef.current = text;
        setLastSavedAt(new Date(file.lastModified));
        lastModRef.current = file.lastModified;
        setSaved(true);
        setFileSynced(true);
      }
    } catch (e) {
      console.error('Reload failed:', e);
    }
    setExternalChangeAvailable(false);
  }

  // Guard: warn on browser close/reload with unsaved changes
  useEffect(() => {
    const h = e => {
      if (!saved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saved]);

  // Pick a fresh file handle via Save-As dialog, suggesting the previous filename.
  // Used as fallback when the existing handle's permission/write fails after a reload.
  async function pickSaveHandle(suggestedFromName) {
    if (!filePickerAvailable()) {
      exportJSON();
      return null;
    }
    const fallbackSlug = (meta.name || 'project').toLowerCase().replace(/\s+/g, '-');
    const suggested = suggestedFromName || `${fallbackSlug}.planr.json`;
    const isMd = suggested.endsWith('.md');
    return await pickFileToSave({
      suggestedName: suggested,
      types: isMd
        ? [
            { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
            { description: 'Planr JSON', accept: { 'application/json': ['.json'] } },
          ]
        : [
            { description: 'Planr JSON', accept: { 'application/json': ['.json'] } },
            { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
          ],
    });
  }

  // Write content to a handle (caller already has write permission)
  async function writeToHandle(handle, content) {
    await writeWithRetry(handle, content);
    diskTextRef.current = content;
    busyRoundsRef.current = 0;
  }

  // Save to file (File System Access API). On failure, fall back to Save-As with previous filename.
  async function saveToFile(saveAs) {
    if (!data) return;
    let handle = saveAs ? null : fileHandleRef.current;
    const previousFileName = fileName; // remember for fallback suggestion
    try {
      // Path A: no handle yet → open Save-As picker right away
      if (!handle) {
        handle = await pickSaveHandle(previousFileName);
        if (!handle) return; // exportJSON path or aborted
      } else {
        // Path B: have a handle → request permission interactively
        const canWrite = await ensureHandlePermission(handle, true);
        if (!canWrite) {
          // Permission denied/failed → offer Save-As fallback so the user can re-mount
          // (this is critical after page reload when permissions reset)
          const ok = confirm(
            'File access was not granted by the browser. Click OK to choose where to save (suggesting the original location), or Cancel to skip.',
          );
          if (!ok) {
            setFileWriteOk(false);
            return;
          }
          handle = await pickSaveHandle(previousFileName);
          if (!handle) {
            setFileWriteOk(false);
            return;
          }
        }
      }
      const { content, ...composed } = composeFileForSave();
      await writeToHandle(handle, content);
      lastOwnWriteRef.current = Date.now();
      await rememberHandle(handle);
      setAutoSave(true);
      setFileWriteOk(true);
      setFileSynced(true);
      setSaved(true);
      setLastSavedAt(new Date());
      // Persist a JSON snapshot tied to a real file write — recovery scenarios
      // care about state that landed on disk, not every keystroke. Throttled
      // internally to ≥60s so manual rapid saves don't churn the ring.
      pushSnapshot(fileDataRef.current);
      commitSaveSideEffects(composed);
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled file picker
      console.error('Save failed:', e);
      // If write fails (handle invalid, file moved/deleted), offer Save-As fallback
      const isInvalidHandle = e.name === 'NotFoundError' || e.name === 'NotAllowedError' || e.name === 'InvalidStateError';
      if (isInvalidHandle) {
        const retry = confirm(
          `Save failed: ${e.message || e.name}\n\nThe file may have been moved or access was revoked. Click OK to choose where to save (suggesting the original location), or Cancel to skip.`,
        );
        if (retry) {
          try {
            const handle2 = await pickSaveHandle(previousFileName);
            if (!handle2) return;
            const { content, ...composed } = composeFileForSave();
            await writeToHandle(handle2, content);
            await rememberHandle(handle2);
            setAutoSave(true);
            setFileWriteOk(true);
            setFileSynced(true);
            setSaved(true);
            setLastSavedAt(new Date());
            commitSaveSideEffects(composed);
            return;
          } catch (e2) {
            if (e2.name !== 'AbortError') alert('Save still failed: ' + (e2.message || e2.name));
            return;
          }
        }
      }
      setFileWriteOk(false);
      alert('Could not save: ' + (e.message || e.name || 'unknown error'));
    }
  }
  async function loadFromFile() {
    try {
      if (filePickerAvailable()) {
        const handle = await pickFileToOpen({
          types: [
            { description: 'Planr Project', accept: { 'application/json': ['.json'] } },
            { description: 'Markdown', accept: { 'text/markdown': ['.md'] } },
          ],
        });
        const file = await handle.getFile();
        const text = await file.text();
        const isMd = handle.name.endsWith('.md');
        const d = normalizeLoadedData(isMd ? parseMdToProject(text) : JSON.parse(text));
        if (!d.tree || !Array.isArray(d.tree) || d.tree.length === 0)
          throw new Error(
            isMd
              ? 'No work items found in this Markdown file. Expected format: bullet list with **ID** Name entries under a "## Work Tree" heading.'
              : 'Invalid JSON project file — no tree items found.',
          );
        // Apply data immediately — don't block on file write permission
        await rememberHandle(handle);
        setData(d);
        resetHistory(); // different document — the old undo stack doesn't apply
        setSel(null);
        setSaved(true);
        setLastSavedAt(new Date());
        // Try to establish write permission (non-blocking for UI update)
        const canWrite = await ensureHandlePermission(handle, true);
        setFileWriteOk(canWrite);
        setAutoSave(true);
      } else {
        fRef.current?.click();
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Could not load file: ' + e.message);
    }
  }
  // Accept both .json and .md files

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
  // One order, everywhere.
  //
  // Reported after a long afternoon rearranging the tree: the work order
  // queues showed something else entirely. They did — `displayOrder` is a
  // number written onto the rows, and nothing ever reordered the ARRAY, so
  // every surface that simply walked `data.tree` was reading the order the
  // rows happened to be stored in. That was the tree's order once, before the
  // first reorder; after an afternoon of them the two had nothing to do with
  // each other (measured on the plan reported: 171 of 181 positions differed).
  // Only the tree view and the Gantt sorted; the queues, the resource views,
  // the report and every PDF did not, and each of them was presenting itself
  // as the plan's order.
  //
  // So the array carries the order. Sorting once here rather than in nine
  // places is also the only version that stays true — a new view cannot
  // forget to do it. The tree view still sorts its own rows, which is now a
  // no-op, and the scheduler still ranks by the same comparator.
  const tree = useMemo(() => sortTree(data?.tree || []), [data?.tree]);
  // Derive selected node from tree — always fresh after any tree mutation.
  const selected = useMemo(() => (selId ? tree.find(r => r.id === selId) || null : null), [tree, selId]);
  // ── Archive layer ────────────────────────────────────────────────────────
  // Long-finished projects and long-gone people are dropped from what the
  // views render, but NOT from `tree` / `stats` / `scheduled`. The headline
  // percentage and PT totals keep counting them — archiving a finished
  // project must never make the project look less finished.
  const archive = useMemo(() => scanArchive({ tree, members, days: archiveDays }), [tree, members, archiveDays]);
  const activeTree = useMemo(
    () => (showArchived ? tree : stripArchivedRoots(tree, archive.rootIds)),
    [tree, showArchived, archive.rootIds],
  );
  const activeMembers = useMemo(
    () => (showArchived ? members : stripArchivedMembers(members, archive.memberIds)),
    [members, showArchived, archive.memberIds],
  );
  const visibleTree = useMemo(() => {
    // Archive first, then hide-done: both are display filters over the same
    // tree, and the archive set is the coarser of the two.
    return hideDone ? withoutDone(activeTree) : activeTree;
  }, [activeTree, hideDone]);
  const rootItems = useMemo(() => visibleTree.filter(r => !r.id.includes('.')), [visibleTree]);
  const netRootOptions = useMemo(() => rootItems.map(r => ({ id: r.id, label: r.name || r.id })), [rootItems]);
  const netTree = useMemo(
    () => scopeFiltered(visibleTree, { rootFilter, teamFilter, personFilter, onlyUnestimated }),
    [visibleTree, rootFilter, teamFilter, personFilter, onlyUnestimated],
  );
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
    const iMap = Object.fromEntries(tree.map(r => [r.id, r]));
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
  const goals = useMemo(() => tree.filter(r => !r.id.includes('.') && r.type), [tree]);
  const hm = useMemo(() => buildHMap(data?.holidays || []), [data?.holidays]);
  const planStart = meta.planStart || iso(new Date());
  // viewStart = rendering start. Can be earlier than planStart for pre-started tasks.
  // planStart = scheduling start. New/unstarted tasks begin here.
  const viewStart = useMemo(() => inferGanttViewStart(tree, planStart, meta.viewStart, 14), [tree, planStart, meta.viewStart]);
  // Headroom horizon for the scheduler — +10 years so even long migrations
  // fit. After scheduling we trim the resulting `weeks` array back to the
  // latest scheduled endD + padding so the Gantt / Roadmap don't render
  // empty decades. Plans with an explicit `End` in the Plan table honour
  // that exactly.
  const GANTT_WINDOW_PADDING_DAYS = 14;
  const SCHEDULER_HEADROOM_END = iso(new Date(new Date().getFullYear() + 10, 11, 31));
  const planEnd = meta.planEnd || SCHEDULER_HEADROOM_END;
  const workDays = meta.workDays || [1, 2, 3, 4, 5]; // Mon–Fri default
  // Enrich members with effective meetings (team-inherited plans + member
  // plans + individual) so the scheduler's deriveCap() sees the same capacity
  // picture as Gantt/Resource load.
  //
  // And over time: everything that changes on a date (utils/effective.js) is
  // flattened per person here, with each meeting plan resolved, because the
  // scheduler has no catalogue to look a plan up in.
  const enrichedMembers = useMemo(
    () => compileMembers({ members, teams: data?.teams || [], meetingPlans: data?.meetingPlans || [], changes: data?.changes || [] }),
    [members, data?.meetingPlans, data?.teams, data?.changes],
  );
  // The one answer to "how much of this person is there on that day", for
  // everything that draws availability (utils/capacityLens.js).
  const capacityAt = useMemo(() => capacityLookup(enrichedMembers), [enrichedMembers]);
  // ── The day you are working on ───────────────────────────────────────────
  // Empty = today. Set, the Resources view shows people, teams and meeting
  // plans as they will be on that day, and what is edited there goes into the
  // change at that date instead of into the plan as it always was. Not
  // persisted: like backdating, a date you forgot about would quietly send
  // every later edit to the wrong place.
  const [effDate, setEffDate] = useState('');
  const resLens = useMemo(() => resourcesAsOf(data, effDate || new Date()), [data, effDate]);
  const effDates = useMemo(() => changeDates(data), [data?.changes]);
  const effCount = effDates.find(d => d.from === effDate)?.count || 0;
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
  // A person's own order of work, when they have one. The plan's order is the
  // tree's; this is the single override, and it only permutes the slots that
  // person's work already holds (utils/personQueue.js).
  const personQueues = data?.personQueues || null;
  const { results: scheduled, weeks } = useMemo(() => {
    if (!data) return { results: [], weeks: [] };
    const out = schedule(tree, enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, {
      personQueues,
      ...(past ? { now: past.day } : {}),
    });
    if (meta.planEnd) return out; // explicit user choice — leave alone
    return trimmedToHorizon(out, GANTT_WINDOW_PADDING_DAYS);
  }, [data, tree, enrichedMembers, vacations, viewStart, planStart, planEnd, hm, workDays, meta.planEnd, personQueues, past?.day]);
  // The same schedule for a different tree: what-if runs for "what is this
  // project waiting on?" (utils/projectWaits.js). Answers are cached until
  // the plan changes and computed only when a view asks for a project.
  const reschedule = useCallback(
    nextTree =>
      schedule(nextTree, enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, {
        personQueues,
        ...(past ? { now: past.day } : {}),
      }).results,
    [enrichedMembers, vacations, viewStart, planEnd, hm, workDays, planStart, personQueues, past?.day],
  );
  const projectWaitsOf = useMemo(() => {
    const cache = new Map();
    return rootId => {
      if (!rootId) return null;
      if (!cache.has(rootId)) cache.set(rootId, projectWaits({ tree, scheduled, rootId, reschedule, members: enrichedMembers }));
      return cache.get(rootId);
    };
  }, [tree, scheduled, reschedule, enrichedMembers]);

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

  const stats = useMemo(() => {
    const s = treeStats(tree);
    enrichParentSchedules(s, tree, scheduled);
    return s;
  }, [tree, scheduled]);
  // ── Scenario against plan ────────────────────────────────────────────────
  // The plan is scheduled a second time, once per visit to a scenario, so the
  // two can be laid side by side. Same scheduler, same day, same inputs but
  // for the scenario's changes — which is what makes the difference theirs.
  const baseScheduled = useMemo(() => (scn ? schedulePlanData(scn.base) : null), [scn]);
  const scnComparison = useMemo(
    () => (scn && data ? compareScenario({ base: scn.base, work: data, baseScheduled, workScheduled: scheduled }) : null),
    [scn, data, baseScheduled, scheduled],
  );
  const scnBaseline = useMemo(() => (scnComparison ? baselineWindows(scnComparison) : null), [scnComparison]);
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
  // What the scenario moves, per task, for the views that mark it: calendar
  // days later (+) or earlier (−); `null` for a task that is new, gone or no
  // longer scheduled — affected, with no shift to put a number on.
  const scnShifts = useMemo(() => {
    if (!scnComparison) return null;
    const out = new Map();
    for (const it of scnComparison.items) {
      if (it.presence !== 'both') {
        out.set(it.id, null);
        continue;
      }
      const days = it.endShift || it.startShift;
      if (days) out.set(it.id, days);
    }
    return out;
  }, [scnComparison]);
  // Rows the scenario itself changed (not the ones that merely moved because
  // of it): marked in the tree, where they are edited.
  const scnChangedIds = useMemo(
    () => (scn ? new Set(scnChanges.filter(c => c.kind === 'item' && c.op !== 'remove').map(c => c.id)) : null),
    [scn, scnChanges],
  );
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
  // Paused while a scenario is on screen. Two overlays at once is how amber
  // rows for "progressed since the 5th" came to be read as "moved by the
  // scenario". The window is not forgotten — `sinceDays` stays as it is and
  // the filter says it is paused — it just does not paint while the question
  // on screen is a different one (principles.md: overlays belong to a
  // moment, never two at once).
  const sinceDate = useMemo(() => (scn ? null : parseSinceValue(sinceDays)), [sinceDays, scn]);
  const horizonEnd = useMemo(() => parseHorizonValue(horizonDays), [horizonDays]);
  const horizonIds = useMemo(() => horizonScopedIds({ tree, scheduled, horizonEnd }), [tree, scheduled, horizonEnd]);
  const futureProgressByRootId = useMemo(() => futureProgressByRoot(tree, scheduled, horizonEnd), [tree, scheduled, horizonEnd]);
  const diff = useMemo(
    () =>
      computeDiff({
        tree,
        historyEvents: data?.historyEvents || [],
        sinceDate,
        members,
        vacations,
        holidays: hm,
        workDays,
      }),
    [tree, data?.historyEvents, sinceDate, members, vacations, hm, workDays],
  );
  const diffDoneSet = useMemo(() => new Set(diff?.doneInWindowIds || []), [diff]);
  const diffChangedSet = useMemo(() => new Set(diff?.changedInWindowIds || []), [diff]);
  const diffProgressedSet = useMemo(() => new Set(diff?.progressedInWindowIds || []), [diff]);
  // Effective filter sets: pass to views only when they actually carry
  // entries. Critical: an empty Set is truthy, so consumers like Plan /
  // Briefing / Queues would `if (diffChangedIds)` and filter EVERYTHING
  // out the moment the toggle was on without a matching diff/horizon
  // configured. Null when inactive → consumer skips the filter cleanly.
  const horizonFilterSet = horizonOnlyPlanned && horizonIds && horizonIds.size > 0 ? horizonIds : null;
  const diffFilterSet = diffOnlyChanged && diffChangedSet.size > 0 ? diffChangedSet : null;
  const diffVisibleSet = sinceDate && diffChangedSet.size > 0 ? diffChangedSet : null;
  const cpData = useMemo(() => rootCpm(tree), [tree]);
  const cpSet = cpData.critical;
  const cpLabels = useMemo(() => criticalPathLabelMap(cpData.rootPaths), [cpData.rootPaths]);
  const goalPaths = useMemo(() => goalCpm(tree), [tree]);
  // Global resource-load + overbooked task ids — shared by the quick-filter
  // chip and any view that wants to flag overbookings (vs each view rolling
  // its own load matrix and drifting out of sync).
  const resourceLoadByWeek = useMemo(
    () => buildResourceLoadMatrix({ members, teams, vacations, meetingPlans: data?.meetingPlans || [], scheduled, weeks, capacityAt }),
    [members, teams, vacations, data?.meetingPlans, scheduled, weeks],
  );
  const overbookedTaskIds = useMemo(() => overbookedIds(scheduled, weeks, resourceLoadByWeek), [scheduled, weeks, resourceLoadByWeek]);

  // The quick filters as data, so the sub-toolbar and the filter popup show
  // the same set without either of them owning it. Two of them only exist
  // when they have something to filter: an archive toggle on a plan with
  // nothing archived, or an overbooked toggle with nobody overbooked, is a
  // control that can only disappoint.
  const quickFilters = useMemo(
    () =>
      [
        { id: 'hideDone', label: _t('chip.hideDone'), tip: _t('chip.hideDoneTip'), active: hideDone, onToggle: () => setHideDone(v => !v) },
        archive.count > 0
          ? {
              id: 'archived',
              label: _t('arch.pill', archive.count),
              tip: _t('arch.chipTip'),
              active: showArchived,
              onToggle: () => setShowArchived(v => !v),
            }
          : null,
        {
          id: 'auto',
          label: _t('chip.auto'),
          tip: _t('chip.autoTip'),
          active: onlyAutoAssigned,
          onToggle: () => setOnlyAutoAssigned(v => !v),
        },
        {
          id: 'overdue',
          label: _t('chip.overdue'),
          tip: _t('chip.overdueTip'),
          active: onlyOverdue,
          onToggle: () => setOnlyOverdue(v => !v),
        },
        {
          id: 'unestimated',
          label: _t('chip.unestimated'),
          tip: _t('chip.unestimatedTip'),
          active: onlyUnestimated,
          onToggle: () => setOnlyUnestimated(v => !v),
        },
        overbookedTaskIds.size > 0
          ? {
              id: 'overbooked',
              label: _t('chip.overbooked', overbookedTaskIds.size),
              tip: _t('chip.overbookedTip'),
              active: onlyOverbooked,
              onToggle: () => setOnlyOverbooked(v => !v),
            }
          : null,
      ].filter(Boolean),
    [_t, hideDone, archive.count, showArchived, onlyAutoAssigned, onlyOverdue, onlyUnestimated, overbookedTaskIds.size, onlyOverbooked],
  );
  const activeQuickFilters = useMemo(() => quickFilters.filter(f => f.active), [quickFilters]);

  // Scope lives in the filter popup and comes back out as a chip the moment
  // one is set — a narrowed view has to say so (principles.md, "a view is
  // never the truth"), an unnarrowed one has nothing to say. The chip clears
  // the filter, which is the only thing you want from it once you see it.
  const scopeFields = useMemo(
    () => [
      {
        id: 'root',
        value: rootFilter,
        options: netRootOptions,
        showIds: true,
        placeholder: _t('tv.allRoots'),
        onSelect: v => {
          setRootFilter(v);
          setSearchIdx(0);
        },
      },
      {
        id: 'team',
        value: teamFilter,
        options: teams.map(t => ({ id: t.id, label: t.name || t.id })),
        placeholder: _t('tv.allTeams'),
        onSelect: v => {
          setTeamFilter(v);
          setSearchIdx(0);
        },
      },
      {
        id: 'person',
        value: personFilter,
        options: activeMembers.map(m => ({ id: m.id, label: m.name || m.id })),
        placeholder: _t('tv.allPeople'),
        onSelect: v => {
          setPersonFilter(v);
          setSearchIdx(0);
        },
      },
    ],
    [rootFilter, teamFilter, personFilter, netRootOptions, teams, activeMembers, _t],
  );

  const activeScopeChips = useMemo(
    () =>
      scopeFields
        .filter(f => f.value)
        .map(f => ({
          id: `scope-${f.id}`,
          label: f.options.find(o => o.id === f.value)?.label || f.value,
          onToggle: () => f.onSelect(''),
        })),
    [scopeFields],
  );

  // Handoff segments have synthetic ids like `${treeId}#N` and live alongside
  // their primary in scheduled[]. Match either id or treeId so all segments
  // pass through view-filters together with their tree node.
  // Quick-filter chips that depend on the scheduler output (auto-assigned,
  // overdue, overbooked). Applied to netTree downstream so all views share
  // the same view.
  const quickFilteredNetTree = useMemo(
    () => scheduleFiltered(netTree, scheduled, { onlyAutoAssigned, onlyOverdue, onlyOverbooked, overbookedTaskIds }),
    [netTree, onlyAutoAssigned, onlyOverdue, onlyOverbooked, scheduled, overbookedTaskIds],
  );
  const visibleTreeForViews = useMemo(() => {
    if (!hideDone || !sinceDate || diffChangedSet.size === 0) return quickFilteredNetTree;
    return withReviewedDone(quickFilteredNetTree, activeTree, diffChangedSet);
  }, [hideDone, sinceDate, diffChangedSet, quickFilteredNetTree, activeTree]);
  const visibleViewIdSet = useMemo(() => new Set(visibleTreeForViews.map(r => r.id)), [visibleTreeForViews]);
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
  const viewScheduled = useMemo(
    () => scheduled.filter(s => visibleViewIdSet.has(s.id) || (s.treeId && visibleViewIdSet.has(s.treeId))),
    [scheduled, visibleViewIdSet],
  );
  const viewGoals = useMemo(() => visibleTreeForViews.filter(r => !r.id.includes('.') && r.type), [visibleTreeForViews]);
  const viewStats = useMemo(() => {
    if (!hideDone) return stats;
    const s = treeStats(visibleTreeForViews);
    enrichParentSchedules(s, visibleTreeForViews, viewScheduled);
    return s;
  }, [hideDone, stats, visibleTreeForViews, viewScheduled]);
  // Gantt reads `scheduled` directly (not the view tree), so it needs its own
  // archive-filtered copy — same reason the tree gets one.
  const activeScheduled = useMemo(
    () => (showArchived || !archive.rootIds.size ? scheduled : scheduled.filter(s => !isArchivedId(archive.rootIds, s.id))),
    [scheduled, showArchived, archive.rootIds],
  );
  const viewCpSet = cpData.critical;
  const viewCpEdges = cpData.edges;
  const leaves = useMemo(() => leafNodes(tree), [tree]);
  // Dropped work leaves every count, which would make it invisible; say how
  // much of it there is, so the denominator is explicable.
  const droppedCount = useMemo(() => tree.filter(r => r.dropped).length, [tree]);
  const { confidence, reasons: confReasons } = useMemo(() => computeConfidence(tree, members), [tree, members]);

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

  function setD(k, v) {
    mutate(d => ({ ...d, [k]: v }));
  }
  // Functional update so callbacks fired in rapid succession always see the LATEST tree state,
  // not a closure-captured snapshot. Prevents the second of two fast edits from overwriting the
  // first (e.g. deleting two dependency arrows in the Gantt within the same tick).
  // `opts.asOf` dates a status or progress change to an earlier day. The date
  // is kept in the document (`asOfPending`) until the next save reads it, so
  // an undo takes it back together with the change, a later edit of the item
  // from anywhere voids it, and the save's diff stays
  // the one place that writes history (utils/history.js `stampPendingDates`).
  function updateNode(u, opts = {}) {
    const pending = opts.asOf && !scnRef.current ? pendingDate(opts.asOf, u) : null;
    const dated = d => (pending ? { ...d, asOfPending: { ...(d.asOfPending || {}), [u.id]: pending } } : d);
    // Auto-extend viewStart if the user pins a task before the current visual horizon.
    if (u.pinnedStart) {
      const vs = meta.viewStart || meta.planStart;
      if (vs && u.pinnedStart < vs) {
        // Extend viewStart 2 weeks before the pin so the bar isn't flush at the left edge.
        const pinD = new Date(u.pinnedStart);
        const extended = new Date(pinD);
        extended.setDate(extended.getDate() - 14);
        const extStr = extended.toISOString().slice(0, 10);
        mutate(d =>
          dated({
            ...d,
            meta: { ...d.meta, viewStart: extStr },
            tree: (d.tree || []).map(r => (r.id === u.id ? u : r)),
          }),
        );
        return;
      }
    }
    mutate(d => dated({ ...d, tree: (d.tree || []).map(r => (r.id === u.id ? u : r)) }));
  }
  // Bulk status write from Run mode's Jira drift rows (BriefingView.jsx).
  // Patches carry whole nodes (see utils/jiraSync.js statusPatches); parent
  // statuses and the done-window metadata are filled in by the effects that
  // already watch the tree, exactly as with a hand edit.
  const onJiraApplyStatus = useStableCallback(patches => {
    if (!patches?.length) return;
    const byId = new Map(patches.map(patch => [patch.id, patch]));
    mutate(d => ({ ...d, tree: (d.tree || []).map(r => byId.get(r.id) || r) }));
  });
  // First-start import (JiraImportModal.jsx): the tickets already exist in
  // Jira and nobody types two hundred of them again. The nodes arrive fully
  // formed and already numbered past whatever the plan has, so this appends
  // rather than merges — and it goes through `mutate`, so ⌘Z takes the whole
  // import back in one press, which is the only thing that makes trying it
  // safe.
  const applyJiraImport = useStableCallback(({ nodes = [], newMembers = [] }) => {
    if (!nodes.length) return;
    mutate(d => ({
      ...d,
      tree: [...(d.tree || []), ...nodes],
      members: newMembers.length ? [...(d.members || []), ...newMembers] : d.members,
    }));
    setModal(null);
    setTab('tree');
    setSel(nodes[0]);
  });
  // Targeted dep mutations: read current tree state and touch ONLY the deps field.
  // Avoids the stale-closure overwrite pattern where `{...oldNode, deps: newDeps}` wipes
  // out unrelated field changes that happened after the callback was created.
  // Remove a dep edge — checks both hard and soft buckets so the caller
  // can stay agnostic ("delete this connection") without knowing the
  // kind. Returns the node to either bucket if it lives there.
  function removeDep(fromId, depId) {
    mutate(d => {
      const tree = d.tree || [];
      const mutated = tree.map(r => {
        if (r.id !== fromId) return r;
        const next = { ...r, deps: (r.deps || []).filter(x => x !== depId) };
        // Strip any lingering softDeps too — legacy field that's no longer
        // emitted, but old plans might still carry it on the in-memory node.
        if (r.softDeps?.length) next.softDeps = r.softDeps.filter(x => x !== depId);
        return next;
      });
      return { ...d, tree: applyDisplayOrder(mutated, computeDisplayOrder(mutated)) };
    });
  }
  // Add a hard dep edge. Soft deps were removed — every link is a hard
  // dependency now ("X must finish before Y"). Drag-link, NodeModal picker,
  // and selection "Reihenfolge linken" all go through this single path.
  function addDep(fromId, depId) {
    if (fromId === depId) return;
    mutate(d => {
      const mutated = (d.tree || []).map(r => {
        if (r.id !== fromId) return r;
        const merged = new Set([...(r.deps || []), ...(r.softDeps || [])]);
        if (merged.has(depId)) {
          // Already linked (possibly as legacy soft); ensure it lives in deps
          // and drop any stale softDeps reference.
          const next = { ...r, deps: [...new Set([...(r.deps || []), depId])] };
          if (r.softDeps?.length) next.softDeps = r.softDeps.filter(x => x !== depId);
          return next;
        }
        return { ...r, deps: [...(r.deps || []), depId] };
      });
      return { ...d, tree: applyDisplayOrder(mutated, computeDisplayOrder(mutated)) };
    });
  }
  // Functional, and prefix-safe. Two bugs lived in the one-liner this
  // replaces, both harmless while deleting was a mouse trip behind a confirm
  // and both reachable now that ⌫ deletes in one keystroke:
  //   * it read `tree` from the render closure, so a delete chained after
  //     another edit in the same tick overwrote that edit,
  //   * `startsWith(id)` is not a subtree test — deleting "P1" also deleted
  //     "P10" and "P12". Only `id` itself and `id + '.'` are descendants.
  function deleteNode(id) {
    mutate(d => ({ ...d, tree: (d.tree || []).filter(r => r.id !== id && !r.id.startsWith(id + '.')) }));
    setSel(null);
  }
  // Materialize handoff segments as standalone tree tasks, chained by deps.
  // The primary task stays in place but is trimmed to its own consumed
  // effort (so the schedule no longer includes the handoff portion in its
  // best estimate). Each cascade leg becomes a sibling with the next
  // assignee, the segment's remaining effort, and a dep on the previous
  // leg. Drops the source task's handoffPlan so the scheduler doesn't
  // re-cascade into the freshly created tasks.
  function splitHandoff(nodeId) {
    const sc = scheduled.find(s => s.id === nodeId);
    const node = tree.find(r => r.id === nodeId);
    if (!node || !sc?.segments || sc.segments.length <= 1) return;
    const handoffSegs = sc.segments.slice(1).filter(s => !s.unscheduled);
    if (!handoffSegs.length) return;

    const factor = node.factor || 1.5;
    const primaryEff = sc.segments[0]?.effort || 0;
    // Round (not ceil) so the trimmed primary fits inside the consumed
    // portion. ceil gave a 0.5–1d slop that pushed the primary past the
    // offboard date and re-triggered a cascade — exactly the synthetic
    // `#N` row the split was supposed to eliminate.
    const newPrimaryBest = Math.max(1, Math.round(primaryEff / factor));

    // noCascade: the scheduler still re-cascades on offboard even after we
    // dropped handoffPlan, because cascading is triggered by the assignee's
    // end-date alone. Mark the trimmed primary as opt-out so the synthetic
    // `#N` row doesn't reappear after the split — the new sibling tasks own
    // that work now.
    const updatedPrimary = { ...node, best: newPrimaryBest, noCascade: true };
    delete updatedPrimary.handoffPlan;

    // Find next free sibling slot under the same parent.
    const parent = nodeId.split('.').slice(0, -1).join('.');
    const sibIds = tree
      .filter(r => {
        const p = r.id.split('.').slice(0, -1).join('.');
        return p === parent;
      })
      .map(r => parseInt(r.id.split('.').pop().replace(/\D/g, ''), 10) || 0);
    let nextNum = sibIds.length ? Math.max(...sibIds) : 0;

    let prevId = node.id;
    const newTasks = handoffSegs.map(seg => {
      nextNum += 1;
      const newId = parent ? `${parent}.${nextNum}` : `P${nextNum}`;
      const remBest = Math.max(1, Math.ceil((seg.effort || 0) / factor));
      const t = {
        id: newId,
        name: `${node.name} → ${seg.personName || '?'}`,
        status: 'open',
        team: seg.team || node.team || '',
        best: remBest,
        factor,
        prio: node.prio || 2,
        deps: [prevId],
        note: _t('split.handoff.note', node.id),
        assign: seg.personId ? [seg.personId] : [],
      };
      if (node.confidence) t.confidence = node.confidence;
      prevId = newId;
      return t;
    });

    // Insert new tasks right after the primary's tree slot so the order
    // matches the Gantt's left-to-right reading.
    const next = [];
    for (const r of tree) {
      if (r.id === nodeId) {
        next.push(updatedPrimary);
      } else {
        next.push(r);
      }
    }
    // Splice new tasks in after the primary's last descendant (same logic
    // as addNode for nested IDs).
    let insertAt = next.length;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].id === nodeId || next[i].id.startsWith(nodeId + '.')) {
        insertAt = i + 1;
        break;
      }
    }
    next.splice(insertAt, 0, ...newTasks);
    setD('tree', next);
  }
  // Split an interrupted task. The original is closed at its current
  // progress (clamped `best`, status=done) and a new sibling carries the
  // remaining effort with a dep on the original. Useful when work paused
  // mid-task and the rest will be picked up later — possibly by someone
  // else, possibly after blocking work resolves. progressPct overrides
  // node.progress for explicit control.
  function splitTaskAtProgress(nodeId, progressPct) {
    const node = tree.find(r => r.id === nodeId);
    if (!node || !node.best) return;
    const factor = node.factor || 1.5;
    const totalEff = node.best * factor;
    const prog = Number.isFinite(progressPct) ? progressPct : (node.progress ?? 0);
    if (prog <= 0 || prog >= 100) return; // nothing to split
    const consumedEff = totalEff * (prog / 100);
    const remEff = totalEff - consumedEff;
    if (remEff <= 0) return;

    const today = iso(new Date());
    const newDoneBest = Math.max(1, Math.round(consumedEff / factor));
    const newRemBest = Math.max(1, Math.round(remEff / factor));

    const updated = {
      ...node,
      best: newDoneBest,
      status: 'done',
      progress: 100,
      completedAt: node.completedAt || today,
      completedEnd: node.completedEnd || today,
    };
    delete updated.handoffPlan;

    const parent = nodeId.split('.').slice(0, -1).join('.');
    const sibIds = tree
      .filter(r => {
        const p = r.id.split('.').slice(0, -1).join('.');
        return p === parent;
      })
      .map(r => parseInt(r.id.split('.').pop().replace(/\D/g, ''), 10) || 0);
    const nextNum = (sibIds.length ? Math.max(...sibIds) : 0) + 1;
    const newId = parent ? `${parent}.${nextNum}` : `P${nextNum}`;

    const newTask = {
      id: newId,
      name: `${node.name} ${_t('split.task.suffix')}`,
      status: 'open',
      team: node.team || '',
      best: newRemBest,
      factor,
      prio: node.prio || 2,
      deps: [nodeId],
      note: _t('split.task.note', node.id),
      assign: node.assign || [],
    };
    if (node.confidence) newTask.confidence = node.confidence;

    const next = tree.map(r => (r.id === nodeId ? updated : r));
    let insertAt = next.length;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].id === nodeId || next[i].id.startsWith(nodeId + '.')) {
        insertAt = i + 1;
        break;
      }
    }
    next.splice(insertAt, 0, newTask);
    setD('tree', next);
  }
  // Functional for the same reason as every other mutator here: the tree
  // editor commits a rename and inserts the next row inside ONE keypress, and
  // reading `tree` from the render closure made the insert write back a
  // snapshot taken before the rename — silently throwing the typed name away.
  // That is the exact failure the comments on updateNode and removeDep warn
  // about; it just took a single-keystroke workflow to make it reachable.
  function addNode(node) {
    const pid = node.id.split('.').slice(0, -1).join('.');
    mutate(d => {
      const nt = [...(d.tree || [])];
      if (!pid) {
        nt.push(node);
        return { ...d, tree: nt };
      }
      let ins = -1;
      for (let i = nt.length - 1; i >= 0; i--) {
        if (nt[i].id === pid || nt[i].id.startsWith(pid + '.')) {
          ins = i + 1;
          break;
        }
      }
      if (ins >= 0) nt.splice(ins, 0, node);
      else nt.push(node);
      return { ...d, tree: nt };
    });
  }

  // Compute an ID map for moving/duplicating a subtree rooted at `nodeId` under `newParentId`.
  // Returns: { [oldId]: newId } for the node and every descendant.
  function computeIdMap(tree, nodeId, newParentId) {
    const subtreeIds = [nodeId, ...tree.filter(r => r.id.startsWith(nodeId + '.')).map(r => r.id)];
    const newBase = nextChildId(tree, newParentId);
    const map = { [nodeId]: newBase };
    subtreeIds.slice(1).forEach(old => {
      map[old] = newBase + old.slice(nodeId.length);
    });
    return map;
  }

  // Duplicate a node + its entire subtree. Deps pointing INSIDE the subtree are remapped;
  // deps pointing OUTSIDE are preserved. Returns the new root node id.
  function duplicateNode(nodeId) {
    const node = tree.find(r => r.id === nodeId);
    if (!node) return null;
    const parentOfNode = nodeId.split('.').slice(0, -1).join('.'); // stays under same parent
    const idMap = computeIdMap(tree, nodeId, parentOfNode);
    const copies = [nodeId, ...tree.filter(r => r.id.startsWith(nodeId + '.')).map(r => r.id)].map(oldId => {
      const orig = tree.find(r => r.id === oldId);
      const copy = { ...orig, id: idMap[oldId] };
      // Remap deps that point within the subtree, keep deps pointing outside
      copy.deps = (orig.deps || []).map(d => idMap[d] || d);
      // Preserve _depLabels but remap keys
      if (orig._depLabels) {
        copy._depLabels = {};
        Object.entries(orig._depLabels).forEach(([k, v]) => {
          copy._depLabels[idMap[k] || k] = v;
        });
      }
      // Reset progress/status for fresh copy (user decides)
      delete copy.pinnedStart;
      if (copy.phases) {
        copy.phases = copy.phases.map(p => ({
          ...p,
          id: 'ph' + Date.now() + Math.random().toString(36).slice(2, 6),
          status: 'open',
          assign: [],
        }));
      }
      return copy;
    });
    setD('tree', [...tree, ...copies]);
    return idMap[nodeId];
  }

  // Move a node (and its subtree) under a new parent ('' for top-level).
  // Updates IDs, dep references everywhere, and re-sorts so siblings are grouped.
  function moveNode(nodeId, newParentId) {
    if (nodeId === newParentId) return;
    // Prevent moving into own descendant (would create a cycle)
    if (newParentId && (newParentId === nodeId || newParentId.startsWith(nodeId + '.'))) {
      alert('Cannot move an item under itself or one of its descendants.');
      return;
    }
    // The id map depends on STRUCTURE only, so computing it from the render
    // closure is sound — but applying it must be functional, or a name
    // written in the same tick (Tab straight out of the inline editor) is
    // overwritten by this snapshot. That is exactly the bug addNode had.
    const planned = moveSubtree(tree, nodeId, newParentId);
    if (!planned) return; // no-op
    mutate(d => ({ ...d, tree: moveSubtree(d.tree || [], nodeId, newParentId)?.tree || d.tree }));
    return planned.id;
  }

  // The work tree's four structural commands — move up/down, indent,
  // outdent (utils/treeMove.js). One command, one state update, one undo
  // step: outdent used to be a re-parent followed by a separate reorder.
  // Returns { id, idMap } — where the row lives now — or null when the
  // command cannot run from here.
  function runTreeCommand(id, command, visibleIds) {
    const planned = applyTreeCommand(tree, id, command, visibleIds);
    if (!planned) return null;
    mutate(d => ({ ...d, tree: applyTreeCommand(d.tree || [], id, command, visibleIds)?.tree || d.tree }));
    return { id: planned.id, idMap: planned.idMap };
  }
  // Reorder a node within its sibling list by writing persistent displayOrder
  // values. IDs and dependencies stay stable; the order round-trips as `ord:`.
  // Direction: 'up'|'down'|'first'|'last' or { targetId, position:'before'|'after' }.
  function reorderSibling(nodeId, direction) {
    let changed = false;
    // The snapshot undo will return to must be the state that is CURRENT, not
    // the one this render closed over — see mutate() above.
    const before = dataRef.current;
    setData(d => {
      const nextTree = placeAmongSiblings(d.tree || [], nodeId, direction);
      if (!nextTree) return d;
      changed = true;
      return { ...d, tree: nextTree };
    });
    if (changed) {
      setHistory(h => pushHistory(h, before, { coalesceMs: 300 }));
      setSaved(false);
    }
  }

  // "Move P10 behind P8" from a project's waits block: each cause goes
  // directly after the project it holds back, in the order they are named.
  // "Apply" on an order from the planning review's search: one undo step.
  const onApplyOrder = useStableCallback(order => {
    const before = dataRef.current;
    setData(d => ({ ...d, tree: applyRootOrder(d.tree || [], order) }));
    setHistory(h => pushHistory(h, before, { coalesceMs: 0 }));
    setSaved(false);
  });
  const onMoveBehind = useStableCallback((ids, rootId) => {
    let anchor = rootId;
    for (const id of ids) {
      reorderSibling(id, { targetId: anchor, position: 'after' });
      anchor = id;
    }
  });
  function addMember(teamId) {
    const id = 'm' + Date.now();
    setD('members', [
      ...members,
      { id, name: 'New person', team: teamId || teams[0]?.id || '', role: '', cap: 1.0, vac: 25, start: planStart },
    ]);
  }
  function cloneMember(src) {
    const id = 'm' + Date.now();
    const { teams: _teams, ...rest } = src;
    setD('members', [...members, { ...rest, id, team: '', cap: 0.5 }]);
  }
  // Gantt drag callback. Accepts either a number (legacy seq update) or an object patch (e.g. {pinnedStart}).
  function onSeqUpdate(taskId, patch) {
    const update = typeof patch === 'object' && patch !== null ? patch : { seq: patch };
    setD(
      'tree',
      tree.map(r => (r.id === taskId ? { ...r, ...update } : r)),
    );
  }
  // Extend the plan start date backward so partially-done tasks that began before the
  // current horizon fit naturally. Scheduler re-computes with the wider window; existing
  // positions shift right by the added weeks.
  // Extend the VISUAL start (viewStart) without touching the scheduling start (planStart).
  // Pre-planStart weeks exist for display only — the scheduler still begins at planStart.
  function extendViewStart(newStart) {
    if (!newStart || newStart >= (meta.viewStart || meta.planStart || '9999')) return;
    mutate(d => ({ ...d, meta: { ...d.meta, viewStart: newStart } }));
  }

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
  function buildMarkdownText() {
    const fd = fileDataRef.current || data;
    if (fd !== data)
      return _buildMd({
        tree: sortTree(fd.tree || []),
        members: fd.members || [],
        teams: fd.teams || [],
        vacations: fd.vacations || [],
        data: fd,
        meta: fd.meta || {},
      });
    return _buildMd({ tree, members, teams, vacations, data, meta });
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

  // Stable callback wrappers for memo'd children. MUST run unconditionally
  // every render — placed BEFORE any early-return so React sees the same
  // hook order whether `data` is null (Onboard splash) or loaded.
  // Each callback's body resolves identifiers at invocation time, so the
  // closures still see fresh `tree`, `selected`, etc. via the latest-closure
  // ref pattern inside useStableCallback.
  // Standard list-selection (Finder / Explorer / VS Code):
  //   plain         → single select, clear multi, anchor = clicked
  //   shift         → replace the previous shift-range with [anchor..click];
  //                   manually pinned items (added via cmd+click) survive
  //   cmd|ctrl      → toggle clicked, anchor moves, previous range forgotten
  //   cmd|ctrl+shift→ unconditional add of [anchor..click] to selection
  const lastShiftRangeRef = useRef(null);
  const onTreeSelect = useStableCallback((node, e, visibleIds) => {
    const ctrlLike = !!(e?.ctrlKey || e?.metaKey);
    if (e?.shiftKey && selected && visibleIds) {
      const ai = visibleIds.indexOf(selected.id),
        bi = visibleIds.indexOf(node.id);
      if (ai >= 0 && bi >= 0) {
        const range = visibleIds.slice(Math.min(ai, bi), Math.max(ai, bi) + 1);
        const newRange = new Set(range);
        setMultiSel(prev => {
          const next = new Set(prev);
          if (!ctrlLike && lastShiftRangeRef.current) {
            lastShiftRangeRef.current.forEach(x => next.delete(x));
          }
          newRange.forEach(x => next.add(x));
          return next;
        });
        lastShiftRangeRef.current = newRange;
      }
    } else if (ctrlLike) {
      // The first ⌘-click starts a selection FROM the row the cursor is on:
      // click A, ⌘-click B is A and B — the rule every file list has, and
      // the one the Work order view already had. It used to be B alone, so
      // a move then took one row while two looked meant.
      setMultiSel(s => {
        const n = new Set(s.size ? s : selected?.id && selected.id !== node.id ? [selected.id] : []);
        n.has(node.id) ? n.delete(node.id) : n.add(node.id);
        return n;
      });
      if (!selected) setSel(node);
      lastShiftRangeRef.current = null;
    } else {
      setSel(node);
      setMultiSel(new Set());
      lastShiftRangeRef.current = null;
    }
  });
  const onTreeDelete = useStableCallback((...a) => deleteNode(...a));
  // The same two, for a multi-selection: it moves as a block (utils/
  // treeMove.js). One mutate, so one ⌘Z undoes the whole move, and the
  // selection follows the rows to their new ids.
  const onTreeCommandMany = useStableCallback((ids, command, visibleIds) => {
    const planned = applyTreeCommandMany(tree, [...ids], command, visibleIds);
    if (!planned) return null;
    mutate(d => ({ ...d, tree: applyTreeCommandMany(d.tree || [], [...ids], command, visibleIds)?.tree || d.tree }));
    setMultiSel(new Set(planned.ids));
    if (selected?.id && planned.idMap[selected.id]) setSel({ id: planned.idMap[selected.id] });
    return planned;
  });
  // A drop in the tree: next to any row, or into a package — across parents
  // too (utils/treeMove.js `dropRows`). One mutate, so one ⌘Z; the dragged
  // rows stay selected at their new ids, and the cursor goes with them.
  const onTreeDropRows = useStableCallback((ids, target, visibleIds) => {
    const planned = dropRows(tree, [...ids], target, visibleIds);
    if (!planned) return null;
    mutate(d => ({ ...d, tree: dropRows(d.tree || [], [...ids], target, visibleIds)?.tree || d.tree }));
    if (planned.ids.length > 1) {
      setMultiSel(new Set(planned.ids));
      if (selected?.id && planned.idMap[selected.id]) setSel({ id: planned.idMap[selected.id] });
    } else {
      setMultiSel(new Set());
      setSel({ id: planned.ids[0] });
    }
    return planned;
  });
  // ⌘A in the tree: every row on screen, which is what the filters left.
  const onTreeSelectAll = useStableCallback(ids => {
    if (!ids?.length) return;
    setMultiSel(new Set(ids));
    if (!selected || !ids.includes(selected.id)) setSel({ id: ids[0] });
  });
  // ── Tree editor (Phase 4) — keyboard-only structure/creation paths ──────
  // Every one of these is a thin wrapper around the SAME mutate()-backed
  // primitives the mouse-driven controls already use (moveNode, addNode,
  // reorderSibling) — see docs/principles.md principle 2. Nothing here is a
  // new write path; it's the existing ones, reachable without a modal.

  // Tab / ⇧Tab re-parent — moveNode renumbers the moved subtree and every
  // dependency reference to it, then hands back the node's new id (it
  // changes on every re-parent); the cursor (selected) follows it so the
  // next keypress still targets the right row.
  const onTreeMove = useStableCallback((id, newParentId) => {
    const newId = moveNode(id, newParentId);
    if (newId) setSel({ id: newId });
    return newId; // the inline editor follows the row to its new id
  });
  // Toolbar buttons and structural shortcuts both land here — the one path
  // for move up/down, indent and outdent. The cursor follows the row: a
  // re-parent renumbers it, and the next keypress has to find it again.
  const onTreeCommand = useStableCallback((id, command, visibleIds) => {
    const res = runTreeCommand(id, command, visibleIds);
    if (res && res.id !== id) setSel({ id: res.id });
    return res;
  });
  // The tree calls this when the row it just moved is not on screen any more.
  //
  // Re-parenting out a level renumbers the subtree into a project of its own
  // — P1.1 becomes P4 — and every filter keyed on where a row USED to be then
  // excludes it: the project filter above all, a search over ids, a review
  // window it is no longer part of. The row is in the plan and nowhere on the
  // screen, which reads as losing it.
  //
  // So the view widens to where the row went. Everything that narrows the
  // tree comes off at once rather than guessing which one did it; the guard
  // on the other side only fires when the row really has vanished, and the
  // filter chips going quiet is itself the notice that they were dropped.
  const onTreeRevealHidden = useStableCallback(() => {
    setRootFilter('');
    setTeamFilter('');
    setPersonFilter('');
    setSearch('');
    setHideDone(false);
    setDiffOnlyChanged(false);
    setHorizonOnlyPlanned(false);
  });
  // Enter, mid-edit: create an empty sibling directly after `afterId` (same
  // parent) and hand back its id so TreeView can immediately edit it. Empty
  // on purpose — see onTreeBulkDelete's neighbour, commitEdit in
  // TreeView.jsx, for why an empty commit on a still-new row deletes it
  // again instead of littering the tree.
  const onTreeInsertAfter = useStableCallback(afterId => {
    const pid = parentId(afterId);
    const id = nextChildId(tree, pid);
    // No priority — see buildPasteNodes in utils/treeEdit.js. The team IS
    // inherited from the sibling: adding a row next to a Backend item almost
    // always means another Backend item, and that is a fact about where you
    // are, not a guess about what you meant.
    const sibling = tree.find(r => r.id === afterId);
    addNode({
      id,
      name: '',
      status: 'open',
      team: sibling?.team || '',
      best: 0,
      factor: 1.5,
      deps: [],
      note: '',
      assign: [],
      lvl: pid ? pid.split('.').length + 1 : 1,
    });
    reorderSibling(id, { targetId: afterId, position: 'after' });
    return id;
  });
  // ⇧Enter: create an empty child under `parentIdArg` (mirrors onTreeQuickAdd
  // above, but with an empty name — see onTreeInsertAfter).
  const onTreeInsertChild = useStableCallback(parentIdArg => {
    const id = nextChildId(tree, parentIdArg);
    const parentNode = tree.find(r => r.id === parentIdArg);
    addNode({
      id,
      name: '',
      status: 'open',
      team: parentNode?.team || '',
      best: 0,
      factor: 1.5,
      deps: [],
      note: '',
      assign: [],
      lvl: parentIdArg ? parentIdArg.split('.').length + 1 : 1,
    });
    return id;
  });
  // ⌫/Delete on a multi-selection: deleteNode's `setD('tree', tree.filter(...))`
  // reads `tree` from the render closure, so looping it per id inside one
  // keypress would have each call overwrite the previous one's result — the
  // "do not loop single updates" case principle 5's brief calls out. This is
  // the one batched callback: a single functional mutate() over the whole
  // id set, so it's correct AND one undo step.
  const onTreeBulkDelete = useStableCallback(ids => {
    if (!ids?.length) return;
    // `startsWith(id)` alone is not a subtree test: it also matches P10 when
    // deleting P1 (the bug just fixed in deleteNode). A node is in the set if
    // it IS one of the ids, or sits strictly below one of them.
    mutate(d => ({ ...d, tree: (d.tree || []).filter(r => !ids.some(id => r.id === id || r.id.startsWith(id + '.'))) }));
    setSel(null);
    setMultiSel(new Set());
  });
  // Paste a list: parse → build the whole batch of new nodes against a
  // local working copy of the tree (utils/treeEdit.js buildPasteNodes, so
  // ids don't collide within the pasted block itself) → splice them in with
  // ONE mutate() call, right after the active row's own subtree.
  const onTreePasteRows = useStableCallback((afterId, rows) => {
    if (!rows?.length) return;
    const pid = parentId(afterId);
    mutate(d => {
      const currentTree = d.tree || [];
      const newNodes = buildPasteNodes(currentTree, pid, rows);
      const next = currentTree.slice();
      let insertAt = next.length;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].id === afterId || next[i].id.startsWith(afterId + '.')) {
          insertAt = i + 1;
          break;
        }
      }
      next.splice(insertAt, 0, ...newNodes);
      return { ...d, tree: next };
    });
  });
  const onGanttBarClick = useStableCallback((...a) => onBarClick(...a));
  const onGanttSeqUpdate = useStableCallback((...a) => onSeqUpdate(...a));
  const onGanttExtendViewStart = useStableCallback((...a) => extendViewStart(...a));
  const onGanttTaskUpdate = useStableCallback((...a) => updateNode(...a));
  const onGanttRemoveDep = useStableCallback((...a) => removeDep(...a));
  const onGanttAddDep = useStableCallback((...a) => addDep(...a));
  const onGanttReorderSibling = useStableCallback((...a) => reorderSibling(...a));
  // Move a task within its assignee's own queue. The plan's order is the
  // tree's and this does not touch it: the queue permutes only the slots that
  // person's work already holds (utils/personQueue.js). It is stored against
  // the person for the same reason — a rank smeared over every task is what
  // `seq` was, and what competed with the tree everywhere.
  const onQueueReset = useStableCallback(personId => {
    mutate(d => {
      const queues = d.personQueues || {};
      if (!queues[personId]) return d;
      const { [personId]: _gone, ...rest } = queues;
      return { ...d, personQueues: Object.keys(rest).length ? rest : undefined };
    });
  });
  const onQueueReorder = useStableCallback((taskIds, direction) => {
    // One id or a selection. The owner is taken from the first — a selection
    // spanning two owners is not one move, and the rest is ignored rather than
    // half-applied.
    const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
    const node = tree.find(r => r.id === ids[0]);
    const person = queueOwnerOf(node);
    if (!person) return;
    const mine = leaves.filter(l => queueOwnerOf(l) === person).map(l => l.id);
    if (mine.length < 2) return;
    const moving = ids.filter(id => mine.includes(id));
    mutate(d => {
      const queues = d.personQueues || {};
      const current = reconcileQueue(queues[person], mine);
      // `direction` is either a key's word — up/down/first/last — or the id a
      // drag was dropped on.
      const next =
        typeof direction === 'object' && (direction?.before || direction?.after)
          ? placeInQueue(current, moving, direction.before || direction.after, direction.after ? 'after' : 'before')
          : moveInQueue(current, moving, direction);
      if (next.join() === current.join() && queues[person]) return d;
      return { ...d, personQueues: { ...queues, [person]: next } };
    });
  });
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
  const onNetDeleteNode = useStableCallback(id => deleteNode(id));
  const onPlanReviewUpdate = useStableCallback((...a) => updateNode(...a));
  // Row-level status change from Run mode (attention list + per-person
  // queues) — same updateNode() → mutate() path every other status control
  // uses (TreeView's Space key, the bulk-status buttons, QuickEdit), so one
  // undo step either way.
  const onBriefingUpdate = useStableCallback((...a) => updateNode(...a));
  // Reorganize tree layout: per-parent topological sort of children by
  // their dep + softDep edges so paths render top-to-bottom in the Gantt.
  // Manually-triggered so live edits don't shuffle the tree on the user.
  const onReorganizeLayout = useStableCallback(() => {
    const order = computeDisplayOrder(tree);
    mutate(d => ({ ...d, tree: applyDisplayOrder(d.tree || [], order) }));
  });
  // Persistent Subway-Map assignment: Roadmap.jsx fires this when its
  // computed {rootId → routeIdx, colorIdx} differs from what's stored
  // (first render of a fresh plan, or a new root entered). Locks the
  // layout so projects keep their colour + lane across data edits.
  const onRoadmapAssignmentChange = useStableCallback(computed => {
    // Merge, never replace — see mergeRoadmapAssignment.
    setData(d => {
      const prev = d.roadmapAssignment || {};
      const rootIds = new Set((d.tree || []).filter(r => !r.id.includes('.')).map(r => r.id));
      const merged = mergeRoadmapAssignment(prev, computed, rootIds);
      const unchanged =
        Object.keys(merged).length === Object.keys(prev).length &&
        Object.keys(merged).every(id => prev[id] && prev[id].routeIdx === merged[id].routeIdx && prev[id].colorIdx === merged[id].colorIdx);
      return unchanged ? d : { ...d, roadmapAssignment: merged };
    });
  });
  const onSumExportTodo = useStableCallback(horizonDays => exportSprintMarkdown({ ..._exportCtx(), horizonDays }));
  // Everything the Resources view edits goes through the lens of the day you
  // are working on (`effDate`, empty = today): `foldEdit` puts each field
  // where it belongs — the change at that date, or the plan itself.
  const onResMeetingPlansUpd = useStableCallback(list =>
    mutate(d => {
      const known = new Set((d.meetingPlans || []).map(p => p.id));
      const kept = new Set((list || []).map(p => p.id));
      // Plans that were removed or added are timeless; edited ones are folded.
      let next = {
        ...d,
        meetingPlans: [...(d.meetingPlans || []).filter(p => kept.has(p.id)), ...(list || []).filter(p => !known.has(p.id))],
      };
      for (const plan of list || []) if (known.has(plan.id)) next = foldEdit(next, 'meetingPlans', plan, effFold);
      return pruneChanges(next);
    }),
  );
  const onResMemberUpd = useStableCallback(m => mutate(d => foldEdit(d, 'members', m, effFold)));
  const onResMemberAdd = useStableCallback(teamId => {
    // Somebody added while working on a date joins on that date.
    if (!effDate) {
      addMember(teamId);
      return;
    }
    const id = 'm' + Date.now();
    mutate(d => ({
      ...d,
      members: [
        ...(d.members || []),
        { id, name: 'New person', team: teamId || d.teams?.[0]?.id || '', role: '', cap: 1.0, vac: 25, start: effDate },
      ],
    }));
  });
  const onResMemberClone = useStableCallback((...a) => cloneMember(...a));
  const onResMemberDel = useStableCallback(id => {
    // Removed while working on a date: they leave the day before, and stay
    // in the plan for everything up to then.
    // Never LATER than they were already leaving; and somebody who would
    // only join on or after that day was never there — they are deleted.
    const target = members.find(m => m.id === id);
    if (effDate && target && !(target.start && target.start >= effDate)) {
      const last = addDays(effDate, -1);
      mutate(d => ({ ...d, members: (d.members || []).map(m => (m.id === id ? { ...m, end: m.end && m.end < last ? m.end : last } : m)) }));
      return;
    }
    mutate(d => pruneChanges({ ...d, members: (d.members || []).filter(m => m.id !== id) }));
  });
  const onResVacUpd = useStableCallback(v => setD('vacations', v));
  const onResTeamUpd = useStableCallback((i, k, v) => {
    const team = resLens.teams[i];
    if (team) mutate(d => foldEdit(d, 'teams', { ...team, [k]: v }, effFold));
  });
  const onResTeamAdd = useStableCallback(() =>
    setD('teams', [...teams, { id: `T${teams.length + 1}`, name: 'New Team', color: '#3b82f6' }]),
  );
  const onResTeamDel = useStableCallback(i => {
    const deleted = teams[i];
    if (!deleted) return;
    mutate(d => {
      const nextTeams = d.teams.filter((_, j) => j !== i);
      const nextMembers = d.members.map(m => withoutTeam(m, deleted.id));
      const nextTree = d.tree.map(r => {
        let out = r;
        if (r.team === deleted.id) out = { ...out, team: '' };
        if (r.phases?.length) {
          const phases = r.phases.map(p => {
            const hasMatch = p.team === deleted.id || (p.teams || []).includes(deleted.id);
            if (!hasMatch) return p;
            const teamsRest = (p.teams || []).filter(t => t !== deleted.id);
            return { ...p, team: p.team === deleted.id ? teamsRest[0] || '' : p.team, teams: teamsRest };
          });
          if (phases.some((p, idx) => p !== r.phases[idx])) out = { ...out, phases };
        }
        return out;
      });
      // A dated change for the team that is gone goes with it: team ids are
      // reused, and an orphan would come back to life on the next new team.
      return pruneChanges({ ...d, teams: nextTeams, members: nextMembers, tree: nextTree });
    });
  });
  const onHolUpdate = useStableCallback(v => setD('holidays', v));

  if (!bootstrapped)
    return (
      <div className="onboard">
        <div className="onboard-card fade" style={{ padding: 32, width: 360 }}>
          <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>
            Planr<span style={{ color: 'var(--ac)' }}>.</span>
          </div>
          <div className="onboard-sub" style={{ marginBottom: 0 }}>
            Restoring project context...
          </div>
        </div>
      </div>
    );

  if (!data && fileName && fileHandleRef.current)
    return (
      <div className="onboard">
        <div className="onboard-card fade" style={{ padding: 32, width: 420, textAlign: 'center' }}>
          <div className="onboard-logo" style={{ fontSize: 24, marginBottom: 10 }}>
            Planr<span style={{ color: 'var(--ac)' }}>.</span>
          </div>
          <div className="onboard-sub" style={{ marginBottom: 22 }}>
            Restore mounted project
          </div>
          <div
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--b2)',
              borderRadius: 'var(--r)',
              padding: 12,
              marginBottom: 18,
              fontSize: 12,
              fontFamily: 'var(--mono)',
              color: 'var(--tx2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Icon name="doc" size={14} />
            {fileName}
          </div>
          <p className="helper" style={{ marginBottom: 18, fontSize: 12 }}>
            Browser security requires you to grant file access again after a page reload.
          </p>
          <div className="ob-actions">
            <button className="ob-btn ob-pri" onClick={restoreMountedFile}>
              Reactivate file access
            </button>
            <button
              className="ob-btn ob-sec"
              onClick={async () => {
                await forgetHandle();
              }}
            >
              Discard mount
            </button>
          </div>
        </div>
      </div>
    );

  if (!data)
    return (
      <>
        <Onboard
          onCreate={() => setModal('new')}
          onLoad={loadFromFile}
          fRef={fRef}
          onJiraImport={() => setModal('jiraImport')}
          onLoadDemo={() => {
            import('./utils/demoProject.js').then(m => {
              const demo = m.buildDemoProject(_t);
              setData(demo);
              resetHistory();
              setSaved(false);
              setTab('summary');
              setSel(demo.tree?.[0] || null);
            });
          }}
        />
        {modal === 'new' && (
          <NewProjModal
            onClose={() => setModal(null)}
            onCreate={d => {
              setData(d);
              resetHistory();
              setSaved(false);
              setModal(null);
              setTab('tree');
              setSel(d.tree?.[0] || null);
              // Auto-start tour for first-time users (tour not yet dismissed)
              try {
                if (!localStorage.getItem(TOUR_DONE_KEY)) setTourStep(0);
              } catch {}
            }}
          />
        )}
        {/* The other way to start: the work is already in Jira. Same shell the
        wizard builds — standard template, NRW holidays, two teams — with the
        tree coming from the paste instead of from an empty form. */}
        {modal === 'jiraImport' && (
          <JiraImportModal
            onClose={() => setModal(null)}
            onImport={({ nodes, newMembers, projectName }) => {
              const d = buildImportedProject({ nodes, members: newMembers, name: projectName, t: _t });
              setData(d);
              resetHistory();
              setSaved(false);
              setModal(null);
              setTab('tree');
              setSel(d.tree?.[0] || null);
            }}
          />
        )}
        <input ref={fRef} type="file" accept=".json,.md" style={{ display: 'none' }} onChange={loadFile} />
      </>
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

  // Bulk-edit body — same content rendered into the Tree sidebar AND the
  // standalone bulk-edit modal. Closure captures the App's state + setters.
  const renderBulkEditBody = () => {
    if (multiSel.size === 0) return null;
    const selItems = tree.filter(r => multiSel.has(r.id));
    const commonOf = (key, getter = r => r[key]) => {
      const vals = selItems.map(getter);
      const first = vals[0];
      return vals.every(v => v === first) ? first : null;
    };
    const commonTeam = commonOf('team');
    const commonStatus = commonOf('status');
    const commonPrio = commonOf('prio');
    const commonBest = commonOf('best');
    const commonFactor = commonOf('factor');
    const commonPinnedStart = commonOf('pinnedStart', r => r.pinnedStart || '');
    const commonCompletedStart = commonOf('completedStart', r => r.completedStart || '');
    const commonCompletedEnd = commonOf('completedEnd', r => r.completedEnd || '');
    const commonCompletedAt = commonOf('completedAt', r => r.completedAt || '');
    const commonConfidence = commonOf('confidence', r => r.confidence || '');
    const commonNote = commonOf('note');
    const commonParallel = commonOf('parallel', r => !!r.parallel);
    const commonTeamLock = commonOf('teamLock', r => !!r.teamLock);
    const allLeaf = selItems.every(r => isLeafNode(tree, r.id));
    const allDeadlineScoped =
      selItems.length > 0 &&
      selItems.every(item => {
        const rootId = deadlineRootIdForNode(tree, item.id);
        return !!rootId && item.id !== rootId;
      });
    const deadlineParentExcluded =
      allDeadlineScoped &&
      selItems.some(item => {
        const rootId = deadlineRootIdForNode(tree, item.id);
        const pid = item.id.split('.').slice(0, -1).join('.');
        return !!pid && !isDeadlineRelevantForRoot(tree, rootId, pid);
      });
    const commonDeadlineRelevant = allDeadlineScoped ? commonOf('deadlineRelevant', item => item.deadlineRelevant !== false) : null;
    const anyNonRoot = selItems.some(r => r.id.includes('.'));
    const batchTabs = [
      { id: 'overview', label: _t('qe.tab.overview') },
      { id: 'workflow', label: _t('qe.tab.workflow') },
      ...(allLeaf ? [{ id: 'effort', label: _t('qe.tab.effort') }] : []),
      ...(allLeaf || allDeadlineScoped ? [{ id: 'timing', label: _t('qe.tab.timing') }] : []),
    ];
    const bTab = batchTabs.find(bt => bt.id === sideTab) ? sideTab : 'overview';
    return (
      <div className="side-body">
        <p className="helper" style={{ marginBottom: 10 }}>
          {_t('bulk.hint')}
        </p>
        <div className="qe-tabs" role="tablist">
          {batchTabs.map(bt => (
            <button
              key={bt.id}
              role="tab"
              aria-selected={bTab === bt.id}
              className={`qe-tab${bTab === bt.id ? ' active' : ''}`}
              onClick={() => setSideTab(bt.id)}
            >
              {bt.label}
            </button>
          ))}
        </div>
        {bTab === 'overview' && (
          <>
            {allLeaf && (
              <div className="field">
                <label>
                  {_t('qe.status')}
                  {commonStatus == null ? ` (${_t('bulk.mixed')})` : ''}
                </label>
                <SearchSelect
                  value={commonStatus || ''}
                  options={[
                    { id: 'open', label: _t('open') },
                    { id: 'wip', label: _t('wip') },
                    { id: 'done', label: _t('done') },
                  ]}
                  onSelect={v =>
                    setD(
                      'tree',
                      tree.map(r => {
                        // The single editors' rules, not a bare status write: done stamps
                        // the completion dates and 100 %, open resets progress, wip seeds
                        // the start. A task with phases has no status of its own to set —
                        // its phases decide it — so it is left alone, as the single
                        // editors do by hiding the field.
                        if (!multiSel.has(r.id) || r.phases?.length) return r;
                        return { ...r, ...statusChangePatch(r, v) };
                      }),
                    )
                  }
                  placeholder={_t('bulk.chooseStatus')}
                />
              </div>
            )}
            <div className="field">
              <label>
                {_t('qe.notes')}
                {commonNote == null ? ` (${_t('bulk.mixed')})` : ''}
              </label>
              <LazyInput
                value={commonNote ?? ''}
                onCommit={v =>
                  setD(
                    'tree',
                    tree.map(r => (multiSel.has(r.id) ? { ...r, note: v } : r)),
                  )
                }
                placeholder={_t('bulk.notePlaceholder')}
              />
            </div>
            {anyNonRoot && (
              <>
                {(data.taskTemplates || []).length > 0 && (
                  <div className="field">
                    <label>{_t('ph.applyTemplate')}</label>
                    <SearchSelect
                      options={(data.taskTemplates || []).map(tp => ({ id: tp.id, label: tp.name }))}
                      onSelect={tplId => {
                        const tpl = (data.taskTemplates || []).find(tp => tp.id === tplId);
                        if (!tpl) return;
                        setD(
                          'tree',
                          tree.map(r => {
                            if (!multiSel.has(r.id)) return r;
                            const phases = instantiateTemplatePhases(tpl.phases);
                            return { ...r, phases, templateId: tplId, status: 'open', progress: 0 };
                          }),
                        );
                      }}
                      placeholder={_t('ph.applyTemplate')}
                    />
                  </div>
                )}
                {(() => {
                  const withPhases = selItems.filter(r => r.phases?.length);
                  if (!withPhases.length) return null;
                  const refPhases = withPhases[0].phases;
                  const allSameStructure =
                    withPhases.length === selItems.length &&
                    withPhases.every(r => r.phases.length === refPhases.length && r.phases.every((p, i) => p.name === refPhases[i].name));
                  if (!allSameStructure) return null;
                  return (
                    <div className="field">
                      <label>{_t('ph.phases')}</label>
                      {refPhases.map((ph, i) => {
                        const statuses = withPhases.map(r => r.phases[i].status);
                        const common = statuses.every(s => s === statuses[0]) ? statuses[0] : null;
                        // One geometric triple — filled / half / ring — rather than a dingbat
                        // check that renders as an emoji on some platforms.
                        const dot = common === 'done' ? '●' : common === 'wip' ? '◐' : common === 'open' ? '○' : '?';
                        const dotColor = common === 'done' ? 'var(--st-done)' : common === 'wip' ? 'var(--ac)' : 'var(--tx3)';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span
                              style={{
                                cursor: 'pointer',
                                fontSize: 13,
                                color: dotColor,
                                width: 18,
                                textAlign: 'center',
                                flexShrink: 0,
                                userSelect: 'none',
                              }}
                              onClick={() => {
                                const next = common === 'open' ? 'wip' : common === 'wip' ? 'done' : 'open';
                                setD(
                                  'tree',
                                  tree.map(r => {
                                    if (!multiSel.has(r.id) || !r.phases?.[i]) return r;
                                    const newPhases = r.phases.map((p, j) => (j === i ? { ...p, status: next } : p));
                                    // Same derivation as the single editors: a wip phase
                                    // counts for its share, not for nothing, so one click
                                    // gives one progress figure wherever it is made.
                                    const derived = derivePhaseStatus(newPhases);
                                    return {
                                      ...r,
                                      phases: newPhases,
                                      ...(derived ? { status: derived.status, progress: derived.progress } : {}),
                                    };
                                  }),
                                );
                              }}
                            >
                              {dot}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: common === 'done' ? 'var(--tx3)' : 'var(--tx)',
                                textDecoration: common === 'done' ? 'line-through' : 'none',
                              }}
                            >
                              {ph.name}
                            </span>
                            {common == null && <span style={{ fontSize: 10, color: 'var(--tx3)' }}>({_t('bulk.mixed')})</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}
        {bTab === 'workflow' && (
          <>
            <div className="field">
              <label>
                {_t('qe.team')}
                {commonTeam == null ? ` (${_t('bulk.mixed')})` : ''}
              </label>
              <SearchSelect
                value={commonTeam || ''}
                options={teams.map(t => ({ id: t.id, label: t.name }))}
                onSelect={v =>
                  setD(
                    'tree',
                    tree.map(r => (multiSel.has(r.id) ? { ...r, team: v } : r)),
                  )
                }
                placeholder={_t('bulk.chooseTeam')}
                allowEmpty
              />
            </div>
            <div className="field">
              <label>{_t('qe.assignee')}</label>
              {(() => {
                const commonAssigns = selItems[0]?.assign?.filter(a => selItems.every(r => (r.assign || []).includes(a))) || [];
                return (
                  <>
                    {commonAssigns.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {commonAssigns.map(a => {
                          const m = members.find(x => x.id === a);
                          return (
                            <span key={a} className="tag">
                              {m?.name || a}
                              <span
                                className="tag-x"
                                data-htip={_t('bulk.removeFromSelected')}
                                onClick={() =>
                                  setD(
                                    'tree',
                                    tree.map(r => (multiSel.has(r.id) ? { ...r, assign: (r.assign || []).filter(x => x !== a) } : r)),
                                  )
                                }
                              >
                                <Icon name="x" size={9} />
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <SearchSelect
                      options={members.filter(m => !commonAssigns.includes(m.id)).map(m => ({ id: m.id, label: m.name || m.id }))}
                      onSelect={v => {
                        const m = members.find(x => x.id === v);
                        setD(
                          'tree',
                          tree.map(r =>
                            multiSel.has(r.id)
                              ? { ...r, assign: [...new Set([...(r.assign || []), v])], team: teamForAssignment(m, r.team) }
                              : r,
                          ),
                        );
                      }}
                      placeholder={_t('qe.assignPerson')}
                    />
                  </>
                );
              })()}
            </div>
            {allLeaf && (
              <div className="field">
                <label>
                  {_t('qe.parallel') || 'Parallel'}
                  {commonParallel == null ? ` (${_t('bulk.mixed')})` : ''}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={commonParallel === true}
                      onChange={e =>
                        setD(
                          'tree',
                          tree.map(r => (multiSel.has(r.id) ? { ...r, parallel: e.target.checked || undefined } : r)),
                        )
                      }
                    />
                    <span className="slider" />
                  </label>
                  <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{_t('qe.parallelTip')}</span>
                </div>
              </div>
            )}
            {allLeaf && (
              <div className="field">
                <label>
                  {_t('qe.teamLock')}
                  {commonTeamLock == null ? ` (${_t('bulk.mixed')})` : ''}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={commonTeamLock === true}
                      onChange={e =>
                        setD(
                          'tree',
                          tree.map(r => (multiSel.has(r.id) ? { ...r, teamLock: e.target.checked || undefined } : r)),
                        )
                      }
                    />
                    <span className="slider" />
                  </label>
                  <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{_t('qe.teamLockTip')}</span>
                </div>
              </div>
            )}
          </>
        )}
        {bTab === 'effort' && (
          <>
            {allLeaf && (
              <div className="frow">
                <div className="field">
                  <label>
                    {_t('qe.bestDays')}
                    {commonBest == null ? ` (${_t('bulk.mixed')})` : ''}
                  </label>
                  <LazyInput
                    type="number"
                    min="0"
                    step="0.1"
                    value={commonBest ?? ''}
                    onCommit={v =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, best: +v } : r)),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>
                    {_t('qe.factor')}
                    {commonFactor == null ? ` (${_t('bulk.mixed')})` : ''}
                  </label>
                  <LazyInput
                    type="number"
                    step="0.1"
                    min="1"
                    value={commonFactor ?? ''}
                    onCommit={v =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, factor: +v } : r)),
                      )
                    }
                  />
                </div>
              </div>
            )}
            <div className="field">
              <label>
                {_t('qe.priority')}
                {commonPrio == null ? ` (${_t('bulk.mixed')})` : ''}
              </label>
              <SearchSelect
                value={commonPrio ? String(commonPrio) : ''}
                options={[
                  { id: '1', label: `1 ${_t('critical')}` },
                  { id: '2', label: `2 ${_t('high')}` },
                  { id: '3', label: `3 ${_t('medium')}` },
                  { id: '4', label: `4 ${_t('low')}` },
                ]}
                onSelect={v =>
                  setD(
                    'tree',
                    tree.map(r => (multiSel.has(r.id) ? { ...r, prio: +v } : r)),
                  )
                }
                placeholder={_t('bulk.choosePriority')}
              />
            </div>
            <div className="field">
              <label>{_t('qe.confidence')}</label>
              <div style={{ display: 'flex', gap: 3 }}>
                {[
                  ['', _t('auto')],
                  ['committed', '●'],
                  ['estimated', '◐'],
                  ['exploratory', '○'],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={`btn btn-sec btn-xs${commonConfidence === v ? ' active' : ''}`}
                    style={{ flex: 1, fontSize: 11 }}
                    onClick={() =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, confidence: v } : r)),
                      )
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {bTab === 'timing' && (
          <>
            {allLeaf && (
              <div className="frow">
                <div className="field">
                  <label>
                    {_t('qe.pinnedStart')}
                    {commonPinnedStart == null ? ` (${_t('bulk.mixed')})` : ''}
                  </label>
                  <LazyInput
                    type="date"
                    value={commonPinnedStart ?? ''}
                    onCommit={v =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, pinnedStart: v } : r)),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>
                    {_t('qe.completedStart')}
                    {commonCompletedStart == null ? ` (${_t('bulk.mixed')})` : ''}
                  </label>
                  <LazyInput
                    type="date"
                    value={commonCompletedStart ?? ''}
                    onCommit={v =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, completedStart: v } : r)),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>
                    {_t('qe.completedEnd')}
                    {commonCompletedEnd == null ? ` (${_t('bulk.mixed')})` : ''}
                  </label>
                  <LazyInput
                    type="date"
                    value={commonCompletedEnd ?? ''}
                    onCommit={v =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, completedEnd: v, completedAt: v || r.completedAt } : r)),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>
                    {_t('qe.completedAt')}
                    {commonCompletedAt == null ? ` (${_t('bulk.mixed')})` : ''}
                  </label>
                  <LazyInput
                    type="date"
                    value={commonCompletedAt ?? ''}
                    onCommit={v =>
                      setD(
                        'tree',
                        tree.map(r => (multiSel.has(r.id) ? { ...r, completedAt: v, completedEnd: v || r.completedEnd } : r)),
                      )
                    }
                  />
                </div>
              </div>
            )}
            {allDeadlineScoped && (
              <div className="field">
                <label>
                  {_t('qe.affectsDeadline')}
                  {commonDeadlineRelevant == null ? ` (${_t('bulk.mixed')})` : ''}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={commonDeadlineRelevant !== false}
                      disabled={deadlineParentExcluded}
                      onChange={e =>
                        setD(
                          'tree',
                          tree.map(r => (multiSel.has(r.id) ? { ...r, deadlineRelevant: e.target.checked ? undefined : false } : r)),
                        )
                      }
                    />
                    <span className="slider" />
                  </label>
                  <span
                    style={{
                      fontSize: 12,
                      color: deadlineParentExcluded ? 'var(--tx3)' : commonDeadlineRelevant === false ? 'var(--am)' : 'var(--tx2)',
                    }}
                  >
                    {commonDeadlineRelevant === false ? _t('no') : _t('yes')}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        <hr className="divider" />
        <button className="btn btn-sec btn-sm" style={{ width: '100%', marginBottom: 6 }} onClick={() => setMultiSel(new Set())}>
          {_t('bulk.clearSelection')}
        </button>
      </div>
    );
  };

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

  return (
    <>
      <CapacityProvider value={capacityAt}>
        <HoverTipProvider />
        <CommandPalette commands={paletteCommands} />
        <KeyboardMap />
        <div className={`app${scn ? ' in-scenario' : ''}`} ref={appRef}>
          <div className="topbar">
            <TopBarFile
              SAVE_DEBOUNCE_MS={SAVE_DEBOUNCE_MS}
              _t={_t}
              autoSave={autoSave}
              fileName={fileName}
              fileSynced={fileSynced}
              fileWriteOk={fileWriteOk}
              hosted={hosted}
              lastSavedAt={lastSavedAt}
              meta={meta}
              saveCountdown={saveCountdown}
              saveToFile={saveToFile}
              saved={saved}
              saving={saving}
              setAutoSave={setAutoSave}
            />
            <ExternalChangeBanner
              _t={_t}
              externalChangeAvailable={externalChangeAvailable}
              reloadFromFile={reloadFromFile}
              setExternalChangeAvailable={setExternalChangeAvailable}
            />
            <TopBarState
              _t={_t}
              history={history}
              droppedCount={droppedCount}
              effDate={effDate}
              effDates={effDates}
              effDropDate={effDropDate}
              fRef={fRef}
              fileName={fileName}
              handleRedo={handleRedo}
              handleUndo={handleUndo}
              leaves={leaves}
              loadFile={loadFile}
              loadFromFile={loadFromFile}
              newProject={newProject}
              past={past}
              pickEffDate={pickEffDate}
              saveToFile={saveToFile}
              saved={saved}
              scenarioCreate={scenarioCreate}
              scenarioDelete={scenarioDelete}
              scenarioList={scenarioList}
              scenarioRename={scenarioRename}
              scenarioSwitch={scenarioSwitch}
              scheduled={scheduled}
              scn={scn}
              scnChanges={scnChanges}
              setModal={setModal}
              setTab={setTab}
              tab={tab}
            />
          </div>
          <ScenarioStrip
            activeScenario={activeScenario}
            effCount={effCount}
            effDate={effDate}
            effDropDate={effDropDate}
            handleUndo={handleUndo}
            past={past}
            pastStart={pastStart}
            pickEffDate={pickEffDate}
            scenarioApply={scenarioApply}
            scenarioCreate={scenarioCreate}
            scenarioDelete={scenarioDelete}
            scenarioRename={scenarioRename}
            scenarioSwitch={scenarioSwitch}
            scn={scn}
            scnChanges={scnChanges}
            scnComparison={scnComparison}
            scnNotice={scnNotice}
            setModal={setModal}
            setScnNotice={setScnNotice}
            setTab={setTab}
            tab={tab}
          />
          <TabBar
            TABS={TABS}
            _t={_t}
            activeTabRef={activeTabRef}
            setTab={setTab}
            syncTabFades={syncTabFades}
            tab={tab}
            tabBarRef={tabBarRef}
            tabFades={tabFades}
          />
          <FilterBar
            _t={_t}
            activeQuickFilters={activeQuickFilters}
            activeScopeChips={activeScopeChips}
            archive={archive}
            archiveDays={archiveDays}
            data={data}
            diffOnlyChanged={diffOnlyChanged}
            hideDone={hideDone}
            horizonDays={horizonDays}
            horizonEnd={horizonEnd}
            horizonOnlyPlanned={horizonOnlyPlanned}
            persistDiffOnlyChanged={persistDiffOnlyChanged}
            persistHorizon={persistHorizon}
            persistHorizonOnly={persistHorizonOnly}
            persistSince={persistSince}
            quickFilters={quickFilters}
            scn={scn}
            scopeFields={scopeFields}
            search={search}
            searchRef={searchRef}
            setArchiveDays={setArchiveDays}
            setModal={setModal}
            setSearch={setSearch}
            setSearchIdx={setSearchIdx}
            setShowArchived={setShowArchived}
            showArchived={showArchived}
            sinceDate={sinceDate}
            sinceDays={sinceDays}
            tab={tab}
          />
          <div className="main">
            {visitedTabs.has('summary') && (
              <SummaryPane
                archive={archive}
                archiveDays={archiveDays}
                confidence={confidence}
                cpSet={cpSet}
                data={data}
                diff={diff}
                diffOnlyChanged={diffOnlyChanged}
                futureProgressByRootId={futureProgressByRootId}
                goalPaths={goalPaths}
                goals={goals}
                hm={hm}
                horizonDays={horizonDays}
                horizonEnd={horizonEnd}
                horizonIds={horizonIds}
                horizonOnlyPlanned={horizonOnlyPlanned}
                members={members}
                onOpenItemDialog={onOpenItemDialog}
                onRoadmapAssignmentChange={onRoadmapAssignmentChange}
                onSumExportTodo={onSumExportTodo}
                onSumNavigate={onSumNavigate}
                persistDiffOnlyChanged={persistDiffOnlyChanged}
                persistHorizon={persistHorizon}
                persistHorizonOnly={persistHorizonOnly}
                persistSince={persistSince}
                projectWaitsOf={projectWaitsOf}
                scheduled={scheduled}
                scnShifts={scnShifts}
                setArchiveDays={setArchiveDays}
                setShowArchived={setShowArchived}
                showArchived={showArchived}
                sinceDate={sinceDate}
                sinceDays={sinceDays}
                stats={stats}
                tab={tab}
                teams={teams}
                tree={tree}
                workDays={workDays}
              />
            )}
            {visitedTabs.has('briefing') && (
              <BriefingPane
                confidence={confidence}
                cpLabels={cpLabels}
                data={data}
                diffFilterSet={diffFilterSet}
                diffVisibleSet={diffVisibleSet}
                hideDone={hideDone}
                horizonFilterSet={horizonFilterSet}
                members={members}
                onBriefingUpdate={onBriefingUpdate}
                onJiraApplyStatus={onJiraApplyStatus}
                onOpenItemDialog={onOpenItemDialog}
                onSumExportTodo={onSumExportTodo}
                personFilter={personFilter}
                rootFilter={rootFilter}
                tab={tab}
                teamFilter={teamFilter}
                teams={teams}
                tree={tree}
                vacations={vacations}
                viewCpSet={viewCpSet}
                viewScheduled={viewScheduled}
                viewStats={viewStats}
                visibleTreeForViews={visibleTreeForViews}
              />
            )}
            {visitedTabs.has('plan') && (
              <PlanPane
                confReasons={confReasons}
                confidence={confidence}
                cpData={cpData}
                cpLabels={cpLabels}
                data={data}
                diffFilterSet={diffFilterSet}
                diffVisibleSet={diffVisibleSet}
                hideDone={hideDone}
                horizonFilterSet={horizonFilterSet}
                members={members}
                onApplyOrder={onApplyOrder}
                onOpenItemDialog={onOpenItemDialog}
                onPlanReviewUpdate={onPlanReviewUpdate}
                personFilter={personFilter}
                reschedule={reschedule}
                rootFilter={rootFilter}
                tab={tab}
                teamFilter={teamFilter}
                teams={teams}
                tree={tree}
                vacations={vacations}
                viewCpSet={viewCpSet}
                viewScheduled={viewScheduled}
                viewStats={viewStats}
                visibleTreeForViews={visibleTreeForViews}
                weeks={weeks}
              />
            )}
            {/* The tree pane was the one pane left outside Frozen. It is the most
          expensive of them all — 298 rows on a real plan — so it was the one
          re-rendering, unseen, on every switch to any other tab. Measured in
          Chromium on a 404-item plan: ~40 ms per switch, gone. */}
            {visitedTabs.has('tree') && (
              <div className="pane-full" style={{ display: tab === 'tree' ? 'flex' : 'none', flexDirection: 'row' }}>
                <Frozen active={tab === 'tree'}>
                  <TreeList
                    cpLabels={cpLabels}
                    cpSet={cpSet}
                    data={data}
                    deferredSearch={deferredSearch}
                    diff={diff}
                    diffOnlyChanged={diffOnlyChanged}
                    editorAsDialog={editorAsDialog}
                    hideDone={hideDone}
                    horizonEnd={horizonEnd}
                    horizonIds={horizonIds}
                    horizonOnlyPlanned={horizonOnlyPlanned}
                    members={members}
                    multiSel={multiSel}
                    onGanttTaskUpdate={onGanttTaskUpdate}
                    onTreeBulkDelete={onTreeBulkDelete}
                    onTreeCommand={onTreeCommand}
                    onTreeCommandMany={onTreeCommandMany}
                    onTreeDelete={onTreeDelete}
                    onTreeDropRows={onTreeDropRows}
                    onTreeInsertAfter={onTreeInsertAfter}
                    onTreeInsertChild={onTreeInsertChild}
                    onTreeMove={onTreeMove}
                    onTreePasteRows={onTreePasteRows}
                    onTreeRevealHidden={onTreeRevealHidden}
                    onTreeSelect={onTreeSelect}
                    onTreeSelectAll={onTreeSelectAll}
                    persistSince={persistSince}
                    personFilter={personFilter}
                    rootFilter={rootFilter}
                    scheduled={scheduled}
                    scnChangedIds={scnChangedIds}
                    selected={selected}
                    setBulkEditModalOpen={setBulkEditModalOpen}
                    setMN={setMN}
                    setModal={setModal}
                    setMultiSel={setMultiSel}
                    showTreeIds={showTreeIds}
                    sinceDate={sinceDate}
                    sinceDays={sinceDays}
                    stats={stats}
                    teamFilter={teamFilter}
                    teams={teams}
                    tree={tree}
                    visibleTreeForViews={visibleTreeForViews}
                  />
                  <TreeSide
                    _t={_t}
                    addDep={addDep}
                    confReasons={confReasons}
                    confidence={confidence}
                    cpLabels={cpLabels}
                    cpSet={cpSet}
                    data={data}
                    deleteNode={deleteNode}
                    duplicateNode={duplicateNode}
                    editorAsDialog={editorAsDialog}
                    hm={hm}
                    members={members}
                    multiSel={multiSel}
                    mutate={mutate}
                    past={past}
                    removeDep={removeDep}
                    renderBulkEditBody={renderBulkEditBody}
                    scheduled={scheduled}
                    selected={selected}
                    setBulkEditModalOpen={setBulkEditModalOpen}
                    setEditorDock={setEditorDock}
                    setMN={setMN}
                    setModal={setModal}
                    setMultiSel={setMultiSel}
                    setSel={setSel}
                    setSideTab={setSideTab}
                    sideTab={sideTab}
                    splitHandoff={splitHandoff}
                    splitTaskAtProgress={splitTaskAtProgress}
                    stats={stats}
                    teams={teams}
                    tree={tree}
                    updateNode={updateNode}
                    workDays={workDays}
                  />
                </Frozen>
              </div>
            )}
            {visitedTabs.has('gantt') && (
              <GanttPane
                activeScheduled={activeScheduled}
                activeTree={activeTree}
                confReasons={confReasons}
                confidence={confidence}
                cpLabels={cpLabels}
                data={data}
                deferredSearch={deferredSearch}
                diff={diff}
                diffDoneSet={diffDoneSet}
                diffOnlyChanged={diffOnlyChanged}
                diffProgressedSet={diffProgressedSet}
                hideDone={hideDone}
                horizonEnd={horizonEnd}
                horizonIds={horizonIds}
                horizonOnlyPlanned={horizonOnlyPlanned}
                members={members}
                onGanttAddDep={onGanttAddDep}
                onGanttBarClick={onGanttBarClick}
                onGanttExtendViewStart={onGanttExtendViewStart}
                onGanttRemoveDep={onGanttRemoveDep}
                onGanttReorderSibling={onGanttReorderSibling}
                onGanttSeqUpdate={onGanttSeqUpdate}
                onGanttTaskUpdate={onGanttTaskUpdate}
                personFilter={personFilter}
                personQueues={personQueues}
                planStart={planStart}
                rootFilter={rootFilter}
                scnBaseline={scnBaseline}
                searchIdx={searchIdx}
                setBulkEditModalOpen={setBulkEditModalOpen}
                setMultiSel={setMultiSel}
                sinceDate={sinceDate}
                tab={tab}
                teamFilter={teamFilter}
                teams={teams}
                vacations={vacations}
                viewCpEdges={viewCpEdges}
                viewCpSet={viewCpSet}
                viewGoals={viewGoals}
                weeks={weeks}
                workDays={workDays}
              />
            )}
            {visitedTabs.has('roadmap') && (
              <RoadmapPane
                activeScheduled={activeScheduled}
                activeTree={activeTree}
                cpLabels={cpLabels}
                data={data}
                diffDoneSet={diffDoneSet}
                diffOnlyChanged={diffOnlyChanged}
                diffProgressedSet={diffProgressedSet}
                ganttRoadmapFocus={ganttRoadmapFocus}
                members={members}
                onMoveBehind={onMoveBehind}
                onOpenItemDialog={onOpenItemDialog}
                projectWaitsOf={projectWaitsOf}
                setGanttRoadmapFocus={setGanttRoadmapFocus}
                sinceDate={sinceDate}
                stats={stats}
                tab={tab}
                teams={teams}
                viewCpSet={viewCpSet}
              />
            )}
            {visitedTabs.has('net') && (
              <NetPane
                archive={archive}
                cpLabels={cpLabels}
                deferredSearch={deferredSearch}
                diffDoneSet={diffDoneSet}
                diffOnlyChanged={diffOnlyChanged}
                diffProgressedSet={diffProgressedSet}
                hideDone={hideDone}
                horizonIds={horizonIds}
                horizonOnlyPlanned={horizonOnlyPlanned}
                members={members}
                onNetAddNode={onNetAddNode}
                onNetDeleteNode={onNetDeleteNode}
                onNetNodeClick={onNetNodeClick}
                personFilter={personFilter}
                rootFilter={rootFilter}
                searchIdx={searchIdx}
                setRootFilter={setRootFilter}
                setSearchIdx={setSearchIdx}
                showArchived={showArchived}
                tab={tab}
                teamFilter={teamFilter}
                teams={teams}
                viewCpSet={viewCpSet}
                viewScheduled={viewScheduled}
                viewStats={viewStats}
                visibleTreeForViews={visibleTreeForViews}
              />
            )}
            {visitedTabs.has('order') && (
              <OrderPane
                activeTree={activeTree}
                data={data}
                deferredSearch={deferredSearch}
                members={members}
                onGanttTaskUpdate={onGanttTaskUpdate}
                onQueueReorder={onQueueReorder}
                onQueueReset={onQueueReset}
                personFilter={personFilter}
                personQueues={personQueues}
                rootFilter={rootFilter}
                scheduled={scheduled}
                setBulkEditModalOpen={setBulkEditModalOpen}
                setMN={setMN}
                setModal={setModal}
                setMultiSel={setMultiSel}
                tab={tab}
                teamFilter={teamFilter}
                teams={teams}
              />
            )}
            {visitedTabs.has('resources') && (
              <ResourcesPane
                effContext={effContext}
                onResMeetingPlansUpd={onResMeetingPlansUpd}
                onResMemberAdd={onResMemberAdd}
                onResMemberClone={onResMemberClone}
                onResMemberDel={onResMemberDel}
                onResMemberUpd={onResMemberUpd}
                onResTeamAdd={onResTeamAdd}
                onResTeamDel={onResTeamDel}
                onResTeamUpd={onResTeamUpd}
                onResVacUpd={onResVacUpd}
                personFilter={personFilter}
                resLens={resLens}
                scheduled={scheduled}
                tab={tab}
                teamFilter={teamFilter}
                tree={tree}
                vacations={vacations}
                weeks={weeks}
              />
            )}
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
          <EditModals
            addNode={addNode}
            confReasons={confReasons}
            confidence={confidence}
            cpLabels={cpLabels}
            cpSet={cpSet}
            data={data}
            deleteNode={deleteNode}
            duplicateNode={duplicateNode}
            editorAsDialog={editorAsDialog}
            members={members}
            modal={modal}
            modalFocus={modalFocus}
            modalNode={modalNode}
            moveNode={moveNode}
            mutate={mutate}
            past={past}
            scheduled={scheduled}
            selected={selected}
            setEditorDock={setEditorDock}
            setMN={setMN}
            setModal={setModal}
            setModalFocus={setModalFocus}
            setSel={setSel}
            splitHandoff={splitHandoff}
            splitTaskAtProgress={splitTaskAtProgress}
            stats={stats}
            teams={teams}
            tree={tree}
            updateNode={updateNode}
          />
          <ScenarioModals
            activeScenario={activeScenario}
            data={data}
            exportScenarioPDF={exportScenarioPDF}
            modal={modal}
            resetHistory={resetHistory}
            scenarioApply={scenarioApply}
            scenarioRevertChange={scenarioRevertChange}
            scn={scn}
            scnChanges={scnChanges}
            scnCompareMemory={scnCompareMemory}
            scnComparison={scnComparison}
            setData={setData}
            setModal={setModal}
            setSaved={setSaved}
            setSel={setSel}
            setTab={setTab}
            tree={tree}
          />
          <ConfigModals
            _t={_t}
            bulkEditModalOpen={bulkEditModalOpen}
            data={data}
            editorDock={editorDock}
            meta={meta}
            modal={modal}
            multiSel={multiSel}
            renderBulkEditBody={renderBulkEditBody}
            setBulkEditModalOpen={setBulkEditModalOpen}
            setD={setD}
            setEditorDock={setEditorDock}
            setModal={setModal}
            setShowTreeIds={setShowTreeIds}
            setUiScale={setUiScale}
            showTreeIds={showTreeIds}
            teams={teams}
            uiScale={uiScale}
          />
          <ProjectModals
            applyJiraImport={applyJiraImport}
            data={data}
            exportHandlerProps={exportHandlerProps}
            members={members}
            meta={meta}
            modal={modal}
            modalNode={modalNode}
            resetHistory={resetHistory}
            scheduled={scheduled}
            setData={setData}
            setMN={setMN}
            setModal={setModal}
            setSaved={setSaved}
            setSel={setSel}
            setTab={setTab}
            teams={teams}
            tree={tree}
            updateNode={updateNode}
          />

          <OnboardingModals
            NEW_FEATURES={NEW_FEATURES}
            TOUR_STEPS={TOUR_STEPS}
            _t={_t}
            closeTour={closeTour}
            dismissNewFeat={dismissNewFeat}
            setTourStep={setTourStep}
            showNewFeat={showNewFeat}
            startTour={startTour}
            tourStep={tourStep}
          />
        </div>
      </CapacityProvider>
    </>
  );
}
