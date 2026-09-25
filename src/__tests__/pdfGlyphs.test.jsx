/** @vitest-environment happy-dom */
// pdfmake carries one font (Roboto) and silently draws a missing-glyph box for
// anything outside it. Everything renders fine on screen, so the difference
// only shows up in the finished PDF — nobody's favourite place to find it.
//
// This walks the real docDefinition of all four PDFs and asserts that every
// character in it exists in that font. A new symbol anywhere in the app fails
// here instead of turning into a rectangle in a management summary.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPdfSafeCodePoint, sanitizePdfText, sanitizePdfDoc, PDF_GLYPH_MAP } from '../utils/pdfGlyphs.js';
import { buildExportCtx } from '../utils/exportCtx.js';
import { schedule, treeStats, enrichParentSchedules } from '../utils/scheduler.js';

const captured = [];
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addVirtualFileSystem: () => {},
    createPdf: dd => { captured.push(dd); return { download: () => {} }; },
  },
}));
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: { pdfMake: { vfs: {} } }, pdfMake: { vfs: {} }, vfs: {} }));

// Umlauts, an em dash, an ellipsis-forcing long name, a deadline, done work
// and a task name carrying an arrow — i.e. everything that has ever produced a
// box in this app.
const tree = [];
['F1', 'P2', 'D1'].forEach((root, ri) => {
  tree.push({
    id: root, name: `Projekt ${root} — Überführung mit einem absichtlich sehr langen Namen`,
    type: ri === 2 ? 'deadline' : 'goal', status: 'wip',
    // D1's date sits BEFORE the work under it can finish, so the model
    // produces a late-deadline risk. Without one the summary builds no
    // findings table at all and every guard over it passes vacuously — which
    // is exactly how a malformed cell in that table reached the browser.
    ...(ri === 2 ? { date: '2026-01-15' } : {}),
  });
  for (let a = 1; a <= 3; a++) {
    tree.push({ id: `${root}.${a}`, name: `Paket ${a} — Änderungen`, status: 'wip' });
    for (let b = 1; b <= 3; b++) {
      const done = ri === 0 && a === 1;
      tree.push({
        id: `${root}.${a}.${b}`, name: `Aufgabe ${a}.${b} Release → UAT · Prüfung`,
        status: done ? 'done' : 'open', team: 'T1', best: 4, factor: 1.5, assign: ['m1'], deps: [],
        ...(done ? { completedAt: '2026-05-14', completedStart: '2026-05-01', completedEnd: '2026-05-14' } : {}),
      });
    }
  }
});
const data = {
  meta: { name: 'Glyphen', planStart: '2026-09-01', planEnd: '2028-12-31' },
  tree,
  members: [{ id: 'm1', name: 'Anna Bäuerle', team: 'T1', cap: 2, vac: 0 }],
  teams: [{ id: 'T1', name: 'Backend', color: '#2563eb' }],
  vacations: [], holidays: [],
};

function ctx() {
  const { results } = schedule(data.tree, data.members, [], '2026-09-01', '2028-12-31', {}, [1, 2, 3, 4, 5], '2026-09-01');
  const stats = treeStats(data.tree);
  enrichParentSchedules(stats, data.tree, results);
  return buildExportCtx({
    data, scheduled: results, stats, weeks: [], cpSet: new Set(), goalPaths: {},
    confidence: {}, lang: 'de',
  });
}

// Every string pdfmake is handed, minus embedded SVG (svg-to-pdfkit handles
// those with its own font logic, and the roadmap preparers substitute there).
function pdfStrings(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { if (!node.startsWith('<svg')) out.push(node); return out; }
  if (typeof node === 'number') return out;
  if (Array.isArray(node)) { node.forEach(n => pdfStrings(n, out)); return out; }
  if (typeof node === 'object') Object.values(node).forEach(value => pdfStrings(value, out));
  return out;
}

const offenders = strings => {
  const bad = new Map();
  strings.forEach(text => {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (!isPdfSafeCodePoint(cp)) {
        bad.set(ch, `U+${cp.toString(16).toUpperCase().padStart(4, '0')} in ${JSON.stringify(text.slice(0, 60))}`);
      }
    }
  });
  return [...bad.entries()].map(([ch, where]) => `${ch} ${where}`);
};

