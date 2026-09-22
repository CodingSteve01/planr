// The views the shell knows about, in the order the tab bar shows them.
//
// This file used to declare five modes — Build, Plan, Run, Review, Report —
// each owning a subset of the tabs, with the top bar switching between them
// (docs/principles.md, principle 1: "mode before feature"). The idea was that
// a planner is doing one thing at a time and the app should show only that.
//
// It did not survive contact with the work. A real loop is: look at the
// roadmap, restructure the tree, set the order, update progress, reconcile
// Jira — four modes deep, several times an hour. Modes did not remove a
// decision, they added one: every jump became "which mode was that in?" on top
// of "which view was that?". And with Review owning exactly one tab, the app
// showed a tab bar containing one tab underneath a row of five mode buttons.
//
// So: one flat row. Ten destinations, one level, no hidden ones. The overlays
// modes were supposed to keep apart — the Δ window for a review, the horizon
// for planning — live in the filter popup where they are switched on
// deliberately and say so while they are on.
//
// Order follows the loop rather than the feature list: where you look first,
// where you change things, where time is, then the inputs, then the output.
export const TAB_IDS = [
  'summary',    // the subway map — where a week starts
  'tree',       // the one place the plan is changed
  'gantt',      // when it happens
  'roadmap',    // one project, as a calendar
  'net',        // how it hangs together
  'plan',       // planning review
  'order',      // in which order does who work
  'briefing',   // the day
  'resources',  // who there is
  'holidays',   // when nobody is there
  'report',     // what leaves the building
];

// Where a fresh install lands. A returning user's own `planr_tab` wins.
export const DEFAULT_TAB = 'tree';

export function isValidTab(id) {
  return TAB_IDS.includes(id);
}

export function initialTab(savedTab) {
  return savedTab && isValidTab(savedTab) ? savedTab : DEFAULT_TAB;
}
