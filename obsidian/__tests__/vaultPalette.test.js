// Inside Obsidian the neutral tokens come from the vault's theme, and a theme
// is not held to anything: Atom's --text-muted is 3.5:1 on its own ground and
// --text-faint is below 2:1. The mapping in obsidian.css therefore mixes the
// theme's values instead of taking them as-is, and this test is what the mix
// percentages answer to — the same WCAG AA bars src/utils/__tests__/
// paletteContrast.test.js sets for Planr's own palette, evaluated against real
// theme values in both modes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Theme values, copied from the theme's stylesheet. `--interactive-accent`
// follows the vault's accent setting, so Atom is checked with the accent this
// vault actually uses (#ac5c39) as well as the theme's own.
const ATOM_DARK = {
  'background-primary': '#272b34', 'background-secondary': '#20242b',
  'background-modifier-border': '#424958',
  'text-normal': '#dcddde', 'text-muted': '#888888', 'text-faint': '#515663',
  'text-on-accent': '#dcddde',
};
const ATOM_LIGHT = {
  'background-primary': '#fafafa', 'background-secondary': '#eaeaeb',
  'background-modifier-border': '#dbdbdc',
  'text-normal': '#383a42', 'text-muted': '#8e8e90', 'text-faint': '#999999',
  'text-on-accent': '#f2f2f2',
};
// Obsidian's built-in theme (the --color-base-* ramp) with its default accent.
const DEFAULT_DARK = {
  'background-primary': '#1e1e1e', 'background-secondary': '#262626',
  'background-modifier-border': '#363636',
  'text-normal': '#dadada', 'text-muted': '#b3b3b3', 'text-faint': '#666666',
  'interactive-accent': '#8a5cf5', 'text-on-accent': '#ffffff',
};
const DEFAULT_LIGHT = {
  'background-primary': '#ffffff', 'background-secondary': '#f6f6f6',
  'background-modifier-border': '#e0e0e0',
  'text-normal': '#222222', 'text-muted': '#5c5c5c', 'text-faint': '#ababab',
  'interactive-accent': '#7045e0', 'text-on-accent': '#ffffff',
};

const THEMES = [
  ['Atom dark, rust accent', 'dark', { ...ATOM_DARK, 'interactive-accent': '#ac5c39' }],
  ['Atom dark, own accent', 'dark', { ...ATOM_DARK, 'interactive-accent': '#4a7dcf' }],
  ['Atom light, rust accent', 'light', { ...ATOM_LIGHT, 'interactive-accent': '#ac5c39' }],
  ['Atom light, own accent', 'light', { ...ATOM_LIGHT, 'interactive-accent': '#5870f0' }],
  ['default dark', 'dark', DEFAULT_DARK],
  ['default light', 'light', DEFAULT_LIGHT],
];

function declsOf(css, match) {
  const out = {};
  postcss.parse(css).walkRules(rule => {
    if (!rule.selectors.some(match)) return;
    rule.walkDecls(d => { if (d.prop.startsWith('--')) out[d.prop.slice(2)] = d.value; });
  });
  return out;
}

const pluginCss = readFileSync(path.join(repo, 'obsidian/src/obsidian.css'), 'utf8');
const appCss = readFileSync(path.join(repo, 'src/App.css'), 'utf8');
const MAPPING = declsOf(pluginCss, s => /body\.theme-(dark|light) \.planr-view$/.test(s));
const PLANR = {
  dark: declsOf(appCss, s => s === ':root'),
  light: { ...declsOf(appCss, s => s === ':root'), ...declsOf(appCss, s => s === ':root[data-theme="light"]') },
};

