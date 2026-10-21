// Who gets a task, and in what order. Four faults, all found on the venneker
// plan in October 2026:
//
// * A finished task still pulled its predecessors to the front: its "Requires"
//   was walked before the tree order, so a project the tree put last started
//   first.
// * Unassigned work went to whoever was free first. A colleague with a fifth
//   of a week is often free first, and a fifteen-day task then took four
//   months on them while a full-time colleague finished a week later.
// * A member in two teams was an equal candidate for both. Someone who works
//   mainly in Backend took Frontend lists whenever the Frontend people were
//   busy, and the Backend work waited.
// * A member whose meetings eat their whole week has no capacity left, yet was
//   still picked, and the task stretched to the end of the horizon unnoticed.
import { describe, test, expect } from 'vitest';
import { schedule } from '../scheduler.js';
import { membersWithoutCapacity } from '../capacity.js';
import { iso } from '../date.js';

const PS = '2026-01-05'; // Monday
function run(tree, members, options = {}) {
  return schedule(tree, members, [], PS, '2027-12-31', {}, [1, 2, 3, 4, 5], PS,
    { now: PS, anchorToToday: false, discountProgress: false, ...options }).results;
}
const leaf = (id, team, best, extra = {}) => ({ id, name: id, team, best, factor: 1, status: 'open', ...extra });
const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]));

describe('a finished task', () => {
  test('does not pull its predecessors ahead of the tree order', () => {
    const dev = { id: 'D', name: 'Dev', team: 'B', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      { id: 'P1', name: 'First project' },
      leaf('P1.1', 'B', 0, { status: 'done', completedAt: '2026-01-02', deps: ['P2.1'] }),
      leaf('P1.2', 'B', 5),
      { id: 'P2', name: 'Last project' },
      leaf('P2.1', 'B', 5),
    ];
    const rows = byId(run(tree, [dev]));
    expect(+rows['P1.2'].startD).toBeLessThan(+rows['P2.1'].startD);
  });

  test('an open task still waits for its predecessor', () => {
    const dev = { id: 'D', name: 'Dev', team: 'B', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      { id: 'P1', name: 'First project' },
      leaf('P1.1', 'B', 5, { deps: ['P2.1'] }),
      { id: 'P2', name: 'Last project' },
      leaf('P2.1', 'B', 5),
    ];
    const rows = byId(run(tree, [dev]));
    expect(+rows['P1.1'].startD).toBeGreaterThan(+rows['P2.1'].endD);
  });
});

describe('unassigned work', () => {
  test('goes to whoever finishes it first, not whoever is free first', () => {
    const part = { id: 'S', name: 'Part-timer', team: 'B', cap: 0.2, vac: 0, start: '2026-01-01' };
    const full = { id: 'J', name: 'Full-timer', team: 'B', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [
      leaf('A', 'B', 3, { assign: ['J'] }),
      leaf('L', 'B', 15),
    ];
    const rows = byId(run(tree, [part, full]));
    expect(rows.L.personId).toBe('J');
    expect(iso(rows.L.endD) < '2026-02-28').toBe(true);
  });

  test('still goes to the free colleague when that is the earlier finish', () => {
    const a = { id: 'A1', name: 'Anna', team: 'B', cap: 1, vac: 0, start: '2026-01-01' };
    const b = { id: 'B1', name: 'Ben', team: 'B', cap: 1, vac: 0, start: '2026-01-01' };
    const tree = [leaf('X', 'B', 20, { assign: ['A1'] }), leaf('Y', 'B', 5)];
    expect(byId(run(tree, [a, b])).Y.personId).toBe('B1');
  });
});

describe('a member in two teams', () => {
  const teamsOf = (id, name, teams) => ({ id, name, team: teams[0], teams, cap: 1, vac: 0, start: '2026-01-01' });

  test('works their first team first while it has work in the same project', () => {
    const jonas = teamsOf('JF', 'Jonas', ['BE', 'FE']);
    const georg = teamsOf('GB', 'Georg', ['FE']);
    const tree = [
      { id: 'P', name: 'Project' },
      leaf('P.1', 'FE', 10, { assign: ['GB'] }),
      leaf('P.2', 'FE', 5),
      leaf('P.3', 'BE', 5),
    ];
    const rows = byId(run(tree, [jonas, georg]));
    expect(rows['P.2'].personId).toBe('GB');
    expect(rows['P.3'].personId).toBe('JF');
    expect(iso(rows['P.3'].startD) <= '2026-01-09').toBe(true);
  });

  test('helps out in the other team once their own has nothing left there', () => {
    const jonas = teamsOf('JF', 'Jonas', ['BE', 'FE']);
    const georg = teamsOf('GB', 'Georg', ['FE']);
    const tree = [
      { id: 'P', name: 'Project' },
      leaf('P.1', 'BE', 3),
      leaf('P.2', 'FE', 10, { assign: ['GB'] }),
      leaf('P.3', 'FE', 5),
    ];
    expect(byId(run(tree, [jonas, georg]))['P.3'].personId).toBe('JF');
  });

  test('is the only candidate when nobody has that team first', () => {
    const jonas = teamsOf('JF', 'Jonas', ['BE', 'FE']);
    const tree = [{ id: 'P', name: 'Project' }, leaf('P.1', 'BE', 5), leaf('P.2', 'FE', 5)];
    expect(byId(run(tree, [jonas]))['P.2'].personId).toBe('JF');
  });
});

describe('a member without capacity', () => {
  const plans = [{ id: 'dev', name: 'dev', meetings: [{ id: 'm', name: 'Standup', hours: 2, frequency: 'daily' }] }];
  const lead = { id: 'SL', name: 'Steffen', team: 'B', capMode: 'derived', weeklyHours: 8, meetingPlanIds: ['dev'], vac: 0, start: '2026-01-01' };
  const dev = { id: 'JF', name: 'Jonas', team: 'B', cap: 1, vac: 0, start: '2026-01-01' };
  const withMeetings = m => ({ ...m, meetings: m.meetingPlanIds ? plans[0].meetings : [] });

  test('is not picked for unassigned work', () => {
    const tree = [leaf('A', 'B', 10, { assign: ['JF'] }), leaf('B', 'B', 3)];
    const rows = byId(run(tree, [withMeetings(lead), dev]));
    expect(rows.B.personId).toBe('JF');
  });

  test('is reported with the work assigned to them', () => {
    const tree = [leaf('A', 'B', 3, { assign: ['SL'] })];
    const rows = run(tree, [withMeetings(lead), dev]);
    const found = membersWithoutCapacity([lead, dev], rows, { plans, teams: [] });
    expect(found.map(f => f.member.id)).toEqual(['SL']);
    expect(found[0].taskIds).toEqual(['A']);
  });
});
