/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { NodeModal } from '../components/modals/NodeModal.jsx';

const tree = [
  { id: 'P1', name: 'Project', status: 'wip', progress: 50, deps: [], assign: [] },
  { id: 'P1.1', name: 'Selected task', status: 'wip', progress: 40, best: 1, factor: 1, deps: [], assign: [] },
  { id: 'P1.2', name: 'Other task', status: 'wip', progress: 75, best: 1, factor: 1, deps: [], assign: [] },
];

function renderModal(props = {}) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <NodeModal
          node={tree[1]}
          tree={tree}
          members={[]}
          teams={[]}
          taskTemplates={[]}
          sizes={[]}
          customFields={[]}
          scheduled={[]}
          cpSet={new Set()}
          stats={{}}
          confidence={{}}
          confReasons={{}}
          onClose={() => {}}
          onUpdate={() => {}}
          {...props}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe('NodeModal item history', () => {
  beforeEach(() => cleanup());

  it('shows an item-scoped, read-only history timeline in the item dialog', () => {
    renderModal({
      historyEvents: [
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 40, effectiveAt: '2026-05-01' },
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.2', status: 'wip', progress: 75, effectiveAt: '2026-05-01' },
      ],
    });

    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });

    expect(screen.getByTestId('item-history')).toBeTruthy();
    const text = screen.getByTestId('item-history').textContent;
    expect(text).toContain('what happened to this item');
    expect(text).toContain('Created (In Progress)');
    expect(text).toContain('Progress 0 % → 40 %');
    expect(text).not.toContain('75 %');
    expect(text).toContain('1 entry');
  });

  it('says what changed, newest first, and never the same thing twice', () => {
    renderModal({
      historyEvents: [
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', kind: 'added', status: 'open', progress: 0 },
        // The artefact a real plan was full of: the same state recorded again.
        { ts: '2026-05-02T10:00:00.000Z', id: 'P1.1', kind: 'added', status: 'open', progress: 0 },
        { ts: '2026-05-03T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 30 },
        { ts: '2026-05-04T10:00:00.000Z', id: 'P1.1', progress: 63 },
        { ts: '2026-05-09T10:00:00.000Z', id: 'P1.1', status: 'done', progress: 100, completedAt: '2026-05-08' },
      ],
    });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    const rows = screen.getAllByTestId('item-history-row').map(r => r.textContent);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('In Progress → Done');
    expect(rows[0]).toContain('finished on 2026-05-08');
    expect(rows[1]).toContain('Progress 30 % → 63 %');
    expect(rows[2]).toContain('Open → In Progress');
    expect(rows[3]).toContain('Created (Open)');
    // The list scrolls inside itself: a long history does not size the dialog.
    const list = screen.getAllByTestId('item-history-row')[0].parentElement;
    expect(list.style.overflowY).toBe('auto');
    expect(list.style.maxHeight).toBeTruthy();
  });

  it('lets the user delete an entry from the item version history', () => {
    const onHistoryChange = vi.fn();
    renderModal({
      historyEvents: [
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 40, effectiveAt: '2026-05-01' },
        { ts: '2026-05-05T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 60, effectiveAt: '2026-05-05' },
      ],
      onHistoryChange,
    });

    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    const rows = screen.getAllByTestId('item-history-row');
    expect(rows.length).toBe(2);
    // Newest first: the last row is the older entry.
    fireEvent.click(rows[1].querySelector('button[aria-label]'));

    expect(onHistoryChange).toHaveBeenCalled();
    const result = onHistoryChange.mock.calls[0][0];
    expect(result.filter(e => e.id === 'P1.1').length).toBe(1);
    expect(result.find(e => e.id === 'P1.1').progress).toBe(60);
  });
});

describe('the history reads the log in replay order', () => {
  beforeEach(() => cleanup());

  it('a same-day backdated entry is a transition from what the replay had before it', () => {
    renderModal({
      historyEvents: [
        { ts: '2026-05-01T08:00:00.000Z', id: 'P1.1', kind: 'added', status: 'open', progress: 0 },
        // Recorded at 16:00 the same day. Replay puts the backdated one (noon) first.
        { ts: '2026-05-10T16:00:00.000Z', id: 'P1.1', status: 'done', progress: 100 },
        { ts: '2026-05-10T18:00:00.000Z', id: 'P1.1', status: 'wip', progress: 40, effectiveAt: '2026-05-10' },
      ],
    });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    const rows = screen.getAllByTestId('item-history-row').map(r => r.textContent);
    expect(rows[0]).toContain('In Progress → Done');
    expect(rows[1]).toContain('Open → In Progress');
  });
});

