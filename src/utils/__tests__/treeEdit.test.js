import { describe, it, expect } from 'vitest';
import {
  sortTree,
  filterCollapsedRows,
  siblingsOf,
  indentTarget,
  outdentTarget,
  moveStep,
  nextStatus,
  resolveSize,
  fieldPatchForKey,
  parsePastedRows,
  buildPasteNodes,
} from '../treeEdit.js';

const mk = (id, extra = {}) => ({ id, name: id, status: 'open', best: 0, factor: 1.5, prio: 2, deps: [], assign: [], ...extra });

describe('treeEdit — sortTree / filterCollapsedRows', () => {
  it('sorts parent-then-children, honouring displayOrder over id order', () => {
    const tree = [
      mk('P1'), mk('P1.2', { displayOrder: 1 }), mk('P1.1', { displayOrder: 2 }),
    ];
    const order = sortTree(tree).map(r => r.id);
    expect(order).toEqual(['P1', 'P1.2', 'P1.1']);
  });

  it('falls back to the numeric id suffix when displayOrder is absent', () => {
    const tree = [mk('P1'), mk('P1.10'), mk('P1.2')];
    const order = sortTree(tree).map(r => r.id);
    expect(order).toEqual(['P1', 'P1.2', 'P1.10']);
  });

  it('drops rows with a collapsed ancestor', () => {
    const rows = [mk('P1'), mk('P1.1'), mk('P1.1.1'), mk('P1.2')];
    const visible = filterCollapsedRows(rows, new Set(['P1.1'])).map(r => r.id);
    expect(visible).toEqual(['P1', 'P1.1', 'P1.2']);
  });

  it('returns the same rows when nothing is collapsed', () => {
    const rows = [mk('P1'), mk('P1.1')];
    expect(filterCollapsedRows(rows, new Set())).toBe(rows);
  });
});

describe('treeEdit — Tab / ⇧Tab (indent / outdent)', () => {
  it('indenting the first child is a no-op', () => {
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    expect(indentTarget(tree, 'P1.1')).toBeNull();
  });

  it('indents under the immediately preceding sibling', () => {
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2'), mk('P1.3')];
    expect(indentTarget(tree, 'P1.2')).toBe('P1.1');
    expect(indentTarget(tree, 'P1.3')).toBe('P1.2');
  });

  it('indent respects displayOrder, not just id suffix', () => {
    const tree = [mk('P1'), mk('P1.1', { displayOrder: 2 }), mk('P1.2', { displayOrder: 1 })];
    // In display order: P1.2 (1st), P1.1 (2nd) — indenting P1.1 nests it under P1.2.
    expect(indentTarget(tree, 'P1.1')).toBe('P1.2');
  });

  it('outdenting a root is a no-op', () => {
    expect(outdentTarget('P1')).toBeNull();
  });

  it('outdents to the parent of the parent', () => {
    expect(outdentTarget('P1.2.3')).toBe('P1');
  });

  it('outdenting a top-level child returns the empty (top-level) parent', () => {
    expect(outdentTarget('P1.2')).toBe('');
  });
});

describe('treeEdit — ⌥↑ / ⌥↓ (move within order)', () => {
  it('⌥↓ on the last sibling is a no-op', () => {
    const tree = [mk('P1.1'), mk('P1.2')];
    expect(moveStep(tree, 'P1.2', 'down')).toBeNull();
  });

  it('⌥↑ on the first sibling is a no-op', () => {
    const tree = [mk('P1.1'), mk('P1.2')];
    expect(moveStep(tree, 'P1.1', 'up')).toBeNull();
  });

  it('a sole sibling (no others in its group) is always a no-op', () => {
    const tree = [mk('P1.1')];
    expect(moveStep(tree, 'P1.1', 'up')).toBeNull();
    expect(moveStep(tree, 'P1.1', 'down')).toBeNull();
  });

  it('moves within bounds return the direction unchanged', () => {
    const tree = [mk('P1.1'), mk('P1.2'), mk('P1.3')];
    expect(moveStep(tree, 'P1.2', 'up')).toBe('up');
    expect(moveStep(tree, 'P1.2', 'down')).toBe('down');
  });

  it('root items only group with siblings sharing their letter prefix', () => {
    const tree = [mk('P1'), mk('P2'), mk('G1')];
    // G1 is alone in its "G" group, so it can't move even though P2 exists.
    expect(moveStep(tree, 'G1', 'down')).toBeNull();
    expect(moveStep(tree, 'P1', 'down')).toBe('down');
  });
});

