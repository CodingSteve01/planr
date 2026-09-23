// What comes out of the printer looks like what is on the screen.
//
// Reported of the management summary: the layout is not comparable to what
// the app looks like now. It was not — the PDFs and the HTML report carried a
// palette of their own from before the rebuild: ink at #1a1e2a, headings in
// #1d4ed8, tables banded #edf2fa, greens at #16a34a, ambers at #d97706. The
// Tailwind-ish blues the screen used to have. A summary that does not look
// like the tool it came out of reads as a different document, and the figures
// on it read as different figures.
//
// The screen resolves its colours through CSS variables and a PDF cannot, so
// the values are written out once in printPalette.js. This is what stops the
// copy drifting from the original.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRINT } from '../printPalette.js';

const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');

// The LIGHT block, because print is always on white.
const lightBlock = (() => {
  const at = css.indexOf(':root[data-theme="light"]');
  expect(at, 'no light palette block in App.css').toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('\n}', at));
})();
const token = name => {
  const hit = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(lightBlock);
  return hit ? hit[1].toLowerCase() : null;
};

describe('the printed palette', () => {
  it.each([
    ['ink', 'tx'],
    ['ink2', 'tx2'],
    ['muted', 'tx3'],
    ['paper', 'bg2'],
    ['ground', 'bg'],
    ['band', 'bg3'],
    ['rule', 'b'],
    ['rule2', 'b2'],
    ['accent', 'ac'],
    ['accentDeep', 'ac2'],
    ['accentSoft', 'ac-soft'],
    ['done', 'st-done'],
    ['wip', 'st-wip'],
    ['risk', 'st-risk'],
    ['doneSoft', 'st-done-soft'],
    ['wipSoft', 'st-wip-soft'],
    ['riskSoft', 'st-risk-soft'],
    ['confHi', 'cf-hi'],
    ['confMid', 'cf-mid'],
    ['confLo', 'cf-lo'],
  ])('%s is the stylesheet\'s --%s', (printKey, cssName) => {
    const want = token(cssName);
    expect(want, `--${cssName} is not a literal in the light block`).toBeTruthy();
    expect(String(PRINT[printKey]).toLowerCase()).toBe(want);
  });
});

describe('the printed surfaces', () => {
  // Every colour they draw comes from the palette above, so a change to the
  // theme reaches the paper too.
  const FILES = ['src/utils/pdfExports.js', 'src/utils/report.js'];
  const KNOWN = new Set(Object.values(PRINT).map(v => String(v).toLowerCase()));

  it.each(FILES)('writes no colour of its own in %s', file => {
    const text = readFileSync(path.join(process.cwd(), file), 'utf8');
    const stray = [];
    text.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      // Comments may name the old values — that is the record of what changed.
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (!KNOWN.has(m[0].toLowerCase())) stray.push(`${file}:${i + 1} ${m[0]}`);
      }
    });
    expect(stray, `colours outside the print palette:\n${stray.join('\n')}`).toEqual([]);
  });
});
