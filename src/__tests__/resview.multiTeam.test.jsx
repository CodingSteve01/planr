/** @vitest-environment happy-dom */
// A person in several teams: listed under each team, with the realised split
// of their scheduled work shown as an outcome, and editable as a team list.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { ResView } from '../components/views/ResView.jsx';

const teams = [
  { id: 'T1', name: 'Backend', color: '#3b82f6' },
  { id: 'T2', name: 'Frontend', color: '#10b981' },
];
const jonas = { id: 'M1', name: 'Jonas', team: 'T1', teams: ['T1', 'T2'], cap: 1, vac: 25 };
const carla = { id: 'M2', name: 'Carla', team: 'T2', cap: 1, vac: 25 };
const scheduled = [
  { id: 'a', team: 'T1', personId: 'M1', effort: 6 },
  { id: 'b', team: 'T2', personId: 'M1', effort: 4 },
];

const noop = () => {};
const wrap = ui => render(<I18nProvider><ThemeProvider>{ui}</ThemeProvider></I18nProvider>);
const baseProps = {
  members: [jonas, carla], teams, vacations: [], meetingPlans: [], scheduled,
  onMeetingPlansUpd: noop, onUpd: noop, onAdd: noop, onClone: noop, onDel: noop,
  onVac: noop, onTeamUpd: noop, onTeamAdd: noop, onTeamDel: noop,
};

describe('ResView: multi-team members', () => {
  beforeEach(() => cleanup());

  it('lists the person under each of their teams', () => {
    wrap(<ResView {...baseProps} />);
    expect(screen.getAllByText('Jonas')).toHaveLength(2);
    expect(screen.getAllByText('Carla')).toHaveLength(1);
  });

  it('stays visible under a filter on their second team', () => {
    wrap(<ResView {...baseProps} teamFilter="T2" />);
    expect(screen.getAllByText('Jonas').length).toBeGreaterThan(0);
  });

  // Reported: two chips overflowed the column, so the second team read
  // "Front…" and the split line "78 % Backend ·…". Each team is its own
  // chip now, carrying its share, and the chips wrap instead of clipping.
  it('shows the share derived from scheduled tasks inside each team chip', () => {
    const { container } = wrap(<ResView {...baseProps} />);
    const chip = id => container.querySelector(`[data-team-chip="${id}"]`);
    expect(chip('T1').textContent).toBe('Backend60 %');
    expect(chip('T2').textContent).toBe('Frontend40 %');
    expect(chip('T1').closest('td').classList.contains('res-td-teams')).toBe(true);
  });

  it('gives work outside the person\'s own teams a chip of its own', () => {
    const extra = [...scheduled, { id: 'c', team: 'T3', personId: 'M1', effort: 10 }];
    const { container } = wrap(<ResView {...baseProps} scheduled={extra}
      teams={[...teams, { id: 'T3', name: 'RE/Proc', color: '#f0d342' }]} />);
    const other = container.querySelector('.res-team-badge-other[data-team-chip="T3"]');
    expect(other?.textContent).toBe('RE/Proc50 %');
  });

  it('shows no percentages while the work sits in one team', () => {
    const { container } = wrap(<ResView {...baseProps} scheduled={[scheduled[0]]} />);
    expect(container.querySelector('.res-team-share')).toBeNull();
  });

  it('adds a team through the editor without any percentage', () => {
    let updated = null;
    wrap(<ResView {...baseProps} members={[carla]} onUpd={m => { updated = m; }} />);
    fireEvent.click(screen.getByText('Carla'));
    const input = screen.getAllByPlaceholderText(/add team|team hinzufügen/i)[0];
    fireEvent.focus(input);
    const popup = document.querySelector('[data-searchselect-popup]');
    const option = [...popup.querySelectorAll('[data-ss-idx]')].find(el => el.textContent === 'Backend');
    fireEvent.click(option);
    expect(updated).toMatchObject({ team: 'T2', teams: ['T2', 'T1'] });
  });
});
