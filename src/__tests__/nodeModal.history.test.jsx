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

    fireEvent.click(screen.getByText('History'));

    expect(screen.getByTestId('item-history')).toBeTruthy();
    expect(screen.getByTestId('item-history').textContent).toContain('Version history for this item');
    expect(screen.getByTestId('item-history').textContent).toContain('40%');
    expect(screen.getByTestId('item-history').textContent).not.toContain('75%');
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

    fireEvent.click(screen.getByText('History'));
    const rows = screen.getAllByTestId('item-history-row');
    expect(rows.length).toBe(2);
    fireEvent.click(rows[0].querySelector('button'));

    expect(onHistoryChange).toHaveBeenCalled();
    const result = onHistoryChange.mock.calls[0][0];
    expect(result.filter(e => e.id === 'P1.1').length).toBe(1);
    expect(result.find(e => e.id === 'P1.1').progress).toBe(60);
  });
});
