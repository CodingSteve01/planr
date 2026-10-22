/** @vitest-environment happy-dom */
// "Work out the order" in the planning review: runs on demand, lists the
// better order with what it gains and costs, and applies it only on request.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { PlanReview } from '../components/views/PlanReview.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { schedule } from '../utils/scheduler.js';

afterEach(() => { cleanup(); localStorage.clear(); });

const PS = '2026-01-05';
const members = [{ id: 'X', name: 'Xaver', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }];
const tree = [
  { id: 'P1', name: 'Bookkeeping', displayOrder: 1 },
  { id: 'P1.1', name: 'Mail import', team: 'T1', best: 20, factor: 1, status: 'open' },
  { id: 'P2', name: 'Billing', type: 'deadline', date: '2026-01-30', displayOrder: 2 },
  { id: 'P2.1', name: 'Masks', team: 'T1', best: 10, factor: 1, status: 'open' },
];
const reschedule = t => schedule(t, members, [], PS, '2027-12-31', {}, [1, 2, 3, 4, 5], PS,
  { now: PS, anchorToToday: false, discountProgress: false }).results;

describe('working out the order in the planning review', () => {
  it('lists the better order and applies it on request', async () => {
    localStorage.setItem('planr_lang', 'en');
    const onApplyOrder = vi.fn();
    render(<I18nProvider><ThemeProvider>
      <PlanReview tree={tree} planTree={tree} scheduled={reschedule(tree)} members={members} teams={[{ id: 'T1', name: 'Team' }]}
        confidence={{}} cpSet={new Set()} stats={{}} onOpenItem={() => {}} onUpdate={() => {}}
        reschedule={reschedule} onApplyOrder={onApplyOrder} />
    </ThemeProvider></I18nProvider>);
    fireEvent.click(screen.getByText('Order'));
    fireEvent.click(screen.getByTestId('order-search-start'));
    const alt = await waitFor(() => {
      const el = document.querySelector('[data-or-alt="0"]');
      if (!el || !el.textContent.includes('Apply')) throw new Error('no finished alternative');
      return el;
    });
    expect(alt.textContent).toContain('P2 before P1');
    expect(alt.textContent).toContain('deadlines missed: 1 → 0');
    expect(alt.querySelector('[data-or-row="P2"]').textContent).toMatch(/\d+ days earlier/);
    expect(alt.querySelector('[data-or-row="P1"]').textContent).toMatch(/\d+ days later/);
    expect(onApplyOrder).not.toHaveBeenCalled();
    fireEvent.click([...alt.querySelectorAll('button')].find(b => b.textContent === 'Apply'));
    expect(onApplyOrder).toHaveBeenCalledWith(['P2', 'P1']);
  });
});
