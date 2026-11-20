// Dropping rows in the tree. The drag used to reorder among siblings only;
// dropping onto another package's rows did nothing. It now puts rows next to
// any row, or into a package, taking subtrees and dependencies along.
import { describe, expect, it } from 'vitest';
import { dropRows } from '../treeMove.js';
import { sortTree } from '../treeEdit.js';

const T = (...ids) => ids.map(id => ({ id, name: id }));
const order = tree => sortTree(tree).map(r => r.id);
const names = tree => sortTree(tree).map(r => r.name);
const drop = (tree, ids, targetId, position) => dropRows(tree, ids, { targetId, position }, order(tree));

describe('dropRows', () => {
  const tree = T('P1', 'P1.1', 'P1.2', 'P1.3', 'P2', 'P2.1', 'P2.2');

  it('reorders among siblings, before or after', () => {
    expect(names(drop(tree, ['P1.3'], 'P1.1', 'before').tree)).toEqual(['P1', 'P1.3', 'P1.1', 'P1.2', 'P2', 'P2.1', 'P2.2']);
    expect(names(drop(tree, ['P1.1'], 'P1.3', 'after').tree)).toEqual(['P1', 'P1.2', 'P1.3', 'P1.1', 'P2', 'P2.1', 'P2.2']);
  });

  it('moves a row next to a row of another package', () => {
    const res = drop(tree, ['P1.2'], 'P2.1', 'after');
    expect(names(res.tree)).toEqual(['P1', 'P1.1', 'P1.3', 'P2', 'P2.1', 'P1.2', 'P2.2']);
    expect(res.ids).toEqual(['P2.3']);   // renumbered under its new parent
  });

  it('puts a row into a package, as its last child', () => {
    const res = drop(tree, ['P1.1'], 'P2', 'inside');
    expect(names(res.tree)).toEqual(['P1', 'P1.2', 'P1.3', 'P2', 'P2.1', 'P2.2', 'P1.1']);
  });

  it('moves a selection as a block, in screen order, whatever order it was picked in', () => {
    const res = drop(tree, ['P1.3', 'P1.1'], 'P2.2', 'before');
    expect(names(res.tree)).toEqual(['P1', 'P1.2', 'P2', 'P2.1', 'P1.1', 'P1.3', 'P2.2']);
    expect(res.ids).toHaveLength(2);
  });

  it('takes the subtree along and remaps dependencies on it', () => {
    const deep = [
      ...T('P1', 'P1.1', 'P1.1.1', 'P2'),
      { id: 'P2.1', name: 'P2.1', deps: ['P1.1.1'] },
    ];
    const res = drop(deep, ['P1.1'], 'P2.1', 'before');
    const moved = res.tree.find(r => r.name === 'P1.1.1');
    expect(moved.id.startsWith(res.ids[0] + '.')).toBe(true);
    expect(res.tree.find(r => r.name === 'P2.1').deps).toEqual([moved.id]);
  });

  it('refuses a drop into the dragged row itself or its own subtree', () => {
    expect(drop(tree, ['P1'], 'P1.2', 'before')).toBeNull();
    expect(drop(tree, ['P1'], 'P1', 'inside')).toBeNull();
  });

  it('refuses a drop that would change nothing', () => {
    expect(drop(tree, ['P1.1'], 'P1.2', 'before')).toBeNull();
  });
});
