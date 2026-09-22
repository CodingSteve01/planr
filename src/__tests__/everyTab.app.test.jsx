/** @vitest-environment happy-dom */
// "Bei einem Klick auf 'Planung' ist das ganze Plugin weiß geworden."
//
// views.smoke.test.jsx mounts each view with its own hand-written props and
// proves the component renders. What it cannot prove is that App passes it
// props of that shape — and App is where the last few changes were. That gap
// is exactly how a view can go white while every test is green.
//
// So: open every tab in the real App, and read the plan back afterwards to be
// sure the shell is still standing rather than merely not throwing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act, waitFor } from '@testing-library/react';
import App, { TAB_IDS } from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

function seedProject() {
  localStorage.setItem('planr_v2', JSON.stringify({
    tree: [
      { id: 'A', name: 'Projekt A', status: 'wip', team: 'T1' },
      { id: 'A.1', name: 'A eins', status: 'done', progress: 100, team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'A.2', name: 'A zwei', status: 'wip', progress: 30, team: 'T1', best: 10, factor: 1, assign: ['M1'] },
      { id: 'B', name: 'Projekt B', status: 'open', team: 'T1' },
      { id: 'B.1', name: 'B eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'], deps: ['A.1'] },
      { id: 'B.2', name: 'B zwei', status: 'open', team: 'T1', best: 5, factor: 1, dropped: true },
    ],
    members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 25, start: '2026-01-01' }],
    teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
    vacations: [], meetingPlans: [],
    personQueues: { M1: ['A.2', 'A.1', 'B.1'] },
    meta: { name: 'Every tab', planStart: '2026-01-05', planEnd: '2027-06-30' },
  }));
}

const renderApp = () => render(
  <I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>,
);
const tabs = () => [...document.querySelectorAll('.tab')];
const labelOf = el => (el.firstChild?.textContent || '').trim();

describe('every view opens', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'en');
    localStorage.setItem('planr_tab', 'tree');
    localStorage.setItem('planr_tree_ids', 'true');
    localStorage.setItem('planr_tour_done', '1');
    seedProject();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('clicking each tab in turn leaves the app standing', async () => {
    const errors = [];
    const origError = console.error;
    console.error = (...args) => { errors.push(args.join(' ')); origError(...args); };
    try {
      renderApp();
      await waitFor(() => { if (!tabs().length) throw new Error('no tab bar'); });
      expect(tabs()).toHaveLength(TAB_IDS.length);

      for (const label of tabs().map(labelOf)) {
        const tab = tabs().find(el => labelOf(el) === label);
        await act(async () => { fireEvent.mouseDown(tab, { button: 0 }); });
        // The shell is still there — a white screen is an App that unmounted.
        expect(document.querySelector('.tab-bar'), `after opening ${label}`).toBeTruthy();
        expect(document.querySelector('.topbar'), `after opening ${label}`).toBeTruthy();
      }
    } finally {
      console.error = origError;
    }

    // React logs the component stack before it tears the tree down; a render
    // that threw is not "green just because nothing was asserted".
    const thrown = errors.filter(e => /Error|Cannot read|is not a function|undefined is not/.test(e));
    expect(thrown, thrown.join('\n---\n')).toEqual([]);
  });
});
