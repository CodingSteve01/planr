import { describe, test, expect } from 'vitest';
import {
  FTE_HOURS, meetingWeeklyHours, sumMeetingHours,
  resolveMemberMeetings, deriveCap,
} from '../capacity.js';

describe('meetingWeeklyHours', () => {
  test('weekly: hours pass through', () => {
    expect(meetingWeeklyHours({ hours: 1, frequency: 'weekly' })).toBe(1);
  });
  test('daily: 5× multiplier', () => {
    expect(meetingWeeklyHours({ hours: 0.25, frequency: 'daily' })).toBe(1.25);
  });
  test('biweekly: 0.5× multiplier', () => {
    expect(meetingWeeklyHours({ hours: 2, frequency: 'biweekly' })).toBe(1);
  });
  test('monthly: 12/52 multiplier', () => {
    expect(meetingWeeklyHours({ hours: 1, frequency: 'monthly' })).toBeCloseTo(12 / 52, 5);
  });
  test('unknown frequency defaults to weekly', () => {
    expect(meetingWeeklyHours({ hours: 2 })).toBe(2);
  });
  test('zero/empty hours → 0', () => {
    expect(meetingWeeklyHours({ hours: 0 })).toBe(0);
    expect(meetingWeeklyHours({})).toBe(0);
    expect(meetingWeeklyHours(null)).toBe(0);
  });
  test('negative hours clamp to 0', () => {
    expect(meetingWeeklyHours({ hours: -1 })).toBe(0);
  });
});

describe('sumMeetingHours', () => {
  test('sums across frequencies', () => {
    const res = sumMeetingHours([
      { hours: 0.25, frequency: 'daily' },  // 1.25
      { hours: 1, frequency: 'weekly' },    // 1.00
      { hours: 2, frequency: 'biweekly' },  // 1.00
      { hours: 1, frequency: 'monthly' },   // 0.231
    ]);
    expect(res).toBeCloseTo(3.481, 2);
  });
  test('non-array → 0', () => {
    expect(sumMeetingHours(undefined)).toBe(0);
    expect(sumMeetingHours(null)).toBe(0);
  });
});

describe('resolveMemberMeetings', () => {
  const plans = [
    { id: 'eng', name: 'Engineering', meetings: [{ id: 'standup', name: 'Standup', hours: 0.25, frequency: 'daily' }] },
    { id: 'lead', name: 'Leitung', meetings: [{ id: 'sync', name: 'Lead Sync', hours: 1, frequency: 'weekly' }] },
  ];
  const teams = [
    { id: 'T1', meetingPlanIds: ['eng'] },
    { id: 'T2', meetingPlanIds: [] },
  ];

  test('no plans, no meetings → empty', () => {
    expect(resolveMemberMeetings({ team: 'T1' }, { plans: [], teams: [] })).toEqual([]);
  });
  test('team inherits plan meetings', () => {
    const got = resolveMemberMeetings({ team: 'T1' }, { plans, teams });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ name: 'Standup', _planName: 'Engineering', _planSource: 'team' });
  });
  test('member adds own plans on top of team plans', () => {
    const got = resolveMemberMeetings({ team: 'T1', meetingPlanIds: ['lead'] }, { plans, teams });
    expect(got).toHaveLength(2);
    expect(got.map(m => m._planName)).toEqual(['Engineering', 'Leitung']);
  });
  test('member adds own ad-hoc meetings at the end', () => {
    const got = resolveMemberMeetings({
      team: 'T2',
      meetings: [{ id: 'x', name: '1:1', hours: 0.5, frequency: 'weekly' }],
    }, { plans, teams });
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe('1:1');
    expect(got[0]._planName).toBeUndefined();
  });
  test('accepts legacy plans-array signature', () => {
    const got = resolveMemberMeetings({ meetingPlanIds: ['eng'] }, plans);
    expect(got).toHaveLength(1);
  });
  test('unknown plan id is skipped', () => {
    const got = resolveMemberMeetings({ meetingPlanIds: ['doesnt-exist'] }, { plans, teams });
    expect(got).toEqual([]);
  });
});

describe('deriveCap', () => {
  const plans = [
    { id: 'eng', name: 'Eng', meetings: [{ id: 's', name: 'Standup', hours: 0.25, frequency: 'daily' }] },
  ];
  const teams = [{ id: 'T1', meetingPlanIds: ['eng'] }];

  test('null/undefined member → 1', () => {
    expect(deriveCap(null)).toBe(1);
    expect(deriveCap(undefined)).toBe(1);
  });
  test('manual mode passes through cap field', () => {
    expect(deriveCap({ cap: 0.5 })).toBe(0.5);
    expect(deriveCap({ cap: 1 })).toBe(1);
  });
  test('manual mode with undefined cap → 1', () => {
    expect(deriveCap({ capMode: 'manual' })).toBe(1);
  });
  test('derived mode, no meetings → 1 (full FTE)', () => {
    expect(deriveCap({ capMode: 'derived', weeklyHours: 40 })).toBe(1);
  });
  test('derived mode subtracts meetings', () => {
    const m = { capMode: 'derived', weeklyHours: 40,
      meetings: [{ id: 'x', name: '1:1', hours: 1, frequency: 'weekly' }] };
    expect(deriveCap(m)).toBeCloseTo((40 - 1) / 40, 5);
  });
  test('derived mode part-time (20h/week) with 2h meetings', () => {
    const m = { capMode: 'derived', weeklyHours: 20,
      meetings: [{ id: 'x', name: '1:1', hours: 2, frequency: 'weekly' }] };
    expect(deriveCap(m)).toBeCloseTo((20 - 2) / FTE_HOURS, 5);
  });
  test('MANUAL mode still subtracts team-plan meetings (inheritance)', () => {
    const m = { team: 'T1', cap: 1 };
    // Baseline = 1×40 = 40h, minus Standup 1.25h/w → 38.75/40 = 0.96875
    expect(deriveCap(m, { plans, teams })).toBeCloseTo((40 - 1.25) / 40, 5);
  });
  test('MANUAL 50% + team plan meetings stacks', () => {
    const m = { team: 'T1', cap: 0.5 };
    // Baseline = 0.5×40 = 20h, minus 1.25h = 18.75h; / 40 = 0.46875
    expect(deriveCap(m, { plans, teams })).toBeCloseTo((20 - 1.25) / 40, 5);
  });
  test('meetings exceeding capacity clamp to 0', () => {
    const m = { capMode: 'derived', weeklyHours: 1,
      meetings: [{ hours: 10, frequency: 'weekly' }] };
    expect(deriveCap(m)).toBe(0);
  });
  test('negative cap clamps to 0 availability', () => {
    // Manual mode with negative cap: Math.max(0, cap) * 40 = 0 baseline → 0/40 = 0
    expect(deriveCap({ cap: -0.5 })).toBe(0);
    // Derived with negative weeklyHours falls back to FTE_HOURS (treated as missing)
    expect(deriveCap({ capMode: 'derived', weeklyHours: -5 })).toBe(1);
  });
});
