/** @vitest-environment happy-dom */
// The Jira reconcile dialog: link check without any input, then a pasted
// Jira table turning into a reviewable list of status changes.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { JiraSyncModal } from '../components/modals/JiraSyncModal.jsx';

const tree = [
  { id: 'D1', name: 'E-Rechnung', status: 'wip' },
  { id: 'D1.1', name: 'DMS anpassen', status: 'wip', customValues: { jira: 'NA-385' } },
  { id: 'D1.2', name: 'Zugferd 2.5', status: 'open', customValues: { jira: 'NA-266' } },
  { id: 'D1.3', name: 'Masken UI', status: 'open' },
];
const customFields = [{ id: 'jira', name: 'Jira ID', type: 'uri' }];
const noop = () => {};

function mount(extra = {}) {
  return render(
    <I18nProvider><ThemeProvider>
      <JiraSyncModal tree={tree} customFields={customFields}
        onApplyStatus={noop} onOpenItem={noop} onClose={noop} {...extra} />
    </ThemeProvider></I18nProvider>,
  );
}

const paste = text => fireEvent.change(screen.getByPlaceholderText(/Issue key/), { target: { value: text } });

describe('JiraSyncModal', () => {
  beforeEach(() => cleanup());

  it('reports link health from the plan alone', () => {
    mount();

    // 2 linked, 1 open leaf without a ticket, 0 duplicates.
    expect(screen.getByText('Open work without a ticket')).toBeTruthy();
    expect(screen.getByText('Masken UI')).toBeTruthy();
    // Parents are epic-level and legitimately unlinked — not flagged.
    expect(screen.queryByText('E-Rechnung')).toBeNull();
  });

  it('warns when the plan has no Jira field at all', () => {
    mount({ customFields: [{ id: 'risk', name: 'Risiko', type: 'text' }], tree: [{ id: 'P1', name: 'X', status: 'open' }] });

    expect(screen.getByText(/No Jira field found/)).toBeTruthy();
  });

  it('turns a pasted table into reviewable status changes', () => {
    mount();
    fireEvent.click(screen.getByText('Compare'));

    paste('Issue key,Summary,Status\nNA-385,DMS anpassen,Done\nNA-266,Zugferd 2.5,In Progress');

    expect(screen.getByText(/2 tickets recognised/)).toBeTruthy();
    expect(screen.getByText('Status drift')).toBeTruthy();
    expect(screen.getByText('Apply status (2)')).toBeTruthy();
  });

  it('applies only the rows left checked', () => {
    const onApplyStatus = vi.fn();
    const { container } = mount({ onApplyStatus });
    fireEvent.click(screen.getByText('Compare'));
    paste('Issue key,Status\nNA-385,Done\nNA-266,In Progress');

    // Uncheck the first drift row, then apply.
    fireEvent.click(container.querySelectorAll('input[type="checkbox"]')[0]);
    expect(screen.getByText('Apply status (1)')).toBeTruthy();
    fireEvent.click(screen.getByText('Apply status (1)'));

    expect(onApplyStatus).toHaveBeenCalledTimes(1);
    expect(onApplyStatus.mock.calls[0][0]).toEqual([
      { id: 'D1.2', name: 'Zugferd 2.5', status: 'wip', progress: 50, customValues: { jira: 'NA-266' } },
    ]);
  });

  it('lists tickets that exist only in Jira', () => {
    mount();
    fireEvent.click(screen.getByText('Compare'));

    paste('Issue key,Summary,Status\nNA-999,Neues Ticket,To Do');

    expect(screen.getByText('Only in Jira')).toBeTruthy();
    expect(screen.getByText('Neues Ticket')).toBeTruthy();
    // NA-385 / NA-266 are linked in the plan but absent from the paste.
    expect(screen.getByText('Only in the plan')).toBeTruthy();
  });

  it('explains an unusable paste instead of failing silently', () => {
    mount();
    fireEvent.click(screen.getByText('Compare'));

    paste('Name,Owner\nAnna,Bob');

    expect(screen.getByText(/No issue-key column found/)).toBeTruthy();
  });

  it('says so when plan and board agree', () => {
    mount();
    fireEvent.click(screen.getByText('Compare'));

    paste('Issue key,Summary,Status\nNA-385,DMS anpassen,In Progress\nNA-266,Zugferd 2.5,To Do');

    expect(screen.getByText('Plan and board agree.')).toBeTruthy();
  });
});
