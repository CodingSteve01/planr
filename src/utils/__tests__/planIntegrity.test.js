// The contradictions the plan check lists. Reported from a real plan: a
// dropped task at 63% "in progress" under a finished project, invisible in
// the tree and still in the queue.
import { describe, expect, it } from 'vitest';
import { planInconsistencies } from '../planIntegrity.js';

const kinds = tree => planInconsistencies(tree).map(c => `${c.kind}:${c.id}`);

describe('planInconsistencies', () => {
  it('is quiet on a consistent plan', () => {
    expect(kinds([
      { id: 'P1', status: 'wip' },
      { id: 'P1.1', status: 'done' },
      { id: 'P1.2', status: 'open' },
      { id: 'P2', status: 'done' },
      { id: 'P2.1', status: 'done' },
    ])).toEqual([]);
  });

  it('finds an item whose parent is not in the plan', () => {
    const found = planInconsistencies([{ id: 'P1', status: 'open' }, { id: 'P1.4.2', status: 'open' }]);
    expect(found).toEqual([{ kind: 'orphan', id: 'P1.4.2', parentId: 'P1.4' }]);
  });

  it('finds dropped work that still claims progress', () => {
    expect(kinds([
      { id: 'P1', status: 'done' },
      { id: 'P1.4', status: 'done' },
      { id: 'P1.5', status: 'wip', progress: 63, dropped: true },
    ])).toEqual(['droppedLive:P1.5']);
  });

  it('leaves dropped work alone when it claims nothing', () => {
    expect(kinds([{ id: 'P8', status: 'open' }, { id: 'P8.9', status: 'open', dropped: true }])).toEqual([]);
  });

  it('finds a finished parent with live work open below it', () => {
    const found = planInconsistencies([
      { id: 'P1', status: 'done' },
      { id: 'P1.1', status: 'done' },
      { id: 'P1.2', status: 'open' },
      { id: 'P1.3', status: 'open', dropped: true },
    ]);
    expect(found).toEqual([{ kind: 'doneOverOpen', id: 'P1', openIds: ['P1.2'] }]);
  });
});
