import { describe, it, expect, vi } from 'vitest';
import { reorderSelectionInTime, adjustSelectionPrio, linkSelectedInOrder, clearSelectedLinks } from '../gantt/selectionEdits.js';

const tree = [
  { id: 'A', name: 'Alpha Task', prio: 1, deps: ['B'], softDeps: ['C'] },
  { id: 'B', name: 'Beta Task', deps: [] },
  { id: 'C', name: 'Gamma Task', prio: 4, deps: ['A'] },
];
const iMap = Object.fromEntries(tree.map(n => [n.id, n]));

describe('reorderSelectionInTime', () => {
  it('moves down bottom-up so the selection does not step over itself', () => {
    const onReorderSibling = vi.fn();
    reorderSelectionInTime({ selectedTaskIds: ['A', 'B', 'X'], leafIdSet: new Set(['A', 'B']), onReorderSibling }, 'down');
    expect(onReorderSibling.mock.calls).toEqual([
      ['B', 'down'],
      ['A', 'down'],
    ]);
  });

  it('does nothing without a handler or a selection', () => {
    expect(() => reorderSelectionInTime({ selectedTaskIds: [], leafIdSet: new Set(), onReorderSibling: vi.fn() }, 'up')).not.toThrow();
    expect(() => reorderSelectionInTime({ selectedTaskIds: ['A'], leafIdSet: new Set(['A']) }, 'up')).not.toThrow();
  });
});

describe('adjustSelectionPrio', () => {
  it('nudges within 1..4 and skips items already at the limit', () => {
    const onTaskUpdate = vi.fn();
    adjustSelectionPrio({ selectedTaskIds: ['A', 'B', 'C'], iMap, onTaskUpdate }, -1);
    expect(onTaskUpdate.mock.calls.map(([n]) => [n.id, n.prio])).toEqual([
      ['B', 1],
      ['C', 3],
    ]);
  });
});

describe('linkSelectedInOrder', () => {
  it('makes each selected item depend on the one before it', () => {
    const onAddDep = vi.fn();
    linkSelectedInOrder({ selectedTaskIds: ['A', 'B', 'B', 'C'], onAddDep });
    expect(onAddDep.mock.calls).toEqual([
      ['B', 'A'],
      ['C', 'B'],
    ]);
  });
});

describe('clearSelectedLinks', () => {
  it('removes only the soft links around the selection when asked for soft', () => {
    const onTaskUpdate = vi.fn();
    clearSelectedLinks({ selectedTaskIds: ['C'], iMap, tree, onTaskUpdate }, 'soft');
    expect(onTaskUpdate).toHaveBeenCalledTimes(1);
    expect(onTaskUpdate.mock.calls[0][0]).toMatchObject({ id: 'A', softDeps: [], deps: ['B'] });
  });

  it('removes every link of the selection, in both directions, with kind all', () => {
    const onTaskUpdate = vi.fn();
    clearSelectedLinks({ selectedTaskIds: ['A'], iMap, tree, onTaskUpdate }, 'all');
    const byId = Object.fromEntries(onTaskUpdate.mock.calls.map(([n]) => [n.id, n]));
    expect(byId.A).toMatchObject({ deps: [], softDeps: [] });
    expect(byId.C.deps).toEqual([]);
    expect(byId.B).toBeUndefined();
  });

  it('falls back to per-pair removal when only onRemoveDep exists', () => {
    const onRemoveDep = vi.fn();
    clearSelectedLinks({ selectedTaskIds: ['A'], iMap, tree, onRemoveDep }, 'all');
    expect(onRemoveDep.mock.calls.map(c => c.join('<'))).toEqual(['A<B', 'A<C', 'C<A']);
  });
});
