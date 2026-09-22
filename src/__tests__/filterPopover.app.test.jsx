/** @vitest-environment happy-dom */
// A filter you cannot pick is worse than one that is not there.
//
// Reported: "I can't select anything in the filters, it just doesn't take."
// Both halves of that were one bug. The panel is portalled out of the
// toolbar (it has to be — an absolutely-positioned panel is clipped by a
// scrolling ancestor), and the SearchSelect inside it portals its own option
// list out in turn. So a click on an option landed in neither the trigger nor
// the panel, the outside-click handler fired on mousedown, and the panel was
// gone before the option's click ever ran.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const seed = () => {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'en');
  localStorage.setItem('planr_tab', 'tree');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt Alpha', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'Alpha eins', status: 'open', team: 'T1', best: 10, factor: 1 },
      { id: 'B', name: 'Projekt Beta', status: 'open', team: 'T1' },
      { id: 'B.1', name: 'Beta eins', status: 'open', team: 'T1', best: 5, factor: 1 },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0 }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    meta: { name: 'Filters', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
};

const openPanel = async () => {
  render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
  const trigger = await screen.findByTestId('view-filters-trigger');
  await act(async () => { fireEvent.click(trigger); });
  await waitFor(() => {
    if (!document.querySelector('[data-testid="view-filters-panel"]')) throw new Error('panel did not open');
  });
};

describe('the filter panel', () => {
  beforeEach(() => { cleanup(); seed(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('holds the scope pickers, which used to sit in the toolbar', async () => {
    await openPanel();
    for (const id of ['root', 'team', 'person']) {
      expect(screen.getByTestId(`scope-field-${id}`), `${id} picker missing`).toBeTruthy();
    }
  });

  it('stays open while you use a picker inside it', async () => {
    await openPanel();
    const input = screen.getByTestId('scope-field-root').querySelector('input');
    await act(async () => { fireEvent.focus(input); fireEvent.click(input); });
    await waitFor(() => {
      if (!document.querySelector('[data-searchselect-popup]')) throw new Error('option list did not open');
    });
    // The click that selects an option lands in the select's own portal.
    const popup = document.querySelector('[data-searchselect-popup]');
    await act(async () => { fireEvent.mouseDown(popup); });
    expect(document.querySelector('[data-testid="view-filters-panel"]'),
      'the panel closed the moment the option list was touched').toBeTruthy();
  });

  it('actually applies the pick, and says so with a chip', async () => {
    await openPanel();
    const input = screen.getByTestId('scope-field-root').querySelector('input');
    await act(async () => { fireEvent.focus(input); fireEvent.click(input); });
    const option = await waitFor(() => {
      const el = [...document.querySelectorAll('[data-searchselect-popup] [data-ss-idx]')]
        .find(n => /Projekt Beta/.test(n.textContent));
      if (!el) throw new Error('option not listed');
      return el;
    });
    await act(async () => { fireEvent.click(option); });

    await waitFor(() => {
      const chip = document.querySelector('[data-testid="scope-root"]');
      if (!chip) throw new Error('no chip for the narrowed view');
      if (!/Projekt Beta/.test(chip.textContent)) throw new Error('chip names the wrong thing');
    });
  });

  it('clears the filter from its own chip', async () => {
    await openPanel();
    const input = screen.getByTestId('scope-field-root').querySelector('input');
    await act(async () => { fireEvent.focus(input); fireEvent.click(input); });
    const option = await waitFor(() => {
      const el = [...document.querySelectorAll('[data-searchselect-popup] [data-ss-idx]')]
        .find(n => /Projekt Beta/.test(n.textContent));
      if (!el) throw new Error('option not listed');
      return el;
    });
    await act(async () => { fireEvent.click(option); });
    const chip = await screen.findByTestId('scope-root');
    await act(async () => { fireEvent.click(chip); });
    await waitFor(() => {
      if (document.querySelector('[data-testid="scope-root"]')) throw new Error('chip still there');
    });
  });
});

// A filter control belongs on every view the filters change, and nowhere
// else. It used to skip the Overview and the Roadmap — both of which answer
// to the archive filter and the Review/Plan window — so on those two a
// narrowed view had no way to say so and no way to be widened again. The
// Overview had its own second copy of the control inside the view instead,
// which is one copy too many on one screen.
describe('the filter bar', () => {
  beforeEach(() => { cleanup(); seed(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  const tabIndexOf = async name => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    return waitFor(() => {
      const el = [...document.querySelectorAll('.tab')].find(t => t.textContent.trim().startsWith(name));
      if (!el) throw new Error(`no ${name} tab`);
      return el;
    });
  };

  it.each(['Overview', 'Work Tree', 'Work order', 'Schedule', 'Roadmap', 'Briefing', 'Planning', 'Network'])(
    'is on %s, which these filters change',
    async name => {
      const tab = await tabIndexOf(name);
      await act(async () => { fireEvent.mouseDown(tab, { button: 0 }); });
      await waitFor(() => {
        if (!document.querySelector('[data-testid="view-filters-trigger"]')) {
          throw new Error(`no filter control on ${name}`);
        }
      });
    },
  );

  it.each(['Resources', 'Holidays', 'Report'])('is not on %s, where nothing here reaches', async name => {
    const tab = await tabIndexOf(name);
    await act(async () => { fireEvent.mouseDown(tab, { button: 0 }); });
    expect(document.querySelector('[data-testid="view-filters-trigger"]'),
      `a filter control on ${name} would do nothing`).toBeNull();
  });

  it('shows exactly one of them, never two on the same screen', async () => {
    const tab = await tabIndexOf('Overview');
    await act(async () => { fireEvent.mouseDown(tab, { button: 0 }); });
    await waitFor(() => {
      if (!document.querySelector('[data-testid="view-filters-trigger"]')) throw new Error('none yet');
    });
    expect(document.querySelectorAll('[data-testid="view-filters-trigger"]')).toHaveLength(1);
  });
});
