import { useMemo, useRef } from 'react';
import { applyPastEdit } from '../utils/dayLog.js';
import {
  applyPatch,
  carryScenarioList,
  deepEqual,
  describeChanges,
  diffPlan,
  newScenarioId,
  revertChange,
  uniqueScenarioName,
  withScenarioPatch,
} from '../utils/scenario.js';
import { createHistory, push as pushHistory } from '../utils/undo.js';

const NO_SCENARIOS = [];

// What the open scenario amounts to, and the file-shaped document: the plan
// with each scenario as its patch.
function useScenarioDocument({ data, scn, past }) {
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
  return { scnPatch, scnChanges, fileData, fileDataRef };
}

// Putting a document on screen: the plan or one of its scenarios.
function useShowDocument({ history, setHistory, setData, setScn, scnRef, dataRef, planHistoryRef, setMultiSel, setScnNotice }) {
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
  return showDocument;
}

// The scenario list and what a person can do with it.
function useScenarioActions(c) {
  const { data, scn, pastRef, fileDataRef, showDocument, mutate, scnPatch, scnChanges, setScnNotice, setSaved, setModal, _t } = c;
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
  return {
    scenarioList,
    activeScenario,
    scenarioSwitch,
    scenarioCreate,
    scenarioRename,
    scenarioDelete,
    scenarioApply,
    scenarioRevertChange,
  };
}

// Scenarios over the plan, and the file-shaped document that goes with them.
export function useScenarios(args) {
  const { data, scn, past } = args;
  const { scnPatch, scnChanges, fileData, fileDataRef } = useScenarioDocument({ data, scn, past });
  const showDocument = useShowDocument({ ...args, fileDataRef });
  const actions = useScenarioActions({ ...args, fileDataRef, showDocument, scnPatch, scnChanges });
  return { scnPatch, scnChanges, fileData, fileDataRef, showDocument, ...actions };
}
