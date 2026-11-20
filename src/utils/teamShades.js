// Tints of a team's colour, one per member.
//
// A team card carries the team's colour as a swatch beside its name; giving
// each member a step of that same colour ties a person to their team without
// introducing a second hue. Steps run dark to light in light mode and light to
// dark in the dark one, so the first member is always the most contrasty
// against the ground rather than the most washed out.
//
// Mixing happens here rather than in CSS because the PDF layer has no
// stylesheet to resolve `color-mix` against, and screen and paper have to show
// the same thing.

function parseHex(color) {
  const hex = String(color || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.slice(1).split('');
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16) };
  }
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
  }
  return null;
}

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

function mix(rgb, target, amount) {
  return '#' + hex2(rgb.r + (target - rgb.r) * amount)
    + hex2(rgb.g + (target - rgb.g) * amount)
    + hex2(rgb.b + (target - rgb.b) * amount);
}

// `count` steps from the team colour. The first step is the colour itself; the
// rest walk towards white (or towards black on a dark ground) so they stay
// distinguishable from each other and readable on the card.
export function memberShades(teamColor, count, { dark = false } = {}) {
  const rgb = parseHex(teamColor);
  const n = Math.max(1, count || 1);
  if (!rgb) return Array.from({ length: n }, () => teamColor || '#888888');
  // Stop well short of the ground: past ~0.55 a tint is no longer a colour,
  // it is a smudge, and two adjacent members become indistinguishable.
  const span = n === 1 ? 0 : 0.5;
  return Array.from({ length: n }, (_, i) => {
    const amount = n === 1 ? 0 : (i / (n - 1)) * span;
    return mix(rgb, dark ? 0 : 255, amount);
  });
}

export default memberShades;
