/** @vitest-environment happy-dom */
// Icons are drawn, not typed.
//
// Reported, fairly: the old ones were not presentable. They were emoji and
// stray typographic glyphs — 🗺 for the roadmap, 💾 for save, ✧ beside a menu
// entry. Three things are wrong with that and only the third is taste. An
// emoji comes from a different font on every machine, so it never matches the
// weight of the text beside it. It carries its own colour and ignores the
// one the row is painted in, so it cannot go quiet in a disabled control.
// And its size comes from the font rather than the layout, so it never lines
// up twice.
//
// The typographic arrows in SHORTCUT HINTS (⇧, ↵, ⌥) and DATE RANGES (→) are
// text, not icons, and are deliberately left alone.
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Icon, ICON_NAMES } from '../components/shared/Icon.jsx';

const read = rel => readFileSync(path.join(process.cwd(), rel), 'utf8');

// Anything pictographic, plus the stray typographic marks the app used as
// icons (◎ ☰ ▭ ⁂ ✎ ☀). NOT the arrow blocks: those are text here.
const PICTOGRAPH = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25CE}\u{2630}\u{25AD}\u{2042}]/u;

// Five of these are the MARKDOWN FILE FORMAT, not decoration: a plan note on
// disk writes phases as `✅RE, 🟡Development`, a pinned start as `📌2026-01-05`
// and a goal or pain point as `🎯` / `⚡`. Replacing them would not change an
// icon, it would stop every saved plan from parsing. They are data.
const FORMAT_TOKENS = /[✅🟡📌⚡🎯]/u;
const stripFormat = line => line.replace(new RegExp(FORMAT_TOKENS, 'gu'), '');

describe('the icon set', () => {
  it('draws in the colour of the text around it', () => {
    const { container } = render(<Icon name="save" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    cleanup();
  });

  it('is hidden from a screen reader unless it is given a name', () => {
    // An icon beside its own label is decoration; one standing alone is not.
    const plain = render(<Icon name="save" />);
    expect(plain.container.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const named = render(<Icon name="save" title="Speichern" />);
    const svg = named.container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('Speichern');
    expect(svg.getAttribute('role')).toBe('img');
    cleanup();
  });

  it('sits on one grid, so two icons beside each other line up', () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector('svg').getAttribute('viewBox'), name).toBe('0 0 24 24');
      cleanup();
    }
  });

  it('renders nothing for a name it does not have, rather than a gap', () => {
    const { container } = render(<Icon name="not-an-icon" />);
    expect(container.querySelector('svg')).toBeNull();
    cleanup();
  });
});

describe('the chrome', () => {
  // The surfaces that frame every view: the tab row, the palette and the file
  // menu. These are the ones a stranger sees first.
  // Every component the app draws. Icon.jsx itself is excluded: its header
  // names the glyphs it replaced, which is documentation, not decoration.
  const COMPONENTS = readdirSync(path.join(process.cwd(), 'src/components'), { recursive: true })
    .filter(f => typeof f === 'string' && f.endsWith('.jsx') && !f.includes('__tests__') && !f.endsWith('Icon.jsx'))
    .map(f => `src/components/${f}`);

  it.each(['src/App.jsx', ...COMPONENTS])('has no pictograph left in %s', file => {
    const text = read(file);
    const hits = text.split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => PICTOGRAPH.test(stripFormat(line)))
      .map(({ line, n }) => `${n}: ${line.trim().slice(0, 80)}`);
    expect(hits, `glyphs still used as icons:\n${hits.join('\n')}`).toEqual([]);
  });
});
