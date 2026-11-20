import { useMemo } from 'react';
import { baselineWindows, compareScenario, schedulePlanData } from '../../utils/scenarioCompare.js';

// ── Scenario against plan ────────────────────────────────────────────────
// The plan is scheduled a second time, once per visit to a scenario, so the
// two can be laid side by side. Same scheduler, same day, same inputs but
// for the scenario's changes — which is what makes the difference theirs.
// Only reads: nothing here changes the plan or the scenario.
export function useScenarioView({ scn, data, scheduled, scnChanges }) {
  const baseScheduled = useMemo(() => (scn ? schedulePlanData(scn.base) : null), [scn]);
  const scnComparison = useMemo(
    () => (scn && data ? compareScenario({ base: scn.base, work: data, baseScheduled, workScheduled: scheduled }) : null),
    [scn, data, baseScheduled, scheduled],
  );
  const scnBaseline = useMemo(() => (scnComparison ? baselineWindows(scnComparison) : null), [scnComparison]);
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
  return { baseScheduled, scnComparison, scnBaseline, scnShifts, scnChangedIds };
}
