/** @vitest-environment happy-dom */
// Guardrail: an export must never print a different number than the screen.
//
// This mounts the real Overview (SumView) and runs the real exportSummaryPDF
// against the SAME ctx, then compares the strings that actually reach the
// user: the rendered percentage vs. the KPI text inside pdfmake's
// docDefinition. Same for the HTML report. A regression in either code path
// (new inline formula, different rounding, different weighting) fails here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { SumView } from '../components/views/SumView.jsx';
import { buildReportModel, generateReport } from '../utils/report.js';
import { treeStats } from '../utils/scheduler.js';

// pdfmake is heavy and browser-bound — capture the docDefinition instead.
const captured = [];
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addVirtualFileSystem: () => {},
    createPdf: (dd) => { captured.push(dd); return { download: () => {} }; },
  },
}));
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: { pdfMake: { vfs: {} } }, pdfMake: { vfs: {} }, vfs: {} }));

function d(isoStr) { return new Date(`${isoStr}T00:00:00`); }

// Deliberately nasty mix: a tiny done task, a big half-done task (phases), a
// big untouched one, a fixed-duration item and an unestimated leaf. Every
// naive formula (done-count, re() instead of scheduleEffort, integer rounding)
// produces a different number on this tree.
const TREE = [
  { id: 'P1', name: 'Programme', type: 'goal', status: 'open', team: 'T1' },
  { id: 'P1.1', name: 'Tiny done', status: 'done', best: 1, factor: 1, team: 'T1', assign: ['m1'],
    completedStart: '2026-01-05', completedEnd: '2026-01-05' },
  { id: 'P1.2', name: 'Big half', status: 'wip', best: 20, factor: 1, team: 'T1', assign: ['m1'],
    phases: [{ name: 'A', status: 'done' }, { name: 'B', status: 'open' }] },
  { id: 'P1.3', name: 'Big open', status: 'open', best: 20, factor: 1, team: 'T1' },
  { id: 'P1.4', name: 'Fixed window', status: 'open', best: 0, fixedDurationDays: 7, team: 'T1' },
  { id: 'P1.5', name: 'No estimate', status: 'open', best: 0, team: 'T1' },
];

const TEAMS = [{ id: 'T1', name: 'Team One', color: '#2563eb' }];
const MEMBERS = [{ id: 'm1', name: 'Anna', team: 'T1', cap: 1, vac: 25 }];

const SCHEDULED = TREE.filter(r => r.id.includes('.')).map((r, i) => ({
  id: r.id, treeId: r.id, name: r.name, status: r.status, team: 'T1',
  person: 'Anna', personId: 'm1', effort: r.best || 7,
  startD: d('2026-01-05'), endD: d(`2026-01-${String(9 + i).padStart(2, '0')}`),
  workingDaysInWindow: r.best || 7,
}));

function ctx() {
  return {
    data: {}, tree: TREE, members: MEMBERS, teams: TEAMS, scheduled: SCHEDULED,
    weeks: [], cpSet: new Set(), goalPaths: {}, stats: treeStats(TREE),
    confidence: {}, meta: { name: 'Parity', planStart: '2026-01-05' }, lang: 'de',
  };
}

function screenPct() {
  const { container } = render(
    <I18nProvider>
      <ThemeProvider>
        <SumView tree={TREE} scheduled={SCHEDULED} goals={TREE.filter(r => r.type)}
          members={MEMBERS} teams={TEAMS} cpSet={new Set()} goalPaths={{}}
          stats={treeStats(TREE)} confidence={{}}
          onNavigate={() => {}} onOpenItem={() => {}} onExportTodo={() => {}} />
      </ThemeProvider>
    </I18nProvider>,
  );
  // The headline figure — first standalone "NN.N%" token in the header row.
  const match = container.textContent.match(/(\d+(?:\.\d+)?)%/);
  expect(match, 'no percentage rendered in SumView header').toBeTruthy();
  return match[1];
}

// Walk pdfmake's nested content structure and collect every text string.
function flattenPdfText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach(n => flattenPdfText(n, out)); return out; }
  ['text', 'stack', 'columns', 'content', 'table', 'body'].forEach(k => {
    if (node[k] != null) flattenPdfText(node[k], out);
  });
  return out;
}

