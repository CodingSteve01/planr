/** @vitest-environment happy-dom */
// Every project is in the overview, not only the labelled ones.
//
// Reported: projects are missing under "Focus", running ones among them, and
// they are missing from the PDF too. The section listed roots carrying a
// `type` — goal, pain point or deadline — and a type is an ANNOTATION on a
// project, not the thing that makes it exist. On a real plan that was five of
// eight projects absent, the largest running one included. A management
// summary that omits the biggest project is worse than none.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { buildExportCtx } from '../utils/exportCtx.js';
import { generateReport } from '../utils/report.js';
import { treeStats } from '../utils/scheduler.js';

const TREE = [
  { id: 'A', name: 'Ein Ziel', type: 'goal', status: 'wip', team: 'T1' },
  { id: 'A.1', name: 'a', status: 'open', team: 'T1', best: 5, factor: 1 },
  // No type at all — and the one actually being worked on.
  { id: 'B', name: 'Namenloses Grossprojekt', status: 'wip', team: 'T1' },
  { id: 'B.1', name: 'b', status: 'open', team: 'T1', best: 20, factor: 1 },
  // Dropped: a decision NOT to do something is not a focus.
  { id: 'C', name: 'Verworfenes', status: 'open', team: 'T1', dropped: true },
  { id: 'C.1', name: 'c', status: 'open', team: 'T1', best: 5, factor: 1, dropped: true },
];
const PLAN = {
  tree: TREE,
  members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
  teams: [{ id: 'T1', name: 'Team A', color: '#3b82f6' }],
  vacations: [], holidays: [], meetingPlans: [],
  meta: { name: 'Fokus', planStart: '2026-01-05', planEnd: '2027-06-30', version: '2' },
};

describe('the overview lists every project', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    localStorage.setItem('planr_lang', 'de');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_v2', JSON.stringify(PLAN));
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows a project nobody labelled a goal', async () => {
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await waitFor(() => expect(document.body.textContent).toContain('Ein Ziel'));
    expect(document.body.textContent, 'an untyped project is missing from the overview')
      .toContain('Namenloses Grossprojekt');
  });

  it('still leaves a dropped one out of the focus list', async () => {
    // Dropped work is visible elsewhere on purpose — you have to be able to
    // see what you decided against — but it is not a focus.
    render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    await waitFor(() => expect(document.body.textContent).toContain('Ein Ziel'));
    const heading = [...document.querySelectorAll('.section-h')].find(el => /Fokus/.test(el.textContent));
    expect(heading, 'no focus section').toBeTruthy();
    let text = '';
    for (let el = heading.nextElementSibling; el && !el.classList.contains('section-h'); el = el.nextElementSibling) {
      text += el.textContent;
    }
    expect(text).toContain('Namenloses Grossprojekt');
    expect(text).not.toContain('Verworfenes');
  });
});

describe('and so does the report the PDF is built from', () => {
  it('carries the untyped project and not the dropped one', () => {
    const html = generateReport(buildExportCtx({
      data: PLAN, scheduled: [], weeks: [], cpSet: new Set(), goalPaths: {},
      stats: treeStats(TREE), confidence: {}, lang: 'de',
    }));
    // Scoped to the table this is about: dropped work is deliberately marked
    // rather than omitted in other sections of the same document.
    const at = html.indexOf('Projekte, Ziele &amp; Deadlines') >= 0
      ? html.indexOf('Projekte, Ziele &amp; Deadlines')
      : html.indexOf('Projekte, Ziele & Deadlines');
    expect(at, 'no projects/goals section in the report').toBeGreaterThan(-1);
    const section = html.slice(at, html.indexOf('</table>', at));
    expect(section).toContain('Namenloses Grossprojekt');
    expect(section).toContain('Ein Ziel');
    expect(section).not.toContain('Verworfenes');
  });
});
