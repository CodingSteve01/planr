/** @vitest-environment happy-dom */
// Guards docs/design-tokens.md § Layers. Tooltips once opened underneath the
// filter popover: both carried z-index 9999, and between equals the later
// element in the DOM wins. The fix is one ordered scale in App.css and no
// hand-picked numbers beside it — this test keeps it that way.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { HoverTipProvider } from '../components/shared/HoverTip.jsx';
import { Tip } from '../components/shared/Tooltip.jsx';
import { I18nProvider } from '../i18n.jsx';

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'src', 'App.css'), 'utf8');

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') out.push(...sources(full));
    } else if (/\.(jsx?|css)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

const ORDER = ['--z-overlay', '--z-overlay-top', '--z-popover', '--z-dropdown', '--z-drag', '--z-tooltip'];

function tokenValue(name) {
  const m = CSS.match(new RegExp(`${name}:(\\d+);`));
  return m ? Number(m[1]) : null;
}

describe('layer scale', () => {
  afterEach(cleanup);

  it('defines every layer token, in ascending order, with the tooltip on top', () => {
    const values = ORDER.map(tokenValue);
    expect(values.every(v => v != null)).toBe(true);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('has no hand-picked z-index of 100 or more anywhere in the app', () => {
    const offenders = [];
    for (const file of [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'obsidian', 'src'))]) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:z-index\s*:\s*|zIndex\s*:\s*['"]?)(\d+)/g)) {
        if (Number(m[1]) >= 100) offenders.push(`${file.slice(ROOT.length + 1)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lets a layer class win over .overlay, which it is combined with', () => {
    // Same specificity — the later rule wins, so the layer classes must follow.
    expect(CSS.indexOf('.layer-overlay-top{')).toBeGreaterThan(CSS.indexOf('.overlay{'));
    for (const [cls, tok] of [['layer-popover', '--z-popover'], ['layer-dropdown', '--z-dropdown'], ['layer-drag', '--z-drag']]) {
      expect(CSS).toContain(`.${cls}{z-index:var(${tok});}`);
    }
    expect(CSS).toMatch(/\.tt\{[^}]*z-index:var\(--z-tooltip\)/);
    expect(CSS).toMatch(/\.htip-pop\{[^}]*z-index:var\(--z-tooltip\)/);
  });

  it('renders both tooltips where the popovers go, not inside the view', () => {
    const { container } = render(<I18nProvider>
      <HoverTipProvider />
      <span data-htip="Hint">x</span>
      <Tip item={{ id: 'A-1', name: 'Alpha', status: 'open' }} x={10} y={10} />
    </I18nProvider>);
    fireEvent.mouseMove(container.querySelector('[data-htip]'), { clientX: 5, clientY: 5 });
    const hover = document.querySelector('.htip-pop');
    const item = document.querySelector('[data-testid="item-tip"]');
    expect(hover?.parentElement).toBe(document.body);
    expect(item?.parentElement).toBe(document.body);
    expect(container.contains(hover)).toBe(false);
  });
});
