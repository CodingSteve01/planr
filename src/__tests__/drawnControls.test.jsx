/** @vitest-environment happy-dom */
// A button's face is drawn, not typed.
//
// The pictograph sweep (icons.test.jsx) let the arrow and geometry blocks
// through, on the grounds that the ⇧ in a shortcut hint and the → in a date
// range are text. That is still true, and so is the app's own state notation
// — ● half ◐ ring ○ — which is a vocabulary the legend teaches, not an icon.
//
// What the sweep missed is the marks that were doing an icon's whole job:
// ↶ and ↷ were the undo and redo buttons, ⊞ opened the editor, ⇤ and ⇥ moved
// a row a level, ⤒ ▲ ▼ ⤓ reordered it, ⧉ duplicated it, ▶ and ▼ folded a
// branch, and × closed every dialog in the app. They carry the three
// problems the emoji had — a different font on every machine, a size the
// layout does not control, a weight that does not match the text beside them
// — plus one of their own: in the tree's row actions, one button was a drawn
// pencil and the three next to it were typed marks.
//
// The rule is therefore about POSITION, not about the character. A mark that
// is a control's ENTIRE visible face is an icon and has to be drawn. The same
// mark leading a phrase, a count or a date range is text and stays.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const read = rel => readFileSync(path.join(process.cwd(), rel), 'utf8');

const COMPONENTS = readdirSync(path.join(process.cwd(), 'src/components'), { recursive: true })
  .filter(f => typeof f === 'string' && f.endsWith('.jsx') && !f.includes('__tests__') && !f.endsWith('Icon.jsx'))
  .map(f => `src/components/${f}`);
const FILES = ['src/App.jsx', ...COMPONENTS];

// Arrows, technical marks and geometric shapes. × (U+00D7) is here too: it is
// multiplication inside a phrase and a close button on its own, and only its
// position tells the two apart. The state triple ● ◐ ○ is deliberately absent
// — see the note above.
const ICONISH = '×←-⇿⊕-⋿⎘■-◊◌-◎◑-◿⤀-⥿⧀-⧿';

// A control whose children are NOTHING BUT such a mark — either written
// straight (`>×</button>`) or picked between two of them
// (`>{isCol ? '▶' : '▼'}</span>`).
const BARE = new RegExp(`>\\s*[${ICONISH}]\\s*</(button|span)>`, 'u');
const TERNARY = new RegExp(`>\\s*\\{[^}]*\\?\\s*'[${ICONISH}]'\\s*:\\s*'[${ICONISH}]'\\s*\\}\\s*</(button|span)>`, 'u');

describe('controls the app draws', () => {
  it.each(FILES)('has no glyph standing in for an icon in %s', file => {
    const hits = read(file).split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => BARE.test(line) || TERNARY.test(line))
      .map(({ line, n }) => `${n}: ${line.slice(0, 90)}`);
    expect(hits, `glyphs used as a control's whole face:\n${hits.join('\n')}`).toEqual([]);
  });

  // The other half of the same rule: a label in the dictionary must not carry
  // its own icon. `× Löschen` and `↳ Split` put the mark somewhere the
  // component cannot size, colour or align it.
  it('has no icon glyph prefixed to a label in the dictionary', () => {
    const LABEL = new RegExp(`'([a-z][\\w.]*)':\\s*'[${ICONISH}]\\s`, 'gu');
    const hits = [...read('src/i18n.jsx').matchAll(LABEL)].map(m => m[0]);
    expect(hits, `labels carrying their own glyph:\n${hits.join('\n')}`).toEqual([]);
  });
});

describe('the palette', () => {
  // `var(--gn)` sat in the bulk editor, colouring the one signal in its phase
  // list — a token that has never existed, so the "done" dot inherited the
  // colour around it and said nothing. Nothing catches that on its own: it is
  // valid CSS and it fails quietly.
  it('defines every custom property the app asks for', () => {
    const css = read('src/App.css');
    const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
    const sources = readdirSync(path.join(process.cwd(), 'src'), { recursive: true })
      .filter(f => typeof f === 'string' && /\.(jsx?|css)$/.test(f) && !f.includes('__tests__'))
      .map(f => `src/${f}`);
    const missing = [];
    for (const file of sources) {
      read(file).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
          if (!defined.has(m[1])) missing.push(`${file}:${i + 1} ${m[1]}`);
        }
      });
    }
    expect(missing, `undefined custom properties:\n${missing.join('\n')}`).toEqual([]);
  });
});
