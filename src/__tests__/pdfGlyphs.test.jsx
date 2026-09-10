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
    ...(ri === 2 ? { date: '2027-06-30' } : {}),
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
  it('knows what Roboto has, and what it does not', () => {
    // Spot checks against the cmap of pdfmake/build/vfs_fonts Roboto-Regular.
    '·—…×Üäöü●○■•–Δ√±≤≥≈°§'.split('').forEach(ch =>
      expect(isPdfSafeCodePoint(ch.codePointAt(0)), ch).toBe(true));
    '✓✔◐▪→←↑↓⚠⊕★▲🚆'.split('').forEach(ch =>
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

  it('maps the app symbols to something Roboto can draw', () => {
    expect(sanitizePdfText('✓ erledigt')).toBe('√ erledigt');
    expect(sanitizePdfText('2026-01-01 → 2026-02-01')).toBe('2026-01-01 » 2026-02-01');
    expect(sanitizePdfText('◐ in Arbeit')).toBe('● in Arbeit');
    expect(sanitizePdfText('⚠ Deadline')).toBe('! Deadline');
  });

  it('drops an unknown symbol instead of leaving a box, and the space with it', () => {
    expect(sanitizePdfText('🚆 Zug')).toBe('Zug');
    expect(sanitizePdfText('Status 🟢 grün')).toBe('Status grün');
  });

  it('walks a whole docDefinition but never touches embedded svg', () => {
    const svg = '<svg><text>✓ keep</text></svg>';
    const out = sanitizePdfDoc({
      content: [{ text: '✓ done' }, { svg }, { table: { body: [[{ text: 'a → b' }]] } }],
      styles: { h2: { fontSize: 13 } },
    });

    expect(out.content[0].text).toBe('√ done');
    expect(out.content[1].svg).toBe(svg);
    expect(out.content[2].table.body[0][0].text).toBe('a » b');
    expect(out.styles.h2.fontSize).toBe(13);
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
    // test turns green for the wrong reason and can be deleted.
    const { exportSummaryPDF } = await import('../utils/pdfExports.js');
    await exportSummaryPDF(ctx(), { includeTimetable: true, includeProjectRoadmaps: false });
    const rendered = pdfStrings(captured[0].content).join(' ');

    expect(rendered).toContain('√');       // was ✓
    expect(rendered).not.toContain('✓');
  });
});
