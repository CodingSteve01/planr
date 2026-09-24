// Both palettes have to be readable, and that is arithmetic, not taste.
//
// A palette is the one thing in this app nobody can review by looking: a
// caption grey that reads fine on one monitor is the first thing to fail on a
// laptop screen at an angle, and dark mode fails differently from light. So
// the ratios are computed here from the real token values in App.css, in both
// palettes, against every surface they are painted on.
//
// WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and for the boundary
// of a control you have to be able to find.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');

function paletteOf(selector) {
  const at = css.indexOf(selector);
  expect(at, `no ${selector} block in App.css`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('\n}', at));
  const out = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

// Tokens alias each other (`--gr: var(--st-done)`), so resolve to a hex.
function hexOf(palette, token, seen = new Set()) {
  const raw = palette[token];
  if (!raw || seen.has(token)) return null;
  seen.add(token);
  const via = raw.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (via) return hexOf(palette, via[1], seen);
  const hex = raw.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  return hex ? hex[1] : null;
}

function luminance(hex) {
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
  const channel = i => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a, b) {
  const pair = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (pair[0] + 0.05) / (pair[1] + 0.05);
}

const DARK = paletteOf(':root{');
const LIGHT = paletteOf(':root[data-theme="light"]{');

// Surfaces text is actually painted on. --bg4/--bg5 are control fills and
// hover states, not text grounds.
const SURFACES = ['bg', 'bg2', 'bg3'];

describe.each([['dark', DARK], ['light', LIGHT]])('the %s palette', (name, palette) => {
  it('defines every colour token as a resolvable hex', () => {
    for (const token of ['bg', 'bg2', 'bg3', 'b', 'b2', 'b3', 'tx', 'tx2', 'tx3', 'ac', 'ac2']) {
      expect(hexOf(palette, token), `--${token} does not resolve to a hex`).toBeTruthy();
    }
  });

  // --tx3 is the one that gets set too light every time: captions, column
  // heads, counts, and the second line of every work-order row.
  //
  // AA (4.5:1) is the floor for text of any size, and at 10–12px it is not
  // enough to read comfortably for long: reported as headaches, in both
  // palettes. So the text ladder is held above it — body and secondary text
  // to AAA (7:1, WCAG 1.4.6), captions to 6:1, which is where GitHub's and
  // macOS's own secondary greys sit.
  it.each([['tx', 7], ['tx2', 7], ['tx3', 6]])('reads --%s on every surface it sits on', (token, bar) => {
    const ink = hexOf(palette, token);
    for (const surface of SURFACES) {
      const ratio = contrast(ink, hexOf(palette, surface));
      expect(ratio, `--${token} on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(bar);
    }
  });

  it('reads --ac on every surface it sits on', () => {
    const ink = hexOf(palette, 'ac');
    for (const surface of SURFACES) {
      const ratio = contrast(ink, hexOf(palette, surface));
      expect(ratio, `--ac on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The state colours label status in words as well as in dots and bars.
  it.each(['st-done', 'st-wip', 'st-risk'])('reads --%s as label text', token => {
    const ink = hexOf(palette, token);
    for (const surface of SURFACES) {
      const ratio = contrast(ink, hexOf(palette, surface));
      expect(ratio, `--${token} on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // A row separator you cannot see is a table without rows.
  it('separates surfaces from each other visibly', () => {
    expect(contrast(hexOf(palette, 'b2'), hexOf(palette, 'bg2'))).toBeGreaterThanOrEqual(1.3);
    expect(contrast(hexOf(palette, 'b3'), hexOf(palette, 'bg2'))).toBeGreaterThanOrEqual(1.9);
  });

  // The empty status dot is a ring on a card. Inheriting the row separator's
  // colour makes "offen" invisible — the classic dark-mode miss.
  it('gives the open-state ring more contrast than a row separator', () => {
    const ring = hexOf(palette, 'st-open-ring');
    expect(ring, '--st-open-ring is not defined').toBeTruthy();
    expect(contrast(ring, hexOf(palette, 'bg2')))
      .toBeGreaterThan(contrast(hexOf(palette, 'b'), hexOf(palette, 'bg2')));
  });

  // Tinted badge grounds carry their own label. A soft ground borrowed from
  // the other palette is how dark mode ends up with dark green on dark green.
  it.each([['st-done', 'st-done-soft'], ['st-wip', 'st-wip-soft'], ['st-risk', 'st-risk-soft'], ['ac', 'ac-soft']])(
    'carries --%s on its own --%s ground',
    (ink, ground) => {
      const groundHex = hexOf(palette, ground);
      expect(groundHex, `--${ground} is not defined`).toBeTruthy();
      const ratio = contrast(hexOf(palette, ink), groundHex);
      expect(ratio, `--${ink} on --${ground} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('the two palettes stay in step', () => {
  it('declares the same colour tokens in both', () => {
    // Only tokens written as a literal hex. An alias (`--surf1: var(--bg2)`)
    // re-resolves against whichever palette is in effect, so it is declared
    // once in :root on purpose and must NOT be repeated in the light block.
    const colourish = p => Object.keys(p).filter(k => /^#[0-9a-fA-F]{3,6}$/.test(p[k])).sort();
    const light = colourish(LIGHT);
    const onlyDark = colourish(DARK).filter(k => !light.includes(k));
    expect(onlyDark, `only in the dark palette: ${onlyDark.join(', ')}`).toEqual([]);
  });
});

describe('the palette has one source', () => {
  // A literal colour outside the two palette blocks is a value nobody can
  // retheme. That is how the light mode drifted: every badge, row tint and
  // Gantt band carried its own pair of hexes and a `[data-theme="light"]`
  // twin to correct it, so changing the palette meant finding forty places.
  // They are all expressed as tokens (or a color-mix over one) now.
  it('carries no literal colour outside the palette blocks', () => {
    const lines = css.split('\n');
    // Where the two :root blocks end.
    const endOf = selector => {
      const at = css.indexOf(selector);
      return css.slice(0, css.indexOf('\n}', at)).split('\n').length;
    };
    const darkEnd = endOf(':root{');
    const lightStart = css.slice(0, css.indexOf(':root[data-theme="light"]{')).split('\n').length;
    const lightEnd = endOf(':root[data-theme="light"]{');

    const offenders = [];
    lines.forEach((line, i) => {
      const n = i + 1;
      if (n <= darkEnd) return;                       // dark palette
      if (n >= lightStart && n <= lightEnd) return;   // light palette
      if (/^\s*(\/\*|\*)/.test(line)) return;         // a comment naming a colour
      for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        // White and black on a coloured fill (a button's own label, a toggle
        // knob) are not palette decisions — they are the contrast pair of
        // whatever the fill is, in both themes.
        if (/^#(fff|ffffff|000|000000)$/i.test(m[0])) continue;
        offenders.push(`${n}: ${line.trim().slice(0, 90)}`);
      }
    });
    expect(offenders, `literal colours outside the palette:\n${offenders.join('\n')}`).toEqual([]);
  });

  // Same reasoning, one level up: a light-mode twin that only restates what
  // the base rule already derives from tokens is a second source.
  it('needs no light twin for anything built from tokens', () => {
    // A descendant selector (`[data-theme="light"] .foo`), never the palette
    // block itself (`:root[data-theme="light"]`), which is where the light
    // values belong.
    const twins = [...css.matchAll(/\[data-theme="light"\] [^{]*\{([^}]*)\}/g)]
      .filter(m => [...m[1].matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
        .some(h => !/^#(fff|ffffff|000|000000)$/i.test(h[0])))
      .map(m => m[0].slice(0, 80));
    expect(twins, `light twins still carrying literal colours:\n${twins.join('\n')}`).toEqual([]);
  });
});
