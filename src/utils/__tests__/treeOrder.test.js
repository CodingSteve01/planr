// The tree's order, as a number you can compare across the whole plan.
//
// `displayOrder` counts 1..N inside each parent, so on its own it cannot say
// whether the third task of the first project comes before the first task of
// the last one — they are both just "3" and "1". The scheduler used to leave
// it out for exactly that reason and sort by priority and id instead, which is
// how the timeline came to disagree with the tree.

import { describe, test, expect } from 'vitest';
import { treeOrderRank } from '../displayOrder.js';

const order = tree => [...treeOrderRank(tree).entries()]
  .sort((a, b) => a[1] - b[1])
  .map(([id]) => id);

describe('treeOrderRank', () => {
  test('reads depth-first: a parent, then its children, then the next parent', () => {
    const tree = [
      { id: 'P1' }, { id: 'P1.1' }, { id: 'P1.2' },
      { id: 'P2' }, { id: 'P2.1' },
    ];
    expect(order(tree)).toEqual(['P1', 'P1.1', 'P1.2', 'P2', 'P2.1']);
  });

  test('follows displayOrder, not the id', () => {
    const tree = [
      { id: 'P1' },
      { id: 'P1.1', displayOrder: 3 },
      { id: 'P1.2', displayOrder: 1 },
      { id: 'P1.3', displayOrder: 2 },
    ];
    expect(order(tree)).toEqual(['P1', 'P1.2', 'P1.3', 'P1.1']);
  });

  test('sorts by number, not by string — P1.10 comes after P1.9', () => {
    const tree = [{ id: 'P1' }, { id: 'P1.9' }, { id: 'P1.10' }];
    expect(order(tree)).toEqual(['P1', 'P1.9', 'P1.10']);
  });

  test('ranks a whole subtree before the next sibling', () => {
    // The point of depth-first: moving a package moves everything under it.
    const tree = [
      { id: 'P1' }, { id: 'P1.1' }, { id: 'P1.1.1' }, { id: 'P1.1.2' }, { id: 'P1.2' },
    ];
    const rank = treeOrderRank(tree);
    expect(rank.get('P1.1.2')).toBeLessThan(rank.get('P1.2'));
  });

  test('a node whose parent is missing is a root, not a straggler', () => {
    // An orphan sorted last would quietly schedule last, which is a plan
    // change disguised as a data problem.
    const tree = [{ id: 'P1' }, { id: 'P1.1' }, { id: 'X9.4' }];
    expect(order(tree)).toContain('X9.4');
    expect(treeOrderRank(tree).size).toBe(3);
  });

  test('says nothing about a tree that is not one', () => {
    expect(treeOrderRank(null).size).toBe(0);
    expect(treeOrderRank([]).size).toBe(0);
  });
});
