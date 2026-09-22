// The type stack, and the two ways it goes wrong quietly.
//
// One: the token names a family the page never loads, so everything falls
// back to system-ui and nobody notices because it still looks like a font.
// Two: the display face has no real fallback, so in the Obsidian plugin —
// which cannot ship web fonts at all — a serif headline silently becomes the
// same sans as the body, and the one piece of hierarchy carrying the view
// disappears.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const css = readFileSync(path.join(root, 'src/App.css'), 'utf8');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const pluginCss = readFileSync(path.join(root, 'obsidian/src/obsidian.css'), 'utf8');

const tokenOf = name => {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};
// The first family in a stack, unquoted.
const firstFamily = stack => stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

describe('the type stack', () => {
  it('names a body, a mono and a display face', () => {
    for (const token of ['font', 'mono', 'font-display']) {
      expect(tokenOf(token), `--${token} is not defined in App.css`).toBeTruthy();
    }
  });

  it('loads exactly the families the tokens ask for', () => {
    const wanted = ['font', 'mono', 'font-display'].map(t => firstFamily(tokenOf(t)));
    for (const family of wanted) {
      expect(html, `index.html never loads "${family}"`).toContain(family.replace(/ /g, '+'));
    }
  });

  it('falls back to a real serif, for the plugin that cannot ship fonts', () => {
    // Obsidian gets no web fonts, so the display stack has to degrade to a
    // serif that is already on the machine — not to the body sans, which
    // would flatten the headline into the rest of the page.
    const stack = tokenOf('font-display').toLowerCase();
    expect(stack).toMatch(/\bserif\s*$/);
    expect(stack).toMatch(/georgia/);
  });

  it('gives the plugin the same three tokens, its own way', () => {
    // The plugin overrides --font/--mono to prefer the vault's typography.
    // A display token left out there means the headline is unstyled inside
    // Obsidian while it is right in the browser.
    for (const token of ['--font', '--mono', '--font-display']) {
      expect(pluginCss, `${token} is not set for .planr-view`).toContain(token);
    }
  });

  // Same rule as the colours: one source. A literal family name in a rule is
  // a decision nobody can change from the token block.
  it('sets no font-family outside the tokens', () => {
    const offenders = [];
    // `--font:` and friends are the token declarations themselves.
    for (const m of css.matchAll(/(?<!-)\bfont(?:-family)?\s*:\s*([^;}]+)[;}]/g)) {
      const value = m[1];
      if (/var\(--(font|mono|font-display)\)/.test(value)) continue;
      if (/^\s*(inherit|initial|unset)\s*$/.test(value)) continue;
      // `font:` shorthand also carries size/weight — only the family matters.
      if (/(inter|jetbrains|roboto|arial|helvetica|georgia|plex|instrument)/i.test(value)) {
        offenders.push(value.trim().slice(0, 70));
      }
    }
    expect(offenders, `literal families outside the tokens:\n${offenders.join('\n')}`).toEqual([]);
  });
});
