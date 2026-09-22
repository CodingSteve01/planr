// The line colours are one family, and they are drawn on two grounds.
//
// Two separate failures hide here. The first is aesthetic and was real: the
// old set was the default Tailwind ramp — #3b82f6, #10b981, #f59e0b, #ef4444
// — eight unrelated hues at full chroma. Any one of them is fine on a badge;
// eight of them on one canvas is a set of lines shouting over each other
// instead of a drawing.
//
// The second is mechanical. The same hex is painted on a near-white card in
// light mode and a near-black one in dark, because the colour is stored per
// project (colorIdx) and travels into the PDF as well. A colour tuned for one
// ground goes muddy on the other, and nobody notices until they switch theme.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(process.cwd(), 'src/utils/roadmap.js'), 'utf8');
const PALETTE = JSON.parse(
  src.match(/const PALETTE = (\[[^\]]*\]);/)[1].replace(/'/g, '"'),
);

const luminance = hex => {
  const ch = i => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
};
const contrast = (a, b) => {
  const p = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (p[0] + 0.05) / (p[1] + 0.05);
};

// The card surface in each palette, from App.css's --bg2.
const LIGHT_CARD = '#ffffff';
const DARK_CARD = '#1c1b17';

describe('the roadmap line colours', () => {
  it('gives eight lines eight colours', () => {
    expect(PALETTE).toHaveLength(8);
    expect(new Set(PALETTE).size).toBe(8);
  });

  // 3:1 — a 6px stroke is a graphical object, not text.
  it.each(PALETTE)('%s reads on the light card', hex => {
    expect(contrast(hex, LIGHT_CARD)).toBeGreaterThanOrEqual(3);
  });

  it.each(PALETTE)('%s reads on the dark card too', hex => {
    expect(contrast(hex, DARK_CARD)).toBeGreaterThanOrEqual(3);
  });

  it('is one family, not eight unrelated brights', () => {
    // Lightness within a narrow band: that is what stops one line shouting
    // over its neighbours. The old Tailwind ramp spanned 0.17 to 0.58.
    const ls = PALETTE.map(luminance);
    const spread = Math.max(...ls) - Math.min(...ls);
    expect(spread, `luminance spread ${spread.toFixed(3)}`).toBeLessThan(0.2);
  });

  it('spreads the hues, so two lines are never the same colour at a glance', () => {
    const hueOf = hex => {
      const [r, g, b] = [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    };
    const hues = PALETTE.map(hueOf).sort((a, b) => a - b);
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i] - hues[i - 1], `${hues[i - 1].toFixed(0)}° and ${hues[i].toFixed(0)}° are too close`)
        .toBeGreaterThan(12);
    }
  });
});
