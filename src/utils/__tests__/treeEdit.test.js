import { describe, it, expect } from 'vitest';
import {
  sortTree,
  compareSiblings,
  filterCollapsedRows,
  siblingsOf,
  indentTarget,
  outdentTarget,
  moveStep,
  visibleSiblingTarget,
  visibleIndentTarget,
  scrollAdjustment,
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

  it('fieldPatchForKey maps space to the next status, with the dates that go with it', () => {
    // Not just `{ status }`. Moving a task to wip or done also stamps the
    // actual start/end and progress — that is what the Soll/Ist comparison
    // reads. The QuickEdit dropdown always did this; Space did not, so a
    // task cycled with the keyboard left a hole in the comparison.
    const patch = fieldPatchForKey(mk('P1.1', { status: 'open' }), ' ');
    expect(patch.status).toBe('wip');
    expect(patch.progress).toBe(50);
    expect(patch.completedStart, 'no Ist-start stamped').toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const done = fieldPatchForKey(mk('P1.1', { status: 'wip', completedStart: '2026-01-05' }), ' ');
    expect(done.status).toBe('done');
    expect(done.progress).toBe(100);
    // An existing Ist-start is kept, not overwritten with today.
    expect(done.completedStart).toBe('2026-01-05');
    expect(done.completedEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Cycling back to open clears the progress rather than leaving 100.
    expect(fieldPatchForKey(mk('P1.1', { status: 'done' }), ' '))
      .toEqual({ status: 'open', progress: 0 });
  });

  it('fieldPatchForKey is still a no-op when the status would not change', () => {
    expect(fieldPatchForKey(mk('P1.1', { status: 'open' }), 'Z')).toBeNull();
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

// ── visibleSiblingTarget ──────────────────────────────────────────────────
// The reported symptom: "moving stumbles over already-finished tasks". With
// `hideDone` on, or an archived project, or a collapsed branch, the row above
// you in the DATA is not the row above you on SCREEN — so a move swapped with
// something invisible and looked like a dead key.
describe('visibleSiblingTarget', () => {
  // On screen: P1.1, P1.4, P1.7 — the rest are filtered out (done/archived).
  const visible = ['P1', 'P1.1', 'P1.4', 'P1.7', 'P2'];

  it('steps to the next VISIBLE sibling, not the next one in the data', () => {
    expect(visibleSiblingTarget(visible, 'P1.1', 'down'))
      .toEqual({ targetId: 'P1.4', position: 'after' });
    expect(visibleSiblingTarget(visible, 'P1.7', 'up'))
      .toEqual({ targetId: 'P1.4', position: 'before' });
  });

  it('goes all the way to either end in one press', () => {
    expect(visibleSiblingTarget(visible, 'P1.7', 'first'))
      .toEqual({ targetId: 'P1.1', position: 'before' });
    expect(visibleSiblingTarget(visible, 'P1.1', 'last'))
      .toEqual({ targetId: 'P1.7', position: 'after' });
  });

  it('returns null at the ends rather than a no-op move', () => {
    expect(visibleSiblingTarget(visible, 'P1.1', 'up')).toBeNull();
    expect(visibleSiblingTarget(visible, 'P1.7', 'down')).toBeNull();
    expect(visibleSiblingTarget(visible, 'P1.1', 'first')).toBeNull();
    expect(visibleSiblingTarget(visible, 'P1.7', 'last')).toBeNull();
  });

  it('never crosses into another branch', () => {
    // P1.7 is the last visible child of P1; P2 follows it on screen but is
    // not its sibling. Moving down must stop, not reparent by accident.
    expect(visibleSiblingTarget(visible, 'P1.7', 'down')).toBeNull();
    // And a root moves among roots only.
    expect(visibleSiblingTarget(visible, 'P1', 'down'))
      .toEqual({ targetId: 'P2', position: 'after' });
  });

  it('is a no-op for an only child or a row that is not on screen', () => {
    expect(visibleSiblingTarget(['P1', 'P1.1'], 'P1.1', 'down')).toBeNull();
    expect(visibleSiblingTarget(visible, 'P1.2', 'down')).toBeNull();
  });

  it('handles deep nesting by exact parent, not by prefix', () => {
    // P1.1.1 and P1.10.1 share the prefix "P1.1" — grouping by prefix would
    // make them siblings. They are not.
    const deep = ['P1.1.1', 'P1.1.2', 'P1.10.1'];
    expect(visibleSiblingTarget(deep, 'P1.1.1', 'last'))
      .toEqual({ targetId: 'P1.1.2', position: 'after' });
    expect(visibleSiblingTarget(deep, 'P1.10.1', 'up')).toBeNull();
  });
});

// ── visibleIndentTarget ───────────────────────────────────────────────────
// The workflow this exists for: move a row behind the task it belongs under,
// then press ⌥→ (or Tab). If the "row above" is computed from the data rather
// than the screen, it lands under something the filters are hiding — a
// finished task, an archived project, a collapsed branch — and you have no
// way to see what happened.
describe('visibleIndentTarget', () => {
  const visible = ['P1', 'P1.1', 'P1.4', 'P1.7', 'P2'];

  it('subordinates to the preceding VISIBLE sibling', () => {
    // P1.2 and P1.3 exist in the plan but are hidden; P1.4 must land under
    // P1.1, which is what the user can see above it.
    expect(visibleIndentTarget(visible, 'P1.4')).toBe('P1.1');
    expect(visibleIndentTarget(visible, 'P1.7')).toBe('P1.4');
  });

  it('is a no-op for the first visible row in a run', () => {
    expect(visibleIndentTarget(visible, 'P1.1')).toBeNull();
    expect(visibleIndentTarget(visible, 'P1')).toBeNull();
  });

  it('never reaches across a branch for a parent', () => {
    // P1.7 precedes P2 on screen but is not its sibling. P2's own preceding
    // sibling is the root P1 — which is the right answer, and NOT P1.7.
    expect(visibleIndentTarget(visible, 'P2')).toBe('P1');
    // With no preceding root at all there is nothing to subordinate to.
    expect(visibleIndentTarget(['P2', 'P2.1'], 'P2')).toBeNull();
  });

  it('groups by exact parent, not by id prefix', () => {
    const deep = ['P1.1.1', 'P1.1.2', 'P1.10.1'];
    expect(visibleIndentTarget(deep, 'P1.1.2')).toBe('P1.1.1');
    // "P1.1" is a prefix of "P1.10" — these are not siblings.
    expect(visibleIndentTarget(deep, 'P1.10.1')).toBeNull();
  });

  it('agrees with outdentTarget on what a no-op looks like', () => {
    // Both answer `null` rather than a value the caller has to test for.
    expect(outdentTarget('P1')).toBeNull();
    expect(outdentTarget('P1.1')).toBe('');
    expect(outdentTarget('P1.1.1')).toBe('P1');
  });
});

// ── compareSiblings ───────────────────────────────────────────────────────
// Reported twice: "Paket 1 can't be moved up." The ▲ button was enabled and
// the press did nothing. The cause was two sort orders, not one: what you see
// (sortTree) and what the reorder computed its indices against. They only
// disagree when SOME siblings carry a displayOrder and some don't — which is
// every set until something has been reordered once.
describe('compareSiblings is the one order', () => {
  // Exactly the reported plan: five roots with no displayOrder, three with.
  const roots = [
    { id: 'B1' }, { id: 'D1' }, { id: 'F1' }, { id: 'M1' }, { id: 'Pr1' },
    { id: 'P4', displayOrder: 1 }, { id: 'P2', displayOrder: 2 }, { id: 'P3', displayOrder: 3 },
  ];
  const order = rows => [...rows].sort(compareSiblings).map(r => r.id);

  it('puts a partially ordered set of roots where the tree shows them', () => {
    expect(order(roots)).toEqual(['B1', 'D1', 'F1', 'M1', 'Pr1', 'P4', 'P2', 'P3']);
  });

  it('agrees with sortTree — that is the whole point', () => {
    const viaSortTree = sortTree(roots).map(r => r.id);
    expect(viaSortTree).toEqual(order(roots));
  });

  it('compares displayOrder only when both sides have one', () => {
    // P4 has displayOrder 1 and Pr1 has none. Treating 1 as comparable to
    // Pr1's id-derived 1 is what made the two orders diverge.
    expect(order([{ id: 'Pr1' }, { id: 'P4', displayOrder: 1 }])).toEqual(['Pr1', 'P4']);
    expect(order([{ id: 'P4', displayOrder: 1 }, { id: 'Pr1', displayOrder: 2 }])).toEqual(['P4', 'Pr1']);
  });

  it('falls back to the number in the id, then to the id itself', () => {
    expect(order([{ id: 'P10' }, { id: 'P2' }, { id: 'P1' }])).toEqual(['P1', 'P2', 'P10']);
    expect(order([{ id: 'B1' }, { id: 'A1' }])).toEqual(['A1', 'B1']);
  });

  it('reads the last segment, so nesting does not change the rule', () => {
    expect(order([{ id: 'P1.10' }, { id: 'P1.2' }])).toEqual(['P1.2', 'P1.10']);
  });
});

// ── scrollAdjustment ──────────────────────────────────────────────────────
// Reported: "it doesn't scroll to the focused row the way you'd expect."
// The old check asked whether the row was inside the WINDOW, but the tree
// scrolls a container that starts below the topbar, the tab bar and the
// sub-toolbar. Measured in the browser: container top at y=160, cursor row
// at y=36 — behind the chrome, invisible, and `top >= 0` said "fine".
describe('scrollAdjustment keeps the cursor inside its container', () => {
  // A container occupying y=160..768, with a 30px sticky table head.
  const box = { boxTop: 160, boxBottom: 768, headBottom: 190, margin: 34 };

  it('does nothing when the row is comfortably inside', () => {
    expect(scrollAdjustment({ ...box, rowTop: 400, rowBottom: 428 })).toBe(0);
  });

  it('scrolls up when the row sits above the container — the reported case', () => {
    // y=36 is inside the WINDOW and outside the container. The old rule
    // called this visible and did nothing.
    const delta = scrollAdjustment({ ...box, rowTop: 36, rowBottom: 64 });
    expect(delta).toBeLessThan(0);
    // Lands it below the sticky head plus the margin, not flush against it.
    expect(36 - delta).toBe(190 + 34);
  });

  it('counts a row hidden behind the sticky head as hidden', () => {
    // Inside the container (>=160) but under the head (<190).
    const delta = scrollAdjustment({ ...box, rowTop: 170, rowBottom: 198 });
    expect(delta).toBeLessThan(0);
    expect(170 - delta).toBe(224);
  });

  it('scrolls down when the row runs past the bottom, leaving room after it', () => {
    const delta = scrollAdjustment({ ...box, rowTop: 750, rowBottom: 778 });
    expect(delta).toBeGreaterThan(0);
    // Bottom ends exactly one margin above the container's edge — the old
    // `block: 'nearest'` glued it to the edge with nothing visible after.
    expect(778 - delta).toBe(768 - 34);
  });

  it('falls back to the container edge when nothing is sticky', () => {
    const delta = scrollAdjustment({ boxTop: 100, boxBottom: 500, rowTop: 60, rowBottom: 88, margin: 0 });
    expect(60 - delta).toBe(100);
  });

  it('ignores a head that is not actually sticking', () => {
    // Scrolled away upward: its bottom is above the container's top.
    const delta = scrollAdjustment({ boxTop: 160, boxBottom: 768, headBottom: -537, margin: 0, rowTop: 120, rowBottom: 148 });
    expect(120 - delta).toBe(160);
  });
});