describe('the supported set matches the bundled font', () => {
  it('knows what Plex Sans has, and what it does not', () => {
    // Spot checks against the cmap of the embedded, subsetted faces
    // (utils/pdfFonts.js). The trade against Roboto is visible here: real
    // arrows and a real tick arrived, the geometric shapes went.
    '·—…×Üäöü•–Δ√±≤≥≈°§✓→←↑↓◊'.split('').forEach(ch =>
      expect(isPdfSafeCodePoint(ch.codePointAt(0)), ch).toBe(true));
    '●○■◐▪✔⚠⊕★▲🚆'.split('').forEach(ch =>
      expect(isPdfSafeCodePoint(ch.codePointAt(0)), ch).toBe(false));
  });

  it('substitutes every unsupported glyph it maps with a supported one', () => {
    Object.entries(PDF_GLYPH_MAP).forEach(([from, to]) => {
      expect(isPdfSafeCodePoint(from.codePointAt(0)), `${from} should need mapping`).toBe(false);
      [...to].forEach(ch => expect(isPdfSafeCodePoint(ch.codePointAt(0)), `${from} → ${ch}`).toBe(true));
    });
  });
});

describe('sanitizePdfText', () => {
  it('leaves supported text exactly as it is', () => {
    const text = 'Überführung — 33.3 % · Δ 2 Tage ≤ Soll';
    expect(sanitizePdfText(text)).toBe(text);
  });

  it('maps the app symbols to something Plex Sans can draw', () => {
    // Two of these no longer need a stand-in at all: Plex has the tick and the
    // arrow, which Roboto did not, so they print as themselves instead of as
    // `√` and `»` — which read as typos in a document you hand to somebody.
    expect(sanitizePdfText('✓ erledigt')).toBe('✓ erledigt');
    expect(sanitizePdfText('2026-01-01 → 2026-02-01')).toBe('2026-01-01 → 2026-02-01');
    // The geometric shapes are what Plex lacks, so the status triple keeps its
    // meaning through fill: a bullet for under way, a lozenge for not started.
    expect(sanitizePdfText('◐ in Arbeit')).toBe('• in Arbeit');
    expect(sanitizePdfText('○ offen')).toBe('◊ offen');
    expect(sanitizePdfText('⚠ Deadline')).toBe('! Deadline');
  });

  it('drops an unknown symbol instead of leaving a box, and the space with it', () => {
    expect(sanitizePdfText('🚆 Zug')).toBe('Zug');
    expect(sanitizePdfText('Status 🟢 grün')).toBe('Status grün');
  });

  it('does not leave the dropped symbol\'s space in front of punctuation', () => {
    // A project named with a trailing icon printed inside quotes as
    // „Abrechnung in VOffice " — the gap where the icon had been.
    expect(sanitizePdfText('„Abrechnung in VOffice ⏰\u201c')).toBe('„Abrechnung in VOffice\u201c');
    expect(sanitizePdfText('fertig 🎯.')).toBe('fertig.');
  });

  it('walks a whole docDefinition but never touches embedded svg', () => {
    const svg = '<svg><text>✓ keep</text></svg>';
    const out = sanitizePdfDoc({
      content: [{ text: '✓ done' }, { svg }, { table: { body: [[{ text: 'a → b' }]] } }],
      styles: { h2: { fontSize: 13 } },
    });

    expect(out.content[0].text).toBe('✓ done');
    expect(out.content[1].svg).toBe(svg);
    expect(out.content[2].table.body[0][0].text).toBe('a → b');
    expect(out.styles.h2.fontSize).toBe(13);
  });
});

// ── The document pdfmake will actually accept ──────────────────────────────
// pdfmake is mocked above, so createPdf never validates anything: a malformed
// node sails through every test here and throws only in the browser, where the
// export dies with "Unrecognized document structure" and no PDF at all. That
// happened — a colSpan’s swallowed placeholder cells were given a `border`
// and nothing else, which pdfmake rejects outright.
//
// This walks the same docDefinitions and applies pdfmake’s own rule: every
// node has to carry one of the properties it knows how to draw.
const DRAWABLE = ['text', 'table', 'columns', 'stack', 'ul', 'ol', 'image', 'svg', 'canvas', 'qr', 'toc', 'pageReference', 'textReference'];

// Only the arrays pdfmake lays out hold NODES. `layout` and `styles` are
// option bags that happen to share property names (fillColor, paddingTop) and
// are walked without being judged.
const NODE_ARRAYS = ['content', 'stack', 'columns', 'body'];
const SKIP = ['layout', 'styles', 'defaultStyle', 'images', 'info'];

function judge(node, path, out) {
  if (node == null) return;
  if (typeof node === 'string' || typeof node === 'number') return;  // bare text is fine
  if (Array.isArray(node)) { node.forEach((n, i) => judge(n, `${path}[${i}]`, out)); return; }
  if (typeof node !== 'object' || node instanceof Date) return;
  const keys = Object.keys(node);
  if (keys.length && !keys.some(k => DRAWABLE.includes(k))) {
    out.push(`${path}: {${keys.join(', ')}}`);
  }
  badNodes(node, path, out);
}

