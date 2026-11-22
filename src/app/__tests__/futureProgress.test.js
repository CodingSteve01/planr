import { describe, test, expect } from 'vitest';
import { futureProgressByRoot } from '../futureProgress.js';

const leaf = (id, extra = {}) => ({ id, name: id, team: 'Backend', best: 4, factor: 1, status: 'open', ...extra });
// Local midnights, like the scheduler's own dates.
const bar = (id, start, end) => ({ id, startD: new Date(`${start}T00:00:00`), endD: new Date(`${end}T00:00:00`) });
const HORIZON = new Date('2026-06-15T00:00:00');

// One root, two leaves of 4 days each; the first is half done.
const plan = () => [{ id: 'P1', name: 'Rechnungen', best: 0 }, leaf('P1.1', { status: 'wip', progress: 50 }), leaf('P1.2')];

describe('futureProgressByRoot()', () => {
  test('no horizon → null', () => {
    expect(futureProgressByRoot(plan(), [], null)).toBeNull();
  });

  test('without bars it stays at today: one of two equal leaves at 50 % is 25 %', () => {
    expect(futureProgressByRoot(plan(), [], HORIZON).P1).toBeCloseTo(0.25, 10);
  });

  test('a bar that ends before the horizon counts as (almost) done', () => {
    const sched = [bar('P1.1', '2026-06-01', '2026-06-05')];
    // (4 × 0.99 + 4 × 0) / 8
    expect(futureProgressByRoot(plan(), sched, HORIZON).P1).toBeCloseTo(0.495, 10);
  });

  test('a bar the horizon cuts in half gives half credit', () => {
    const sched = [bar('P1.2', '2026-06-10', '2026-06-20')];
    // Horizon is 5 of 10 days into the bar → 0.5; the first leaf stays at 0.5.
    expect(futureProgressByRoot(plan(), sched, HORIZON).P1).toBeCloseTo(0.5, 10);
  });

  test('a bar that starts after the horizon adds nothing', () => {
    const sched = [bar('P1.2', '2026-07-01', '2026-07-10')];
    expect(futureProgressByRoot(plan(), sched, HORIZON).P1).toBeCloseTo(0.25, 10);
  });

  test('a finished root is exactly 1, an unfinished one never reaches 1', () => {
    const tree = [
      { id: 'P1', name: 'Rechnungen', best: 0 },
      leaf('P1.1', { status: 'done' }),
      { id: 'P2', name: 'Kundenbereich', best: 0 },
      leaf('P2.1', { status: 'wip', progress: 90 }),
    ];
    const sched = [bar('P2.1', '2026-06-01', '2026-06-05')];
    const out = futureProgressByRoot(tree, sched, HORIZON);
    expect(out.P1).toBe(1);
    expect(out.P2).toBeLessThanOrEqual(0.99);
    expect(out.P2).toBeGreaterThan(0.9);
  });

  test('each root is projected on its own leaves', () => {
    const tree = [...plan(), { id: 'P2', name: 'Kundenbereich', best: 0 }, leaf('P2.1')];
    const sched = [bar('P2.1', '2026-06-01', '2026-06-05')];
    const out = futureProgressByRoot(tree, sched, HORIZON);
    expect(out.P1).toBeCloseTo(0.25, 10);
    expect(out.P2).toBeCloseTo(0.99, 10);
  });

  test('a dropped leaf leaves both sides of the fraction', () => {
    const tree = [...plan(), leaf('P1.3', { dropped: true })];
    expect(futureProgressByRoot(tree, [], HORIZON).P1).toBeCloseTo(0.25, 10);
  });
});