describe('export parity: screen figures === exported figures', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });
  afterEach(() => cleanup());

  it('Management Summary PDF prints the Overview progress percentage verbatim', async () => {
    const onScreen = screenPct();
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(ctx(), { includeTimetable: true });

    expect(captured).toHaveLength(1);
    const texts = flattenPdfText(captured[0].content);
    const pctTokens = texts.filter(s => /^\d+(\.\d+)?%$/.test(s));
    expect(pctTokens.length, 'PDF has no percentage KPI').toBeGreaterThan(0);
    expect(pctTokens[0]).toBe(onScreen + '%');
  });

  it('HTML report prints the same progress percentage', () => {
    const onScreen = screenPct();
    const html = generateReport(ctx());
    const kpi = html.match(/<div class="kpi-v" style="color:#16a34a">([\d.]+)%<\/div>/);
    expect(kpi, 'no progress KPI in HTML report').toBeTruthy();
    expect(kpi[1]).toBe(onScreen);
  });

  it('the model figure is neither done-count nor re()-weighted', () => {
    const m = buildReportModel(ctx());
    // done/total over 5 leaves = 20 %
    expect(Math.round(m.prog)).not.toBe(20);
    // progressed = 1 (done) + 10 (one of two phases on a 20 PT task) = 11.
    // denominator = 1 + 20 + 20 + 7 (fixed duration) + 1 (unestimated leaf
    // still counts as scope) = 49 → 22.4 %.
    expect(m.prog).toBeCloseTo(11 / 49 * 100, 6);
    expect(m.progLabel).toBe('22.4');
  });

  it('the goal card percentage on screen is the one the PDF goal table prints', async () => {
    const { container } = render(
      <I18nProvider>
        <ThemeProvider>
          <SumView tree={TREE} scheduled={SCHEDULED} goals={TREE.filter(r => r.type)}
            members={MEMBERS} teams={TEAMS} cpSet={new Set()}
            goalPaths={{ P1: { critical: new Set(), needed: new Set() } }}
            stats={treeStats(TREE)} confidence={{}}
            onNavigate={() => {}} onOpenItem={() => {}} onExportTodo={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );
    // The goal card renders "1/5 tasks done · …" and its percentage next to it.
    const card = container.textContent.match(/1\/5[^%]*?(\d+(?:\.\d+)?)%/);
    expect(card, 'no goal card percentage rendered').toBeTruthy();
    const cardPct = card[1];
    // Not the done-count ratio (1 of 5 leaves = 20 %).
    expect(cardPct).not.toBe('20');

    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(ctx(), { includeTimetable: false });
    const texts = flattenPdfText(captured[0].content);
    const goalCell = texts.find(s => s.includes('1/5'));
    expect(goalCell, 'no goal row in the PDF').toBeTruthy();
    expect(goalCell).toContain(cardPct + '%');
  });

  it('Total PT in the export counts fixed-duration work like the screen does', () => {
    const m = buildReportModel(ctx());
    expect(m.totalPt).toBeCloseTo(1 + 20 + 20 + 7, 6);
    expect(m.donePt).toBeCloseTo(11, 6);
  });
});

// A deadline whose work finished after the date. Screen and exports must both
// report it as completed-late, not as an open risk.
const DONE_LATE_TREE = [
  { id: 'D1', name: 'Umfirmierung', type: 'deadline', date: '2026-07-01', status: 'done', team: 'T1' },
  { id: 'D1.1', name: 'Register', status: 'done', best: 4, factor: 1, team: 'T1', assign: ['m1'],
    completedStart: '2026-03-26', completedEnd: '2026-07-09' },
];
const DONE_LATE_SCHEDULED = [
  { id: 'D1.1', treeId: 'D1.1', name: 'Register', status: 'done', team: 'T1', person: 'Anna', personId: 'm1',
    effort: 4, startD: d('2026-03-26'), endD: d('2026-07-09'), workingDaysInWindow: 4 },
];

function doneLateCtx() {
  return {
    data: {}, tree: DONE_LATE_TREE, members: MEMBERS, teams: TEAMS, scheduled: DONE_LATE_SCHEDULED,
    weeks: [], cpSet: new Set(), goalPaths: {}, stats: treeStats(DONE_LATE_TREE),
    confidence: {}, meta: { name: 'Parity', planStart: '2026-01-05' }, lang: 'de',
  };
}

describe('a completed deadline is not reported as at risk', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });
  afterEach(() => cleanup());

  // The provider defaults to English, so assert against the EN labels here;
  // the export assertions below run with lang: 'de'.
  it('Overview shows the done-late badge instead of AT RISK', () => {
    const { container } = render(
      <I18nProvider>
        <ThemeProvider>
          <SumView tree={DONE_LATE_TREE} scheduled={DONE_LATE_SCHEDULED}
            goals={DONE_LATE_TREE.filter(r => r.type)} members={MEMBERS} teams={TEAMS}
            cpSet={new Set()} goalPaths={{ D1: { critical: new Set(), needed: new Set() } }}
            stats={treeStats(DONE_LATE_TREE)} confidence={{}}
            onNavigate={() => {}} onOpenItem={() => {}} onExportTodo={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );
    expect(container.textContent).not.toContain('AT RISK');
    expect(container.textContent).toContain('DONE · late');
  });

  it('the Management Summary PDF reports it as done, with no deadline risk entry', async () => {
    const m = buildReportModel(doneLateCtx());
    expect(m.deadlineStates.D1.state).toBe('doneLate');
    expect(m.risks.filter(r => /Deadline/.test(r.text))).toHaveLength(0);

    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(doneLateCtx(), { includeTimetable: false });
    const texts = flattenPdfText(captured[0].content).join(' | ');
    expect(texts).not.toContain('GEFÄHRDET');
    expect(texts).toContain('abgeschl. · verspätet');
  });

  it('the HTML report reports it as done too', () => {
    const html = generateReport(doneLateCtx());
    expect(html).not.toContain('GEFÄHRDET');
    expect(html).toContain('abgeschlossen · verspätet');
  });
});
