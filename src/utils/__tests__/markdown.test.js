import { describe, test, expect } from 'vitest';
import { buildMarkdownText } from '../markdown.js';

// Heavy round-trip: we import App.jsx only to reuse its parseMdToProject.
// Since App.jsx is a React module, we duplicate the minimal parser contract
// here to keep the test lean. The production parser is exercised end-to-end
// in the UI; this test focuses on the writer's output format so corrupted
// files can't slip through silently.

describe('buildMarkdownText: task serialisation', () => {
  const base = {
    meta: { name: 'X', planStart: '2026-01-05', planEnd: '2026-12-31', version: '2' },
    teams: [{ id: 'T1', name: 'Backend', color: '#10b981' }],
    members: [{ id: 'M1', name: 'Alex Kim', team: 'T1', cap: 1, vac: 25 }],
    vacations: [],
  };

  test('assign survives alongside tagStr, decideBy, pinned', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: 'T1', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 5, factor: 1.5,
        assign: ['M1'], prio: 2, status: 'open',
        customValues: { jira: 'NA-385' },
        decideBy: '2026-09-30', pinnedStart: '2026-09-01',
      },
    ];
    const md = buildMarkdownText({ ...base, tree });
    // Expect: `— Backend [AK] {cv.jira:NA-385} ⏰decide:2026-09-30 📌2026-09-01`
    const line = md.split('\n').find(l => l.includes('**P1.1**'));
    expect(line).toBeDefined();
    expect(line).toMatch(/\[AK\]/);      // assign in brackets
    expect(line).toMatch(/\{cv\.jira:NA-385\}/);
    expect(line).toMatch(/⏰decide:2026-09-30/);
    expect(line).toMatch(/📌2026-09-01/);
    // And the assign must come BEFORE the tag block
    const assignPos = line.indexOf('[AK]');
    const tagPos = line.indexOf('{cv.jira');
    expect(assignPos).toBeGreaterThanOrEqual(0);
    expect(tagPos).toBeGreaterThan(assignPos);
  });

  test('parallel + seq round-trip via metadata tags', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: 'T1', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 3, factor: 1,
        assign: ['M1'], prio: 2, status: 'open', pinnedStart: '2026-03-01', parallel: true, seq: 42,
      },
    ];
    const md = buildMarkdownText({ ...base, tree });
    const line = md.split('\n').find(l => l.includes('**P1.1**'));
    expect(line).toMatch(/parallel:true/);
    expect(line).toMatch(/seq:42/);
    expect(line).toMatch(/📌2026-03-01/);
  });

  test('derived member emits h/w; manual legacy emits %', () => {
    const members = [
      { id: 'M1', name: 'Derived Dan', team: 'T1', capMode: 'derived', weeklyHours: 30, vac: 25 },
      { id: 'M2', name: 'Manual Max', team: 'T1', cap: 0.75, vac: 25 },
    ];
    const md = buildMarkdownText({ ...base, members, tree: [] });
    expect(md).toMatch(/\*\*Derived Dan\*\*.*30h\/w/);
    expect(md).toMatch(/\*\*Manual Max\*\*.*\(75%\)/);
  });

  test('meeting plans catalog emitted when data.meetingPlans present', () => {
    const md = buildMarkdownText({
      ...base,
      tree: [],
      data: {
        meetingPlans: [
          { id: 'p1', name: 'Eng', meetings: [
            { id: 'm1', name: 'Standup', hours: 0.5, frequency: 'daily' },
            { id: 'm2', name: 'Retro', hours: 1, frequency: 'biweekly' },
          ]},
        ],
      },
    });
    expect(md).toMatch(/## Meeting Plans/);
    expect(md).toMatch(/### Eng/);
    expect(md).toMatch(/Standup 0\.5h\/d/);
    expect(md).toMatch(/Retro 1h\/2w/);
  });

  test('team meeting-plan ids rendered in third column', () => {
    const md = buildMarkdownText({
      ...base,
      tree: [],
      teams: [{ id: 'T1', name: 'Backend', color: '#10b981', meetingPlanIds: ['p1'] }],
      data: {
        meetingPlans: [{ id: 'p1', name: 'Eng', meetings: [] }],
      },
    });
    expect(md).toMatch(/## Teams\n\n\| Name \| Color \| Meeting Plans \|/);
    expect(md).toMatch(/\| Backend \| `#10b981` \| Eng \|/);
  });

  test('member meeting-plan ids emitted as sub-bullet', () => {
    const md = buildMarkdownText({
      ...base,
      tree: [],
      members: [{ id: 'M1', name: 'Alex Kim', team: 'T1', capMode: 'derived', meetingPlanIds: ['p1'] }],
      data: {
        meetingPlans: [{ id: 'p1', name: 'Eng', meetings: [] }],
      },
    });
    expect(md).toMatch(/\*Plans: Eng\*/);
  });

  test('scheduled member meeting-plan changes emit effective date', () => {
    const md = buildMarkdownText({
      ...base,
      members: [{
        id: 'M1',
        name: 'Alex Kim',
        team: 'T1',
        capMode: 'derived',
        weeklyHours: 40,
        meetingChanges: [{ from: '2026-07-01', meetingPlanIds: ['p1'] }],
      }],
      tree: [],
      data: {
        meetingPlans: [{ id: 'p1', name: 'Eng', meetings: [] }],
      },
    });
    expect(md).toMatch(/\*Meeting plan: 2026-07-01→\[plans:Eng\]\*/);
  });

  test('handoff-plan emitted as sub-bullet with stages', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: 'T1', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 5, factor: 1,
        assign: ['M1'], prio: 2, status: 'open',
        handoffPlan: [
          { assign: ['M1'] },
          { team: 'T1' },
        ],
      },
    ];
    const md = buildMarkdownText({ ...base, tree });
    const handoffLine = md.split('\n').find(l => l.trim().startsWith('*Handoff:'));
    expect(handoffLine).toBeDefined();
    expect(handoffLine).toMatch(/→ AK/);
    expect(handoffLine).toMatch(/→ \(Backend\)/);
  });

  test('task timing, fixed duration and dependencies are fully serialised', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: 'T1', best: 0 },
      { id: 'P1.0', name: 'Predecessor', team: 'T1', best: 1, factor: 1, status: 'done' },
      {
        id: 'P1.1',
        name: 'Fixed task',
        team: 'T1',
        best: 3,
        factor: 1,
        assign: ['M1'],
        prio: 2,
        status: 'done',
        completedAt: '2026-04-10',
        completedStart: '2026-04-08',
        completedEnd: '2026-04-10',
        plannedStart: '2026-04-07',
        plannedEnd: '2026-04-11',
        due: '2026-04-12',
        deadlineRelevant: false,
        teamLock: true,
        parallel: true,
        fixedDurationDays: 4,
        displayOrder: 7,
        customValues: { jira: 'PLAN-7' },
        deps: ['P1.0'],
        softDeps: ['P1.2'],
      },
    ];

    const md = buildMarkdownText({ ...base, tree });
    const line = md.split('\n').find(l => l.includes('**P1.1**'));
    const depLine = md.split('\n').find(l => l.includes('*Requires:'));

    expect(line).toMatch(/\{[^}]*done:2026-04-10/);
    expect(line).toMatch(/\{[^}]*done-start:2026-04-08/);
    expect(line).toMatch(/\{[^}]*done-end:2026-04-10/);
    expect(line).toMatch(/\{[^}]*plan-start:2026-04-07/);
    expect(line).toMatch(/\{[^}]*plan-end:2026-04-11/);
    expect(line).toMatch(/\{[^}]*due:2026-04-12/);
    expect(line).toMatch(/\{[^}]*deadline:false/);
    expect(line).toMatch(/\{[^}]*team-lock:true/);
    expect(line).toMatch(/\{[^}]*parallel:true/);
    expect(line).toMatch(/\{[^}]*fixed:4/);
    expect(line).toMatch(/\{[^}]*ord:7/);
    expect(line).toMatch(/\{[^}]*cv\.jira:PLAN-7/);
    expect(depLine).toContain('P1.0');
    // Soft deps are merged into the single deps bucket — no `~` prefix any more.
    expect(depLine).toContain('P1.2');
    expect(depLine).not.toContain('~');
  });

  test('planning metadata is JSON-safe without lossy fields', () => {
    const data = {
      tree: [{
        id: 'P1.1',
        name: 'Fixed task',
        fixedDurationDays: 3,
        completedStart: '2026-04-01',
        completedEnd: '2026-04-03',
        plannedStart: '2026-04-01',
        plannedEnd: '2026-04-04',
        due: '2026-04-05',
        teamLock: true,
        parallel: true,
        deps: ['P1.0'],
        softDeps: ['P1.2'],
      }],
      members: [{
        id: 'M1',
        capChanges: [{ from: '2026-06-01', cap: 0.5, weeklyHours: 20 }],
        meetingChanges: [{ from: '2026-06-01', meetingPlanIds: ['p1'], meetings: [{ id: 'm1', name: 'Standup', hours: 0.5, frequency: 'daily' }] }],
      }],
      roadmapAssignment: { P1: { routeIdx: 2, colorIdx: 4 } },
    };

    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});

