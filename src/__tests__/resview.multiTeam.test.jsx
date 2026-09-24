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

  it('shows the share derived from scheduled tasks', () => {
    wrap(<ResView {...baseProps} />);
    const lines = screen.getAllByText(/60 % Backend · 40 % Frontend/);
    expect(lines.length).toBeGreaterThan(0);
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
