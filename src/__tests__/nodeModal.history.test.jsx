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

  it('shows an item-scoped history timeline in the item dialog', () => {
    renderModal({
      historyEvents: [
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 40, effectiveAt: '2026-05-01' },
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.2', status: 'wip', progress: 75, effectiveAt: '2026-05-01' },
      ],
    });

    fireEvent.click(screen.getByText('History'));

    expect(screen.getByTestId('item-history')).toBeTruthy();
    expect(screen.getByText('Timeline for this item. Effective dates drive replay, Subway diffs, and historical progress.')).toBeTruthy();
    expect(screen.getByTestId('item-history').textContent).toContain('40%');
    expect(screen.getByTestId('item-history').textContent).not.toContain('75%');
  });

  it('adds history for the current item without exposing the global event table', () => {
    const onHistoryChange = vi.fn();
    renderModal({
      historyEvents: [
        { ts: '2026-05-01T10:00:00.000Z', id: 'P1.1', status: 'wip', progress: 40, effectiveAt: '2026-05-01' },
      ],
      onHistoryChange,
    });

    fireEvent.click(screen.getByText('History'));
    fireEvent.change(screen.getByTestId('item-history-draft-date'), { target: { value: '2026-05-10' } });
    fireEvent.change(screen.getByTestId('item-history-draft-progress'), { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('item-history-add'));
    fireEvent.click(screen.getByTestId('item-history-apply'));

    expect(onHistoryChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'P1.1', progress: 80, effectiveAt: '2026-05-10' }),
    ]));
  });
});