// ── Sub-bullet tags: renamed to English, old files still load ──────────────
// The persisted .md format used four German tag words — *Benötigt:* (deps),
// *Cap-Plan:*, *Meeting-Plan:*, *Phasen:* — baked directly into the file
// format itself, not just UI copy. The writer above now emits the English
// names (*Requires:*, *Capacity plan:*, *Meeting plan:*, *Phases:*); the
// READER in App.jsx's parseMdToProject accepts both forms, so a file saved
// by an older build keeps loading unchanged.
//
// parseMdToProject is a closure inside the App component (not exported), so
// this checks the exact same regex literals shipped in App.jsx rather than
// driving a full file-load through the rendered app. If either drifts from
// the other, this test and the app disagree — keep them in sync by eye.
describe('sub-bullet tag rename is backward compatible', () => {
  // Copied verbatim from App.jsx's parseMdToProject.
  const CAP_PLAN = /^\s*\*(?:Capacity plan|Cap-Plan):\s*(.+?)\*\s*$/;
  const MEETING_PLAN = /^\s*\*(?:Meeting plan|Meeting-Plan):\s*(.+?)\*\s*$/;
  const REQUIRES = /^\*(?:Requires|Benötigt):\s*(.+?)\*$/;
  const PHASES = /^\*(?:Phases?|Phasen):\s*(.+?)\*$/;

  test.each([
    ['capacity plan', CAP_PLAN, '  *Capacity plan: 2026-09-01→50%*'],
    ['capacity plan, pre-rename', CAP_PLAN, '  *Cap-Plan: 2026-09-01→50%*'],
    ['meeting plan', MEETING_PLAN, '  *Meeting plan: 2026-06-01→[Standup 0.5h/d]*'],
    ['meeting plan, pre-rename', MEETING_PLAN, '  *Meeting-Plan: 2026-06-01→[Standup 0.5h/d]*'],
    ['deps', REQUIRES, '*Requires: P1.1*'],
    ['deps, pre-rename', REQUIRES, '*Benötigt: P1.1*'],
    ['phases', PHASES, '*Phases: ✅RE, 🟡Dev*'],
    ['phases, pre-rename plural', PHASES, '*Phasen: ✅RE, 🟡Dev*'],
    ['phases, pre-rename singular', PHASES, '*Phase: ✅RE*'],
  ])('%s: %s matches and captures the body', (_label, re, line) => {
    const m = line.match(re);
    expect(m, `did not match: ${line}`).toBeTruthy();
    expect(m[1].length).toBeGreaterThan(0);
  });

  test('the writer only ever emits the new English tags', () => {
    const base = {
      meta: { name: 'X', planStart: '2026-01-05', planEnd: '2026-12-31', version: '2' },
      teams: [{ id: 'T1', name: 'Backend', color: '#10b981' }],
      vacations: [],
    };
    const md = buildMarkdownText({
      ...base,
      tree: [
        { id: 'P1', name: 'Root', team: 'T1', best: 0 },
        { id: 'P1.1', name: 'A', team: 'T1', best: 1, factor: 1, status: 'open',
          phases: [{ id: 'ph1', name: 'RE', status: 'done' }] },
        { id: 'P1.2', name: 'B', team: 'T1', best: 1, factor: 1, status: 'open', deps: ['P1.1'] },
      ],
      members: [{
        id: 'M1', name: 'Alex', team: 'T1', capMode: 'derived', weeklyHours: 40,
        capChanges: [{ from: '2026-09-01', cap: 0.5 }],
        meetingChanges: [{ from: '2026-07-01', meetingPlanIds: ['p1'] }],
      }],
      data: { meetingPlans: [{ id: 'p1', name: 'Eng', meetings: [] }] },
    });
    expect(md).toContain('*Requires: P1.1*');
    expect(md).toContain('*Phases: ');
    expect(md).toContain('*Capacity plan: ');
    expect(md).toContain('*Meeting plan: ');
    expect(md).not.toMatch(/\*Benötigt:|\*Cap-Plan:|\*Meeting-Plan:|\*Phasen:/);
  });
});
