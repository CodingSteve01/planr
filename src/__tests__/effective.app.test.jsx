/** @vitest-environment happy-dom */
// Working on a date, through the real App: pick the day, edit a person the
// ordinary way, and the edit takes effect on that day — in the file, in the
// lens the Resources view shows, and for the scheduler.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seed(extra = {}) {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Project', status: 'open', type: 'goal' },
      { id: 'P1.1', name: 'Alpha Task', team: 'T1', best: 5, factor: 1, status: 'open', assign: ['M1'], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 }, { id: 'M2', name: 'Bo', team: 'T1', cap: 1, vac: 25 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Dated Test', planStart: '2026-01-05' },
    ...extra,
  }));
}
const stored = () => JSON.parse(localStorage.getItem('planr_v2'));
const storedWhen = async check => { await waitFor(() => { check(stored()); }, { timeout: 8000, interval: 100 }); return stored(); };

async function pickDate(day) {
  fireEvent.click(await screen.findByTestId('effective-switch'));
  fireEvent.change(screen.getByTestId('effective-date-input'), { target: { value: day } });
  fireEvent.click(screen.getByTestId('effective-date-ok'));
  await screen.findByTestId('effective-bar');
}
// The capacity percentage in the person's dialog (manual mode): a number input.
async function setCapacity(name, pct) {
  fireEvent.click((await screen.findAllByText(name))[0].closest('tr'));
  const modal = await screen.findByTestId('member-modal');
  const input = [...modal.querySelectorAll('.member-cap input[type="number"]')][0];
  fireEvent.change(input, { target: { value: String(pct) } });
  fireEvent.blur(input);
  return modal;
}

describe('working on a date', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); localStorage.setItem('planr_lang', 'en'); localStorage.setItem('planr_tab', 'resources'); seed(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is quiet while it is today, and says the date when it is not', async () => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    expect((await screen.findByTestId('effective-switch')).textContent).toContain('Today');
    expect(screen.queryByTestId('effective-bar')).toBeNull();
    await pickDate('2027-03-01');
    expect(screen.getByTestId('effective-bar-date').textContent).toBe('from 01/03/2027');
    expect(screen.getByTestId('effective-switch').textContent).toContain('from 01/03/2027');
    fireEvent.click(screen.getByTestId('effective-leave'));
    await waitFor(() => expect(screen.queryByTestId('effective-bar')).toBeNull());
  });

  it('an edit to a person\'s capacity on a date lands in that date, not in the plan', async () => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await pickDate('2027-03-01');
    const modal = await setCapacity('Anna', 50);
    expect(within(modal).getByTestId('dated-hint').textContent).toContain('01/03/2027');
    const file = await storedWhen(d => expect(d.changes?.length).toBe(1));
    expect(file.members.find(m => m.id === 'M1').cap).toBe(1);
    expect(file.changes).toEqual([{ from: '2027-03-01', patch: { members: { set: { M1: { cap: 0.5 } } } } }]);
    // The dialog lists what is planned, on the day being edited.
    await waitFor(() => expect(within(modal).getByTestId('planned-2027-03-01').textContent).toContain('Capacity 50 %'));
    expect(screen.getByTestId('effective-bar').textContent).toContain('1 change');
  });

  it('today still shows today\'s value, and the planned change is one click away', async () => {
    seed({ changes: [{ from: '2027-03-01', patch: { members: { set: { M1: { cap: 0.5 } } } } }] });
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    fireEvent.click((await screen.findAllByText('Anna'))[0].closest('tr'));
    const modal = await screen.findByTestId('member-modal');
    expect(modal.querySelector('.member-cap input[type="number"]').value).toBe('100');
    fireEvent.click(within(modal).getByText('from 01/03/2027'));
    await screen.findByTestId('effective-bar');
    await waitFor(() => expect(screen.getByTestId('member-modal').querySelector('.member-cap input[type="number"]').value).toBe('50'));
    // And it can be taken away again from the same list.
    fireEvent.click(within(screen.getByTestId('member-modal')).getByTestId('planned-drop-2027-03-01'));
    await storedWhen(d => expect(d.changes).toBeUndefined());
  });

  it('removing somebody on a date makes them leave the day before, and they stay in the plan', async () => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await pickDate('2027-03-01');
    fireEvent.click((await screen.findAllByText('Bo'))[0].closest('tr'));
    const modal = await screen.findByTestId('member-modal');
    fireEvent.click(within(modal).getByText('Remove'));
    const file = await storedWhen(d => expect(d.members.find(m => m.id === 'M2')?.end).toBe('2027-02-28'));
    expect(file.members).toHaveLength(2);
  });

  it('removing on a date never keeps somebody longer, and deletes who was never there', async () => {
    seed({ members: [
      { id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25 },
      { id: 'M2', name: 'Bo', team: 'T1', cap: 1, vac: 25, end: '2026-12-31' },      // already leaving earlier
      { id: 'M3', name: 'Cy', team: 'T1', cap: 1, vac: 25, start: '2027-06-01' },    // joins after the date
    ] });
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await pickDate('2027-03-01');
    for (const name of ['Bo', 'Cy']) {
      fireEvent.click((await screen.findAllByText(name))[0].closest('tr'));
      fireEvent.click(within(await screen.findByTestId('member-modal')).getByText('Remove'));
    }
    const file = await storedWhen(d => expect(d.members.map(m => m.id)).toEqual(['M1', 'M2']));
    expect(file.members.find(m => m.id === 'M2').end).toBe('2026-12-31');
  });

  it('the menu lists the dates something changes on', async () => {
    seed({ changes: [{ from: '2027-03-01', patch: { members: { set: { M1: { cap: 0.5 } } } } }, { from: '2027-09-01', patch: { members: { set: { M1: { cap: 1 }, M2: { cap: 0.8 } } } } }] });
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    fireEvent.click(await screen.findByTestId('effective-switch'));
    expect(screen.getByTestId('effective-pick-2027-03-01').textContent).toContain('1 change');
    expect(screen.getByTestId('effective-pick-2027-09-01').textContent).toContain('2 changes');
    fireEvent.click(screen.getByTestId('effective-drop-2027-03-01'));
    await storedWhen(d => expect(d.changes.map(c => c.from)).toEqual(['2027-09-01']));
  });
});
