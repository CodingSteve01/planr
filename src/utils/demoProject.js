// Demo project shown on the onboarding landing page + loadable as "Try demo".
// Deliberately small: 3 root projects, ~20 leaves, realistic mix of done/wip/open
// so the Metro Roadmap shows interesting progress right away.

import { computeNRW } from './holidays.js';
import { applyTemplate, getTemplate } from './projectTemplates.js';

const today = new Date();
const iso = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const relDate = daysFromNow => { const d = new Date(today); d.setDate(d.getDate() + daysFromNow); return iso(d); };

function buildDemoTree() {
  // Demo design notes:
  // - `seq` is gone — ordering between sibling tasks lives in `softDeps`
  //   (planner-set sequencing, ~prefix in markdown) or `deps` (hard
  //   business-need links). Tasks with no dep at all are explicitly
  //   parallelisable.
  // - `teamLock` flags whole-team-blocking work (resolved to every member
  //   of the task's team at run time).
  // - One task showcases `capChanges` via member M1 (set in
  //   buildDemoProject below): half-cap for a stretch in 60 days, then
  //   back to full — gives users a live example to inspect.
  return [
    // Goal: Launch new product — hard deps express real "B needs A" chains.
    { id: 'P1', name: 'Launch new product', type: 'goal', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, deps: [], softDeps: [], assign: [], team: '', description: 'Bring the new product to market in Q3.' },
    { id: 'P1.1', name: 'MVP ready', type: 'goal', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, deps: [], softDeps: [], assign: [], team: '' },
    { id: 'P1.1.1', name: 'Define requirements', status: 'done', completedStart: relDate(-58), completedAt: relDate(-52), best: 5, factor: 1.3, prio: 2, deps: [], softDeps: [], assign: ['M1'], team: 'T1', customValues: { jira: 'DEMO-1' } },
    { id: 'P1.1.2', name: 'Design core UI', status: 'done', completedStart: relDate(-50), completedAt: relDate(-42), best: 8, factor: 1.4, prio: 2, deps: ['P1.1.1'], softDeps: [], assign: ['M2'], team: 'T1', customValues: { jira: 'DEMO-2' } },
    // Build frontend & backend are independent — no soft chain forcing
    // a sequence between them, both can run in parallel.
    { id: 'P1.1.3', name: 'Build frontend', status: 'wip', progress: 60, best: 15, factor: 1.5, prio: 2, deps: ['P1.1.2'], softDeps: [], assign: ['M2'], team: 'T1', customValues: { jira: 'DEMO-3' }, phases: [
      { id: 'ph1', name: 'Requirements', status: 'done', effortPct: 15, teams: [], assign: [] },
      { id: 'ph2', name: 'Refinement',   status: 'done', effortPct: 15, teams: [], assign: [] },
      { id: 'ph3', name: 'Development',  status: 'wip',  effortPct: 50, teams: [], assign: [] },
      { id: 'ph4', name: 'Testing',      status: 'open', effortPct: 20, teams: [], assign: [] },
    ] },
    { id: 'P1.1.4', name: 'Build backend', status: 'wip', progress: 40, best: 20, factor: 1.5, prio: 2, deps: ['P1.1.1'], softDeps: [], assign: ['M1'], team: 'T2', customValues: { jira: 'DEMO-4' }, phases: [
      { id: 'ph1', name: 'Requirements', status: 'done', effortPct: 15, teams: [], assign: [] },
      { id: 'ph2', name: 'Refinement',   status: 'wip',  effortPct: 15, teams: [], assign: [] },
      { id: 'ph3', name: 'Development',  status: 'open', effortPct: 50, teams: [], assign: [] },
      { id: 'ph4', name: 'Testing',      status: 'open', effortPct: 20, teams: [], assign: [] },
    ] },
    { id: 'P1.1.5', name: 'Integration testing', status: 'open', best: 7, factor: 1.4, prio: 2, deps: ['P1.1.3', 'P1.1.4'], softDeps: [], assign: ['M3'], team: 'T2', customValues: { jira: 'DEMO-5' } },
    { id: 'P1.2', name: 'Go-to-market', status: 'open', best: 0, factor: 1.5, prio: 3, deps: [], softDeps: [], assign: [], team: '' },
    { id: 'P1.2.1', name: 'Marketing site', status: 'open', best: 5, factor: 1.4, prio: 3, deps: ['P1.1.2'], softDeps: [], assign: [], team: 'T1' },
    { id: 'P1.2.2', name: 'Launch campaign', status: 'open', best: 10, factor: 1.5, prio: 3, deps: ['P1.1.5', 'P1.2.1'], softDeps: [], assign: ['M3'], team: 'T1' },

    // Pain point: Slow checkout — softDeps express planner-set ordering
    // (CDN caching only makes sense after the profiling identifies the
    // bottleneck even though it isn't a true hard dep).
    { id: 'P2', name: 'Fix slow checkout', type: 'painpoint', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, deps: [], softDeps: [], assign: [], team: '', description: 'Checkout page takes >4s to load, conversions down.' },
    { id: 'P2.1', name: 'Profile the bottleneck', status: 'done', completedStart: relDate(-38), completedAt: relDate(-35), best: 3, factor: 1.3, prio: 2, deps: [], softDeps: [], assign: ['M1'], team: 'T2' },
    { id: 'P2.2', name: 'Optimize DB queries', status: 'wip', progress: 75, best: 6, factor: 1.4, prio: 2, deps: ['P2.1'], softDeps: [], assign: ['M1'], team: 'T2', pinnedStart: relDate(7) },
    { id: 'P2.3', name: 'Add CDN caching', status: 'open', best: 4, factor: 1.3, prio: 2, deps: [], softDeps: ['P2.1'], assign: [], team: 'T2' },
    { id: 'P2.4', name: 'Verify in production', status: 'open', best: 2, factor: 1.3, prio: 2, deps: ['P2.2', 'P2.3'], softDeps: [], assign: ['M3'], team: 'T2' },

    // Deadline: compliance audit — note D1.3 is a teamLock task to
    // demonstrate whole-team-blocking work.
    { id: 'D1', name: 'Compliance audit Q3', type: 'deadline', severity: 'critical', date: relDate(55), status: 'open', best: 0, factor: 1.5, prio: 1, deps: [], softDeps: [], assign: [], team: '', description: 'External audit — must pass inside the visible demo horizon.' },
    { id: 'D1.1', name: 'Document security policies', status: 'wip', progress: 30, best: 5, factor: 1.4, prio: 1, deps: [], softDeps: [], assign: ['M3'], team: 'T2' },
    { id: 'D1.2', name: 'Run penetration tests', status: 'open', best: 8, factor: 1.5, prio: 1, deps: ['D1.1'], softDeps: [], assign: ['M1'], team: 'T2' },
    { id: 'D1.3', name: 'Fix findings (all-hands)', status: 'open', best: 10, factor: 1.6, prio: 1, deps: ['D1.2'], softDeps: [], team: 'T2', teamLock: true, confidence: 'exploratory', description: 'Critical fixes — the whole T2 team is locked onto this task until done.' },
    { id: 'D1.4', name: 'Audit sign-off', status: 'open', best: 2, factor: 1.3, prio: 1, deps: ['D1.3'], softDeps: [], assign: ['M3'], team: 'T2', decideBy: relDate(45) },

    // Handoff showcase
    { id: 'H1', name: 'Legacy migration epic', type: 'goal', severity: 'high', status: 'wip', best: 0, factor: 1.5, prio: 2, deps: [], softDeps: [], assign: [], team: '', description: 'Multi-quarter migration with known staff changes mid-way — showcases handoff cascade.' },
    { id: 'H1.1', name: 'Data migration (auto-handoff)', status: 'wip', progress: 10, best: 60, factor: 1.5, prio: 2, deps: [], softDeps: [], assign: ['M4'], team: 'T2', customValues: { jira: 'DEMO-H1' } },
    { id: 'H1.2', name: 'API rewrite (planned handoff)', status: 'open', best: 40, factor: 1.5, prio: 2, deps: ['H1.1'], softDeps: [], assign: ['M4'], team: 'T2', customValues: { jira: 'DEMO-H2' },
      handoffPlan: [
        { assign: ['M1'], team: 'T2' },
        { team: 'T1' },
      ] },
    { id: 'H1.3', name: 'Cutover & validation', status: 'open', best: 8, factor: 1.4, prio: 2, deps: ['H1.2'], softDeps: [], assign: ['M3'], team: 'T2' },
  ];
}

