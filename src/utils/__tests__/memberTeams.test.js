import { describe, test, expect } from 'vitest';
import { schedule } from '../scheduler.js';
import { buildMarkdownText, parseResourceLine } from '../markdown.js';
import { memberTeams, inTeam, withTeams, withoutTeam, realisedTeamShares, teamForAssignment } from '../memberTeams.js';
import { iso } from '../date.js';

const PS = '2026-01-05'; // Monday
function run(tree, members, options = {}) {
  return schedule(tree, members, [], PS, '2026-12-31', {}, [1, 2, 3, 4, 5], PS,
    { now: PS, anchorToToday: false, discountProgress: false, autoCascade: true, ...options }).results;
}

const teams = [
  { id: 'T1', name: 'Backend', color: '#10b981' },
  { id: 'T2', name: 'Frontend', color: '#3b82f6' },
];
const jonas = { id: 'M1', name: 'Jonas Fiedler', team: 'T1', teams: ['T1', 'T2'], cap: 1, vac: 0, start: '2026-01-01' };
const alice = { id: 'M2', name: 'Alice Berg', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' };

const leaf = (id, team, best, extra = {}) => ({ id, name: id, team, best, factor: 1, prio: 2, status: 'open', ...extra });

// Every working day a person is booked on, counted per row. A day on two rows
// at once means their capacity was booked twice.
function bookedDays(rows, personId) {
  const days = new Map();
  rows.filter(r => r.personId === personId && !r.unscheduled).forEach(r => {
    for (let d = new Date(r.startD); d <= r.endD; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      days.set(iso(d), (days.get(iso(d)) || 0) + 1);
    }
  });
  return days;
}

describe('memberTeams helpers', () => {
  test('legacy member with only `team` reads as one team', () => {
    expect(memberTeams({ team: 'T1' })).toEqual(['T1']);
    expect(memberTeams({ team: '' })).toEqual([]);
    expect(inTeam({ team: 'T1' }, 'T1')).toBe(true);
    expect(inTeam({ team: 'T1' }, 'T2')).toBe(false);
  });

  test('the empty team is the pool of members without a team', () => {
    expect(inTeam({ team: '' }, '')).toBe(true);
    expect(inTeam({ team: 'T1' }, '')).toBe(false);
    expect(inTeam(jonas, '')).toBe(false);
  });

  test('primary first, no duplicates', () => {
    expect(memberTeams({ team: 'T2', teams: ['T1', 'T2'] })).toEqual(['T2', 'T1']);
  });

  test('withTeams keeps `team` as primary and collapses a single team to the legacy shape', () => {
    expect(withTeams({ id: 'x', team: 'T1' }, ['T2', 'T1'])).toEqual({ id: 'x', team: 'T2', teams: ['T2', 'T1'] });
    expect(withTeams({ id: 'x', team: 'T1', teams: ['T1', 'T2'] }, ['T2'])).toEqual({ id: 'x', team: 'T2' });
    expect(withTeams({ id: 'x', team: 'T1' }, [])).toEqual({ id: 'x', team: '' });
  });

  test('withoutTeam promotes the next team when the primary is deleted', () => {
    expect(withoutTeam(jonas, 'T1')).toMatchObject({ team: 'T2' });
    expect(withoutTeam(jonas, 'T1').teams).toBeUndefined();
    expect(withoutTeam(alice, 'T2')).toBe(alice);
  });

  test('assigning keeps the task team when the member works in it', () => {
    expect(teamForAssignment(jonas, 'T2')).toBe('T2');
    expect(teamForAssignment(alice, 'T2')).toBe('T1');
    expect(teamForAssignment(alice, '')).toBe('T1');
  });
});

describe('scheduler: a member in two teams', () => {
  test('picks up tasks from both teams as a regular candidate, never as cross-team', () => {
    const tree = [
      leaf('B1', 'T1', 5), leaf('B2', 'T1', 5),
      leaf('F1', 'T2', 5), leaf('F2', 'T2', 5),
    ];
    const rows = run(tree, [jonas]);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    for (const id of ['B1', 'B2', 'F1', 'F2']) {
      expect(byId[id].personId).toBe('M1');
      expect(byId[id].crossTeam).toBeFalsy();
    }
  });

  test('total load never exceeds their single capacity', () => {
    const tree = [
      leaf('B1', 'T1', 5), leaf('B2', 'T1', 3),
      leaf('F1', 'T2', 5), leaf('F2', 'T2', 4),
    ];
    const rows = run(tree, [jonas]);
    const days = bookedDays(rows, 'M1');
    expect([...days.values()].every(n => n === 1)).toBe(true);
    // Same span as one single-team person doing all 17 PT: the two teams
    // draw on one capacity, they do not add a second one.
    const solo = { ...alice, id: 'M9' };
    const soloRows = run(tree.map(r => ({ ...r, team: 'T1' })), [solo]);
    expect(days.size).toBe(bookedDays(soloRows, 'M9').size);
    const lastEnd = rows => Math.max(...rows.map(r => +r.endD));
    expect(lastEnd(rows)).toBe(lastEnd(soloRows));
  });

  test('shares a team pool with a one-team colleague without double booking', () => {
    const tree = [
      leaf('B1', 'T1', 5), leaf('B2', 'T1', 5), leaf('B3', 'T1', 5),
      leaf('F1', 'T2', 5),
    ];
    const rows = run(tree, [jonas, alice]);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.F1.personId).toBe('M1');                 // only Jonas can do Frontend
    expect(rows.filter(r => r.team === 'T1').some(r => r.personId === 'M1')).toBe(true);
    expect(rows.filter(r => r.team === 'T1').some(r => r.personId === 'M2')).toBe(true);
    expect([...bookedDays(rows, 'M1').values()].every(n => n === 1)).toBe(true);
    expect([...bookedDays(rows, 'M2').values()].every(n => n === 1)).toBe(true);
  });

  test('team-lock includes a member who is in that team among others', () => {
    const tree = [leaf('L1', 'T1', 2, { teamLock: true })];
    const rows = run(tree, [jonas, alice]);
    expect(rows.find(r => r.id === 'L1').assign.sort()).toEqual(['M1', 'M2']);
  });

  test('team-lock of their other team blocks them fully (no split capacity)', () => {
    const tree = [
      leaf('L1', 'T1', 3, { teamLock: true }),
      leaf('F1', 'T2', 2, { deps: [] }),
    ];
    const rows = run(tree, [jonas, alice]);
    const lock = rows.find(r => r.id === 'L1');
    const f1 = rows.find(r => r.id === 'F1');
    expect(lock.assign).toContain('M1');
    expect(f1.personId).toBe('M1');
    // Frontend work does not overlap the Backend lock.
    expect(f1.startD > lock.endD || f1.endD < lock.startD).toBe(true);
  });

  test('handoff to a multi-team member is booked under the task team', () => {
    const leaver = { id: 'M3', name: 'Lea', team: 'T2', cap: 1, vac: 0, start: '2026-01-01', end: '2026-01-09' };
    const tree = [leaf('F1', 'T2', 10, { assign: ['M3'] })];
    const rows = run(tree, [leaver, jonas]);
    const seg = rows.find(r => r.isHandoff && r.personId === 'M1');
    expect(seg).toBeDefined();
    expect(seg.team).toBe('T2');
    expect(seg.crossTeam).toBe(false);
  });
});

