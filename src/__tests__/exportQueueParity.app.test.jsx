/** @vitest-environment happy-dom */
// Guardrail: a per-person work order must reach the PDF, not just the screen.
//
// Asked: "are there more places running off the rails? I don't want to hand a
// PDF to the managing director with the wrong numbers on it." The work order
// (personQueues) is the newest way for the schedule and an export to disagree:
// App computes `scheduled` once, with the queues, and every export consumes
// that one array. If someone ever hands an export the FILTERED `activeScheduled`
// instead, or forgets the queues in the scheduler call, the PDF silently prints
// a different plan than the Schedule tab. This mounts the real App, clicks the
// real export button, and compares the dates in pdfmake's docDefinition against
// the dates the queue actually produces.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';

const captured = [];
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addVirtualFileSystem: () => {},
    createPdf: (dd) => { captured.push(dd); return { download: () => {} }; },
  },
}));
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: { pdfMake: { vfs: {} } }, pdfMake: { vfs: {} }, vfs: {} }));

// Two independent projects on one person. The tree says A before B; the tree
// has no opinion on A.1 vs B.1 beyond that, which is precisely the gap the
// work order exists to fill.
const PLAN = {
  tree: [
    { id: 'A', name: 'Projekt Alpha', status: 'wip', team: 'T1' },
    { id: 'A.1', name: 'Alpha eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
    { id: 'A.2', name: 'Alpha zwei', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
    { id: 'B', name: 'Projekt Beta', status: 'wip', team: 'T1' },
    { id: 'B.1', name: 'Beta eins', status: 'open', team: 'T1', best: 10, factor: 1, assign: ['M1'] },
  ],
  members: [{ id: 'M1', name: 'Anna', team: 'T1', cap: 1, vac: 0, start: '2026-01-01' }],
  teams: [{ id: 'T1', name: 'Team Eins', color: '#3b82f6' }],
  vacations: [], meetingPlans: [],
  meta: { name: 'Queue-Parity', planStart: '2026-01-05', planEnd: '2027-06-30' },
};

function seed(personQueues) {
  localStorage.clear();
  localStorage.setItem('planr_lang', 'de');
  localStorage.setItem('planr_tour_done', '1');
  localStorage.setItem('planr_tab', 'report');
  localStorage.setItem('planr_v2', JSON.stringify(personQueues ? { ...PLAN, personQueues } : PLAN));
}

// Every string pdfmake would draw, in document order.
function pdfText(node, out = []) {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach(n => pdfText(n, out)); return out; }
  if (typeof node === 'string') { out.push(node); return out; }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') out.push(node.text);
    else if (node.text) pdfText(node.text, out);
    if (node.stack) pdfText(node.stack, out);
    if (node.columns) pdfText(node.columns, out);
    if (node.table?.body) pdfText(node.table.body, out);
    if (node.content) pdfText(node.content, out);
  }
  return out;
}

const cardButton = title => {
  const card = [...document.querySelectorAll('div')]
    .find(el => el.textContent.trim().startsWith(title) && el.querySelector('button'));
  return card?.querySelector('button');
};

// The "what comes when" PDF is the one a stakeholder reads for dates, so it is
// the sharpest place to catch a schedule/export split.
async function exportWhatWhen() {
  render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
  const btn = await waitFor(() => {
    const b = cardButton('PDF') || [...document.querySelectorAll('button')].find(x => x.textContent === 'PDF');
    if (!b) throw new Error('export cards not rendered');
    return b;
  });
  expect(btn).toBeTruthy();
  const all = [...document.querySelectorAll('button')].filter(b => b.textContent === 'PDF');
  // Card order in ExportCards.jsx: summary, gantt, what-when, todo.
  await act(async () => { fireEvent.click(all[2]); });
  await waitFor(() => { if (!captured.length) throw new Error('no pdf'); });
  return pdfText(captured[0].content).join(' | ');
}