/**
 * Build a ready-to-use demo project data object.
 * Templates are resolved via the provided `t` function so demo content
 * matches the current UI language.
 */
export function buildDemoProject(t) {
  const startDate = relDate(-60);
  const endDate = relDate(60);
  const years = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
  const hols = computeNRW(years);
  const tpl = getTemplate('software-dev');
  const seeded = applyTemplate(tpl, t);

  return {
    meta: {
      name: t ? t('demo.projectName') : 'Planr Demo Project',
      planStart: startDate,
      planEnd: endDate,
      holidays: 'NRW',
      version: '2',
    },
    teams: [
      // Frontend team gets the shared "Engineering Standard" meeting plan.
      { id: 'T1', name: 'Design & Frontend', color: '#3b82f6', meetingPlanIds: ['plan_eng'] },
      // Backend team inherits the same plan too — shows team-level reuse.
      { id: 'T2', name: 'Backend & Platform', color: '#10b981', meetingPlanIds: ['plan_eng'] },
    ],
    meetingPlans: [
      {
        id: 'plan_eng', name: 'Engineering Standard',
        meetings: [
          { id: 'pe_1', name: 'Daily Standup', hours: 0.25, frequency: 'daily' },
          { id: 'pe_2', name: 'Sprint Planning', hours: 2, frequency: 'biweekly' },
          { id: 'pe_3', name: 'Retro', hours: 1, frequency: 'biweekly' },
        ],
      },
      {
        id: 'plan_lead', name: 'Leitungsrunden',
        meetings: [
          { id: 'pl_1', name: 'Team-Leads Sync', hours: 1, frequency: 'weekly' },
          { id: 'pl_2', name: 'All-Hands', hours: 1, frequency: 'monthly' },
        ],
      },
    ],
    members: [
      // Manual-cap member with a scheduled capacity drop: ramps down to
      // 60 % when a parental leave kicks in 30 days from now, back to
      // 100 % near the end of the visible demo horizon. Scheduler resolves the active cap per
      // task start week automatically.
      { id: 'M1', name: 'Alex Kim',   team: 'T2', cap: 1, vac: 25,
        capChanges: [
          { from: relDate(30), cap: 0.6 },
          { from: relDate(55), cap: 1.0 },
        ],
      },
      // Derived-cap member with meetings: full-time, daily standup + weekly
      // retro → shows the transparent capacity calculation in ResView.
      {
        id: 'M2', name: 'Sam Rivera', team: 'T1', vac: 25,
        capMode: 'derived', weeklyHours: 40,
        // Team inherits `plan_eng` automatically. Sam additionally carries the
        // Leitungsrunden plan + one individual ad-hoc meeting.
        meetingPlanIds: ['plan_lead'],
        meetings: [
          { id: 'm2_x', name: '1:1 Reviews', hours: 0.5, frequency: 'weekly' },
        ],
      },
      // Part-time with manual cap (the scheduler halves the available days).
      { id: 'M3', name: 'Jordan Lee', team: 'T2', cap: 0.5, vac: 25 },
      // Offboards in ~3 weeks — triggers visible cutoffs on H1.1 / H1.2 in
      // the default Gantt window.
      { id: 'M4', name: 'Riley Park', team: 'T2', cap: 1, vac: 25,
        start: relDate(-60), end: relDate(21) },
      // Offboards in ~6 weeks — shows cross-team fallback on H1.2 after M4.
      { id: 'M5', name: 'Dakota Vo', team: 'T1', cap: 1, vac: 25,
        start: relDate(-60), end: relDate(42) },
    ],
    vacations: [
      { person: 'M1', from: relDate(20), to: relDate(34), note: 'Summer vacation' },
      { person: 'M2', from: relDate(48), to: relDate(55), note: '' },
      { person: 'M3', from: relDate(35), to: relDate(42), note: '' },
    ],
    tree: buildDemoTree(),
    holidays: hols,
    risks: seeded.risks,
    sizes: seeded.sizes,
    taskTemplates: seeded.taskTemplates,
    customFields: [
      { id: 'jira', name: 'Jira ID', type: 'uri', uriTemplate: 'https://yourcompany.atlassian.net/browse/{value}' },
    ],
  };
}
