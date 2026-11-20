/** @vitest-environment happy-dom */
// The tab bar is one row, and it stays one row.
//
// Seen in a pane around 800px wide: "Work Tree" and "Work order" each broke
// inside their own tab, so the bar grew to two lines tall on every view, and
// the tabs past "Resources" were cut off with nothing to say they were there.
// Eleven views do not fit a narrow pane, and two rows of tabs cost height on
// the screen that has least of it — so the row scrolls sideways instead, with
// the active tab always brought into view and a fade where it is cut.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');
const ruleFor = selector => {
  const at = css.indexOf(selector + '{');
  return at < 0 ? null : css.slice(at, css.indexOf('}', at));
};

describe('the tab row', () => {
  it('never lets a tab label wrap inside itself', () => {
    // This is the whole bug: nothing made the bar two rows, a two-word label
    // did it from the inside.
    expect(ruleFor('.tab')).toMatch(/white-space:\s*nowrap/);
  });

  it('scrolls sideways rather than wrapping', () => {
    const bar = ruleFor('.tab-bar');
    expect(bar).toMatch(/flex-wrap:\s*nowrap/);
    expect(bar).toMatch(/overflow-x:\s*auto/);
    // A scrollbar under the tabs would eat the height this is saving.
    expect(bar).toMatch(/scrollbar-width:\s*none/);
    expect(css).toMatch(/\.tab-bar::-webkit-scrollbar\{[^}]*display:\s*none/);
  });

  it('marks the cut edge, so a hidden tab is not a missing tab', () => {
    expect(css).toMatch(/\.tab-bar-wrap/);
    expect(css).toMatch(/\.tab-bar-fade/);
  });
});

describe('the active tab', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'de');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_v2', JSON.stringify({
      tree: [{ id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
             { id: 'A.1', name: 'A eins', status: 'open', team: 'T1', best: 5, factor: 1 }],
      members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0 }],
      teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
      vacations: [], meetingPlans: [],
      meta: { name: 'Tabs', planStart: '2026-01-05', planEnd: '2027-06-30' },
    }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

  it('is brought into view when it changes, so it is never the one cut off', async () => {
    // Reaching a tab from the command palette or a keyboard shortcut can
    // select one that is scrolled out of sight; without this the bar looks
    // like nothing happened.
    const seen = [];
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(function () { seen.push(this); });

    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await waitFor(() => {
      if (!document.querySelector('.tab.on')) throw new Error('no active tab');
    });
    seen.length = 0;

    const last = [...document.querySelectorAll('.tab')].at(-1);
    await act(async () => { fireEvent.mouseDown(last, { button: 0 }); });

    await waitFor(() => {
      if (!seen.some(el => el.classList?.contains('tab') && el.classList.contains('on'))) {
        throw new Error('the newly active tab was never scrolled into view');
      }
    });
    spy.mockRestore();
  });
});
