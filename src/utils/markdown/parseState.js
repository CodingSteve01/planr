// The one state a parse shares between its phases (see parseMd.js). It is created
// once per parse; a phase that advanced a counter or an accumulator in the
// single-function parser advances the same field here.
export function createParseState() {
  return {
    tree: [],
    mems: [],
    teamSet: new Set(),
    explicitTeams: [], // teams from "## Teams" table (with color)
    vacationsArr: [],
    holidaysArr: [],
    taskTemplates: [],
    parsedCustomFields: [], // custom field definitions from ## Custom Fields section
    currentTpl: null, // template being parsed
    projName: null,
    planStart: '',
    planEnd: '',
    viewStartMd: '',
    workDays: '',
    idStack: [],
    parsedMeetingPlans: [], // meeting plan definitions from ## Meeting Plans
    currentMeetingPlan: null, // being parsed
    section: null, // 'plan' | 'teams' | 'resources' | 'vacations' | 'holidays' | 'tree' | 'templates' | 'customfields' | 'meetingplans' | 'history' | null
    lastItem: null,
    // History fenced-block accumulator: lines between ```planr-history and ```
    historyBlockLines: null,
    // Roadmap-assignment fenced-block accumulator: lines between
    // ```planr-roadmap and ``` (see `## Roadmap` section).
    roadmapBlockLines: null,
    // ```planr-queues — one line per person: their own order of work.
    queueBlockLines: null,
    // ```planr-scenarios — one JSON line per scenario.
    scenarioBlockLines: null,
    // ```planr-log — one JSON line per day (utils/dayLog.js).
    logBlockLines: null,
    // ```planr-changes — one JSON line per date (utils/effective.js).
    changeBlockLines: null,
  };
}
