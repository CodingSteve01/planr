// The scoping pass is the one place where a silent mistake would be loud:
// a selector that escapes `.planr-view` restyles the user's whole vault.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { scopeCss } from '../scope-css.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function selectorsOf(css) {
  const out = [];
  postcss.parse(css).walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    out.push(...rule.selectors);
  });
  return out;
}

describe('scopeCss', () => {
  it('moves the design tokens from :root onto the container', () => {
    expect(scopeCss(':root{--bg:#000}')).toContain('.planr-view{--bg:#000}');
  });

  it('keeps the light palette keyed to the <html> attribute i18n.jsx sets', () => {
    // `.planr-view[data-theme=light]` would never match: the attribute lives
    // on the document element, not on the container.
    expect(scopeCss(':root[data-theme="light"]{--bg:#fff}'))
      .toContain('html[data-theme="light"] .planr-view');
  });

  it('keeps a bare theme condition on <html>, where i18n.jsx sets it', () => {
    // The bug this test exists for: prefixed like anything else, this becomes
    // `.planr-view [data-theme=light] .tr.l1 td` — a themed element inside
    // Planr, which never exists — and the light palette silently vanishes
    // while the tokens themselves flip. Half-light app, dark tree rows.
    expect(scopeCss('[data-theme="light"] .tr.l1 td{background:#f5f7fa}'))
      .toBe('html[data-theme="light"] .planr-view .tr.l1 td{background:#f5f7fa}');
  });

  it('reads a themed body as the app frame, not a body inside it', () => {
    expect(scopeCss('[data-theme="light"] body{-webkit-font-smoothing:auto}'))
      .toBe('html[data-theme="light"] .planr-view{-webkit-font-smoothing:auto}');
  });

  it('scopes attribute selectors that are app markup', () => {
    expect(scopeCss('[data-ss-idx]{padding:0}')).toBe('.planr-view [data-ss-idx]{padding:0}');
  });

  it('collapses the page frame onto the container', () => {
    expect(selectorsOf(scopeCss('html,body,#root{height:100%}'))).toEqual(['.planr-view']);
  });

  it('keeps the universal reset inside the container', () => {
    expect(selectorsOf(scopeCss('*,*::before{margin:0}')))
      .toEqual(['.planr-view *', '.planr-view *::before']);
  });

  it('scopes rules nested in at-rules', () => {
    expect(scopeCss('@media print{.topbar{display:none}}'))
      .toContain('.planr-view .topbar');
  });

  it('leaves keyframe stops alone', () => {
    expect(scopeCss('@keyframes pulse{0%,100%{opacity:1}}'))
      .toBe('@keyframes pulse{0%,100%{opacity:1}}');
  });

  it('trades viewport height for container height', () => {
    // A leaf is not the window: 100vh would run out the bottom of the tab.
    expect(scopeCss('.app{height:100vh;max-height:calc(100vh - 48px)}'))
      .toBe('.planr-view .app{height:100%;max-height:calc(100% - 48px)}');
  });

  it('lets no selector out of the container', () => {
    const scoped = scopeCss(readFileSync(path.join(repo, 'src', 'App.css'), 'utf8'));
    const escapees = selectorsOf(scoped).filter(s => !s.includes('.planr-view'));
    expect(escapees).toEqual([]);
  });

  it('anchors every light-mode rule in App.css at <html>', () => {
    const scoped = scopeCss(readFileSync(path.join(repo, 'src', 'App.css'), 'utf8'));
    const themed = selectorsOf(scoped).filter(s => s.includes('data-theme'));
    // A floor, not a target: the point is that whatever light-mode rules
    // exist are anchored at <html>. The count fell from thirty-odd to a
    // handful when the palette moved into tokens and the per-rule light
    // twins stopped being necessary — that is the improvement, not a loss.
    expect(themed.length).toBeGreaterThan(3);
    expect(themed.filter(s => !s.startsWith('html[data-theme'))).toEqual([]);
  });
});
