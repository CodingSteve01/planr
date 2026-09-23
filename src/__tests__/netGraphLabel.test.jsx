/** @vitest-environment happy-dom */
// What a node says, and how it says it.
//
// Reported from the graph: a node's percentage read `2.562761506276151` — the
// raw float, sixteen digits wide, across a 130px card. And its name broke
// mid-word: "Zulieferung aus dem Betrieb steht" arrived as "…Betrie" over
// "b steht".
//
// Both come from the same root: SVG <text> formats nothing and wraps nothing,
// so anything a node shows has to be prepared before it gets there.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { wrapTwoLines } from '../components/views/NetGraph.jsx';
import { progressPctLabel } from '../utils/progress.js';

describe('a node label', () => {
  it('breaks at a space, not at a character count', () => {
    const [first, second] = wrapTwoLines('Zulieferung aus dem Betrieb steht', 26);
    expect(first).toBe('Zulieferung aus dem');
    expect(second).toBe('Betrieb steht');
    expect(first.endsWith(' ')).toBe(false);
  });

  it('leaves a short name alone, on one line', () => {
    expect(wrapTwoLines('Masken stehen', 26)).toEqual(['Masken stehen', '']);
  });

  it('marks a name that does not fit in two lines', () => {
    const [, second] = wrapTwoLines(
      'Abrechnungsvorbereitung und Planung inklusive Backlog und Wireframes und mehr', 26);
    expect(second.endsWith('…')).toBe(true);
  });

  it('cuts a single word that is longer than the line, rather than overflowing', () => {
    const [first] = wrapTwoLines('Donaudampfschifffahrtsgesellschaftskapitaen', 26);
    expect(first).toHaveLength(26);
  });

  it('never returns a line longer than the limit', () => {
    const names = ['a '.repeat(40), 'Wort '.repeat(12), 'x'.repeat(80), 'Kurz', ''];
    for (const name of names) {
      for (const line of wrapTwoLines(name, 26)) {
        expect(line.length, `"${line}" from "${name.slice(0, 20)}"`).toBeLessThanOrEqual(27);
      }
    }
  });
});

describe('the percentage in a node ring', () => {
  it('is the app-wide formatted figure, never the raw number', () => {
    // progress.js is the single source for this number AND its rounding, so
    // the graph cannot disagree with the tree about the same task.
    expect(progressPctLabel(2.562761506276151)).toBe('2.6');
  });

  it('is not rendered straight from the stats object', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/components/views/NetGraph.jsx'), 'utf8');
    // The bug in one line: `>{prog}<` inside the ring's <text>.
    expect(src).not.toMatch(/>\{prog\}</);
    expect(src).toMatch(/progressPctLabel\(prog\)/);
  });
});
