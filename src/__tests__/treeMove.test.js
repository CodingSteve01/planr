// The four structural commands on a tree four levels deep, with no UI in the
// way. Reordering and re-parenting are separate commands: moveUp/moveDown
// never change the parent, indent makes the row the last child of its
// previous sibling, outdent puts it right after its old parent. A row always
// takes its whole subtree along.
//
// Assertions compare outlines (names, indented by depth, in screen order), so
// a failure reads as the tree it produced.
import { describe, it, expect } from 'vitest';
import { applyTreeCommand, canTreeCommand, planTreeCommand, moveSubtree, placeAmongSiblings, remapIds } from '../utils/treeMove.js';
import { sortTree } from '../utils/treeEdit.js';

const n = (id, name, extra = {}) => ({ id, name, status: 'open', deps: [], ...extra });

// A                  B                         C
// ├─ A1              ├─ B1                     └─ C1
// │  ├─ A1.1         │  ├─ B1.1
// │  │  ├─ A1.1.1    │  │  ├─ MoveMe
// │  │  └─ A1.1.2    │  │  │  ├─ Child
// │  └─ A1.2         │  │  │  │  └─ Grandchild
// └─ A2              │  │  │  └─ Child2
//                    │  │  └─ B1.1.2
//                    │  └─ B1.2
//                    ├─ B2
//                    └─ B3
const FIXTURE = [
  n('P1', 'A'), n('P1.1', 'A1'), n('P1.1.1', 'A1.1'), n('P1.1.1.1', 'A1.1.1'), n('P1.1.1.2', 'A1.1.2'),
  n('P1.1.2', 'A1.2'), n('P1.2', 'A2'),
  n('P2', 'B'), n('P2.1', 'B1'), n('P2.1.1', 'B1.1'),
  n('P2.1.1.1', 'MoveMe'), n('P2.1.1.1.1', 'Child'), n('P2.1.1.1.1.1', 'Grandchild'), n('P2.1.1.1.2', 'Child2'),
  n('P2.1.1.2', 'B1.1.2'), n('P2.1.2', 'B1.2'), n('P2.2', 'B2'), n('P2.3', 'B3'),
  n('P3', 'C'), n('P3.1', 'C1'),
];

const depth = id => id.split('.').length;
const outline = tree => sortTree(tree).map(r => '  '.repeat(depth(r.id) - 1) + r.name).join('\n');
const idOf = (tree, name) => tree.find(r => r.name === name)?.id;
const byName = (tree, name) => tree.find(r => r.name === name);

// The MoveMe subtree, relative to MoveMe itself — what must survive every move.
function subtreeShape(tree) {
  const root = idOf(tree, 'MoveMe');
  return sortTree(tree)
    .filter(r => r.id === root || r.id.startsWith(root + '.'))
    .map(r => '  '.repeat(depth(r.id) - depth(root)) + r.name)
    .join('\n');
}
const SHAPE = ['MoveMe', '  Child', '    Grandchild', '  Child2'].join('\n');

// Runs a command on MoveMe and hands back the tree and MoveMe's new id.
function run(tree, command) {
  const res = applyTreeCommand(tree, idOf(tree, 'MoveMe'), command);
  expect(res, `${command} was expected to run`).not.toBeNull();
  return res;
}
const can = (tree, command) => canTreeCommand(sortTree(tree).map(r => r.id), idOf(tree, 'MoveMe'), command);

describe('move up / move down', () => {
  it('moves MoveMe down within B1.1, and back up again', () => {
    const down = run(FIXTURE, 'moveDown');
    expect(outline(down.tree)).toContain(['      B1.1.2', '      MoveMe'].join('\n'));
    const up = run(down.tree, 'moveUp');
    expect(outline(up.tree)).toContain(['      MoveMe', '        Child'].join('\n'));
    expect(outline(up.tree).indexOf('MoveMe')).toBeLessThan(outline(up.tree).indexOf('B1.1.2'));
  });

  it('never changes the parent, and keeps the id', () => {
    const down = run(FIXTURE, 'moveDown');
    expect(down.id).toBe('P2.1.1.1');
    expect(down.idMap).toEqual({});
  });

  it('is disabled for the first sibling — no jump into the previous branch', () => {
    expect(can(FIXTURE, 'moveUp')).toBe(false);
    expect(applyTreeCommand(FIXTURE, 'P2.1.1.1', 'moveUp')).toBeNull();
  });

  it('is disabled for the last sibling — no jump out of the branch', () => {
    const down = run(FIXTURE, 'moveDown');
    expect(can(down.tree, 'moveDown')).toBe(false);
  });

  it('moves among the siblings the user can see, stepping over hidden ones', () => {
    // B2 hidden (a finished task, say): B1 → down lands after B3 in one press.
    const visible = sortTree(FIXTURE).map(r => r.id).filter(id => id !== 'P2.2');
    const res = applyTreeCommand(FIXTURE, 'P2.1', 'moveDown', visible);
    const tops = sortTree(res.tree).filter(r => depth(r.id) === 2 && r.id.startsWith('P2.')).map(r => r.name);
    expect(tops).toEqual(['B2', 'B3', 'B1']);
  });

  it('reorders top-level rows too', () => {
    const res = applyTreeCommand(FIXTURE, 'P3', 'moveUp');
    expect(sortTree(res.tree).filter(r => depth(r.id) === 1).map(r => r.name)).toEqual(['A', 'C', 'B']);
  });
});

