// The month axis has to fit its own labels.
//
// Seen on the real plan: "Nov '25Feb" — two labels drawn on top of each
// other. The model decides the tick spacing from the month COUNT, which is
// the wrong quantity. What decides whether a label fits is PIXELS per month,
// and that depends on the zoom, which only the view knows. At "fit" zoom on a
// three-year project a quarter is barely thirty pixels wide while a label
// with a year in it needs about sixty.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(process.cwd(), 'src/components/views/PlanRoadmap.jsx'), 'utf8');

// The rule the view applies, lifted out so the arithmetic can be checked
// without a layout engine.
const tickEvery = (modelTickEvery, pxPerDay) =>
  Math.max(modelTickEvery, Math.ceil(62 / Math.max(1, pxPerDay * 30.4)));

describe('the project lens month axis', () => {
  it('derives its spacing from pixels, not from the month count', () => {
    expect(src).toMatch(/const pxPerMonth = effectivePxDay \* 30\.4/);
    expect(src).toMatch(/const tickEvery = Math\.max\(model\.tickEvery/);
    // And the render uses that, not the model's guess.
    expect(src).not.toMatch(/idx % model\.tickEvery/);
  });

  it.each([
    // [px per day, months a label may cover]
    [4, 1],     // zoomed in: every month fits
    [2, 2],     // 61px per month — one short of the 62 a year-label needs
    [0.5, 5],   // fit on a three-year project: quarters are far too tight
    [0.15, 14], // a decade on one screen
  ])('at %s px/day it labels every %s month(s)', (pxDay, expected) => {
    expect(tickEvery(1, pxDay)).toBe(expected);
  });

  it('never labels more often than the model asked for', () => {
    // The model still gets to say "quarters at least" for a long project; the
    // view can only ever make the spacing wider, never tighter.
    expect(tickEvery(3, 10)).toBe(3);
  });

  it('gives every label at least the width it needs', () => {
    for (const pxDay of [0.1, 0.3, 0.7, 1.5, 3, 8]) {
      const widthPerLabel = tickEvery(1, pxDay) * pxDay * 30.4;
      expect(widthPerLabel, `${pxDay} px/day leaves ${widthPerLabel.toFixed(1)}px`).toBeGreaterThanOrEqual(62);
    }
  });
});
