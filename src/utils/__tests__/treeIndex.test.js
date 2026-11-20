import { describe, expect, test } from 'vitest';
import {
  treeIndex, leafNodes, isLeafNode, directChildren, hasChildren, descendantLeaves,
  resolveToLeafIds, treeStats,
} from '../scheduler.js';
import { computeRoadmapModel } from '../roadmap.js';

// A plan the size of a real one: 8 roots × 5 packages × 5 tasks.
function bigTree() {
  const tree = [];
  ['F1', 'P2', 'P3', 'M1', 'A1', 'B1', 'D1', 'Pr1'].forEach((root, ri) => {
    tree.push({ id: root, name: 'Root ' + root, type: 'goal', status: 'wip' });
    for (let a = 1; a <= 5; a++) {
      tree.push({ id: `${root}.${a}`, name: `Package ${a}`, status: 'wip' });
      for (let b = 1; b <= 5; b++) {
        const done = ri < 2;
        tree.push({
          id: `${root}.${a}.${b}`, name: `Task ${a}.${b}`, team: 'T1',
          status: done ? 'done' : 'open', best: 5, factor: 1.5, deps: [], assign: ['M1'],
          ...(done ? { completedAt: '2026-04-14', completedStart: '2026-04-01', completedEnd: '2026-04-14' } : {}),
        });
      }
    }
  });
  return tree;
}

const small = [
  { id: 'P1', name: 'Root', status: 'wip' },
  { id: 'P1.1', name: 'Parent', status: 'wip' },
  { id: 'P1.1.1', name: 'Leaf A', status: 'done' },
  { id: 'P1.1.2', name: 'Leaf B', status: 'open' },
  { id: 'P1.2', name: 'Lone leaf', status: 'open' },
];

describe('tree index', () => {
  test('classifies leaves, children and descendants', () => {
    expect(leafNodes(small).map(n => n.id)).toEqual(['P1.1.1', 'P1.1.2', 'P1.2']);
    expect(isLeafNode(small, 'P1.2')).toBe(true);
    expect(isLeafNode(small, 'P1.1')).toBe(false);
    expect(hasChildren(small, 'P1')).toBe(true);
    expect(directChildren(small, 'P1').map(n => n.id)).toEqual(['P1.1', 'P1.2']);
    expect(descendantLeaves(small, 'P1').map(n => n.id)).toEqual(['P1.1.1', 'P1.1.2', 'P1.2']);
    // Strictly below: a leaf has no descendant leaves of its own...
    expect(descendantLeaves(small, 'P1.2')).toEqual([]);
    // ...but resolving a leaf to leaf ids yields itself.
    expect(resolveToLeafIds(small, 'P1.2')).toEqual(['P1.2']);
    expect(resolveToLeafIds(small, 'P1.1')).toEqual(['P1.1.1', 'P1.1.2']);
  });

  test('an id the tree does not contain counts as a leaf and resolves to nothing', () => {
    expect(isLeafNode(small, 'ghost')).toBe(true);
    expect(resolveToLeafIds(small, 'ghost')).toEqual([]);
    expect(directChildren(small, 'ghost')).toEqual([]);
  });

  test('handles an empty tree without allocating an index', () => {
    expect(leafNodes([])).toEqual([]);
    // Nothing claims P1 as a parent, so it is a leaf — same as before the index.
    expect(isLeafNode([], 'P1')).toBe(true);
    expect(treeIndex([])).toBe(treeIndex([]));
  });

  test('caches per tree identity, and a changed tree gets a fresh index', () => {
    const idx = treeIndex(small);
    expect(treeIndex(small)).toBe(idx);
    // Repeated calls hand back the same arrays — that is what keeps callers
    // that ask once per rendered row from being quadratic.
    expect(leafNodes(small)).toBe(leafNodes(small));
    expect(descendantLeaves(small, 'P1')).toBe(descendantLeaves(small, 'P1'));

    // Every mutation in the app produces a new array, so the index cannot go
    // stale: a new array is a new index.
    const grown = [...small, { id: 'P1.2.1', name: 'New child', status: 'open' }];
    expect(treeIndex(grown)).not.toBe(idx);
    expect(isLeafNode(grown, 'P1.2')).toBe(false);
    expect(isLeafNode(small, 'P1.2')).toBe(true);
  });
});

// Guard rail, not a benchmark. Before the index, treeStats rebuilt the whole
// leaf list once per parent node (O(n³)) and the roadmap model resolved leaves
// per node the same way: together ~1.5 s for the tree below, which is what made
// every edit on a real plan feel like a hang. The budget is ~50× the measured
// cost so a slow CI box passes, while a return of that pattern fails loudly.
describe('derive cost on a real-sized plan', () => {
  test('treeStats and the roadmap model stay far below a perceptible delay', () => {
    const tree = bigTree();
    expect(tree.length).toBeGreaterThan(240);

    const t0 = performance.now();
    const stats = treeStats(tree);
    computeRoadmapModel({ tree, scheduled: [], stats });
    const elapsed = performance.now() - t0;

    expect(stats.F1._leafCount).toBe(25);
    expect(elapsed).toBeLessThan(300);
  });
});