function badNodes(node, path = '$', out = []) {
  if (node == null || typeof node !== 'object' || node instanceof Date) return out;
  if (Array.isArray(node)) {
    node.forEach((n, i) => badNodes(n, `${path}[${i}]`, out));
    return out;
  }
  Object.keys(node).forEach(k => {
    if (SKIP.includes(k)) return;
    const v = node[k];
    if (NODE_ARRAYS.includes(k) && Array.isArray(v)) v.forEach((n, i) => judge(n, `${path}.${k}[${i}]`, out));
    else badNodes(v, `${path}.${k}`, out);
  });
  return out;
}

describe('every export builds a document pdfmake can draw', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });

  it.each([
    ['exportSummaryPDF', [{ includeTimetable: true, includeProjectRoadmaps: true }]],
    ['exportGanttPDF', []],
    ['exportWhatWhenPDF', []],
    ['exportTodoPDF', [90]],
  ])('%s', async (name, args) => {
    const mod = await import('../utils/pdfExports.js');
    await mod[name](ctx(), ...args);
    expect(captured).toHaveLength(1);
    const bad = badNodes({ content: captured[0].content }, '$');
    expect(bad, `nodes pdfmake cannot draw:\n${bad.join('\n')}`).toEqual([]);
  });

  it('leaves no arrow inside an embedded SVG, where Roboto draws a box', async () => {
    // The document body is set in Plex and can print →. Embedded SVG is not:
    // svg-to-pdfkit draws it with pdfmake's bundled Roboto, which has no
    // arrows, so one in a roadmap header or a task name came out as a box.
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(ctx(), { includeTimetable: true, includeProjectRoadmaps: true });
    const svgs = [];
    (function walk(n) {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        if (typeof n.svg === 'string') svgs.push(n.svg);
        Object.values(n).forEach(walk);
      }
    })(captured[0].content);
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach(svg => expect(svg).not.toMatch(/[→←↑↓]/u));
  });

  it('the summary really does build the blocks this guard is meant to cover', async () => {
    // Without this the guard above can pass because a block was never built.
    // The findings table is the one that broke, so its presence is the proof
    // that the walk had something to walk.
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(ctx(), { includeTimetable: true, includeProjectRoadmaps: true });
    const strings = pdfStrings(captured[0].content);
    // The fixture runs in German.
    expect(strings).toContain('Wo jedes Projekt steht');
    expect(strings).toContain('Was den Termin gefährdet');
  });
});

describe('no PDF reaches the user with a missing-glyph box', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });

  it.each([
    ['exportSummaryPDF', [{ includeTimetable: true, includeProjectRoadmaps: true }]],
    ['exportGanttPDF', []],
    ['exportWhatWhenPDF', []],
    ['exportTodoPDF', [90]],
  ])('%s', async (name, args) => {
    const mod = await import('../utils/pdfExports.js');
    await mod[name](ctx(), ...args);

    expect(captured).toHaveLength(1);
    const strings = pdfStrings(captured[0].content).concat(pdfStrings(captured[0].header || []));
    expect(strings.length).toBeGreaterThan(10);
    expect(offenders(strings)).toEqual([]);
  });

  it('would have failed before the guard — the raw document does contain them', async () => {
    // Guards the guard: if the app ever stops emitting these symbols, this
    // test turns green for the wrong reason and can be deleted. The summary's
    // page 1 no longer carries a status glyph — swatches replaced them — so
    // this asks the Todo export, whose confidence column still writes one.
    const { exportTodoPDF } = await import('../utils/pdfExports.js');
    await exportTodoPDF(ctx(), 90);
    const rendered = pdfStrings(captured[0].content).join(' ');

    expect(rendered).toContain('•');       // was ●
    expect(rendered).not.toContain('●');
  });
});

// A PDF is read by people who have never opened Planr. Every page says what
// made it, and the wordmark is a link to where it comes from.
describe('every PDF footer says it was made with Planr', () => {
  beforeEach(() => { captured.length = 0; localStorage.clear(); });

  it.each([
    ['exportSummaryPDF', [{ includeTimetable: false, includeProjectRoadmaps: false }]],
    ['exportGanttPDF', []],
    ['exportWhatWhenPDF', []],
    ['exportTodoPDF', [90]],
  ])('%s', async (name, args) => {
    const mod = await import('../utils/pdfExports.js');
    await mod[name](ctx(), ...args);

    const footer = captured[0].footer(2, 5);
    const strings = pdfStrings(footer);
    const textOf = node => typeof node === 'string' ? node
      : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.text ?? '');
    expect(footer.columns.map(textOf).join(' | ')).toContain('erstellt mit Planr.');
    expect(offenders(strings)).toEqual([]);

    const linked = [];
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') { if (node.link) linked.push(node); Object.values(node).forEach(walk); }
    })(footer);
    expect(linked.map(n => n.text).join('')).toBe('Planr.');
    expect(linked.every(n => n.link === mod.PLANR_URL)).toBe(true);
  });
});
