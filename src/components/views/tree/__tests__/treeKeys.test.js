import { describe, it, expect, vi } from 'vitest';
import { enterAdvance, handleContainerKey, handleEditKey, handleFieldKey } from '../treeKeys.js';

// Pins the key handlers of the tree view as they behave today, branch by
// branch. Odd behaviour is pinned on purpose and marked "oddity".

const ev = (key, o = {}) => ({
  key,
  code: o.code,
  shiftKey: !!o.shift,
  altKey: !!o.alt,
  metaKey: !!o.meta,
  ctrlKey: !!o.ctrl,
  target: o.target,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

const rows = [{ id: '1' }, { id: '1.1' }, { id: '1.2' }, { id: '2' }];
const ids = ['1', '1.1', '1.2', '2'];
const sizes = [{ label: 'M', days: 5, factor: 2 }];

const ctx = (o = {}) => ({
  editing: null,
  selected: { id: '1' },
  tree: rows,
  filt: rows,
  visibleIds: ids,
  collapsed: new Set(),
  sizes,
  onSelectAll: vi.fn(),
  onFullEdit: vi.fn(),
  onSelect: vi.fn(),
  runCommand: vi.fn(),
  moveCursor: vi.fn(),
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  toggle: vi.fn(),
  startEdit: vi.fn(),
  startNewSibling: vi.fn(),
  startNewChild: vi.fn(),
  doDelete: vi.fn(),
  applyToTargets: vi.fn(),
  ...o,
});

const noCalls = c =>
  expect(
    Object.entries(c)
      .filter(([, v]) => v?.mock?.calls.length)
      .map(([k]) => k),
  ).toEqual([]);
const stopped = e => {
  expect(e.preventDefault).toHaveBeenCalledTimes(1);
  expect(e.stopPropagation).toHaveBeenCalledTimes(1);
};
const untouched = e => {
  expect(e.preventDefault).not.toHaveBeenCalled();
  expect(e.stopPropagation).not.toHaveBeenCalled();
};
const prevented = e => expect(e.preventDefault).toHaveBeenCalledTimes(1);

describe('enterAdvance', () => {
  it('maps the modifiers', () => {
    expect(enterAdvance({ shiftKey: true })).toBe('child');
    expect(enterAdvance({ shiftKey: true, metaKey: true })).toBe('child'); // shift wins
    expect(enterAdvance({ metaKey: true })).toBe('next');
    expect(enterAdvance({ ctrlKey: true })).toBe('next');
    expect(enterAdvance({})).toBe('sibling');
    expect(enterAdvance({ altKey: true })).toBe('sibling');
  });
});

describe('handleEditKey (inline name input)', () => {
  const edit = () => ({
    cancelEdit: vi.fn(),
    commitEdit: vi.fn(),
    commitAndEditNeighbour: vi.fn(),
    applyFieldWhileEditing: vi.fn(),
    teamSelRef: { current: { focus: vi.fn() } },
  });
  const ignored = (key, mods) => {
    const c = edit();
    const e = ev(key, mods);
    handleEditKey(c, e);
    noCalls(c);
    expect(c.teamSelRef.current.focus).not.toHaveBeenCalled();
    untouched(e);
  };

  it('Escape cancels and stops the event', () => {
    const c = edit();
    const e = ev('Escape');
    handleEditKey(c, e);
    expect(c.cancelEdit).toHaveBeenCalledWith();
    stopped(e);
  });

  it.each([
    [{}, 'sibling'],
    [{ shift: true }, 'child'],
    [{ meta: true }, 'next'],
    [{ ctrl: true }, 'next'],
    [{ alt: true, ctrl: true }, 'next'],
  ])('Enter %j commits with %s', (mods, adv) => {
    const c = edit();
    const e = ev('Enter', mods);
    handleEditKey(c, e);
    expect(c.commitEdit).toHaveBeenCalledWith(adv);
    stopped(e);
  });

  it('Alt+Enter is ignored (oddity: not even preventDefault)', () => ignored('Enter', { alt: true }));

  it('Shift+Tab edits the last field of the row above', () => {
    const c = edit();
    const e = ev('Tab', { shift: true });
    handleEditKey(c, e);
    expect(c.commitAndEditNeighbour).toHaveBeenCalledWith(-1, { at: 'last' });
    stopped(e);
  });

  it('plain Tab is left to the browser', () => ignored('Tab'));
  it('Alt+Shift+Tab is left to the browser (oddity: falls to the plain Tab rule)', () => ignored('Tab', { shift: true, alt: true }));

  it.each([
    ['ArrowDown', 1],
    ['ArrowUp', -1],
  ])('plain %s commits and edits the neighbour (%i)', (key, dir) => {
    const c = edit();
    const e = ev(key);
    handleEditKey(c, e);
    expect(c.commitAndEditNeighbour.mock.calls).toEqual([[dir]]);
    stopped(e);
  });

  it.each([{ shift: true }, { alt: true }, { meta: true }, { ctrl: true }])('ArrowDown with %j is the input’s own', mods =>
    ignored('ArrowDown', mods),
  );

  it.each([
    ['Digit1', '1'],
    ['Digit4', '4'],
    ['KeyS', 'S'],
    ['KeyM', 'M'],
    ['KeyL', 'L'],
    ['KeyX', 'X'],
  ])('Alt+%s applies field %s while editing', (code, val) => {
    const c = edit();
    const e = ev('¡', { alt: true, code });
    handleEditKey(c, e);
    expect(c.applyFieldWhileEditing.mock.calls).toEqual([[val]]);
    stopped(e);
  });

  it.each(['Digit5', 'Digit0', 'KeyA'])('Alt+%s is ignored', code => ignored('x', { alt: true, code }));

  it('Alt+Space steps the field forward, Alt+Shift+Space back', () => {
    let c = edit();
    let e = ev(' ', { alt: true, code: 'Space' });
    handleEditKey(c, e);
    expect(c.applyFieldWhileEditing).toHaveBeenCalledWith(' ', { back: false });
    stopped(e);
    c = edit();
    e = ev(' ', { alt: true, shift: true, code: 'Space' });
    handleEditKey(c, e);
    expect(c.applyFieldWhileEditing).toHaveBeenCalledWith(' ', { back: true });
  });

  it('Alt+T focuses the team select', () => {
    const c = edit();
    const e = ev('†', { alt: true, code: 'KeyT' });
    handleEditKey(c, e);
    expect(c.teamSelRef.current.focus).toHaveBeenCalledTimes(1);
    stopped(e);
  });

  it('Alt+T with an empty team select ref does not throw', () => {
    const c = { ...edit(), teamSelRef: { current: null } };
    const e = ev('†', { alt: true, code: 'KeyT' });
    expect(() => handleEditKey(c, e)).not.toThrow();
    stopped(e);
  });

  it('Alt with no code does nothing', () => ignored('q', { alt: true }));
  it.each(['Digit1', 'KeyS', 'Space', 'KeyT'])('physical %s without Alt is ignored', code => ignored('x', { code }));
  it('Ctrl+Alt+Digit1 does not count as Alt', () => ignored('x', { alt: true, ctrl: true, code: 'Digit1' }));
  it.each(['Home', 'a', 'ArrowLeft', 'Delete'])('%s is the input’s own', key => ignored(key));
});

describe('handleFieldKey (dropdowns of the editing row)', () => {
  const field = (o = {}) => ({
    cancelEdit: vi.fn(),
    commitEdit: vi.fn(),
    commitAndEditNeighbour: vi.fn(),
    editing: { id: '1', isNew: false },
    visibleIds: ['1', '1.1', '2'],
    ...o,
  });
  const ignored = (key, isLast, mods) => {
    const c = field();
    const e = ev(key, mods);
    handleFieldKey(c, e, isLast);
    noCalls(c);
    untouched(e);
  };

  it('Escape cancels', () => {
    const c = field();
    const e = ev('Escape');
    handleFieldKey(c, e, false);
    expect(c.cancelEdit).toHaveBeenCalledTimes(1);
    stopped(e);
  });

  it.each([
    [{}, 'sibling'],
    [{ shift: true }, 'child'],
    [{ meta: true }, 'next'],
    [{ ctrl: true }, 'next'],
    [{ alt: true }, 'sibling'], // oddity: unlike the name input, Alt+Enter commits here
  ])('Enter %j commits with %s', (mods, adv) => {
    const c = field();
    const e = ev('Enter', mods);
    handleFieldKey(c, e, false);
    expect(c.commitEdit).toHaveBeenCalledWith(adv);
    stopped(e);
  });

  it('Tab off the last field of an existing, non-last row goes to the next row', () => {
    const c = field();
    const e = ev('Tab');
    handleFieldKey(c, e, true);
    expect(c.commitAndEditNeighbour.mock.calls).toEqual([[1]]);
    expect(c.commitEdit).not.toHaveBeenCalled();
    stopped(e);
  });

  it('Tab off the last field of the last row opens a new one', () => {
    const c = field({ editing: { id: '2', isNew: false } });
    const e = ev('Tab');
    handleFieldKey(c, e, true);
    expect(c.commitEdit).toHaveBeenCalledWith('next');
    expect(c.commitAndEditNeighbour).not.toHaveBeenCalled();
    stopped(e);
  });

  it('Tab off the last field of a new row opens another new one', () => {
    const c = field({ editing: { id: '1', isNew: true } });
    handleFieldKey(c, ev('Tab'), true);
    expect(c.commitEdit).toHaveBeenCalledWith('next');
  });

  it('Tab when the edited row is not visible opens a new one', () => {
    const c = field({ editing: { id: '9', isNew: false } });
    handleFieldKey(c, ev('Tab'), true);
    expect(c.commitEdit).toHaveBeenCalledWith('next');
  });

  it('Tab with nothing being edited commits "next" and stops the event', () => {
    const c = field({ editing: null });
    const e = ev('Tab');
    handleFieldKey(c, e, true);
    expect(c.commitEdit).toHaveBeenCalledWith('next');
    stopped(e);
  });

  it('Tab off a field that is not the last is the browser’s', () => ignored('Tab', false));
  it('Shift+Tab is the browser’s, also off the last field (oddity: no way back from a dropdown)', () =>
    ignored('Tab', true, { shift: true }));
  it.each(['ArrowUp', 'ArrowDown', 'Home', 'End', 'a'])('%s is the select’s own', key => ignored(key, true));
});

describe('handleContainerKey (the grid)', () => {
  const run = (key, mods, c = ctx()) => {
    const e = ev(key, mods);
    handleContainerKey(c, e);
    return { c, e };
  };
  const ignored = (key, mods, c) => {
    const r = run(key, mods, c);
    noCalls(r.c);
    untouched(r.e);
  };

  describe('guards', () => {
    it('does nothing while the inline editor is open', () => ignored('ArrowDown', {}, ctx({ editing: { id: '1' } })));

    it.each([
      ['input', { tagName: 'INPUT', type: 'text' }],
      ['input without a type', { tagName: 'INPUT' }],
      ['textarea', { tagName: 'TEXTAREA' }],
      ['select', { tagName: 'SELECT' }],
      ['contenteditable', { tagName: 'DIV', isContentEditable: true }],
      ['combobox', { tagName: 'DIV', getAttribute: () => 'combobox' }],
    ])('does nothing when focus is in a %s', (_n, target) => {
      for (const key of ['ArrowDown', 'Enter', 'Delete', ' ', 'a', '1', 'Home', 'F2', 'Tab']) ignored(key, { target });
      ignored('a', { meta: true, target });
      ignored('ArrowUp', { meta: true, shift: true, target });
    });

    it('a checkbox is not a typing target: keys still work', () => {
      const { c } = run('ArrowDown', { target: { tagName: 'INPUT', type: 'checkbox' } });
      expect(c.moveCursor).toHaveBeenCalledWith('down', false);
    });
  });

  describe('⌘A / Ctrl+A', () => {
    it.each([
      [{ meta: true }, 'a'],
      [{ ctrl: true }, 'a'],
      [{ meta: true }, 'A'],
    ])('selects all visible ids (%j, %s)', (mods, key) => {
      const { c, e } = run(key, mods);
      expect(c.onSelectAll).toHaveBeenCalledWith(ids);
      stopped(e);
    });

    it('with an empty list it selects an empty array', () => {
      const { c } = run('a', { meta: true }, ctx({ filt: [] }));
      expect(c.onSelectAll).toHaveBeenCalledWith([]);
    });

    it('without onSelectAll nothing happens and the event is not touched', () =>
      ignored('a', { meta: true }, ctx({ onSelectAll: undefined })));

    it.each([
      { meta: true, shift: true },
      { meta: true, alt: true },
    ])('with %j it is not select-all', mods => {
      const { c, e } = run('a', mods);
      expect(c.onSelectAll).not.toHaveBeenCalled();
      untouched(e);
    });
  });

  describe('structural commands', () => {
    it.each([
      ['ArrowUp', 'moveUp'],
      ['ArrowDown', 'moveDown'],
      ['ArrowRight', 'indent'],
      ['ArrowLeft', 'outdent'],
    ])('⌘⇧ and Ctrl⇧ + %s runs %s', (key, cmd) => {
      for (const mods of [
        { meta: true, shift: true },
        { ctrl: true, shift: true },
      ]) {
        const { c, e } = run(key, mods);
        expect(c.runCommand.mock.calls).toEqual([[cmd]]);
        prevented(e);
        expect(e.stopPropagation).not.toHaveBeenCalled(); // oddity: only ⌘A stops propagation
      }
    });

    it('⌘⇧+arrow runs even with no selection', () => {
      const { c } = run('ArrowUp', { meta: true, shift: true }, ctx({ selected: null }));
      expect(c.runCommand).toHaveBeenCalledWith('moveUp');
    });

    it.each(['ArrowUp', 'ArrowLeft'])('⌘⇧⌥+%s is ignored entirely (oddity: no preventDefault)', key =>
      ignored(key, { meta: true, shift: true, alt: true }),
    );
    it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])('⌘+%s without shift is ignored', key => ignored(key, { meta: true }));
    it.each(['ArrowUp', 'ArrowLeft'])('⌘⌥+%s is ignored (Alt needs a bare key)', key => ignored(key, { meta: true, alt: true }));

    it.each([
      ['ArrowUp', {}, 'moveUp'],
      ['ArrowDown', {}, 'moveDown'],
      ['ArrowUp', { shift: true }, 'moveFirst'],
      ['ArrowDown', { shift: true }, 'moveLast'],
    ])('⌥+%s %j runs %s', (key, mods, cmd) => {
      const { c, e } = run(key, { alt: true, ...mods });
      expect(c.runCommand.mock.calls).toEqual([[cmd]]);
      prevented(e);
    });

    it('⌥+↑ runs without a selection', () => {
      const { c } = run('ArrowUp', { alt: true }, ctx({ selected: null }));
      expect(c.runCommand).toHaveBeenCalledWith('moveUp');
    });

    it.each([
      ['ArrowLeft', 'outdent'],
      ['ArrowRight', 'indent'],
    ])('⌥+%s runs %s, also with Shift (ignored) and without a selection', (key, cmd) => {
      for (const mods of [{ alt: true }, { alt: true, shift: true }]) {
        const { c, e } = run(key, mods, ctx({ selected: null }));
        expect(c.runCommand.mock.calls).toEqual([[cmd]]);
        prevented(e);
        expect(c.collapseAll).not.toHaveBeenCalled();
        expect(c.expandAll).not.toHaveBeenCalled();
      }
    });
  });

  describe('↑/↓ cursor', () => {
    it.each([
      ['ArrowDown', {}, 'down', false],
      ['ArrowUp', {}, 'up', false],
      ['ArrowDown', { shift: true }, 'down', true],
      ['ArrowUp', { shift: true }, 'up', true],
    ])('%s %j moves the cursor %s (extend=%s), no selection needed', (key, mods, dir, ext) => {
      const { c, e } = run(key, mods, ctx({ selected: null }));
      expect(c.moveCursor.mock.calls).toEqual([[dir, ext]]);
      prevented(e);
    });
  });

  describe('Enter', () => {
    it('⌘↵ and Ctrl↵ start a new sibling under the selection', () => {
      for (const mods of [{ meta: true }, { ctrl: true }]) {
        const { c, e } = run('Enter', mods, ctx({ selected: { id: '1.1' } }));
        expect(c.startNewSibling.mock.calls).toEqual([['1.1']]);
        prevented(e);
      }
    });

    it('⌘↵ without a selection prevents default but starts nothing (oddity)', () => {
      for (const selected of [null, {}]) {
        const { c, e } = run('Enter', { meta: true }, ctx({ selected }));
        noCalls(c);
        prevented(e);
      }
    });

    it.each([{ meta: true, shift: true }, { meta: true, alt: true }, { alt: true }])('%j+↵ is ignored', mods => ignored('Enter', mods));

    it('↵ edits the selected row', () => {
      const { c, e } = run('Enter', {}, ctx({ selected: { id: '1.2' } }));
      expect(c.startEdit.mock.calls).toEqual([['1.2']]);
      prevented(e);
    });

    it('⇧↵ starts a new child', () => {
      const { c } = run('Enter', { shift: true }, ctx({ selected: { id: '1.2' } }));
      expect(c.startNewChild.mock.calls).toEqual([['1.2']]);
      expect(c.startEdit).not.toHaveBeenCalled();
    });

    it('↵ and ⇧↵ do nothing without a selection (default not prevented)', () => {
      for (const mods of [{}, { shift: true }]) for (const selected of [null, undefined, {}]) ignored('Enter', mods, ctx({ selected }));
    });
  });

  describe('Home / End', () => {
    it('Home selects the first visible row, End the last', () => {
      let { c, e } = run('Home');
      expect(c.onSelect.mock.calls).toEqual([[rows[0], {}, ids]]);
      prevented(e);
      ({ c } = run('End'));
      expect(c.onSelect.mock.calls).toEqual([[rows[3], {}, ids]]);
    });

    it('works with no selection, and on a one-row list', () => {
      const one = [{ id: '7' }];
      for (const key of ['Home', 'End']) {
        const { c } = run(key, {}, ctx({ selected: null, filt: one, visibleIds: ['7'] }));
        expect(c.onSelect.mock.calls).toEqual([[one[0], {}, ['7']]]);
      }
    });

    it('with an empty list nothing happens and default is not prevented', () => {
      for (const key of ['Home', 'End']) ignored(key, {}, ctx({ filt: [] }));
    });

    it.each([{ shift: true }, { alt: true }, { meta: true }, { ctrl: true }])(
      '%j + Home/End is ignored (oddity: Shift+Home does not extend)',
      mods => {
        for (const key of ['Home', 'End']) ignored(key, mods);
      },
    );
  });

  describe('⇧←/⇧→', () => {
    it('collapse or expand everything, with or without a selection', () => {
      for (const selected of [null, { id: '1' }]) {
        let { c, e } = run('ArrowLeft', { shift: true }, ctx({ selected }));
        expect(c.collapseAll).toHaveBeenCalledWith();
        expect(c.expandAll).not.toHaveBeenCalled();
        prevented(e);
        ({ c } = run('ArrowRight', { shift: true }, ctx({ selected })));
        expect(c.expandAll).toHaveBeenCalledWith();
        expect(c.collapseAll).not.toHaveBeenCalled();
        expect(c.toggle).not.toHaveBeenCalled();
      }
    });

    it('Ctrl⇧←/→ is the structural outdent/indent instead', () => {
      const { c } = run('ArrowLeft', { ctrl: true, shift: true });
      expect(c.runCommand).toHaveBeenCalledWith('outdent');
      expect(c.collapseAll).not.toHaveBeenCalled();
    });
  });

  describe('←/→ tree navigation', () => {
    const coll = list => ctx({ collapsed: new Set(list) });

    it('→ on a collapsed parent expands it', () => {
      const { c, e } = run('ArrowRight', {}, coll(['1']));
      expect(c.toggle.mock.calls).toEqual([['1']]);
      expect(c.onSelect).not.toHaveBeenCalled();
      prevented(e);
    });

    it('→ on an expanded parent selects its first visible child', () => {
      const { c } = run('ArrowRight');
      expect(c.onSelect.mock.calls).toEqual([[rows[1], {}, ids]]);
      expect(c.toggle).not.toHaveBeenCalled();
    });

    it('→ on an expanded parent whose children are filtered out selects nothing (still prevents default)', () => {
      const { c, e } = run('ArrowRight', {}, ctx({ filt: [rows[0], rows[3]] }));
      noCalls(c);
      prevented(e);
    });

    it('→ only picks a direct child, not a deeper descendant', () => {
      const tree = [{ id: '1' }, { id: '1.1' }, { id: '1.1.1' }];
      const { c } = run('ArrowRight', {}, ctx({ tree, filt: [tree[0], tree[2]] }));
      expect(c.onSelect).not.toHaveBeenCalled();
    });

    it('→ on a leaf does nothing (a collapsed leaf is not toggled)', () => {
      const { c, e } = run('ArrowRight', {}, ctx({ selected: { id: '2' }, collapsed: new Set(['2']) }));
      noCalls(c);
      prevented(e);
    });

    it('→ does not mistake id "10" for a child of "1"', () => {
      const tree = [{ id: '1' }, { id: '10' }];
      const { c } = run('ArrowRight', {}, ctx({ tree, filt: tree }));
      expect(c.onSelect).not.toHaveBeenCalled();
    });

    it('← on an expanded parent collapses it', () => {
      const { c, e } = run('ArrowLeft');
      expect(c.toggle.mock.calls).toEqual([['1']]);
      expect(c.onSelect).not.toHaveBeenCalled();
      prevented(e);
    });

    it('← on a collapsed top-level parent has no parent to select (prevents default only)', () => {
      const { c, e } = run('ArrowLeft', {}, coll(['1']));
      noCalls(c);
      prevented(e);
    });

    it('← on a child leaf selects the parent row', () => {
      const { c } = run('ArrowLeft', {}, ctx({ selected: { id: '1.2' } }));
      expect(c.onSelect.mock.calls).toEqual([[rows[0], {}, ids]]);
      expect(c.toggle).not.toHaveBeenCalled();
    });

    it('← on a collapsed nested parent selects its parent', () => {
      const tree = [{ id: '1' }, { id: '1.1' }, { id: '1.1.1' }];
      const { c } = run('ArrowLeft', {}, ctx({ tree, filt: tree, selected: { id: '1.1' }, collapsed: new Set(['1.1']) }));
      expect(c.onSelect.mock.calls).toEqual([[tree[0], {}, ids]]);
    });

    it('← on a top-level leaf does nothing; with the parent row filtered out nothing either', () => {
      let { c } = run('ArrowLeft', {}, ctx({ selected: { id: '2' } }));
      noCalls(c);
      ({ c } = run('ArrowLeft', {}, ctx({ selected: { id: '1.2' }, filt: [rows[2]] })));
      noCalls(c);
    });

    it('←/→ without a selection do nothing and do not prevent default', () => {
      for (const key of ['ArrowLeft', 'ArrowRight']) for (const selected of [null, {}]) ignored(key, {}, ctx({ selected }));
    });
  });

  describe('selection-bound keys', () => {
    it('Tab indents, Shift+Tab outdents', () => {
      let { c, e } = run('Tab');
      expect(c.runCommand.mock.calls).toEqual([['indent']]);
      prevented(e);
      ({ c } = run('Tab', { shift: true }));
      expect(c.runCommand.mock.calls).toEqual([['outdent']]);
    });

    it('Tab without a selection is left to the browser', () => ignored('Tab', {}, ctx({ selected: null })));
    it.each([{ ctrl: true }, { meta: true }, { alt: true }])('%j+Tab is ignored', mods => ignored('Tab', mods));

    it('F2 renames the selection, Shift does not matter', () => {
      const { c, e } = run('F2', {}, ctx({ selected: { id: '1.1' } }));
      expect(c.startEdit.mock.calls).toEqual([['1.1']]);
      prevented(e);
      expect(run('F2', { shift: true }).c.startEdit).toHaveBeenCalledWith('1');
    });

    it('Delete and Backspace delete (no arguments), Shift too', () => {
      for (const [key, mods] of [
        ['Delete', {}],
        ['Backspace', {}],
        ['Delete', { shift: true }],
      ]) {
        const { c, e } = run(key, mods);
        expect(c.doDelete.mock.calls).toEqual([[]]);
        prevented(e);
      }
    });

    it.each([{ meta: true }, { ctrl: true }, { alt: true }])('%j+Delete does nothing', mods => ignored('Delete', mods));
    it('Delete without a selection does nothing', () => ignored('Delete', {}, ctx({ selected: null })));

    it('e and E open the full editor with the selected row', () => {
      for (const key of ['e', 'E']) {
        const sel = { id: '1', name: 'Anna' };
        const { c, e } = run(key, {}, ctx({ selected: sel }));
        expect(c.onFullEdit.mock.calls).toEqual([[sel]]);
        prevented(e);
      }
    });

    it('e without onFullEdit does nothing (no preventDefault)', () => ignored('e', {}, ctx({ onFullEdit: undefined })));
    it.each([{ ctrl: true }, { meta: true }, { alt: true }])('%j+e is ignored', mods => ignored('e', mods));
    it('e without a selection is ignored', () => ignored('e', {}, ctx({ selected: null })));
  });

  describe('field keys on the targets', () => {
    // applyToTargets receives a patch function; call it to see the patch.
    const patch = (key, mods, node, c = ctx()) => {
      const { e } = run(key, mods, c);
      expect(c.applyToTargets).toHaveBeenCalledTimes(1);
      prevented(e);
      return c.applyToTargets.mock.calls[0][0](node);
    };

    it.each([' ', 'Spacebar'])('%j cycles the status forward, Shift back', key => {
      expect(patch(key, {}, { status: 'open' })).toMatchObject({ status: 'wip' });
      expect(patch(key, { shift: true }, { status: 'wip' })).toMatchObject({ status: 'open' });
    });

    it.each([{ ctrl: true }, { meta: true }, { alt: true }])('%j+Space is ignored', mods => ignored(' ', mods));

    it('0 toggles dropped', () => {
      expect(patch('0', {}, { dropped: false })).toEqual({ dropped: true });
      expect(patch('0', {}, {})).toEqual({ dropped: true });
      expect(patch('0', {}, { dropped: true })).toEqual({ dropped: undefined });
    });

    it('1–4 set the priority, or null when unchanged', () => {
      expect(patch('3', {}, { prio: 1 })).toEqual({ prio: 3 });
      expect(patch('3', {}, { prio: 3 })).toBeNull();
      expect(patch('1', {}, {})).toEqual({ prio: 1 });
    });

    it.each(['5', '9', '!', '#', 'Escape', 'F1', 'PageDown'])('%s is ignored', key => ignored(key));

    it('s/m/l/x in either case resolve a size (null when unknown or unchanged)', () => {
      for (const key of ['m', 'M']) {
        expect(patch(key, {}, {})).toMatchObject({ best: 5, factor: 2 });
        expect(patch(key, {}, { best: 5, factor: 2 })).toBeNull();
      }
      expect(patch('s', {}, {})).toBeNull();
    });

    it('Shift+letter size works like the plain letter', () => {
      expect(patch('M', { shift: true }, {})).toMatchObject({ best: 5 });
    });

    it.each(['a', 'z', 'q', 'Q', 'ä'])('other letter %s is ignored', key => ignored(key));

    it('Ctrl/Meta/Alt with a size letter or digit is ignored', () => {
      for (const key of ['m', '1', '0']) for (const mods of [{ ctrl: true }, { meta: true }, { alt: true }]) ignored(key, mods);
    });

    it('field keys without a selection do nothing', () => {
      for (const key of ['0', '1', 'm', ' ']) ignored(key, {}, ctx({ selected: null }));
    });
  });
});
