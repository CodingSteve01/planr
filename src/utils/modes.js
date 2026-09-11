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
    tabs: ['gantt', 'roadmap', 'plan', 'resources', 'holidays'],
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

// Which mode a fresh install opens in. Deliberate rather than derived: before
// modes existed the app opened on the Overview tab, and since Run happens to
// list that tab first, deriving the mode from the tab silently made Run the
// default. Build is the answer to "what is this tool for" — a plan has to be
// authored before it can be planned, run, reviewed or reported on — so that is
// where a first open lands. A returning user's own `planr_mode` always wins.
export const DEFAULT_MODE = 'build';

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

// The mode that OWNS this tab — the one whose core surface it is, not merely
// the first one in declaration order that happens to list it. Overview is the
// clearest case: it is Review's core surface and Run only borrows it, so
// `ownerMode` is what decides, and declaration order stays free to read well.
const TAB_OWNER = {
  tree: 'build', net: 'build',
  gantt: 'plan', roadmap: 'plan', plan: 'plan', resources: 'plan', holidays: 'plan',
  briefing: 'run',
  summary: 'review',
  report: 'report',
};

export function modeForTab(tabId) {
  const owner = TAB_OWNER[tabId];
  if (owner && MODE_BY_ID.has(owner)) return MODE_BY_ID.get(owner);
  return MODES.find(m => m.tabs.includes(tabId)) || getMode(DEFAULT_MODE);
}

// Every tab id that appears in at least one mode. Used by App.jsx to build
// the tab bar from a single source of truth, and by modes.test.js to guard
// that nothing lost its home.
export const ALL_MODE_TAB_IDS = [...new Set(MODES.flatMap(m => m.tabs))];
