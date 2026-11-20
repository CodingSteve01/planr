import { useState } from 'react';
import { store, storedFlag, storedFlagDefaultOn, storedText } from './storage.js';

// The two project-wide time windows, as the filter popup sets them. State and
// persistence only; the dates and id sets they stand for are derived in
// App.jsx, where the schedule is.
export function useReviewWindow() {
  // ── Diff overlay (project-wide "since" window) ─────────────────────────────
  // Lives at app level so every view (Roadmap, TreeView, Timetable, Gantt,
  // Network) reads the same cutoff and the same precomputed event-based diff
  // bag. Persists in localStorage.
  const [sinceDays, setSinceDays] = useState(() => storedText('planr_diff_since'));
  const persistSince = val => {
    setSinceDays(val);
    store('planr_diff_since', val);
  };
  // "Only with changes" filter — currently consumed by TreeView. Lives at app
  // level so the toggle inside the global ViewFilters popup stays the only
  // place to flip it.
  const [diffOnlyChanged, setDiffOnlyChanged] = useState(() => storedFlag('planr_diff_only_changed'));
  const persistDiffOnlyChanged = v => {
    setDiffOnlyChanged(v);
    store('planr_diff_only_changed', String(v));
  };
  // ── Planning-horizon filter (project-wide) ─────────────────────────────────
  // Mirrors the diff picker shape: presets in days (7/14/30) or an explicit
  // date. When set, every view narrows to tasks scheduled within the window
  // so the planner can focus on one horizon at a time.
  const [horizonDays, setHorizonDays] = useState(() => storedText('planr_horizon'));
  const persistHorizon = val => {
    setHorizonDays(val);
    store('planr_horizon', val);
  };
  // "Only planned" — strict filter mode. Default on so the picker behaves
  // like the diff "Only changed" toggle (filter is the obvious effect).
  // When off, views fall back to soft hinting (dim/badge) without dropping
  // rows, so the user can still see the full plan with the horizon marker.
  const [horizonOnlyPlanned, setHorizonOnlyPlanned] = useState(() => storedFlagDefaultOn('planr_horizon_only'));
  const persistHorizonOnly = v => {
    setHorizonOnlyPlanned(v);
    store('planr_horizon_only', String(v));
  };
  return {
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
  };
}
