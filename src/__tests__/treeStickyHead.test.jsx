/** @vitest-environment happy-dom */
// Reported from inside the Obsidian plugin: the top of the column header row
// was shaved off — "TEAM" and "AUFWAND" were missing their first pixels.
//
// Three things stick to the top of the tree's scroller: the toolbar, the
// selection bar, and the table head. Their offsets were written into the
// markup as 0, 33 and 32 — numbers that could not all be right at once.
//
//   * The toolbar is 34px tall on the web, so a head parked at 32 lost 2px to
//     it. Obsidian applies its own control metrics, the toolbar grows, and so
//     does the bite taken out of the head.
//   * 32 is less than 33, so the head sat ABOVE the selection bar in the
//     stack. With a row selected it was not clipped, it was gone.
//   * Both bars wrap on a narrow pane — measured at 43px and 109px in a side
//     panel — so no constant would have held anyway.
//
// The stack measures itself now: a running total of the bars above, written
// to the container as a custom property the stylesheet reads back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stickyTops } from '../components/views/TreeView.jsx';

const src = readFileSync(path.join(process.cwd(), 'src/components/views/TreeView.jsx'), 'utf8');
const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');

describe('a sticky stack', () => {
  it('starts each bar where the one above it ended', () => {
    expect(stickyTops([34, 109])).toEqual([0, 34, 143]);
  });

  it('gives the head the toolbar alone when no row is selected', () => {
    expect(stickyTops([34, 0])).toEqual([0, 34, 34]);
  });

  it('survives a bar that has not been measured yet', () => {
    // First paint, before layout: everything is zero and everything is at the
    // top, which is where an unscrolled list draws it anyway.
    expect(stickyTops([0, 0])).toEqual([0, 0, 0]);
  });

  it('ignores a negative height rather than pulling the head upwards', () => {
    expect(stickyTops([-5, 20])).toEqual([0, 0, 20]);
  });
});

describe('the tree view', () => {
  it('measures the bars instead of assuming their height', () => {
    expect(src).toMatch(/new ResizeObserver\(measure\)/);
    expect(src).toMatch(/--tv-head-top/);
  });

  it('writes no pixel offset of its own into the stack', () => {
    // The regression this replaces, in the exact shape it had.
    const stuck = src.split('\n').filter(l => /position: 'sticky'/.test(l));
    expect(stuck.length, 'the sticky bars moved or disappeared').toBeGreaterThanOrEqual(2);
    stuck.forEach(line => {
      expect(line, `a hard-coded offset is back: ${line.trim()}`).toMatch(/top: (0|'var\(--tv-bar\d-top)/);
    });
    expect(src).not.toMatch(/top: 3[23]\b/);
  });

  it('stacks the bars over the head, and the selection bar over the toolbar', () => {
    // Each one covers what scrolls under it, so a lower bar must not paint
    // over the one above it when they touch.
    const z = [...src.matchAll(/position: 'sticky', top: '?(var\(--tv-bar(\d)-top[^']*|0)'?, zIndex: (\d+)/g)]
      .map(m => Number(m[3]));
    expect(z.length).toBe(2);
    expect(z[0]).toBeGreaterThan(z[1]);
  });
});

describe('the stylesheet', () => {
  it('parks the head under the measured stack', () => {
    const at = css.indexOf('.tv-surface .tree-tbl th{');
    expect(at, 'no rule placing the tree head').toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/top:\s*var\(--tv-head-top\)/);
  });

  it('declares the offsets, so a first paint has somewhere to start', () => {
    // Before layout there is nothing to measure, and an undeclared custom
    // property resolves to nothing at all — the head would sit at `top:auto`
    // and scroll away with the rows.
    const at = css.indexOf('.tv-surface{');
    const rule = css.slice(at, css.indexOf('}', at));
    ['--tv-bar0-top', '--tv-bar1-top', '--tv-head-top'].forEach(v =>
      expect(rule, `${v} is not declared`).toMatch(new RegExp(`${v}:\\s*\\d+px`)));
  });

  it('leaves the other tables sticking to the top of their own scroller', () => {
    // SumView and WorkOrderView use .tree-tbl with nothing above it.
    const at = css.indexOf('.tree-tbl th{');
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/top:\s*0/);
  });
});
