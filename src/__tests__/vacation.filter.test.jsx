/** @vitest-environment happy-dom */
// Vacations section in ResView grew its own member + year filter so a
// long vacation history doesn't force scrolling. Verify both narrow the
// rendered rows.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { ResView } from '../components/views/ResView.jsx';

const teams = [{ id: 'T1', name: 'Backend', color: '#3b82f6' }];
const members = [
  { id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 },
  { id: 'M2', name: 'Bob', team: 'T1', cap: 1, vac: 25 },
];
const vacations = [
  { person: 'M1', from: '2025-08-01', to: '2025-08-14', note: 'A 2025' },
  { person: 'M1', from: '2026-05-01', to: '2026-05-07', note: 'A 2026' },
  { person: 'M2', from: '2026-06-01', to: '2026-06-07', note: 'B 2026' },
];

const noop = () => {};
const baseProps = {
  members, teams, vacations, meetingPlans: [],
  onMeetingPlansUpd: noop, onUpd: noop, onAdd: noop, onClone: noop, onDel: noop,
  onVac: noop, onTeamUpd: noop, onTeamAdd: noop, onTeamDel: noop,
};
function wrap(ui) {
  return render(<I18nProvider><ThemeProvider>{ui}</ThemeProvider></I18nProvider>);
}

describe('Vacation filter', () => {
  beforeEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it('shows all vacations by default and switches to vacations section', () => {
    wrap(<ResView {...baseProps} />);
    // Click vacations pill.
    const pill = screen.getByRole('button', { name: /Urlaub|Vacation/ });
    fireEvent.click(pill);
    expect(screen.queryByText('A 2025')).toBeTruthy();
    expect(screen.queryByText('A 2026')).toBeTruthy();
    expect(screen.queryByText('B 2026')).toBeTruthy();
  });

  it('narrows by year filter', () => {
    try { localStorage.setItem('planr_vac_year', '2026'); } catch { /* ignore */ }
    wrap(<ResView {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Urlaub|Vacation/ }));
    expect(screen.queryByText('A 2025')).toBeNull();
    expect(screen.queryByText('A 2026')).toBeTruthy();
    expect(screen.queryByText('B 2026')).toBeTruthy();
  });

  it('narrows by member filter', () => {
    try { localStorage.setItem('planr_vac_member', 'M1'); } catch { /* ignore */ }
    wrap(<ResView {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Urlaub|Vacation/ }));
    expect(screen.queryByText('A 2025')).toBeTruthy();
    expect(screen.queryByText('A 2026')).toBeTruthy();
    expect(screen.queryByText('B 2026')).toBeNull();
  });

  it('intersects member + year filters', () => {
    try {
      localStorage.setItem('planr_vac_member', 'M1');
      localStorage.setItem('planr_vac_year', '2026');
    } catch { /* ignore */ }
    wrap(<ResView {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Urlaub|Vacation/ }));
    expect(screen.queryByText('A 2025')).toBeNull();
    expect(screen.queryByText('A 2026')).toBeTruthy();
    expect(screen.queryByText('B 2026')).toBeNull();
  });
});
