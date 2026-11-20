import { describe, test, expect } from 'vitest';
import { changeDates, compileMembers, dropChange, foldEdit, migrateLegacyChanges, pruneChanges, resourcesAsOf } from '../effective.js';
import { deriveCap, memberAtDate } from '../capacity.js';

const standup = { id: 'mt1', name: 'Stand-up', hours: 0.5, frequency: 'daily' }; // 2.5 h/week
const retro = { id: 'mt2', name: 'Retro', hours: 2, frequency: 'weekly' }; // 2 h/week
const plan = () => ({
  teams: [{ id: 'T1', name: 'Dev', meetingPlanIds: ['mp1'] }],
  meetingPlans: [
    { id: 'mp1', name: 'dev', meetings: [standup] },
    { id: 'mp2', name: 'extra', meetings: [retro] },
  ],
  members: [
    { id: 'm1', name: 'Noah', team: 'T1', cap: 1, capMode: 'derived', weeklyHours: 40 },
    { id: 'm2', name: 'Alex', team: 'T1', cap: 1, capMode: 'derived', weeklyHours: 40 },
  ],
});
const TODAY = new Date(2026, 10, 20);
const member = (data, id, date) => resourcesAsOf(data, date).members.find(m => m.id === id);
// Weekly capacity the SCHEDULER sees for a person on a date: no catalogue, only the compiled member.
const schedCap = (data, id, date) =>
  deriveCap(
    memberAtDate(
      compileMembers(data).find(m => m.id === id),
      new Date(date),
    ),
  );

describe('an edit through the lens of a date', () => {
  test('goes into the change at that date and leaves the base alone', () => {
    const base = plan();
    const noah = member(base, 'm1', '2027-03-01');
    const next = foldEdit(base, 'members', { ...noah, weeklyHours: 24 }, '2027-03-01', TODAY);
    expect(next.members.find(m => m.id === 'm1').weeklyHours).toBe(40);
    expect(next.changes).toEqual([{ from: '2027-03-01', patch: { members: { set: { m1: { weeklyHours: 24 } } } } }]);
    expect(member(next, 'm1', '2027-02-28').weeklyHours).toBe(40);
    expect(member(next, 'm1', '2027-03-01').weeklyHours).toBe(24);
    expect(member(next, 'm1', '2028-01-01').weeklyHours).toBe(24);
    expect(changeDates(next)).toEqual([{ from: '2027-03-01', count: 1 }]);
  });

  test('a timeless field edited at a date is simply edited', () => {
    const base = plan();
    const next = foldEdit(base, 'members', { ...member(base, 'm1', '2027-03-01'), role: 'Lead' }, '2027-03-01', TODAY);
    expect(next.members.find(m => m.id === 'm1').role).toBe('Lead');
    expect(next.changes).toBeUndefined();
  });

  test('setting the value back to what held before takes the change away again', () => {
    let d = foldEdit(plan(), 'members', { ...member(plan(), 'm1', '2027-03-01'), weeklyHours: 24 }, '2027-03-01', TODAY);
    d = foldEdit(d, 'members', { ...member(d, 'm1', '2027-03-01'), weeklyHours: 40 }, '2027-03-01', TODAY);
    expect(d.changes).toBeUndefined();
  });

  test('later changes build on earlier ones, and each is measured against the day before it', () => {
    let d = foldEdit(plan(), 'members', { ...member(plan(), 'm1', '2027-03-01'), weeklyHours: 24 }, '2027-03-01', TODAY);
    d = foldEdit(d, 'members', { ...member(d, 'm1', '2027-09-01'), weeklyHours: 40 }, '2027-09-01', TODAY);
    expect(d.changes.map(c => [c.from, c.patch.members.set.m1.weeklyHours])).toEqual([
      ['2027-03-01', 24],
      ['2027-09-01', 40],
    ]);
    // A change slotted in between does not disturb the one after it.
    d = foldEdit(d, 'members', { ...member(d, 'm1', '2027-06-01'), weeklyHours: 32 }, '2027-06-01', TODAY);
    expect(['2027-02-01', '2027-04-01', '2027-07-01', '2027-10-01'].map(day => member(d, 'm1', day).weeklyHours)).toEqual([40, 24, 32, 40]);
  });

  test("a team's plans and a plan's content can be dated too", () => {
    let d = plan();
    d = foldEdit(d, 'teams', { ...resourcesAsOf(d, '2027-04-01').teams[0], meetingPlanIds: ['mp1', 'mp2'] }, '2027-04-01', TODAY);
    d = foldEdit(
      d,
      'meetingPlans',
      { ...resourcesAsOf(d, '2027-07-01').meetingPlans[0], meetings: [{ ...standup, hours: 1 }] },
      '2027-07-01',
      TODAY,
    );
    expect(d.teams[0].meetingPlanIds).toEqual(['mp1']);
    expect(d.meetingPlans[0].meetings).toEqual([standup]);
    expect(changeDates(d).map(c => c.from)).toEqual(['2027-04-01', '2027-07-01']);
  });
});

