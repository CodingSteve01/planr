// Mode state — pure data + small helpers, no React.
//
// A mode is the state of the WHOLE surface (docs/principles.md, principle 1):
// which view tabs belong to it, which one is the default, and which
// sub-toolbar chips/filters are relevant while it is active. The five modes
// follow the moments of a week, not the features of the app — see the mode
// table in docs/principles.md for the "moment" / "intent" wording the i18n
// tooltips are drawn from.
//
// `tabs` lists every existing App.jsx tab id that belongs to this mode.
// `chips` names the sub-toolbar filters/chips this mode cares about — it is
// informational (used to decide what stays visible/relevant), not a hard
// gate: the shared filter row (root/team/person/hideDone) already renders
// for every tab that had it before this phase, so nothing is hidden by this
// list. `report` is a new, mode-exclusive tab introduced in this phase (the
// former Export modal, lifted into a normal view — see ReportView.jsx).
export const MODES = [
  {
    id: 'build',
    labelKey: 'mode.build',
    tooltipKey: 'mode.build.tip',
    tabs: ['tree', 'net'],
    defaultTab: 'tree',
    chips: ['rootFilter', 'teamFilter', 'personFilter', 'hideDone'],
  },
  {
    id: 'plan',
    labelKey: 'mode.plan',
    tooltipKey: 'mode.plan.tip',
    // Resources and Holidays are capacity inputs to a planning session —
    // both stay reachable here rather than only behind settings (principle 6:
    // subtractive means fewer paths, not fewer capabilities).
    tabs: ['gantt', 'plan', 'resources', 'holidays'],
    defaultTab: 'gantt',
    chips: ['rootFilter', 'teamFilter', 'personFilter', 'hideDone', 'horizon'],
  },
  {
    id: 'run',
    labelKey: 'mode.run',
    tooltipKey: 'mode.run.tip',
    tabs: ['briefing', 'summary'],
    defaultTab: 'briefing',
    chips: ['rootFilter', 'teamFilter', 'personFilter'],
  },
  {
    id: 'review',
    labelKey: 'mode.review',
    tooltipKey: 'mode.review.tip',
    tabs: ['summary'],
    defaultTab: 'summary',
    chips: ['sinceDays', 'diffOnlyChanged'],
  },
  {
    id: 'report',
    labelKey: 'mode.report',
    tooltipKey: 'mode.report.tip',
    tabs: ['report'],
    defaultTab: 'report',
    chips: [],
  },
];

const MODE_BY_ID = new Map(MODES.map(m => [m.id, m]));

export function isValidMode(id) {
  return MODE_BY_ID.has(id);
}

export function getMode(id) {
  return MODE_BY_ID.get(id) || MODES[0];
}

export function tabsForMode(id) {
  return getMode(id).tabs;
}

export function defaultTabForMode(id) {
  return getMode(id).defaultTab;
}

// First mode (in declared order) that lists this tab. Falls back to the
// first mode when the tab id is unknown — used to seed initial mode state
// from a `planr_tab` value saved before modes existed.
export function modeForTab(tabId) {
  return MODES.find(m => m.tabs.includes(tabId)) || MODES[0];
}

// Every tab id that appears in at least one mode. Used by App.jsx to build
// the tab bar from a single source of truth, and by modes.test.js to guard
// that nothing lost its home.
export const ALL_MODE_TAB_IDS = [...new Set(MODES.flatMap(m => m.tabs))];
