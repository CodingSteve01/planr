import { describe, expect, test } from 'vitest';
import { buildThreadStructure } from '../threads.js';

function item(id, extra = {}) {
  return { id, name: id, status: 'open', deps: [], softDeps: [], ...extra };
}

function threadSets(threads) {
  return threads.map(t => [...t.ids].sort());
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
});
