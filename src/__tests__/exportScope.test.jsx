/** @vitest-environment happy-dom */
// Guard rail for the bug class that has actually hurt: an export shipping a
// SUBSET of the plan while looking complete.
//
// The screen renders filtered copies of the tree — hide-done, root/team/person
// filters, the archive filter, single-line roadmap mode. Every export must
// ignore all of it. The reader of a PDF cannot tell that a project is missing
// or that a percentage was taken over a subset, which is exactly why this is
// checked structurally rather than by eye.
//
// The invariant: `buildExportCtx` derives the plan-shaped fields from `data`,
// so passing a filtered tree does not work — and `projectScopedCtx` repairs it
// again at the entry of every export function, for hand-built ctx objects.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { SumView } from '../components/views/SumView.jsx';
import { buildExportCtx, isProjectScoped, projectScopedCtx } from '../utils/exportCtx.js';
import { buildReportModel, generateReport } from '../utils/report.js';
import { scanArchive, stripArchivedRoots } from '../utils/archive.js';
import { treeStats, leafNodes } from '../utils/scheduler.js';
import { aggregateProgressPct } from '../utils/progress.js';

const captured = [];
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addVirtualFileSystem: () => {},
    createPdf: (dd) => { captured.push(dd); return { download: () => {} }; },
  },
}));
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: { pdfMake: { vfs: {} } }, pdfMake: { vfs: {} }, vfs: {} }));

const d = isoStr => new Date(`${isoStr}T00:00:00`);
const NOW = new Date('2026-09-10T12:00:00');

// One live project and one that finished in spring — the archive filter hides
// the second one on screen, so it is the canary for export scope.
const TREE = [
  { id: 'F1', name: 'Fundament Plattform', type: 'goal', status: 'wip', team: 'T1' },
  { id: 'F1.1', name: 'Komponenten-Bibliothek', status: 'wip', best: 20, factor: 1, team: 'T1', assign: ['m1'] },
  { id: 'F1.2', name: 'Monitoring aufsetzen', status: 'open', best: 10, factor: 1, team: 'T1' },
  { id: 'Z9', name: 'Alte Umfirmierung', type: 'goal', status: 'done', team: 'T1',
    completedAt: '2026-03-01' },
  { id: 'Z9.1', name: 'Datev-Umstellung', status: 'done', best: 30, factor: 1, team: 'T1', assign: ['m1'],
    completedAt: '2026-03-01', completedStart: '2026-02-01', completedEnd: '2026-03-01' },
];
const TEAMS = [{ id: 'T1', name: 'Backend', color: '#2563eb' }];
const MEMBERS = [
  { id: 'm1', name: 'Anna', team: 'T1', cap: 1, vac: 25 },
  { id: 'm2', name: 'Olaf', team: 'T1', cap: 1, vac: 25, end: '2026-04-23' },
];
const SCHEDULED = [
  { id: 'F1.1', treeId: 'F1.1', name: 'Komponenten-Bibliothek', status: 'wip', team: 'T1', person: 'Anna',
    personId: 'm1', effort: 20, startD: d('2026-09-14'), endD: d('2026-10-09'), workingDaysInWindow: 20 },
  { id: 'F1.2', treeId: 'F1.2', name: 'Monitoring aufsetzen', status: 'open', team: 'T1', person: 'Anna',
    personId: 'm1', effort: 10, startD: d('2026-10-12'), endD: d('2026-10-23'), workingDaysInWindow: 10 },
];
const DATA = {
  meta: { name: 'Scope', planStart: '2026-09-01', planEnd: '2027-12-31', version: '2' },
  tree: TREE, members: MEMBERS, teams: TEAMS, vacations: [], holidays: [],
  roadmapAssignment: { F1: { routeIdx: 0, colorIdx: 0 }, Z9: { routeIdx: 1, colorIdx: 1 } },
};

const archive = scanArchive({ tree: TREE, members: MEMBERS, days: 90, now: NOW });
// What the views actually render once the archive filter (default on) applies.
const VISIBLE_TREE = stripArchivedRoots(TREE, archive.rootIds);

// The figure every surface must print: effort-weighted over the WHOLE plan.
const FULL_PCT = aggregateProgressPct(leafNodes(TREE));

function baseCtx(extra = {}) {
  return buildExportCtx({
    data: DATA, scheduled: SCHEDULED, weeks: [], cpSet: new Set(), goalPaths: {},
    stats: treeStats(TREE), confidence: {}, lang: 'de', ...extra,
  });
}

