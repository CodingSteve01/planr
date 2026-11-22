import { describe, test, expect } from 'vitest';
import { rootCpm, goalCpm, criticalPathLabelMap } from '../cpm.js';

const leaf = (id, best, deps = []) => ({ id, name: id, team: 'Backend', best, factor: 1, status: 'open', deps });

// A(5) → B(3) → C(2), D(1) → C. All four leaves live under one root.
const diamondTree = () => [
  { id: 'P1', name: 'Rechnungen', best: 0 },
  leaf('P1.1', 5),
  leaf('P1.2', 3, ['P1.1']),
  leaf('P1.3', 2, ['P1.2', 'P1.4']),
  leaf('P1.4', 1),
];

describe('rootCpm()', () => {
  test('marks the long chain critical and leaves the short feeder out', () => {
    const { critical, edges, rootPaths } = rootCpm(diamondTree());
    expect([...critical].sort()).toEqual(['P1.1', 'P1.2', 'P1.3']);
    expect(critical.has('P1.4')).toBe(false);
    expect([...edges].sort()).toEqual(['P1.1->P1.2', 'P1.2->P1.3']);
    // 5 + 3 + 2 effort days; the unit is effort days (best × factor).
    expect(rootPaths.P1.chainLength).toBe(10);
    expect(rootPaths.P1.chains).toEqual([['P1.1', 'P1.2', 'P1.3']]);
  });

  test('the feeder becomes critical when it is the longer branch', () => {
    const tree = diamondTree();
    tree[4] = leaf('P1.4', 9);
    const { critical } = rootCpm(tree);
    expect([...critical].sort()).toEqual(['P1.3', 'P1.4']);
  });

  test('a finished leaf counts zero days in the chain length', () => {
    const tree = diamondTree();
    tree[1] = { ...tree[1], status: 'done' };
    const { critical, rootPaths } = rootCpm(tree);
    expect(critical.has('P1.4')).toBe(false);
    expect(rootPaths.P1.chainLength).toBe(5);
  });

  test('empty tree gives empty results', () => {
    const r = rootCpm([]);
    expect(r.critical.size).toBe(0);
    expect(r.rootPaths).toEqual({});
  });
});

describe('goalCpm()', () => {
  // Two goals with independent chains: G1 = a(2)→b(2), G2 = c(4)→d(1).
  const twoGoals = () => [
    { id: 'P1', name: 'Kundenbereich', type: 'goal', best: 0 },
    leaf('P1.1', 2),
    leaf('P1.2', 2, ['P1.1']),
    { id: 'P2', name: 'Rechnungen', type: 'goal', best: 0 },
    leaf('P2.1', 4),
    leaf('P2.2', 1, ['P2.1']),
  ];

  test('each goal marks only its own chain', () => {
    const paths = goalCpm(twoGoals());
    expect([...paths.P1.critical].sort()).toEqual(['P1.1', 'P1.2']);
    expect([...paths.P2.critical].sort()).toEqual(['P2.1', 'P2.2']);
    expect(paths.P1.chainLength).toBe(4);
    expect(paths.P2.chainLength).toBe(5);
    expect(paths.P1.name).toBe('Kundenbereich');
  });

  test('roots without a type are not goals', () => {
    const tree = twoGoals();
    delete tree[3].type;
    expect(Object.keys(goalCpm(tree))).toEqual(['P1']);
  });
});

describe('criticalPathLabelMap()', () => {
  test('numbers scopes and chains, one label per leaf', () => {
    const paths = goalCpm([
      { id: 'P1', name: 'A', type: 'goal', best: 0 },
      leaf('P1.1', 2),
      leaf('P1.2', 2, ['P1.1']),
      { id: 'P2', name: 'B', type: 'goal', best: 0 },
      leaf('P2.1', 4),
    ]);
    expect(criticalPathLabelMap(paths)).toEqual({ 'P1.1': ['CP1.1'], 'P1.2': ['CP1.1'], 'P2.1': ['CP2.1'] });
  });

  test('a leaf on two parallel chains carries both labels', () => {
    const map = criticalPathLabelMap({
      x: {
        chains: [
          ['a', 'b'],
          ['a', 'c'],
        ],
      },
    });
    expect(map.a).toEqual(['CP1.1', 'CP1.2']);
    expect(map.b).toEqual(['CP1.1']);
  });

  test('no paths → empty map', () => {
    expect(criticalPathLabelMap()).toEqual({});
  });
});
