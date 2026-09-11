/** @vitest-environment happy-dom */
// Integration tests for the tree editor's keyboard model (Phase 4 — see
// docs/principles.md principle 5, "Fast means reversible"). Mounts the real
// TreeView (see views.smoke.test.jsx for the base harness pattern) behind a
// small stateful wrapper that plays the part of App.jsx: it applies the
// SAME kind of mutation App's real handlers would (via spies so we can
// assert on the calls too), so the DOM actually reflects what a keypress
// did — cursor moves, a new row's <input> appearing, a name reverting on
// Escape, etc. — not just "was the callback invoked".
import { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, cleanup, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { TreeView } from '../components/views/TreeView.jsx';

function wrap(node) {
  return render(
    <I18nProvider>
      <ThemeProvider>{node}</ThemeProvider>
    </I18nProvider>,
  );
}

const mk = (id, extra = {}) => ({ id, name: id, status: 'open', best: 0, factor: 1.5, prio: 2, deps: [], assign: [], ...extra });

// Mirrors, in miniature, how App.jsx wires TreeView: `selected`/`multiSel`
// are owned by the parent and threaded back through onSelect (see App.jsx
// onTreeSelect); onInsertAfter/onInsertChild/onMove/etc. are the thin
// mutate()-backed wrappers TreeView calls into and expects an id back from
// (App.jsx onTreeInsertAfter/onTreeInsertChild/onTreeMove).
function Harness({ initialTree, initialSelectedId = null, initialMultiSelIds = [], sizes = [], spies = {} }) {
  const [tree, setTree] = useState(initialTree);
  const [selected, setSelected] = useState(() => initialTree.find(r => r.id === initialSelectedId) || null);
  const [multiSel, setMultiSel] = useState(() => new Set(initialMultiSelIds));
  const nextId = useRef(100);

  const onSelect = (node, e, visibleIds) => {
    spies.onSelect?.(node, e, visibleIds);
    if (e?.shiftKey && selected && visibleIds?.length) {
      const ai = visibleIds.indexOf(selected.id), bi = visibleIds.indexOf(node.id);
      if (ai >= 0 && bi >= 0) {
        setMultiSel(new Set(visibleIds.slice(Math.min(ai, bi), Math.max(ai, bi) + 1)));
        return;
      }
    }
    setSelected(node?.id ? (tree.find(r => r.id === node.id) || node) : node);
    setMultiSel(new Set());
  };
  const onTaskUpdate = patch => {
    spies.onTaskUpdate?.(patch);
    setTree(t => t.map(r => (r.id === patch.id ? { ...r, ...patch } : r)));
  };
  const onDelete = id => {
    spies.onDelete?.(id);
    setTree(t => t.filter(r => !r.id.startsWith(id)));
    setSelected(s => (s?.id === id ? null : s));
  };
  const onBulkDelete = ids => {
    spies.onBulkDelete?.(ids);
    setTree(t => t.filter(r => !ids.some(id => r.id.startsWith(id))));
  };
  const onReorder = (...a) => spies.onReorder?.(...a);
  const onMove = (id, newParentId) => spies.onMove?.(id, newParentId);
  const insertNode = (id, atIndexOf, after) => {
    const node = mk(id, { name: '' });
    setTree(t => {
      const idx = t.findIndex(r => r.id === atIndexOf);
      const next = t.slice();
      let insertAt = after ? idx + 1 : t.length;
      if (after) {
        for (let i = t.length - 1; i >= 0; i--) {
          if (t[i].id === atIndexOf || t[i].id.startsWith(atIndexOf + '.')) { insertAt = i + 1; break; }
        }
      } else {
        for (let i = t.length - 1; i >= 0; i--) {
          if (t[i].id === atIndexOf || t[i].id.startsWith(atIndexOf + '.')) { insertAt = i + 1; break; }
        }
      }
      next.splice(insertAt, 0, node);
      return next;
    });
    return node;
  };
  const onInsertAfter = afterId => {
    const id = `NEW${nextId.current++}`;
    spies.onInsertAfter?.(afterId);
    insertNode(id, afterId, true);
    return id;
  };
  const onInsertChild = parentIdArg => {
    const id = `NEW${nextId.current++}`;
    spies.onInsertChild?.(parentIdArg);
    insertNode(id, parentIdArg, true);
    return id;
  };
  const onPasteRows = (afterId, rows) => {
    spies.onPasteRows?.(afterId, rows);
    setTree(t => {
      const nodes = rows.map((r, i) => mk(`PASTE${i}`, { name: r.name }));
      const idx = t.findIndex(x => x.id === afterId);
      const next = t.slice();
      next.splice(idx + 1, 0, ...nodes);
      return next;
    });
  };

  return <TreeView tree={tree} selected={selected} multiSel={multiSel} onSelect={onSelect}
    search="" teamFilter="" rootFilter="" personFilter="" stats={{}} teams={[]} members={[]} scheduled={[]}
    cpSet={new Set()} customFields={[]} sizes={sizes}
    onQuickAdd={() => {}} onDelete={onDelete} onReorder={onReorder} onTaskUpdate={onTaskUpdate}
    onMove={onMove} onInsertAfter={onInsertAfter} onInsertChild={onInsertChild}
    onBulkDelete={onBulkDelete} onPasteRows={onPasteRows} />;
}

function renderHarness(props) {
  const utils = wrap(<Harness {...props} />);
  return { ...utils, container: utils.getByTestId('tree-editor-surface') };
}

describe('tree editor — keyboard model', () => {
  beforeEach(() => {
    cleanup();
  });

  it('ArrowUp/ArrowDown move the cursor through visible rows', () => {
    const onSelect = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1', spies: { onSelect } });

    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(onSelect.mock.calls[0][0].id).toBe('P1.1');

    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(onSelect.mock.calls[1][0].id).toBe('P1.2');

    fireEvent.keyDown(container, { key: 'ArrowUp' });
    expect(onSelect.mock.calls[2][0].id).toBe('P1.1');
  });

  it('Enter opens an inline editor, and a second Enter commits + creates a sibling below', () => {
    const onTaskUpdate = vi.fn();
    const onInsertAfter = vi.fn();
    const tree = [mk('P1', { name: 'Root' })];
    const { container, getByTestId } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1', spies: { onTaskUpdate, onInsertAfter },
    });

    fireEvent.keyDown(container, { key: 'Enter' });
    const input = getByTestId('tree-name-input-P1');
    expect(input.value).toBe('Root');

    fireEvent.change(input, { target: { value: 'Root renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1', name: 'Root renamed' }));
    expect(onInsertAfter).toHaveBeenCalledWith('P1');
    // The new sibling is immediately the active edit — an empty <input>.
    const newInput = getByTestId('tree-name-input-NEW100');
    expect(newInput.value).toBe('');
  });

  it('committing an empty name on a brand-new row deletes it again (Enter-Enter does not litter)', () => {
    const onDelete = vi.fn();
    const onTaskUpdate = vi.fn();
    const tree = [mk('P1', { name: 'Root' })];
    const { container, getByTestId, queryByTestId } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1', spies: { onDelete, onTaskUpdate },
    });

    // First Enter: edit "Root" and commit unchanged, creating an empty sibling.
    fireEvent.keyDown(container, { key: 'Enter' });
    fireEvent.keyDown(getByTestId('tree-name-input-P1'), { key: 'Enter' });
    const newInput = getByTestId('tree-name-input-NEW100');
    expect(newInput.value).toBe('');

    // Second Enter on the still-empty new row: nothing typed, commit is empty.
    fireEvent.keyDown(newInput, { key: 'Enter' });

    expect(onDelete).toHaveBeenCalledWith('NEW100');
    expect(queryByTestId('tree-name-input-NEW100')).toBeNull();
  });

  it('⇧Enter creates a child row and edits it immediately', () => {
    const onInsertChild = vi.fn();
    const tree = [mk('P1')];
    const { container, getByTestId } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1', spies: { onInsertChild },
    });

    fireEvent.keyDown(container, { key: 'Enter', shiftKey: true });

    expect(onInsertChild).toHaveBeenCalledWith('P1');
    expect(getByTestId('tree-name-input-NEW100').value).toBe('');
  });

  it('Esc cancels without changing the name', () => {
    const onTaskUpdate = vi.fn();
    const tree = [mk('P1', { name: 'Original' })];
    const { container, getByTestId, queryByTestId } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1', spies: { onTaskUpdate },
    });

    fireEvent.keyDown(container, { key: 'Enter' });
    const input = getByTestId('tree-name-input-P1');
    fireEvent.change(input, { target: { value: 'Changed but abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onTaskUpdate).not.toHaveBeenCalled();
    expect(queryByTestId('tree-name-input-P1')).toBeNull();
    // The row's own name cell (not the contextual toolbar's "Selected" echo,
    // which also renders the name) reverted to the untouched original.
    expect(container.querySelector('.tn').textContent).toBe('Original');
  });

  it('Esc on a freshly-created still-empty row removes it (mirrors the empty-commit rule)', () => {
    const onDelete = vi.fn();
    const tree = [mk('P1')];
    const { container, getByTestId, queryByTestId } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1', spies: { onDelete },
    });

    fireEvent.keyDown(container, { key: 'Enter', shiftKey: true });
    const newInput = getByTestId('tree-name-input-NEW100');
    fireEvent.keyDown(newInput, { key: 'Escape' });

    expect(onDelete).toHaveBeenCalledWith('NEW100');
    expect(queryByTestId('tree-name-input-NEW100')).toBeNull();
  });

  it('Tab re-parents the active row under its previous sibling', () => {
    const onMove = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.2', spies: { onMove } });

    fireEvent.keyDown(container, { key: 'Tab' });

    expect(onMove).toHaveBeenCalledWith('P1.2', 'P1.1');
  });

  it('Tab on the first child is a no-op — onMove is never called', () => {
    const onMove = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.1', spies: { onMove } });

    fireEvent.keyDown(container, { key: 'Tab' });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('⇧Tab outdents to the parent of the parent', () => {
    const onMove = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.1.1')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.1.1', spies: { onMove } });

    fireEvent.keyDown(container, { key: 'Tab', shiftKey: true });

    expect(onMove).toHaveBeenCalledWith('P1.1.1', 'P1');
  });

  it('⌥↓ moves the active row down within its sibling order', () => {
    const onReorder = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.1', spies: { onReorder } });

    fireEvent.keyDown(container, { key: 'ArrowDown', altKey: true });

    expect(onReorder).toHaveBeenCalledWith('P1.1', 'down');
  });

  it('⌥↓ on the last sibling is a no-op', () => {
    const onReorder = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.2', spies: { onReorder } });

    fireEvent.keyDown(container, { key: 'ArrowDown', altKey: true });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('"2" on a three-row selection sets priority on all three in one keypress', () => {
    const onTaskUpdate = vi.fn();
    const tree = [mk('P1'), mk('P1.1', { prio: 3 }), mk('P1.2', { prio: 3 }), mk('P1.3', { prio: 3 })];
    const { container } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1.1',
      initialMultiSelIds: ['P1.1', 'P1.2', 'P1.3'],
      spies: { onTaskUpdate },
    });

    fireEvent.keyDown(container, { key: '2' });

    expect(onTaskUpdate).toHaveBeenCalledTimes(3);
    ['P1.1', 'P1.2', 'P1.3'].forEach(id => {
      expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id, prio: 2 }));
    });
  });

  it('a size letter applies {best, factor} from the project size catalogue', () => {
    const onTaskUpdate = vi.fn();
    const tree = [mk('P1.1')];
    const { container } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1.1', spies: { onTaskUpdate },
      sizes: [{ label: 'S', days: 2, factor: 1.2 }, { label: 'M', days: 6, factor: 1.4 }],
    });

    fireEvent.keyDown(container, { key: 'm' });

    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.1', best: 6, factor: 1.4 }));
  });

  it('a size letter with no matching size in the catalogue is a no-op', () => {
    const onTaskUpdate = vi.fn();
    const tree = [mk('P1.1')];
    const { container } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1.1', spies: { onTaskUpdate },
      sizes: [{ label: 'M', days: 6, factor: 1.4 }],
    });

    fireEvent.keyDown(container, { key: 's' });

    expect(onTaskUpdate).not.toHaveBeenCalled();
  });

  it('Space cycles status open -> wip', () => {
    const onTaskUpdate = vi.fn();
    const tree = [mk('P1.1', { status: 'open' })];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.1', spies: { onTaskUpdate } });

    fireEvent.keyDown(container, { key: ' ' });

    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1.1', status: 'wip' }));
  });

  it('Delete removes the active row through onDelete', () => {
    const onDelete = vi.fn();
    const tree = [mk('P1'), mk('P1.1')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1.1', spies: { onDelete } });

    fireEvent.keyDown(container, { key: 'Delete' });

    expect(onDelete).toHaveBeenCalledWith('P1.1');
  });

  it('Delete on a multi-selection deletes all selected rows via the batched callback', () => {
    const onBulkDelete = vi.fn();
    const onDelete = vi.fn();
    const tree = [mk('P1'), mk('P1.1'), mk('P1.2'), mk('P1.3')];
    const { container } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1.1', initialMultiSelIds: ['P1.1', 'P1.2', 'P1.3'],
      spies: { onBulkDelete, onDelete },
    });

    fireEvent.keyDown(container, { key: 'Delete' });

    expect(onBulkDelete).toHaveBeenCalledWith(expect.arrayContaining(['P1.1', 'P1.2', 'P1.3']));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('pasting three lines creates three new rows in one call', () => {
    const onPasteRows = vi.fn();
    const tree = [mk('P1')];
    const { container } = renderHarness({ initialTree: tree, initialSelectedId: 'P1', spies: { onPasteRows } });

    const text = 'One\nTwo\nThree';
    fireEvent.paste(container, { clipboardData: { getData: () => text } });

    expect(onPasteRows).toHaveBeenCalledTimes(1);
    const [afterId, rows] = onPasteRows.mock.calls[0];
    expect(afterId).toBe('P1');
    expect(rows).toEqual([
      { name: 'One', depth: 0 },
      { name: 'Two', depth: 0 },
      { name: 'Three', depth: 0 },
    ]);
    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('Two')).toBeTruthy();
    expect(screen.getByText('Three')).toBeTruthy();
  });

  it('paste is ignored while an inline edit is focused (native paste wins)', () => {
    const onPasteRows = vi.fn();
    const tree = [mk('P1', { name: 'Root' })];
    const { container, getByTestId } = renderHarness({
      initialTree: tree, initialSelectedId: 'P1', spies: { onPasteRows },
    });

    fireEvent.keyDown(container, { key: 'Enter' });
    const input = getByTestId('tree-name-input-P1');
    fireEvent.paste(input, { clipboardData: { getData: () => 'pasted text' } });

    expect(onPasteRows).not.toHaveBeenCalled();
  });

  it('renders the keyboard hint line under the toolbar', () => {
    const tree = [mk('P1')];
    renderHarness({ initialTree: tree });
    expect(screen.getByText(/Enter edit/i)).toBeTruthy();
  });
});