// Every `{ svg: '<svg …>' }` node pdfmake was handed.
function collectPdfSvgs(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(n => collectPdfSvgs(n, out)); return out; }
  if (typeof node.svg === 'string') out.push(node.svg);
  Object.values(node).forEach(value => {
    if (value && typeof value === 'object') collectPdfSvgs(value, out);
  });
  return out;
}

function flattenPdfText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach(n => flattenPdfText(n, out)); return out; }
  ['text', 'stack', 'columns', 'content', 'table', 'body'].forEach(k => {
    if (node[k] != null) flattenPdfText(node[k], out);
  });
  return out;
}

describe('the fixture really is filtered on screen', () => {
  it('archives the finished project, so the export scope differs from the view', () => {
    expect([...archive.rootIds]).toEqual(['Z9']);
    expect(VISIBLE_TREE.map(n => n.id)).toEqual(['F1', 'F1.1', 'F1.2']);
    expect(VISIBLE_TREE.length).toBeLessThan(TREE.length);
  });
});

describe('an export context always describes the whole plan', () => {
  it('ignores a filtered tree handed to the builder', () => {
    // Someone wires up `activeTree` / `visibleTree` by mistake.
    const ctx = buildExportCtx({ data: DATA, tree: VISIBLE_TREE, members: [], teams: [], meta: {} });

    expect(ctx.tree).toBe(TREE);
    expect(ctx.members).toBe(MEMBERS);
    expect(ctx.teams).toBe(TEAMS);
    expect(ctx.meta.name).toBe('Scope');
    expect(ctx.roadmapAssignment).toBe(DATA.roadmapAssignment);
    expect(isProjectScoped(ctx)).toBe(true);
  });

  it('repairs a hand-built filtered ctx and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const filtered = { data: DATA, tree: VISIBLE_TREE, stats: treeStats(VISIBLE_TREE) };

    expect(isProjectScoped(filtered)).toBe(false);
    const repaired = projectScopedCtx(filtered, 'test');

    expect(repaired.tree).toBe(TREE);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('3 of 5 items');
    warn.mockRestore();
  });

  it('leaves an already-correct ctx untouched, allocating nothing', () => {
    const ctx = baseCtx();
    expect(projectScopedCtx(ctx, 'test')).toBe(ctx);
  });
});