describe('an edit without a date is about now', () => {
  test('writes the base when nothing dated is in the way', () => {
    const d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 32 }, null, TODAY);
    expect(d.members[0].weeklyHours).toBe(32);
    expect(d.changes).toBeUndefined();
  });

  test('is not overruled by an older change, and leaves future ones as planned', () => {
    let d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2026-06-01', TODAY); // in the past
    d = foldEdit(d, 'members', { ...member(d, 'm1', '2027-03-01'), weeklyHours: 16 }, '2027-03-01', TODAY); // in the future
    expect(member(d, 'm1', TODAY).weeklyHours).toBe(24);
    d = foldEdit(d, 'members', { ...member(d, 'm1', TODAY), weeklyHours: 36 }, null, TODAY);
    expect(member(d, 'm1', TODAY).weeklyHours).toBe(36);
    expect(member(d, 'm1', '2027-03-01').weeklyHours).toBe(16);
    expect(changeDates(d).map(c => c.from)).toEqual(['2027-03-01']);
  });

  test('a value that only LOOKS current because of a change is not copied into the base', () => {
    let d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2026-06-01', TODAY);
    // Edit the role now; the lens shows 24 h, the base says 40 h and must keep saying it.
    d = foldEdit(d, 'members', { ...member(d, 'm1', TODAY), role: 'Lead' }, null, TODAY);
    expect(d.members[0]).toMatchObject({ role: 'Lead', weeklyHours: 40 });
    expect(member(d, 'm1', '2026-05-01').weeklyHours).toBe(40);
    expect(member(d, 'm1', TODAY).weeklyHours).toBe(24);
  });
});

describe('what the scheduler gets', () => {
  test('a dated change in hours reaches it on that date', () => {
    const d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2027-03-01', TODAY);
    expect(schedCap(d, 'm1', '2027-02-15')).toBeCloseTo((40 - 2.5) / 40, 5);
    expect(schedCap(d, 'm1', '2027-03-15')).toBeCloseTo((24 - 2.5) / 40, 5);
    expect(schedCap(d, 'm2', '2027-03-15')).toBeCloseTo((40 - 2.5) / 40, 5);
  });

  test("a dated meeting change keeps the team's plan meetings — they used to vanish", () => {
    // Noah gets the extra plan from April. The team stand-up still applies.
    const d = foldEdit(plan(), 'members', { ...plan().members[0], meetingPlanIds: ['mp2'] }, '2027-04-01', TODAY);
    expect(schedCap(d, 'm1', '2027-03-15')).toBeCloseTo((40 - 2.5) / 40, 5);
    expect(schedCap(d, 'm1', '2027-04-15')).toBeCloseTo((40 - 2.5 - 2) / 40, 5);
  });

  test('a team plan added on a date reaches everybody in the team, and only from then', () => {
    const d = foldEdit(plan(), 'teams', { ...plan().teams[0], meetingPlanIds: ['mp1', 'mp2'] }, '2027-04-01', TODAY);
    for (const id of ['m1', 'm2']) {
      expect(schedCap(d, id, '2027-03-15')).toBeCloseTo((40 - 2.5) / 40, 5);
      expect(schedCap(d, id, '2027-04-15')).toBeCloseTo((40 - 4.5) / 40, 5);
    }
  });

  test('a plan whose content changes on a date changes everybody who attends it', () => {
    const d = foldEdit(plan(), 'meetingPlans', { ...plan().meetingPlans[0], meetings: [{ ...standup, hours: 1 }] }, '2027-07-01', TODAY);
    expect(schedCap(d, 'm2', '2027-06-15')).toBeCloseTo((40 - 2.5) / 40, 5);
    expect(schedCap(d, 'm2', '2027-07-15')).toBeCloseTo((40 - 5) / 40, 5);
  });

  test('without any change the compiled member has no dated lists at all', () => {
    const m = compileMembers(plan())[0];
    expect(m.capChanges).toBeUndefined();
    expect(m.meetingChanges).toBeUndefined();
    expect(m.meetings.map(x => x.name)).toEqual(['Stand-up']);
  });
});

