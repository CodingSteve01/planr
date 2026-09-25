/** @vitest-environment happy-dom */
// The Gantt's keys (↑/↓, ⌥↑/⌥↓, E/Enter, ⌘A) are bound on the window, and a
// visited tab stays mounted behind the active one. So once the Gantt had been
// opened it kept answering on every other tab: ⌘A selected bars nobody could
// see instead of selecting text, ↑/↓ stopped scrolling the Overview, and ⌥↑
// or E in the tree also reordered or opened the Gantt's old cursor row.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seed() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'A eins', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
      { id: 'A.2', name: 'A zwei', status: 'open', team: 'T1', best: 5, factor: 1, assign: ['M1'] },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'GanttKeys', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const tabNamed = name => [...document.querySelectorAll('.tab')]
  .find(el => (el.firstChild?.textContent || '').trim() === name);
const press = init => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
};

describe('the schedule\'s keys stay on the schedule', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'gantt');
    localStorage.setItem('planr_tour_done', '1');
    seed();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('answers while the schedule is showing, and not after leaving it', async () => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await waitFor(() => { if (!document.querySelector('[data-task-id]')) throw new Error('no bars'); });

    // Showing: ↓ moves the Gantt cursor, so it takes the key.
    let down;
    await act(async () => { down = press({ key: 'ArrowDown' }); });
    expect(down.defaultPrevented).toBe(true);

    await act(async () => { fireEvent.mouseDown(tabNamed('Overview'), { button: 0 }); });
    await waitFor(() => { if (document.querySelector('[data-testid="gantt-timeline"]')?.closest('[style*="display: none"]') == null) throw new Error('gantt still shown'); });

    let selectAll, arrow, open;
    await act(async () => {
      selectAll = press({ key: 'a', metaKey: true });
      arrow = press({ key: 'ArrowDown' });
      open = press({ key: 'e' });
    });
    expect(selectAll.defaultPrevented).toBe(false);
    expect(arrow.defaultPrevented).toBe(false);
    expect(open.defaultPrevented).toBe(false);
    expect(document.querySelector('[data-testid="node-modal"]')).toBeNull();
  });
});