describe('a status change can be dated, and an entry can be moved', () => {
  beforeEach(() => cleanup());
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  it('has no History tab: the history sits under the status it records', () => {
    renderModal();
    expect(screen.queryByTestId('nm-tab-history')).toBeNull();
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    expect(screen.getByTestId('item-history')).toBeTruthy();
  });

  it('opens on Status, names the item, and asks for a day only once there is a change to date', () => {
    renderModal();
    expect(document.querySelector('[role="tab"][aria-selected="true"]').getAttribute('data-testid')).toBe('nm-tab-workflow');
    expect(screen.getByTestId('nm-title').textContent).toBe('Selected task');
    expect([...document.querySelectorAll('[role="tab"]')].map(x => x.getAttribute('data-testid').replace('nm-tab-', ''))).toEqual(['insights', 'workflow', 'overview', 'timing', 'effort']);
    expect(screen.queryByTestId('nm-as-of')).toBeNull();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(screen.getByTestId('nm-as-of').value).toBe(day(0));
    // Dropping is the last control on the tab, after the history.
    const order = screen.getByTestId('item-history').compareDocumentPosition(screen.getByTestId('drop-toggle'));
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on an earlier day there is no day to pick: every change counts for that day', () => {
    const onUpdate = vi.fn();
    renderModal({ viewDay: day(9), onUpdate });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(screen.queryByTestId('nm-as-of')).toBeNull();
    fireEvent.click(screen.getByTestId('nm-save'));
    expect(onUpdate.mock.calls[0][1]).toBeUndefined();
  });

  it('saves a progress change with the day it counts for', () => {
    const onUpdate = vi.fn();
    renderModal({ onUpdate });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(screen.queryByTestId('nm-as-of-note')).toBeNull();
    fireEvent.change(screen.getByTestId('nm-as-of'), { target: { value: day(5) } });
    expect(screen.getByTestId('nm-as-of-note').textContent).toContain(day(5));
    fireEvent.click(screen.getByTestId('nm-save'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].progress).toBe(60);
    expect(onUpdate.mock.calls[0][1]).toEqual({ asOf: day(5) });
  });

  it('finishing a task as of an earlier day finishes it on that day', () => {
    const onUpdate = vi.fn();
    renderModal({ onUpdate });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('nm-as-of'), { target: { value: day(3) } });
    fireEvent.click(screen.getByTestId('nm-save'));
    const saved = onUpdate.mock.calls[0][0];
    expect(saved.status).toBe('done');
    expect(saved.completedAt).toBe(day(3));
    expect(saved.completedEnd).toBe(day(3));
    expect(saved.completedStart <= day(3)).toBe(true);
  });

  it('today, a future day, or no status change sends no date', () => {
    const onUpdate = vi.fn();
    renderModal({ onUpdate });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('nm-as-of'), { target: { value: day(-4) } });
    fireEvent.click(screen.getByTestId('nm-save'));
    expect(onUpdate.mock.calls[0][1]).toBeUndefined();
  });

  it('moves an entry to another day without touching when it was typed', () => {
    const onHistoryChange = vi.fn();
    const events = [
      { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', kind: 'added', status: 'open', progress: 0 },
      { ts: '2026-05-05T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 40 },
      { ts: '2026-05-05T10:00:00.000Z', id: 'P1.2', status: 'wip', progress: 75 },
    ];
    renderModal({ historyEvents: events, onHistoryChange });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    fireEvent.click(screen.getAllByTestId('item-history-day')[0]);
    const input = screen.getByTestId('item-history-date');
    fireEvent.change(input, { target: { value: '2026-05-03' } });
    fireEvent.blur(input);
    const next = onHistoryChange.mock.calls[0][0];
    expect(next).toHaveLength(3);
    expect(next[1]).toEqual({ ...events[1], effectiveAt: '2026-05-03' });
    expect(next[0]).toBe(events[0]);
    expect(next[2]).toBe(events[2]);
  });

  it('does not offer to move the day a task was finished', () => {
    renderModal({
      onHistoryChange: () => {},
      historyEvents: [
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', kind: 'added', status: 'wip', progress: 40 },
        { ts: '2026-05-09T10:00:00.000Z', id: 'P1.1', status: 'done', progress: 100, completedAt: '2026-05-08' },
        { ts: '2026-05-12T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 80 },
        // An older log: done without the day it was done on.
        { ts: '2026-05-14T10:00:00.000Z', id: 'P1.1', status: 'done', progress: 100 },
      ],
    });
    fireEvent.mouseDown(screen.getByTestId('nm-tab-workflow'), { button: 0 });
    const days = screen.getAllByTestId('item-history-day');
    expect(days.map(d => d.disabled)).toEqual([true, false, true, false]);
  });
});
