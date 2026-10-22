/** @vitest-environment happy-dom */
// A late project says what it waits on, where you look at it: above its
// roadmap rows, as a line on its Overview card, and the button moves the
// project that holds it back behind it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'P1', name: 'Bookkeeping', type: 'goal', status: 'open', displayOrder: 1 },
      { id: 'P1.1', name: 'Mail import', status: 'open', team: 'T1', best: 20, factor: 1, assign: [], deps: [] },
      { id: 'P2', name: 'Billing', type: 'deadline', date: '2026-02-06', status: 'open', displayOrder: 2 },
      { id: 'P2.1', name: 'Masks', status: 'open', team: 'T1', best: 10, factor: 1, assign: [], deps: [] },
    ],
    members: [{ id: 'M1', name: 'Jonas', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Backend', color: '#10b981' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Waits', planStart: '2026-01-05', planEnd: '2027-01-01' },
  }));
}

const renderApp = () => render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
const tabNamed = name => [...document.querySelectorAll('.tab')].find(el => (el.firstChild?.textContent || '').trim() === name);
const goToTab = async name => {
  await waitFor(() => { if (!tabNamed(name)) throw new Error(`no tab: ${name}`); });
  fireEvent.mouseDown(tabNamed(name));
};
function pickProject(name) {
  fireEvent.focus(screen.getByTestId('gantt-roadmap-lens-picker').querySelector('input'));
  fireEvent.click([...document.querySelectorAll('[data-ss-idx]')].find(row => row.textContent.includes(name)));
}

describe('what a late project waits on', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is shown above the roadmap, and the button moves the cause behind it', async () => {
    renderApp();
    await goToTab('Schedule');
    await goToTab('Roadmap');
    pickProject('Billing');
    const block = await screen.findByTestId('project-waits');
    expect(block.textContent).toContain('What is P2 waiting on?');
    expect(block.textContent).toContain('Jonas does 20 PT of P1 Bookkeeping first');
    const cause = block.querySelector('[data-pw-cause="P1"]');
    expect(cause).not.toBeNull();
    fireEvent.click([...cause.querySelectorAll('button')].find(b => b.textContent === 'Move P1 behind P2'));
    await waitFor(() => {
      expect(screen.getByTestId('project-waits').querySelector('[data-pw-cause]')).toBeNull();
    });
  });

  it('is a line on the Overview card of the late deadline', async () => {
    renderApp();
    await goToTab('Overview');
    const line = await waitFor(() => {
      const el = document.querySelector('[data-pw-line="P2"]');
      if (!el) throw new Error('no waits line');
      return el;
    });
    expect(line.textContent).toMatch(/^waits on P1 at Jonas, \d+ days$/);
  });
});
