import { useState, useRef, useEffect } from 'react';
import { createHistory, push as pushHistory, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from '../utils/undo.js';

// Undo and redo for the document on screen. `history` is passed in and never
// read as a bare global: it names a browser object too.
function useUndoSteps({ data, setData, setSaved, history, setHistory, setScnNotice }) {
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
  return { dataRef, mutate, handleUndo, handleRedo };
}

// What just happened to a scenario — applied, deleted — said out loud for a
// moment, with the way back. Leaving a mode must not look like nothing.
function useScenarioNotice() {
  const [scnNotice, setScnNotice] = useState(null); // { kind, name, changes }
  useEffect(() => {
    if (!scnNotice) return undefined;
    const timer = setTimeout(() => setScnNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [scnNotice]);
  return [scnNotice, setScnNotice];
}

// ── Undo/redo ────────────────────────────────────────────────────────────
// `history` holds only past/future — the present lives in `data` itself.
// `mutate` is the single gateway every USER-initiated edit routes through
// (see utils/undo.js for the coalescing/redo-clearing rules). Automatic
// writes — parent-status derivation, completion-metadata sync, roadmap-
// assignment merge, autosave, migrations — stay on plain setData so they
// never show up as an undo step. Loading a different document (file open,
// new project, snapshot restore) calls resetHistory() instead.
//
// The same hook holds what else belongs to the document on screen and is
// swapped or cleared with it: the scenario that is open over it, the earlier
// day that is chosen, and the baselines the history log is measured against.
export function useDocumentState({ data, setData, setSaved }) {
  const [history, setHistory] = useState(() => createHistory({ limit: 100 }));
  // While a scenario is on screen, `data` IS the scenario — the plan with the
  // scenario's changes applied — and every view, edit, undo and export works
  // on it exactly as it does on the plan. The plan itself waits in `scn.base`.
  // The file always holds the plan plus, per scenario, what differs
  // (`fileData`, useScenarios); nothing a scenario does reaches the plan until
  // it is applied. See utils/scenario.js and docs/scenarios.md.
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
  const [effDate, setEffDate] = useState('');
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
  // Leaf-state snapshot at the moment of the last successful persist (load or
  // save). Drives the history-event diff: every save compares the current tree
  // to this snapshot and appends only the changes. Reseeded on file load so
  // we don't emit fake "added" events for the whole tree.
  const lastSavedLeavesRef = useRef(null);
  const leafBaselineStaleRef = useRef(true);
  const [scnNotice, setScnNotice] = useScenarioNotice();
  const steps = useUndoSteps({ data, setData, setSaved, history, setHistory, setScnNotice });
  // A different document is on screen: its undo stack is gone, and so is any
  // scenario that was open over the previous one.
  function resetDocumentState() {
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
  return {
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
    ...steps,
  };
}
