/** @vitest-environment happy-dom */
// ResView ignored the global topbar filters before — the resource page kept
// listing every member regardless of personFilter / teamFilter. Verify that
// passing a filter narrows the rendered rows.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { ResView } from '../components/views/ResView.jsx';

const teams = [
  { id: 'T1', name: 'Backend', color: '#3b82f6' },
  { id: 'T2', name: 'Frontend', color: '#10b981' },
];
const members = [
  { id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 },
  { id: 'M2', name: 'Bob', team: 'T1', cap: 1, vac: 25 },
  { id: 'M3', name: 'Carla', team: 'T2', cap: 1, vac: 25 },
];
const vacations = [
  { person: 'M1', from: '2026-05-01', to: '2026-05-07', note: '' },
  { person: 'M3', from: '2026-06-01', to: '2026-06-07', note: '' },
];

const noop = () => {};
function wrap(ui) {
  return render(<I18nProvider><ThemeProvider>{ui}</ThemeProvider></I18nProvider>);
}
const baseProps = {
  members, teams, vacations, meetingPlans: [],
  onMeetingPlansUpd: noop, onUpd: noop, onAdd: noop, onClone: noop, onDel: noop,
  onVac: noop, onTeamUpd: noop, onTeamAdd: noop, onTeamDel: noop,
};

describe('ResView filter', () => {
  beforeEach(() => cleanup());

  it('shows every member without a filter', () => {
    wrap(<ResView {...baseProps} />);
    expect(screen.queryByText('Anna')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeTruthy();
    expect(screen.queryByText('Carla')).toBeTruthy();
  });

  it('shows only the selected person when personFilter is set', () => {
    wrap(<ResView {...baseProps} personFilter="M1" />);
    expect(screen.queryByText('Anna')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText('Carla')).toBeNull();
  });

  it('limits members to the selected team when teamFilter is set', () => {
    wrap(<ResView {...baseProps} teamFilter="T2" />);
    expect(screen.queryByText('Anna')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText('Carla')).toBeTruthy();
  });
});