describe('indent', () => {
  it('makes the row the last child of its previous sibling', () => {
    const down = run(FIXTURE, 'moveDown');            // B1.1: B1.1.2, MoveMe
    const res = run(down.tree, 'indent');
    expect(outline(res.tree)).toContain([
      '      B1.1.2',
      '        MoveMe',
      '          Child',
      '            Grandchild',
      '          Child2',
    ].join('\n'));
    expect(res.id).toBe('P2.1.1.2.1');
  });

  it('appends after the children the previous sibling already has', () => {
    // B2 under B1, which already holds B1.1 and B1.2.
    const res = applyTreeCommand(FIXTURE, 'P2.2', 'indent');
    const kids = sortTree(res.tree).filter(r => depth(r.id) === 3 && r.id.startsWith('P2.1.')).map(r => r.name);
    expect(kids).toEqual(['B1.1', 'B1.2', 'B2']);
  });

  it('lands last even when the new siblings carry a displayOrder and the row carries a stale one', () => {
    let tree = applyTreeCommand(FIXTURE, 'P2.1.2', 'moveUp').tree;   // B1: B1.2, B1.1 — displayOrder written
    tree = tree.map(r => (r.id === 'P2.2' ? { ...r, displayOrder: 1 } : r));
    const res = applyTreeCommand(tree, 'P2.2', 'indent');
    const kids = sortTree(res.tree).filter(r => depth(r.id) === 3 && r.id.startsWith('P2.1.')).map(r => r.name);
    expect(kids).toEqual(['B1.2', 'B1.1', 'B2']);
  });

  it('is disabled for the first sibling', () => {
    expect(can(FIXTURE, 'indent')).toBe(false);
    expect(planTreeCommand(sortTree(FIXTURE).map(r => r.id), 'P2.1', 'indent')).toBeNull();
  });
});

describe('outdent', () => {
  it('goes from depth 4 to depth 3, immediately after the old parent', () => {
    const res = run(FIXTURE, 'outdent');
    expect(outline(res.tree)).toContain([
      '    B1.1',
      '      B1.1.2',
      '    MoveMe',
      '      Child',
      '        Grandchild',
      '      Child2',
      '    B1.2',
    ].join('\n'));
    expect(depth(res.id)).toBe(3);
  });

  it('walks all the way out to the top level, one level per press', () => {
    let tree = FIXTURE;
    const trail = [];
    while (can(tree, 'outdent')) {
      const res = run(tree, 'outdent');
      tree = res.tree;
      trail.push(depth(res.id));
    }
    expect(trail).toEqual([3, 2, 1]);
    // After the old ancestor each time: B1.1 → B1 → B, so MoveMe ends up
    // between B and C.
    expect(sortTree(tree).filter(r => depth(r.id) === 1).map(r => r.name)).toEqual(['A', 'B', 'MoveMe', 'C']);
  });

  it('is disabled at the top level', () => {
    expect(canTreeCommand(sortTree(FIXTURE).map(r => r.id), 'P3', 'outdent')).toBe(false);
  });
});

describe('every command', () => {
  const SEQUENCES = {
    'down, indent': ['moveDown', 'indent'],
    'outdent ×3': ['outdent', 'outdent', 'outdent'],
    'outdent, up, down, indent': ['outdent', 'moveUp', 'moveDown', 'indent'],
    'down, up': ['moveDown', 'moveUp'],
  };

  Object.entries(SEQUENCES).forEach(([label, cmds]) => {
    it(`keeps the MoveMe subtree intact and follows MoveMe: ${label}`, () => {
      let tree = FIXTURE;
      let id = 'P2.1.1.1';
      cmds.forEach(cmd => {
        const res = applyTreeCommand(tree, id, cmd);
        expect(res, `${cmd} from ${id}`).not.toBeNull();
        tree = res.tree;
        id = res.id;
        // The returned id IS MoveMe — this is what selection follows.
        expect(byName(tree, 'MoveMe').id).toBe(id);
        expect(subtreeShape(tree)).toBe(SHAPE);
        // Nothing gained, nothing lost, nothing doubled.
        expect(tree).toHaveLength(FIXTURE.length);
        expect(new Set(tree.map(r => r.id)).size).toBe(FIXTURE.length);
        // Every row's parent exists.
        const ids = new Set(tree.map(r => r.id));
        tree.forEach(r => {
          const p = r.id.split('.').slice(0, -1).join('.');
          if (p) expect(ids.has(p), `${r.name} lost its parent ${p}`).toBe(true);
        });
      });
    });
  });

  it('remaps dependencies that point into the moved subtree', () => {
    const tree = FIXTURE.map(r => (r.name === 'C1' ? { ...r, deps: ['P2.1.1.1.1.1'], _depLabels: { 'P2.1.1.1.1.1': 'grand' } } : r));
    const res = applyTreeCommand(tree, 'P2.1.1.1', 'outdent');
    const c1 = byName(res.tree, 'C1');
    const grand = byName(res.tree, 'Grandchild').id;
    expect(c1.deps).toEqual([grand]);
    expect(c1._depLabels).toEqual({ [grand]: 'grand' });
  });

  it('is deterministic', () => {
    const a = applyTreeCommand(FIXTURE, 'P2.1.1.1', 'outdent');
    const b = applyTreeCommand(FIXTURE, 'P2.1.1.1', 'outdent');
    expect(a).toEqual(b);
  });

  it('refuses an unknown command and an unknown row', () => {
    expect(applyTreeCommand(FIXTURE, 'P2.1.1.1', 'sideways')).toBeNull();
    expect(applyTreeCommand(FIXTURE, 'P9', 'moveUp')).toBeNull();
  });
});

