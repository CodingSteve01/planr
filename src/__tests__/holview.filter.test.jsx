/** @vitest-environment happy-dom */
// HolView gained a year filter — defaults to current year so multi-year
// NRW imports don't bury the page. Verify the filter narrows.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { HolView } from '../components/views/HolView.jsx';

const holidays = [
  { date: '2025-12-25', name: 'Weihnachten 2025', auto: true },
  { date: '2026-01-01', name: 'Neujahr 2026', auto: true },
  { date: '2026-12-25', name: 'Weihnachten 2026', auto: true },
];

function wrap(ui) {
  return render(<I18nProvider><ThemeProvider>{ui}</ThemeProvider></I18nProvider>);
}

describe('HolView year filter', () => {
  beforeEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('filters to the persisted year on load', () => {
    try { localStorage.setItem('planr_hol_year', '2025'); } catch { /* ignore */ }
    wrap(<HolView holidays={holidays} planStart="2025-01-01" planEnd="2027-01-01" onUpdate={() => {}} />);
    expect(screen.queryByText('Weihnachten 2025')).toBeTruthy();
    expect(screen.queryByText('Neujahr 2026')).toBeNull();
    expect(screen.queryByText('Weihnachten 2026')).toBeNull();
  });

  it('shows every year when filter is empty', () => {
    try { localStorage.setItem('planr_hol_year', ''); } catch { /* ignore */ }
    wrap(<HolView holidays={holidays} planStart="2025-01-01" planEnd="2027-01-01" onUpdate={() => {}} />);
    expect(screen.queryByText('Weihnachten 2025')).toBeTruthy();
    expect(screen.queryByText('Neujahr 2026')).toBeTruthy();
    expect(screen.queryByText('Weihnachten 2026')).toBeTruthy();
  });
});