describe('the work order reaches the PDF', () => {
  beforeEach(() => { captured.length = 0; });
  afterEach(() => { cleanup(); captured.length = 0; localStorage.clear(); vi.restoreAllMocks(); });

  it('changes the exported order, exactly as it changes the screen', async () => {
    seed(null);
    const plain = await exportWhatWhen();
    cleanup();
    captured.length = 0;

    seed({ M1: ['B.1', 'A.1', 'A.2'] });
    const queued = await exportWhatWhen();

    // This PDF lists top-level topics by projected completion, which is
    // exactly the level a stakeholder reads — and the level the work order
    // visibly moves.
    const orderIn = txt => ['Projekt Alpha', 'Projekt Beta']
      .map(n => [n, txt.indexOf(n)])
      .filter(([, i]) => i >= 0)
      .sort((a, b) => a[1] - b[1])
      .map(([n]) => n);

    // Without a queue the tree decides: Alpha's two items before Beta's one,
    // so Alpha finishes first.
    expect(orderIn(plain)).toEqual(['Projekt Alpha', 'Projekt Beta']);
    // With it Beta's item goes first, so Beta finishes first — in the PDF,
    // not only on screen.
    expect(orderIn(queued)).toEqual(['Projekt Beta', 'Projekt Alpha']);
  });

  it('prints the headline the Overview shows, with dropped work and a queue in play', async () => {
    // The end-to-end version of src/__tests__/exportParity.test.jsx: there the
    // ctx is hand-built, here App computes `stats` and `scheduled` itself and
    // hands them to the export. Dropped work and a work order are the two
    // newest ways those two could drift apart.
    localStorage.clear();
    localStorage.setItem('planr_lang', 'de');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_v2', JSON.stringify({
      ...PLAN,
      tree: [
        ...PLAN.tree,
        { id: 'A.3', name: 'Alpha drei', status: 'done', team: 'T1', best: 5, factor: 1, assign: ['M1'],
          completedStart: '2026-01-05', completedEnd: '2026-01-09' },
        { id: 'B.2', name: 'Beta zwei, verworfen', status: 'open', team: 'T1', best: 40, factor: 1, assign: ['M1'], dropped: true },
      ],
      personQueues: { M1: ['B.1', 'A.1', 'A.2'] },
    }));

    const { container } = render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    const onScreen = await waitFor(() => {
      const el = container.querySelector('[data-testid="overview-progress"]');
      if (!el) throw new Error('no headline on the Overview');
      return el.textContent.trim();
    });

    await act(async () => {
      fireEvent.mouseDown([...document.querySelectorAll('.tab')]
        .find(el => (el.firstChild?.textContent || '').trim().startsWith('Bericht')), { button: 0 });
    });
    const btns = await waitFor(() => {
      const b = [...document.querySelectorAll('button')].filter(x => x.textContent === 'PDF');
      if (b.length < 3) throw new Error('export cards not rendered');
      return b;
    });
    await act(async () => { fireEvent.click(btns[0]); }); // Management Summary
    await waitFor(() => { if (!captured.length) throw new Error('no pdf'); });

    const pcts = pdfText(captured[0].content).filter(x => /^\d+(\.\d+)?%$/.test(x));
    expect(pcts.length).toBeGreaterThan(0);
    expect(pcts[0]).toBe(onScreen);
    // The 40 PT nobody will do must not be in the exported total either.
    expect(pdfText(captured[0].content).join(' | ')).not.toContain('Beta zwei');
  });
});

// The Overview prints two percentages side by side: "Ist" (now) and "Plan"
// (where the train sits at the horizon). They are computed by different code —
// aggregateProgressPct in progress.js for the first, futureProgressByRootId in
// App.jsx for the second — and the second one reaches the Subway Map in the
// Management Summary PDF. Dropped work must leave both fractions, or the PDF
// shows a projection that silently still counts work nobody will do.
describe('dropped work leaves the forward projection too', () => {
  beforeEach(() => { captured.length = 0; });
  afterEach(() => { cleanup(); captured.length = 0; localStorage.clear(); });

  const seedFinishedExceptDropped = () => {
    localStorage.clear();
    localStorage.setItem('planr_lang', 'de');
    localStorage.setItem('planr_tour_done', '1');
    localStorage.setItem('planr_tab', 'summary');
    localStorage.setItem('planr_horizon', '90');
    localStorage.setItem('planr_v2', JSON.stringify({
      ...PLAN,
      tree: [
        { id: 'A', name: 'Projekt Alpha', status: 'wip', team: 'T1' },
        { id: 'A.1', name: 'Alpha eins', status: 'done', team: 'T1', best: 10, factor: 1, assign: ['M1'],
          completedStart: '2026-01-05', completedEnd: '2026-01-16' },
        { id: 'A.2', name: 'Alpha zwei, verworfen', status: 'open', team: 'T1', best: 90, factor: 1,
          assign: ['M1'], dropped: true },
      ],
    }));
  };

  it('a project whose only open work was dropped reads done in both figures', async () => {
    seedFinishedExceptDropped();
    const { container } = render(<I18nProvider><ThemeProvider><App /></ThemeProvider></I18nProvider>);
    const now = await waitFor(() => {
      const el = container.querySelector('[data-testid="overview-progress"]');
      if (!el) throw new Error('no headline');
      return el.textContent.trim();
    });
    // Everything that is still in the plan is finished.
    expect(now).toBe('100%');
    // …and the forward projection has to agree. Before this guard it read 99%
    // or lower, because the 90 PT nobody will do stayed in its denominator.
    const plan = [...container.querySelectorAll('span')]
      .map(el => el.textContent.trim())
      .find(txt => /^Plan \d+(\.\d+)?%$/.test(txt));
    expect(plan).toBe('Plan 100%');
  });
});