describe('the primitives', () => {
  it('moveSubtree refuses a move into the row itself or its own subtree', () => {
    expect(moveSubtree(FIXTURE, 'P2.1', 'P2.1')).toBeNull();
    expect(moveSubtree(FIXTURE, 'P2.1', 'P2.1.1')).toBeNull();
    expect(moveSubtree(FIXTURE, 'P2.1', 'P2')).toBeNull();   // already there
  });

  it('placeAmongSiblings reports a no-op as null', () => {
    expect(placeAmongSiblings(FIXTURE, 'P2.1', 'first')).toBeNull();
  });

  it('remapIds carries fold state across a re-parent', () => {
    const { idMap } = applyTreeCommand(FIXTURE, 'P2.1.1.1', 'outdent');
    const folded = remapIds(new Set(['P2.1.1.1.1', 'P1']), idMap);
    expect(folded).toEqual(new Set([idMap['P2.1.1.1.1'], 'P1']));
  });
});

// Decided against the rows on SCREEN. With finished tasks hidden, an archived
// project, a collapsed branch, the row above you in the data is not the row
// above you on screen — a move against the data swapped with something
// invisible and looked like a dead key; an indent landed under a row nobody
// could see.
describe('planning against what is visible', () => {
  // On screen: P1.1, P1.4, P1.7 — P1.2, P1.3, P1.5, P1.6 are filtered out.
  const visible = ['P1', 'P1.1', 'P1.4', 'P1.7', 'P2'];
  const plan = (id, cmd, ids = visible) => planTreeCommand(ids, id, cmd);

  it('steps to the next VISIBLE sibling, not the next one in the data', () => {
    expect(plan('P1.1', 'moveDown').place).toEqual({ targetId: 'P1.4', position: 'after' });
    expect(plan('P1.7', 'moveUp').place).toEqual({ targetId: 'P1.4', position: 'before' });
  });

  it('goes all the way to either end in one press', () => {
    expect(plan('P1.7', 'moveFirst').place).toEqual({ targetId: 'P1.1', position: 'before' });
    expect(plan('P1.1', 'moveLast').place).toEqual({ targetId: 'P1.7', position: 'after' });
    expect(plan('P1.1', 'moveFirst')).toBeNull();
    expect(plan('P1.7', 'moveLast')).toBeNull();
  });

  it('never crosses into another branch', () => {
    // P2 follows P1.7 on screen but is not its sibling.
    expect(plan('P1.7', 'moveDown')).toBeNull();
    expect(plan('P1', 'moveDown').place).toEqual({ targetId: 'P2', position: 'after' });
  });

  it('indents under the preceding VISIBLE sibling', () => {
    expect(plan('P1.4', 'indent')).toEqual({ parentId: 'P1.1', place: 'last' });
    // P2's preceding sibling is the root P1 — not P1.7, which only sits
    // above it on screen.
    expect(plan('P2', 'indent').parentId).toBe('P1');
    expect(plan('P2', 'indent', ['P2', 'P2.1'])).toBeNull();
  });

  it('groups by exact parent, not by id prefix', () => {
    // "P1.1" is a prefix of "P1.10" — these are not siblings.
    const deep = ['P1.1.1', 'P1.1.2', 'P1.10.1'];
    expect(plan('P1.1.1', 'moveLast', deep).place).toEqual({ targetId: 'P1.1.2', position: 'after' });
    expect(plan('P1.10.1', 'moveUp', deep)).toBeNull();
    expect(plan('P1.10.1', 'indent', deep)).toBeNull();
  });

  it('does nothing for a row that is not on screen', () => {
    expect(plan('P1.2', 'moveDown')).toBeNull();
  });

  it('outdents anything below the top level, and nothing at it', () => {
    expect(plan('P1.4', 'outdent')).toEqual({ parentId: '', place: { targetId: 'P1', position: 'after' } });
    expect(plan('P1', 'outdent')).toBeNull();
  });
});