describe('treeEdit — field shortcuts', () => {
  it('status cycles open -> wip -> done -> open', () => {
    expect(nextStatus('open')).toBe('wip');
    expect(nextStatus('wip')).toBe('done');
    expect(nextStatus('done')).toBe('open');
    expect(nextStatus(undefined)).toBe('wip');
  });

  it('resolveSize matches a default size case-insensitively', () => {
    expect(resolveSize([], 's')).toEqual({ best: 3, factor: 1.3 });
    expect(resolveSize(null, 'M')).toEqual({ best: 7, factor: 1.4 });
  });

  it('resolveSize returns null when the project (or defaults) define no such size', () => {
    // Default catalogue has no plain "X" label (only XS/XL/XXL).
    expect(resolveSize([], 'X')).toBeNull();
    // A project with a custom, narrower catalogue that defines no "S".
    expect(resolveSize([{ label: 'M', days: 5, factor: 1.4 }], 'S')).toBeNull();
  });

  it('fieldPatchForKey maps 1-4 to priority, skipping a no-op', () => {
    expect(fieldPatchForKey(mk('P1.1', { prio: 3 }), '2')).toEqual({ prio: 2 });
    expect(fieldPatchForKey(mk('P1.1', { prio: 2 }), '2')).toBeNull();
  });

  it('fieldPatchForKey maps a size letter to {best, factor}', () => {
    expect(fieldPatchForKey(mk('P1.1'), 'L', [])).toEqual({ best: 15, factor: 1.5 });
    expect(fieldPatchForKey(mk('P1.1'), 'X', [])).toBeNull();
  });

  it('fieldPatchForKey maps space to the next status', () => {
    expect(fieldPatchForKey(mk('P1.1', { status: 'open' }), ' ')).toEqual({ status: 'wip' });
  });
});

describe('treeEdit — parsePastedRows', () => {
  it('creates one row per non-empty line', () => {
    const rows = parsePastedRows('First\nSecond\nThird');
    expect(rows).toEqual([
      { name: 'First', depth: 0 },
      { name: 'Second', depth: 0 },
      { name: 'Third', depth: 0 },
    ]);
  });

  it('drops blank lines', () => {
    const rows = parsePastedRows('First\n\n  \nSecond');
    expect(rows.map(r => r.name)).toEqual(['First', 'Second']);
  });

  it('strips a single leading bullet marker', () => {
    const rows = parsePastedRows('- First\n* Second\n• Third');
    expect(rows.map(r => r.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('reads mixed indentation as nesting relative to the first line, clamped to +1 level', () => {
    const text = [
      'Parent',
      '  Child A',
      '    Grandchild',
      '  Child B',
      'NoIndentSibling',
    ].join('\n');
    expect(parsePastedRows(text)).toEqual([
      { name: 'Parent', depth: 0 },
      { name: 'Child A', depth: 1 },
      { name: 'Grandchild', depth: 2 },
      { name: 'Child B', depth: 1 },
      { name: 'NoIndentSibling', depth: 0 },
    ]);
  });

  it('a jump of several indent levels at once is clamped to one level deeper', () => {
    const text = 'Top\n      DeepJump';
    expect(parsePastedRows(text)).toEqual([
      { name: 'Top', depth: 0 },
      { name: 'DeepJump', depth: 1 },
    ]);
  });

  it('tabs count as one indent level each', () => {
    const text = 'Top\n\tChild\n\t\tGrandchild';
    expect(parsePastedRows(text)).toEqual([
      { name: 'Top', depth: 0 },
      { name: 'Child', depth: 1 },
      { name: 'Grandchild', depth: 2 },
    ]);
  });

  it('the first non-blank line sets the baseline even if it is indented', () => {
    const text = '  Top\n  Sibling\n    Child';
    expect(parsePastedRows(text)).toEqual([
      { name: 'Top', depth: 0 },
      { name: 'Sibling', depth: 0 },
      { name: 'Child', depth: 1 },
    ]);
  });
});

describe('treeEdit — buildPasteNodes', () => {
  it('builds one node per row, nested per depth, under the given parent', () => {
    const tree = [mk('P1')];
    const rows = [
      { name: 'Parent', depth: 0 },
      { name: 'Child A', depth: 1 },
      { name: 'Grandchild', depth: 2 },
      { name: 'Child B', depth: 1 },
      { name: 'Sibling', depth: 0 },
    ];
    const nodes = buildPasteNodes(tree, 'P1', rows);
    expect(nodes.map(n => [n.id, n.name])).toEqual([
      ['P1.1', 'Parent'],
      ['P1.1.1', 'Child A'],
      ['P1.1.1.1', 'Grandchild'],
      ['P1.1.2', 'Child B'],
      ['P1.2', 'Sibling'],
    ]);
  });

  it('continues numbering after existing siblings', () => {
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    const nodes = buildPasteNodes(tree, 'P1', [{ name: 'Third', depth: 0 }, { name: 'Fourth', depth: 0 }]);
    expect(nodes.map(n => n.id)).toEqual(['P1.3', 'P1.4']);
  });

  it('builds top-level nodes when parentIdVal is empty', () => {
    const tree = [mk('P1')];
    const nodes = buildPasteNodes(tree, '', [{ name: 'New root', depth: 0 }]);
    expect(nodes[0].id).toBe('P2');
    expect(nodes[0].lvl).toBe(1);
  });

  it('three pasted lines create three rows', () => {
    const rows = parsePastedRows('One\nTwo\nThree');
    const nodes = buildPasteNodes([mk('P1')], 'P1', rows);
    expect(nodes).toHaveLength(3);
    expect(nodes.map(n => n.name)).toEqual(['One', 'Two', 'Three']);
  });
});

describe('treeEdit — siblingsOf', () => {
  it('orders siblings by displayOrder, falling back to numeric id', () => {
    const tree = [mk('P1.1'), mk('P1.3'), mk('P1.2')];
    expect(siblingsOf(tree, 'P1.1').map(r => r.id)).toEqual(['P1.1', 'P1.2', 'P1.3']);
  });
});
