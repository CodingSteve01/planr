// Scenarios: a second truth beside the plan.
//
// A scenario is not a copy of the plan. It is the list of things that are
// different in it — a patch — and the scenario you look at is the plan with
// that patch applied. That is the whole design, and it is what makes a
// scenario worth keeping for longer than an afternoon: progress you record in
// the real plan next week is in the scenario too, because the scenario never
// had an opinion about it. A copy would have gone stale the first time
// somebody finished a task.
//
// Everything here is pure. App.jsx holds the plan aside while a scenario is on
// screen (`base`), edits the applied result like any other document, and asks
// `diffPlan(base, work)` what the scenario now consists of whenever it has to
// write the file. See docs/scenarios.md.

export { SCENARIO_IGNORED_KEYS, DERIVED_NODE_FIELDS, deepEqual, diffPlan, isEmptyPatch, applyPatch } from './scenarioCore/patchDiff.js';
export { newScenarioId, uniqueScenarioName, withScenarioPatch, carryScenarioList } from './scenarioCore/scenarioList.js';
export { describeChanges, revertChange } from './scenarioCore/describeChanges.js';
export {
  formatChangesBlock,
  parseChangesBlock,
  toPortablePatch,
  fromPortablePatch,
  formatScenariosBlock,
  parseScenariosBlock,
} from './scenarioCore/portablePatch.js';
