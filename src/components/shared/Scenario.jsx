// The surface of scenarios: where you are (the switch), that you are not in
// the plan (the bar), what just happened (the notice), and what the
// difference comes to (the comparison).
//
// A scenario is a state of the whole document, not a place in it, so none of
// this is a view in the tab row and none of it edits anything: the tree, the
// resources and the holidays are edited exactly as always, and what they
// change is the scenario because that is what is on screen. The one thing
// that must never be in doubt is WHICH truth is on screen — hence a bar that
// cannot be scrolled away and a frame over the whole app in the scenario's
// own colour, which nothing else in Planr uses.
//
// The code lives in components/shared/scenario/ (one file per part) and the
// pure helpers in utils/scenarioUi/; this file keeps the import path.

export { ScenarioSwitch } from './scenario/ScenarioSwitch.jsx';
export { ScenarioBar, ScenarioNotice } from './scenario/ScenarioBar.jsx';
export { ScenarioCompare } from './scenario/ScenarioCompare.jsx';
export { useScenarioReport } from './scenario/useScenarioReport.js';
export { formatShift } from '../../utils/scenarioUi/format.js';
