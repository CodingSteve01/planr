// Asked: is there a rejected status? Would that be "done at 0 %"?
//
// It would, and that is the problem: an item nobody is going to do, marked
// done at 0 %, is counted as delivered work. It inflates "65/132 done", it
// sits at 0 % in the effort-weighted percentage and drags it down, and it
// claims a completion date it never had. Two lies in opposite directions.
//
// `dropped` is a fact about the item rather than a fourth status, deliberately:
// roughly thirty modules ask "is this done?" and every one of them keeps the
// answer it had. What changes is the arithmetic — a dropped item leaves BOTH
// sides of the fraction, because it is no longer work that exists.

import { describe, test, expect } from 'vitest';
import { aggregateProgressPct, deliveredEffort, totalEffort } from '../progress.js';
import { schedule, leafNodes } from '../scheduler.js';

const leaf = (id, extra = {}) => ({ id, name: id, team: 'T', best: 10, factor: 1, status: 'open', ...extra });

describe('an item that is not going to happen', () => {
  test('leaves the percentage alone instead of dragging it down', () => {
    const live = [leaf('P.A', { status: 'done', progress: 100 }), leaf('P.B', { status: 'done', progress: 100 })];
    const withDropped = [...live, leaf('P.C', { dropped: true })];

    // Two of two done is 100 %. Adding something nobody will do does not make
    // it 67 % — that would be reporting a loss of progress for a decision.
    expect(aggregateProgressPct(withDropped)).toBe(aggregateProgressPct(live));
    expect(aggregateProgressPct(withDropped)).toBe(100);
  });

  test('is not counted as delivered, the way "done at 0 %" was', () => {
    expect(deliveredEffort([leaf('P.A', { dropped: true, status: 'done', progress: 100 })])).toBe(0);
  });

  test('leaves the planned total, because it is not planned any more', () => {
    expect(totalEffort([leaf('P.A'), leaf('P.B', { dropped: true })])).toBe(10);
  });

  test('is not one of the leaves the plan is made of', () => {
    const tree = [
      { id: 'P', name: 'Root', best: 0 },
      leaf('P.A'),
      leaf('P.B', { dropped: true }),
    ];
    expect(leafNodes(tree).map(l => l.id)).toEqual(['P.A']);
  });

  test('takes no capacity and gets no dates', () => {
    const tree = [
      { id: 'P', name: 'Root', team: '', best: 0 },
      leaf('P.A', { assign: ['M1'] }),
      leaf('P.B', { assign: ['M1'], dropped: true }),
    ];
    const r = schedule(tree, [{ id: 'M1', name: 'Anna', team: 'T', cap: 1, vac: 0, start: '2026-01-01' }],
      [], '2026-01-05', '2026-12-31', {}, [1, 2, 3, 4, 5], '2026-01-05', { now: '2026-01-05' });

    expect(r.results.find(x => x.id === 'P.B')).toBeUndefined();
    // And the work that remains does not wait for it.
    expect(r.results.find(x => x.id === 'P.A')).toBeDefined();
  });

  test('a whole dropped package takes its children with it', () => {
    const tree = [
      { id: 'P', name: 'Root', best: 0 },
      { id: 'P.1', name: 'Package', best: 0, dropped: true },
      leaf('P.1.1'),
      leaf('P.2'),
    ];
    expect(leafNodes(tree).map(l => l.id)).toEqual(['P.2']);
  });
});
