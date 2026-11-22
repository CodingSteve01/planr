/** @vitest-environment happy-dom */
// A task that found no working day before the plan end is listed in the
// planning review's warnings, not left looking like scheduled work.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { PlanReview } from '../components/views/PlanReview.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const tree = [{ id: 'P1', name: 'Rechnungen', team: 'Frontend', best: 3, factor: 1, status: 'open', assign: ['M1'] }];
const members = [{ id: 'M1', name: 'Anna Noor', team: 'Frontend', cap: 1 }];
const overflow = {
  id: 'P1',
  name: 'Rechnungen',
  personId: 'M1',
  status: 'open',
  beyondHorizon: true,
  effort: 3,
  startD: new Date(2026, 0, 26),
  endD: new Date(2026, 0, 26),
};

function renderReview(scheduled) {
  localStorage.setItem('planr_lang', 'en');
  render(
    <I18nProvider>
      <ThemeProvider>
        <PlanReview
          tree={tree}
          scheduled={scheduled}
          members={members}
          teams={[{ id: 'Frontend', name: 'Frontend' }]}
          meetingPlans={[]}
          confidence={{}}
          cpSet={new Set()}
          onOpenItem={() => {}}
          onUpdate={() => {}}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe('a task beyond the plan horizon', () => {
  it('is listed in the review warnings and counted on the tab', () => {
    renderReview([overflow]);
    expect(screen.getByText(/^Warnings \(1\)/)).not.toBeNull();
    fireEvent.click(screen.getByText(/^Warnings/));
    const group = document.querySelector('[data-testid="warn-beyond-horizon"]');
    expect(group).not.toBeNull();
    expect(group.textContent).toContain('P1');
    expect(group.textContent).toContain('Rechnungen');
  });

  it('does not show the group for a task that fits', () => {
    renderReview([{ ...overflow, beyondHorizon: false }]);
    fireEvent.click(screen.getByText(/^Warnings/));
    expect(document.querySelector('[data-testid="warn-beyond-horizon"]')).toBeNull();
  });
});
