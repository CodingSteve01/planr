// A multi-selection moves as a block. Reported: with several rows selected
// only the one clicked last moved.
import { describe, expect, it } from 'vitest';
import { applyTreeCommandMany, canTreeCommandMany, placeManyAmongSiblings, selectionRoots } from '../treeMove.js';
import { sortTree } from '../treeEdit.js';

const T = (...ids) => ids.map(id => ({ id, name: id }));
const order = tree => sortTree(tree).map(r => r.id);
const names = tree => sortTree(tree).map(r => r.name);
const run = (tree, ids, cmd) => applyTreeCommandMany(tree, ids, cmd, order(tree));

describe('selectionRoots', () => {
  it('drops rows whose ancestor is selected too', () => {
    const tree = T('P1', 'P1.1', 'P1.2', 'P2');
    expect(selectionRoots(['P1', 'P1.2', 'P2'], order(tree))).toEqual(['P1', 'P2']);
  });
});

describe('moving a selection', () => {
  const tree = T('P1', 'P1.1', 'P1.2', 'P1.3', 'P1.4');

  it('moves a block up together, keeping its order', () => {
    const res = run(tree, ['P1.3', 'P1.4'], 'moveUp');
    expect(names(res.tree)).toEqual(['P1', 'P1.1', 'P1.3', 'P1.4', 'P1.2']);
  });

  it('moves a block down together, keeping its order', () => {
    const res = run(tree, ['P1.1', 'P1.2'], 'moveDown');
    expect(names(res.tree)).toEqual(['P1', 'P1.3', 'P1.1', 'P1.2', 'P1.4']);
  });

  it('moves scattered rows one step each', () => {
    const res = run(tree, ['P1.2', 'P1.4'], 'moveUp');
    expect(names(res.tree)).toEqual(['P1', 'P1.2', 'P1.1', 'P1.4', 'P1.3']);
  });

  it('keeps a block whole when it hits the top', () => {
    expect(run(tree, ['P1.1', 'P1.2'], 'moveUp')).toBeNull();
    expect(canTreeCommandMany(tree, order(tree), ['P1.1', 'P1.2'], 'moveUp')).toBe(false);
  });

  it('takes a block to either end in its own order', () => {
    expect(names(run(tree, ['P1.3', 'P1.4'], 'moveFirst').tree)).toEqual(['P1', 'P1.3', 'P1.4', 'P1.1', 'P1.2']);
    expect(names(run(tree, ['P1.1', 'P1.2'], 'moveLast').tree)).toEqual(['P1', 'P1.3', 'P1.4', 'P1.1', 'P1.2']);
  });

  it('indents a block under the row above it, in order, and says where it went', () => {
    const res = run(tree, ['P1.2', 'P1.3'], 'indent');
    // P1.2 and P1.3 become children of P1.1; P1.4 renumbers to P1.2.
    const byName = Object.fromEntries(res.tree.map(r => [r.name, r.id]));
    expect(byName['P1.2']).toBe('P1.1.1');
    expect(byName['P1.3']).toBe('P1.1.2');
    expect(res.ids).toEqual(['P1.1.1', 'P1.1.2']);
  });

  it('does not tuck a block under its own first row when that one cannot indent', () => {
    expect(run(tree, ['P1.1', 'P1.2'], 'indent')).toBeNull();
  });

  it('outdents a block to right after its parent, in order', () => {
    const nested = T('P1', 'P1.1', 'P1.1.1', 'P1.1.2', 'P1.2');
    const res = run(nested, ['P1.1.1', 'P1.1.2'], 'outdent');
    expect(names(res.tree)).toEqual(['P1', 'P1.1', 'P1.1.1', 'P1.1.2', 'P1.2']);
    const parent = id => res.tree.find(r => r.name === id).id.split('.').slice(0, -1).join('.');
    expect(parent('P1.1.1')).toBe('P1');
    expect(parent('P1.1.2')).toBe('P1');
  });

  it('carries a selected child along with its selected parent, not on its own', () => {
    const t2 = T('P1', 'P1.1', 'P1.2', 'P1.2.1', 'P1.3');
    const res = run(t2, ['P1.2', 'P1.2.1'], 'moveUp');
    expect(names(res.tree)).toEqual(['P1', 'P1.2', 'P1.2.1', 'P1.1', 'P1.3']);
  });
});

describe('dropping a selection', () => {
  it('lands the block next to the target in its own order', () => {
    const tree = T('P1', 'P1.1', 'P1.2', 'P1.3', 'P1.4');
    const next = placeManyAmongSiblings(tree, ['P1.1', 'P1.3'], { targetId: 'P1.4', position: 'after' });
    expect(names(next)).toEqual(['P1', 'P1.2', 'P1.4', 'P1.1', 'P1.3']);
  });

  it('leaves selected rows under another parent alone', () => {
    const tree = T('P1', 'P1.1', 'P1.2', 'P2', 'P2.1');
    const next = placeManyAmongSiblings(tree, ['P1.1', 'P2.1'], { targetId: 'P1.2', position: 'after' });
    expect(names(next)).toEqual(['P1', 'P1.2', 'P1.1', 'P2', 'P2.1']);
  });
});
