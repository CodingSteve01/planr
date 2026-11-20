/** @vitest-environment happy-dom */
// The zoom group is above the map, not on it.
//
// Reported twice. It floated over the map's top-right corner to cost no
// vertical space, and sat on the first line's terminus badge — the one bit of
// the drawing that cannot move out of its way. Padding the canvas out from
// under it looked like a fix and was not: the SVG scales with the pane's
// width and a 24px control does not, so the clearance that holds at one width
// closes at another and the collision comes back on a narrower window.
//
// In normal flow it cannot collide at any width, which is a property of the
// layout rather than of a number that happened to be big enough.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(process.cwd(), 'src/components/shared/Roadmap.jsx'), 'utf8');

describe('the roadmap zoom control', () => {
  it('is not positioned over the canvas', () => {
    // The shape of the old bug in one line: an absolutely placed box pinned to
    // the top-right of the box the map is drawn in.
    const floating = /position:\s*'absolute'[^}]*top:\s*0[^}]*right:\s*0/.test(src);
    expect(floating, 'the zoom group floats over the map again').toBe(false);
  });

  it('does not lean on a magic clearance under it', () => {
    // A number chosen against one width is the thing that failed.
    expect(src).not.toMatch(/ZOOM_CLEARANCE/);
    expect(src).not.toMatch(/paddingTop:\s*\d+/);
  });

  it('sits before the map in the document, so flow keeps them apart', () => {
    const zoomAt = src.indexOf("t('g.zoom')");
    const mapAt = src.indexOf('<SvgMarkup');
    expect(zoomAt).toBeGreaterThan(-1);
    expect(mapAt).toBeGreaterThan(-1);
    expect(zoomAt).toBeLessThan(mapAt);
  });
});
