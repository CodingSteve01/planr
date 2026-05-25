import { describe, expect, test } from 'vitest';
import { buildThreadStructure } from '../threads.js';

function item(id, extra = {}) {
  return { id, name: id, status: 'open', deps: [], softDeps: [], ...extra };
}

function threadSets(threads) {
  return threads.map(t => [...t.ids].sort());
}

function leaves(tree) {
  return tree.filter(node => !tree.some(other => other.id !== node.id && other.id.startsWith(`${node.id}.`)));
}

describe('buildThreadStructure', () => {
  test('keeps paths separate when they are connected only by soft deps', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.2', { deps: ['P1.1'] }),
      item('P2'),
      item('P2.1', { softDeps: ['P1.2'] }),
      item('P2.2', { deps: ['P2.1'] }),
    ];
    const allItems = tree.filter(n => n.id.includes('.'));

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1', 'P1.2'],
      ['P2.1', 'P2.2'],
    ]);
  });

  test('uses local soft deps to keep sibling work in one thread', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P1.1.2', { softDeps: ['P1.1.1'] }),
      item('P1.1.3', { softDeps: ['P1.1.2'] }),
    ];
    const allItems = tree.filter(n => n.id.split('.').length === 3);

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1.1', 'P1.1.2', 'P1.1.3'],
    ]);
  });

  test('groups parallel start siblings inside one coarse WBS branch', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P1.1.2'),
      item('P1.1.3'),
    ];
    const allItems = tree.filter(n => n.id.split('.').length === 3);

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1.1', 'P1.1.2', 'P1.1.3'],
    ]);
  });

  test('does not group parallel starts across coarse WBS branches', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P1.2'),
      item('P1.2.1'),
    ];
    const allItems = tree.filter(n => n.id.split('.').length === 3);

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1.1'],
      ['P1.2.1'],
    ]);
  });

  test('merges paths when they are connected by a hard dep', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.2', { deps: ['P1.1'] }),
      item('P2'),
      item('P2.1', { deps: ['P1.2'] }),
      item('P2.2', { deps: ['P2.1'] }),
    ];
    const allItems = tree.filter(n => n.id.includes('.'));

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1', 'P1.2', 'P2.1', 'P2.2'],
    ]);
  });

  test('does not merge threads through inherited parent soft deps', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.2', { deps: ['P1.1'] }),
      item('P2', { softDeps: ['P1.2'] }),
      item('P2.1'),
      item('P2.2', { deps: ['P2.1'] }),
    ];
    const allItems = tree.filter(n => n.id.includes('.'));

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1', 'P1.2'],
      ['P2.1', 'P2.2'],
    ]);
  });

  test('does merge threads through inherited parent hard deps', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.2', { deps: ['P1.1'] }),
      item('P2', { deps: ['P1.2'] }),
      item('P2.1'),
      item('P2.2', { deps: ['P2.1'] }),
    ];
    const allItems = tree.filter(n => n.id.includes('.'));

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1', 'P1.2', 'P2.1', 'P2.2'],
    ]);
  });

  test('attaches a singleton with cross-branch soft predecessor to that thread', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P1.1.2', { deps: ['P1.1.1'] }),
      item('P2'),
      item('P2.1', { softDeps: ['P1.1.2'] }),
    ];
    const allItems = leaves(tree);

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1.1', 'P1.1.2', 'P2.1'],
    ]);
  });

  test('attaches a singleton predecessor to the downstream cross-branch thread', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P2'),
      item('P2.1', { softDeps: ['P1.1.1'] }),
      item('P2.2', { deps: ['P2.1'] }),
    ];
    const allItems = leaves(tree);

    const threads = buildThreadStructure({ allItems, tree });

    expect(threadSets(threads)).toEqual([
      ['P1.1.1', 'P2.1', 'P2.2'],
    ]);
  });

  test('keeps related branch items together inside a connected thread', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P1.1.2', { deps: ['P1.1.1'] }),
      item('P2'),
      item('P2.1'),
      item('P2.1.1'),
      item('P2.1.2', { deps: ['P2.1.1', 'P1.1.2'] }),
    ];
    const allItems = [
      { ...tree.find(n => n.id === 'P1.1.1'), startWi: 0 },
      { ...tree.find(n => n.id === 'P2.1.1'), startWi: 1 },
      { ...tree.find(n => n.id === 'P1.1.2'), startWi: 10 },
      { ...tree.find(n => n.id === 'P2.1.2'), startWi: 11 },
    ];

    const [thread] = buildThreadStructure({ allItems, tree });

    expect(thread.ids).toEqual(['P1.1.1', 'P1.1.2', 'P2.1.1', 'P2.1.2']);
  });

  test('keeps dependency paths together inside the same parent branch', () => {
    const tree = [
      item('P1'),
      item('P1.1'),
      item('P1.1.1'),
      item('P1.1.2'),
      item('P1.1.3', { deps: ['P1.1.1'] }),
      item('P1.1.4', { deps: ['P1.1.3'] }),
      item('P1.1.5', { deps: ['P1.1.2'] }),
      item('P1.1.6', { deps: ['P1.1.5'] }),
      item('P1.1.7', { deps: ['P1.1.4', 'P1.1.6'] }),
    ];
    const allItems = [
      { ...tree.find(n => n.id === 'P1.1.1'), startWi: 0 },
      { ...tree.find(n => n.id === 'P1.1.2'), startWi: 1 },
      { ...tree.find(n => n.id === 'P1.1.3'), startWi: 10 },
      { ...tree.find(n => n.id === 'P1.1.5'), startWi: 11 },
      { ...tree.find(n => n.id === 'P1.1.4'), startWi: 20 },
      { ...tree.find(n => n.id === 'P1.1.6'), startWi: 21 },
      { ...tree.find(n => n.id === 'P1.1.7'), startWi: 30 },
    ];

    const [thread] = buildThreadStructure({ allItems, tree });

    expect(thread.ids).toEqual(['P1.1.1', 'P1.1.3', 'P1.1.4', 'P1.1.2', 'P1.1.5', 'P1.1.6', 'P1.1.7']);
  });
});