const rgb = hex => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
};
const toHex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Resolves a token the way the browser would on .planr-view: the mapping
// first, then Planr's palette for the mode, then the theme's variables.
// Understands exactly the forms the mapping uses — a hex, var(), and a
// two-stop `color-mix(in srgb, A p%, B)`, which is plain interpolation in
// gamma-encoded sRGB.
function resolve(value, mode, theme, seen = new Set()) {
  value = value.trim();
  if (/^#[0-9a-f]{3,6}$/i.test(value)) return value.toLowerCase();
  const ref = value.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (ref) {
    const name = ref[1];
    expect(seen.has(name), `--${name} refers to itself`).toBe(false);
    const next = new Set(seen).add(name);
    if (MAPPING[name]) return resolve(MAPPING[name], mode, theme, next);
    if (PLANR[mode][name]) return resolve(PLANR[mode][name], mode, theme, next);
    expect(theme[name], `the theme fixture has no --${name}`).toBeTruthy();
    return theme[name];
  }
  const mix = value.match(/^color-mix\(\s*in srgb\s*,\s*(.+?)\s+(\d+)%\s*,\s*(.+)\)$/);
  expect(mix, `cannot evaluate ${value}`).toBeTruthy();
  const a = rgb(resolve(mix[1], mode, theme, seen));
  const b = rgb(resolve(mix[3], mode, theme, seen));
  const p = Number(mix[2]) / 100;
  return toHex(a.map((v, i) => v * p + b[i] * (1 - p)));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The text grounds, as in paletteContrast.test.js, plus the done row: a
// finished task's second line is --tx3 on --bg-done.
const SURFACES = ['bg', 'bg2', 'bg3', 'bg-done'];

describe('the vault mapping', () => {
  it('covers every neutral token and leaves the semantic ones alone', () => {
    for (const token of ['bg', 'bg2', 'bg3', 'bg4', 'bg5', 'b', 'b2', 'b3', 'tx', 'tx2', 'tx3', 'ac', 'ac2', 'on-ac']) {
      expect(MAPPING[token], `--${token} is not mapped`).toBeTruthy();
    }
    for (const token of ['st-done', 'st-wip', 'st-risk', 'diff', 'cf-hi', 'cf-mid', 'cf-lo', 'pu']) {
      expect(MAPPING[token], `--${token} must stay Planr's own`).toBeUndefined();
    }
  });

  // Placeholder-grade on every theme checked here; nothing Planr labels with
  // it would be readable.
  it('does not use --text-faint', () => {
    expect(Object.values(MAPPING).join(' ')).not.toContain('--text-faint');
  });
});

describe.each(THEMES)('on %s', (_, mode, theme) => {
  const hex = token => resolve(`var(--${token})`, mode, theme);

  // The text ladder to the same bars as Planr's own palette
  // (paletteContrast.test.js): AAA for body and secondary, 6:1 for captions.
  // Labels in a state colour and the accent stay at AA.
  it.each([['tx', 7], ['tx2', 7], ['tx3', 6], ['ac', 4.5], ['st-done', 4.5], ['st-wip', 4.5], ['st-risk', 4.5]])('reads --%s on every surface', (token, bar) => {
    for (const surface of SURFACES) {
      const ratio = contrast(hex(token), hex(surface));
      expect(ratio, `--${token} on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(bar);
    }
  });

  it('keeps the text ladder in order', () => {
    const on = token => contrast(hex(token), hex('bg'));
    expect(on('tx')).toBeGreaterThan(on('tx2'));
    expect(on('tx2')).toBeGreaterThan(on('tx3'));
  });

  it.each([['st-done', 'st-done-soft'], ['st-wip', 'st-wip-soft'], ['st-risk', 'st-risk-soft'], ['ac', 'ac-soft']])(
    'carries --%s on its own --%s ground',
    (ink, ground) => {
      const ratio = contrast(hex(ink), hex(ground));
      expect(ratio, `--${ink} on --${ground} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Button labels: bold, 11–13px. This is the theme's own pairing — Obsidian
  // paints its buttons with exactly these two — so the bar is the large-text
  // one rather than a second opinion on the vault's accent.
  it('labels a filled accent legibly', () => {
    expect(contrast(hex('on-ac'), hex('ac2'))).toBeGreaterThanOrEqual(3);
  });

  it('separates surfaces and steps visibly', () => {
    expect(contrast(hex('b2'), hex('bg2'))).toBeGreaterThanOrEqual(1.3);
    expect(contrast(hex('b3'), hex('bg2'))).toBeGreaterThanOrEqual(1.9);
    expect(hex('bg3')).not.toBe(hex('bg'));
    expect(hex('bg-done')).not.toBe(hex('bg'));
  });
});