describe('the lists that used to live on the person', () => {
  test('move into the one timeline, once', () => {
    const base = plan();
    base.members[0] = {
      ...base.members[0],
      capChanges: [
        { from: '2027-03-01', weeklyHours: 24 },
        { from: '2027-09-01', weeklyHours: 40 },
      ],
      meetingChanges: [{ from: '2027-03-01', meetingPlanIds: ['mp2'] }],
    };
    const d = migrateLegacyChanges(base);
    expect(d.members[0].capChanges).toBeUndefined();
    expect(d.members[0].meetingChanges).toBeUndefined();
    expect(d.changes).toEqual([
      { from: '2027-03-01', patch: { members: { set: { m1: { weeklyHours: 24, meetingPlanIds: ['mp2'] } } } } },
      { from: '2027-09-01', patch: { members: { set: { m1: { weeklyHours: 40 } } } } },
    ]);
    expect(migrateLegacyChanges(d)).toBe(d);
    // Same capacity as before for the scheduler — plus the plan meetings it used to lose.
    expect(schedCap(d, 'm1', '2027-03-15')).toBeCloseTo((24 - 2.5 - 2) / 40, 5);
  });
});

describe('housekeeping', () => {
  test('one entity can be taken out of a change, or the whole date', () => {
    let d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2027-03-01', TODAY);
    d = foldEdit(d, 'members', { ...plan().members[1], weeklyHours: 20 }, '2027-03-01', TODAY);
    const one = dropChange(d, '2027-03-01', 'members', 'm1');
    expect(Object.keys(one.changes[0].patch.members.set)).toEqual(['m2']);
    expect(dropChange(d, '2027-03-01').changes).toBeUndefined();
  });

  test('a change for somebody who is gone is dropped', () => {
    const d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2027-03-01', TODAY);
    const gone = { ...d, members: d.members.filter(m => m.id !== 'm1') };
    expect(pruneChanges(gone).changes).toBeUndefined();
    expect(pruneChanges(d)).toBe(d);
  });
});

describe('the Markdown file', () => {
  test('dated changes survive a reload that hands out new ids, by name', async () => {
    const { buildMarkdownText } = await import('../markdown.js');
    const { parseMdToProject } = await import('../markdownParse.js');
    const base = {
      meta: { name: 'X', planStart: '2026-01-05', version: '2' },
      teams: [{ id: 'T1', name: 'Dev', color: '#10b981', meetingPlanIds: ['mp1'] }],
      meetingPlans: [
        { id: 'mp1', name: 'dev', meetings: [standup] },
        { id: 'mp2', name: 'extra', meetings: [retro] },
      ],
      members: [{ id: 'm-old', name: 'Noah Berg', team: 'T1', capMode: 'derived', weeklyHours: 40, cap: 1, vac: 25 }],
      tree: [
        { id: 'P1', name: 'Project', status: 'open' },
        { id: 'P1.1', name: 'Task', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['m-old'], deps: [] },
      ],
      vacations: [],
      holidays: [],
    };
    let d = foldEdit(base, 'members', { ...base.members[0], weeklyHours: 24, meetingPlanIds: ['mp2'] }, '2027-03-01', TODAY);
    d = foldEdit(d, 'teams', { ...d.teams[0], meetingPlanIds: ['mp1', 'mp2'] }, '2027-06-01', TODAY);
    d = foldEdit(d, 'meetingPlans', { ...d.meetingPlans[0], meetings: [{ ...standup, hours: 1 }] }, '2027-09-01', TODAY);
    const md = buildMarkdownText({ tree: d.tree, members: d.members, teams: d.teams, vacations: [], meta: d.meta, data: d });
    const block = md.slice(md.indexOf('```planr-changes'));
    for (const id of ['m-old', '"T1"', '"mp1"', '"mp2"']) expect(block).not.toContain(id);
    expect(block).toContain('@Noah Berg');

    const again = parseMdToProject(md);
    const noah = again.members[0];
    expect(noah.id).not.toBe('m-old');
    expect(again.changes.map(c => c.from)).toEqual(['2027-03-01', '2027-06-01', '2027-09-01']);
    expect(resourcesAsOf(again, '2027-03-01').members[0].weeklyHours).toBe(24);
    const extra = again.meetingPlans.find(p => p.name === 'extra').id;
    expect(resourcesAsOf(again, '2027-03-01').members[0].meetingPlanIds).toEqual([extra]);
    expect(resourcesAsOf(again, '2027-06-01').teams[0].meetingPlanIds).toHaveLength(2);
    expect(resourcesAsOf(again, '2027-09-01').meetingPlans.find(p => p.name === 'dev').meetings[0].hours).toBe(1);
    // The scheduler sees the same capacity before and after the round trip.
    for (const day of ['2027-02-01', '2027-04-01', '2027-07-01', '2027-10-01']) {
      expect(schedCap(again, noah.id, day)).toBeCloseTo(schedCap(d, 'm-old', day), 5);
    }
    // No changes, no section.
    expect(
      buildMarkdownText({ tree: base.tree, members: base.members, teams: base.teams, vacations: [], meta: base.meta, data: base }),
    ).not.toContain('## Changes');
  });

  test('the old per-person lines in a file are read and become dated changes on load', async () => {
    const { parseMdToProject } = await import('../markdownParse.js');
    const md = `# X\n\n## Teams\n\n| Name | Color |\n|---|---|\n| Dev | \`#10b981\` |\n\n## Resources\n- **Noah Berg** \`NB\` — Dev, Engineer\n  *Capacity plan: 2027-03-01→50%*\n\n## Work Tree\n\n- **P1** Project\n  - **P1.1** Task (S 5T ×1) — Dev [NB]\n`;
    const parsed = parseMdToProject(md);
    expect(parsed.members[0].capChanges).toEqual([{ from: '2027-03-01', cap: 0.5 }]);
    const d = migrateLegacyChanges(parsed);
    expect(d.members[0].capChanges).toBeUndefined();
    expect(d.changes).toEqual([{ from: '2027-03-01', patch: { members: { set: { [d.members[0].id]: { cap: 0.5 } } } } }]);
  });
});