describe('every export surface covers the archived project', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('report model and HTML report report the full-plan figure', () => {
    const model = buildReportModel(baseCtx());

    expect(model.prog).toBeCloseTo(FULL_PCT, 6);
    expect(model.totalPt).toBeCloseTo(60, 6);   // 20 + 10 + 30, archived work included
    expect(model.donePt).toBeCloseTo(40, 6);    // 30 archived + 10 of the wip task
    expect(model.lvs.map(l => l.id)).toContain('Z9.1');

    const html = generateReport(baseCtx());
    expect(html).toContain('Alte Umfirmierung');
  });

  it('a filtered ctx cannot change what the report says', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const honest = buildReportModel(baseCtx());
    const sneaky = buildReportModel({ ...baseCtx(), tree: VISIBLE_TREE, stats: treeStats(VISIBLE_TREE) });

    expect(sneaky.prog).toBeCloseTo(honest.prog, 6);
    expect(sneaky.totalPt).toBeCloseTo(honest.totalPt, 6);
    expect(sneaky.lvs.map(l => l.id)).toEqual(honest.lvs.map(l => l.id));
  });

  it('the Management Summary PDF lists the archived project', async () => {
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(baseCtx(), { includeTimetable: true });

    expect(captured).toHaveLength(1);
    expect(flattenPdfText(captured[0].content).join(' | ')).toContain('Alte Umfirmierung');
  });

  // The four PDFs legitimately differ in what they include — the Gantt and
  // "what comes when" are about upcoming work, so a finished project has
  // nothing to show there. What must NEVER differ is the answer depending on
  // what the screen happens to be filtering. Comparing each export against
  // itself under a filtered ctx catches the bug class without pinning content
  // each document is not supposed to carry.
  it.each([
    ['exportSummaryPDF', [{ includeTimetable: true }]],
    ['exportGanttPDF', []],
    ['exportWhatWhenPDF', []],
    ['exportTodoPDF', [90]],
  ])('%s ignores a filtered ctx entirely', async (name, args) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../utils/pdfExports.js');

    await mod[name](baseCtx(), ...args);
    const honest = flattenPdfText(captured[0].content).join(' | ');
    captured.length = 0;

    const filtered = { ...baseCtx(), tree: VISIBLE_TREE, stats: treeStats(VISIBLE_TREE) };
    await mod[name](filtered, ...args);
    const sneaky = flattenPdfText(captured[0].content).join(' | ');

    expect(sneaky).toBe(honest);
  });

  it('the Management Summary PDF prints the same percentage with a filtered ctx', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');

    await exportSummaryPDF(baseCtx(), { includeTimetable: false });
    const honest = flattenPdfText(captured[0].content).filter(s => /^\d+(\.\d+)?%$/.test(s));
    captured.length = 0;

    await exportSummaryPDF({ ...baseCtx(), tree: VISIBLE_TREE, stats: treeStats(VISIBLE_TREE) }, { includeTimetable: false });
    const sneaky = flattenPdfText(captured[0].content).filter(s => /^\d+(\.\d+)?%$/.test(s));

    expect(honest[0]).toBe(`${Math.round(FULL_PCT * 10) / 10}%`);
    expect(sneaky).toEqual(honest);
  });

  it('appends a project roadmap page per project, archived ones included', async () => {
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(baseCtx(), { includeTimetable: false, includeProjectRoadmaps: true });

    const svgs = collectPdfSvgs(captured[0].content);
    // One subway map plus one calendar per project — and the calendars carry
    // the project titles, so a missing project is visible in the assertion.
    const projectPages = svgs.filter(svg => svg.includes('·'));
    expect(projectPages.some(svg => svg.includes('Fundament Plattform'))).toBe(true);
    expect(projectPages.some(svg => svg.includes('Alte Umfirmierung'))).toBe(true);

    const texts = flattenPdfText(captured[0].content).join(' | ');
    expect(texts).toContain('Projekt-Roadmaps');
  });

  it('leaves them out when the option is off', async () => {
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(baseCtx(), { includeTimetable: false, includeProjectRoadmaps: false });

    expect(flattenPdfText(captured[0].content).join(' | ')).not.toContain('Projekt-Roadmaps');
  });

  it('the project roadmap pages carry no unresolved theme variables or web fonts', async () => {
    // pdfmake's SVG renderer resolves neither CSS custom properties nor fonts
    // it has not registered — either one silently blanks the text.
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(baseCtx(), { includeTimetable: false, includeProjectRoadmaps: true });

    const projectPages = collectPdfSvgs(captured[0].content).filter(svg => svg.includes('pr-title'));
    expect(projectPages.length).toBeGreaterThan(0);
    projectPages.forEach(svg => {
      expect(svg).not.toContain('var(--');
      expect(svg).not.toContain('JetBrains Mono');
      expect(svg).not.toContain("'Inter'");
      // Fixed size, so pdfmake scales it instead of guessing.
      expect(svg).toMatch(/^<svg [^>]*width="1400" height="\d+"/);
    });
  });

  it('the exported roadmap keeps every line, including the archived one', async () => {
    const { computeRoadmapModel } = await import('../utils/roadmap.js');
    const ctx = baseCtx();
    const model = computeRoadmapModel({ tree: ctx.tree, scheduled: ctx.scheduled, stats: ctx.stats, now: NOW });

    expect(model.lines.map(l => l.root.id).sort()).toEqual(['F1', 'Z9']);
  });
});

describe('screen and export agree even while the screen is filtered', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });
  afterEach(() => cleanup());

  it('the Overview headline equals the exported figure with the archive filter on', () => {
    const { container } = render(
      <I18nProvider>
        <ThemeProvider>
          <SumView tree={TREE} scheduled={SCHEDULED} goals={TREE.filter(r => r.type)}
            members={MEMBERS} teams={TEAMS} cpSet={new Set()} goalPaths={{}}
            stats={treeStats(TREE)} confidence={{}}
            archive={archive} showArchived={false} setShowArchived={() => {}} archiveDays={90}
            onNavigate={() => {}} onOpenItem={() => {}} onExportTodo={() => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );

    // The filter is doing its job: the archived project is off the screen...
    expect(container.textContent).toContain('archived');
    // ...but the headline still counts it, which is what the export prints.
    const onScreen = container.textContent.match(/(\d+(?:\.\d+)?)%/)[1];
    expect(Number(onScreen)).toBeCloseTo(Math.round(FULL_PCT * 10) / 10, 6);
    expect(buildReportModel(baseCtx()).progLabel).toBe(onScreen);
  });
});
