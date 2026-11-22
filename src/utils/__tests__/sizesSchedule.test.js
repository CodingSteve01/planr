import { describe, test, expect } from 'vitest';
import { schedule } from '../scheduler.js';
import { fieldPatchForKey, resolveSize } from '../treeEdit.js';
import { DEFAULT_SIZES } from '../sizes.js';
import { DEFAULT_RISKS, resolveRiskName } from '../risks.js';
import { iso } from '../date.js';

const members = [{ id: 'M1', name: 'Anna Noor', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' }];
const PLAN_START = '2026-01-05'; // Monday

// Pick size M for a task the way the keyboard shortcut does, then schedule it.
function scheduledAfterPickingM(sizes) {
  const base = { id: 'P1.1', name: 'Task', team: 'T1', assign: ['M1'], status: 'open', best: 1, factor: 1 };
  const patch = fieldPatchForKey(base, 'm', sizes);
  const tree = [
    { id: 'P1', name: 'Root', team: '', best: 0 },
    { ...base, ...patch },
  ];
  const opts = { now: PLAN_START, anchorToToday: false, discountProgress: false };
  const { results } = schedule(tree, members, [], PLAN_START, '2026-12-31', {}, [1, 2, 3, 4, 5], PLAN_START, opts);
  return results[0];
}

describe('the size catalogue drives the scheduled duration', () => {
  test('M at 3 days is scheduled for 3 working days', () => {
    const r = scheduledAfterPickingM([{ label: 'M', days: 3, factor: 1 }]);
    expect(r.effort).toBe(3);
    expect(iso(r.startD)).toBe('2026-01-05');
    // `endD` is exclusive: Mon, Tue, Wed are worked, the bar ends on Thursday.
    expect(iso(r.endD)).toBe('2026-01-08');
  });

  test('changing M from 3 to 5 days makes an M task last 5 days', () => {
    const r = scheduledAfterPickingM([{ label: 'M', days: 5, factor: 1 }]);
    expect(r.effort).toBe(5);
    // Mon–Fri worked, exclusive end is the next Monday.
    expect(iso(r.endD)).toBe('2026-01-12');
  });

  test("the size's risk factor multiplies the days", () => {
    const r = scheduledAfterPickingM([{ label: 'M', days: 4, factor: 1.5 }]);
    expect(r.effort).toBe(6);
  });

  test('a project without its own sizes uses the defaults', () => {
    const m = DEFAULT_SIZES.find(s => s.label === 'M');
    expect(resolveSize(undefined, 'm')).toEqual({ best: m.days, factor: m.factor });
    expect(resolveSize([], 'M')).toEqual({ best: m.days, factor: m.factor });
  });

  test('a size the project does not define is a no-op, whatever the defaults say', () => {
    expect(resolveSize([{ label: 'M', days: 5, factor: 1 }], 'L')).toBeNull();
    expect(fieldPatchForKey({ id: 'P1.1' }, 'l', [{ label: 'M', days: 5, factor: 1 }])).toBeNull();
  });
});

describe('risk catalogue', () => {
  test('default risks are named by i18n key, custom ones by their own name', () => {
    expect(resolveRiskName(DEFAULT_RISKS[0], k => `t:${k}`)).toBe('t:ew.risk.newTech');
    expect(resolveRiskName({ id: 'x', name: 'Lieferengpass' }, k => k)).toBe('Lieferengpass');
    expect(resolveRiskName({ id: 'y' }, k => k)).toBe('y');
  });

  test('default weights are positive and add up to a sensible total', () => {
    expect(DEFAULT_RISKS.every(r => r.weight > 0)).toBe(true);
    expect(new Set(DEFAULT_RISKS.map(r => r.id)).size).toBe(DEFAULT_RISKS.length);
  });
});
