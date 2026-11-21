/** @vitest-environment happy-dom */
// A member whose meetings take their whole week cannot finish anything, yet
// work assigned to them by name still lands on them. The planning review's
// warnings name them, with that work, so the stretched bar has a reason on
// screen.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { PlanReview } from '../components/views/PlanReview.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('planning review warnings', () => {
  it('name a member without capacity and the work assigned to them', () => {
    localStorage.setItem('planr_lang', 'en');
    const tree = [{ id: 'P1', name: 'Item', team: 'T1', best: 3, factor: 1, status: 'open', assign: ['ML'] }];
    const members = [{ id: 'ML', name: 'Mara', team: 'T1', capMode: 'derived', weeklyHours: 8, meetingPlanIds: ['dev'] }];
    const meetingPlans = [{ id: 'dev', name: 'dev', meetings: [{ id: 'm', name: 'Standup', hours: 2, frequency: 'daily' }] }];
    const scheduled = [{ id: 'P1', personId: 'ML', status: 'open', startD: new Date(2026, 0, 5), endD: new Date(2036, 0, 5) }];
    render(
      <I18nProvider>
        <ThemeProvider>
          <PlanReview
            tree={tree}
            scheduled={scheduled}
            members={members}
            teams={[{ id: 'T1', name: 'Team' }]}
            meetingPlans={meetingPlans}
            confidence={{}}
            cpSet={new Set()}
            onOpenItem={() => {}}
            onUpdate={() => {}}
          />
        </ThemeProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText(/^Warnings/));
    const row = document.querySelector('[data-no-capacity="ML"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Mara');
    expect(row.textContent).toContain('P1');
  });
});