describe('realised team shares', () => {
  test('come out of the scheduled effort per task team', () => {
    const tree = [leaf('B1', 'T1', 6), leaf('F1', 'T2', 4)];
    const rows = run(tree, [jonas]);
    const shares = realisedTeamShares(jonas, rows);
    expect(shares.map(s => s.team)).toEqual(['T1', 'T2']);
    expect(shares[0].pct).toBeCloseTo(0.6);
    expect(shares[1].pct).toBeCloseTo(0.4);
  });

  test('ignore done and unscheduled rows and other people', () => {
    const rows = [
      { id: 'a', team: 'T1', personId: 'M1', effort: 3 },
      { id: 'b', team: 'T2', personId: 'M1', effort: 1 },
      { id: 'c', team: 'T2', personId: 'M1', effort: 9, status: 'done' },
      { id: 'd', team: 'T2', personId: 'M1', effort: 9, unscheduled: true },
      { id: 'e', team: 'T2', personId: 'M2', effort: 9 },
    ];
    const shares = realisedTeamShares(jonas, rows);
    expect(shares).toEqual([
      { team: 'T1', effort: 3, pct: 0.75 },
      { team: 'T2', effort: 1, pct: 0.25 },
    ]);
  });

  test('can be clipped to a window', () => {
    const d = s => new Date(s + 'T00:00:00');
    const rows = [
      { id: 'a', team: 'T1', personId: 'M1', effort: 10, startD: d('2026-01-01'), endD: d('2026-01-11') },
      { id: 'b', team: 'T2', personId: 'M1', effort: 5, startD: d('2026-02-01'), endD: d('2026-02-06') },
    ];
    const shares = realisedTeamShares(jonas, rows, { from: d('2026-01-25'), to: d('2026-03-01') });
    expect(shares).toEqual([{ team: 'T2', effort: 5, pct: 1 }]);
  });

  test('no scheduled work → no shares', () => {
    expect(realisedTeamShares(jonas, [])).toEqual([]);
  });
});

describe('markdown: Resources line with several teams', () => {
  const base = { meta: { name: 'X', planStart: PS, planEnd: '2026-12-31', version: '2' }, teams, vacations: [], tree: [] };

  test('writes all teams joined by " + ", primary first', () => {
    const md = buildMarkdownText({ ...base, members: [{ ...jonas, role: 'Dev' }] });
    const line = md.split('\n').find(l => l.includes('**Jonas Fiedler**'));
    expect(line).toMatch(/— Backend \+ Frontend, Dev/);
  });

  test('one-team member is written exactly as before', () => {
    const md = buildMarkdownText({ ...base, members: [{ ...alice, role: 'Dev' }] });
    const line = md.split('\n').find(l => l.includes('**Alice Berg**'));
    expect(line).toMatch(/— Backend, Dev/);
    expect(line).not.toMatch(/\+/);
  });

  test('round-trips through parseResourceLine', () => {
    const md = buildMarkdownText({ ...base, members: [{ ...jonas, role: 'Full-stack', cap: 0.8, end: '2026-11-30' }] });
    const line = md.split('\n').find(l => l.includes('**Jonas Fiedler**'));
    const parsed = parseResourceLine(line);
    expect(parsed.teams).toEqual(['Backend', 'Frontend']);
    expect(parsed.team).toBe('Backend');
    expect(parsed.role).toBe('Full-stack');
    expect(parsed.cap).toBe(0.8);
    expect(parsed.end).toBe('2026-11-30');
  });

  test('legacy single-team line still parses', () => {
    const parsed = parseResourceLine('- **Jonas Fiedler** `JF` — Backend, Dev (50%), ab 2026-01-01');
    expect(parsed).toMatchObject({ name: 'Jonas Fiedler', short: 'JF', team: 'Backend', teams: ['Backend'], role: 'Dev', cap: 0.5, start: '2026-01-01' });
  });
});