describe('edge cases the review found', () => {
  test('a field cleared on a date is a change, and the scheduler falls back to the default from then on', () => {
    let d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2027-03-01', TODAY);
    const lens = member(d, 'm1', '2027-09-01');
    const { weeklyHours: _gone, ...cleared } = lens;
    d = foldEdit(d, 'members', cleared, '2027-09-01', TODAY);
    expect(d.changes.find(c => c.from === '2027-09-01').patch.members.set.m1).toEqual({ weeklyHours: null });
    expect(schedCap(d, 'm1', '2027-04-01')).toBeCloseTo((24 - 2.5) / 40, 5);
    expect(schedCap(d, 'm1', '2027-10-01')).toBeCloseTo((40 - 2.5) / 40, 5);
  });
});

describe('one answer for what is drawn and what is scheduled', () => {
  test("the lookup the views use gives the scheduler's figure on every day", async () => {
    const { capacityLookup } = await import('../capacityLens.js');
    let d = foldEdit(plan(), 'members', { ...plan().members[0], weeklyHours: 24 }, '2027-03-01', TODAY);
    d = foldEdit(d, 'teams', { ...d.teams[0], meetingPlanIds: ['mp1', 'mp2'] }, '2027-06-01', TODAY);
    const at = capacityLookup(compileMembers(d));
    for (const day of ['2027-02-01', '2027-03-15', '2027-07-01']) {
      expect(at('m1', new Date(day))).toBeCloseTo(schedCap(d, 'm1', day), 9);
      expect(at('m2', new Date(day))).toBeCloseTo(schedCap(d, 'm2', day), 9);
    }
    expect(at('m1', new Date('2027-03-15'))).toBeLessThan(at('m1', new Date('2027-02-01')));
    expect(at('nobody', new Date())).toBeNull();
  });

  test('the load matrix shows somebody at half capacity from the day it starts', async () => {
    const { buildResourceLoadMatrix } = await import('../../components/shared/ResourceLoadMatrix.jsx');
    const { capacityLookup } = await import('../capacityLens.js');
    const base = {
      ...plan(),
      teams: [{ id: 'T1', name: 'Dev' }],
      meetingPlans: [],
      members: [{ id: 'm1', name: 'Noah', team: 'T1', cap: 1 }],
    };
    const d = foldEdit(base, 'members', { ...base.members[0], cap: 0.5 }, '2027-03-01', TODAY);
    const week = start => ({
      mon: new Date(start),
      wds: [0, 1, 2, 3, 4].map(i => {
        const x = new Date(start);
        x.setDate(x.getDate() + i);
        return x;
      }),
    });
    const weeks = [week('2027-02-22T00:00:00'), week('2027-03-01T00:00:00')];
    const args = { members: d.members, teams: d.teams, vacations: [], meetingPlans: [], scheduled: [], weeks };
    const blind = buildResourceLoadMatrix(args);
    const seeing = buildResourceLoadMatrix({ ...args, capacityAt: capacityLookup(compileMembers(d)) });
    const avail = m => (m.get ? m.get('m1') : m.m1).map(r => r.availability);
    expect(avail(blind)).toEqual([5, 5]); // what it showed without the lookup: wrong from March
    expect(avail(seeing)).toEqual([5, 2.5]);
  });
});
