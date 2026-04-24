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

  test('parallel flag appears and is last among the trailing markers', () => {
    const tree = [
      { id: 'P1', name: 'Root', team: 'T1', best: 0 },
      { id: 'P1.1', name: 'Task', team: 'T1', best: 3, factor: 1,
        assign: ['M1'], prio: 2, status: 'open', parallel: true,
        pinnedStart: '2026-03-01',
      },
    ];
    const md = buildMarkdownText({ ...base, tree });
    const line = md.split('\n').find(l => l.includes('**P1.1**'));
    expect(line).toMatch(/📌2026-03-01.*≡/);
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
});
