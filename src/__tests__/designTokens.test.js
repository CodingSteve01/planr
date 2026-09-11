// Ratchet for docs/design-tokens.md ("one source per truth" — docs/principles.md
// "Design language"). Every colour, spacing and type size should eventually come
// from src/App.css's token system instead of being re-typed as a literal in JSX.
// This test doesn't try to forbid literals outright (some are legitimately out
// of scope — decorative team/demo palettes, alpha-tinted overlays, genuinely
// ambiguous colours tracked in docs/design-tokens.md § "Not yet mapped") but it
// stops the count from silently growing. Lower MAX_LITERALS as you migrate more;
// never raise it without migrating an equal or larger number elsewhere first.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const COMPONENTS_DIR = join(ROOT, 'src', 'components');
const APP_JSX = join(ROOT, 'src', 'App.jsx');
const APP_CSS = join(ROOT, 'src', 'App.css');

// hex literal (#abc, #aabbcc, #aabbccdd, ...) or rgb(/rgba( function call.
const LITERAL_RE = /#[0-9a-f]{3,8}\b|rgba?\(/gi;

function listJsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listJsxFiles(full));
    else if (entry.endsWith('.jsx')) out.push(full);
  }
  return out;
}

function countLiterals(file) {
  const src = readFileSync(file, 'utf8');
  const matches = src.match(LITERAL_RE);
  return matches ? matches.length : 0;
}

describe('design token ratchet', () => {
  it('does not introduce new hex/rgb(a) colour literals in components or App.jsx', () => {
    // lower this as you migrate; never raise it
    const MAX_LITERALS = 258;
    const files = [APP_JSX, ...listJsxFiles(COMPONENTS_DIR)];
    const total = files.reduce((sum, f) => sum + countLiterals(f), 0);
    expect(total).toBeLessThanOrEqual(MAX_LITERALS);
  });

  it('defines the full token system in App.css', () => {
    const css = readFileSync(APP_CSS, 'utf8');
    const root = css.slice(0, css.indexOf(':root[data-theme="light"]'));
    const light = css.slice(css.indexOf(':root[data-theme="light"]'));

    // Spacing + type scale: theme-invariant, defined once in :root.
    for (const tok of ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6']) {
      expect(root).toContain(`${tok}:`);
    }
    for (const tok of ['--t10', '--t11', '--t12', '--t14', '--t20']) {
      expect(root).toContain(`${tok}:`);
    }

    // Surfaces: defined once in :root, mapped onto --bg/--bg2/--bg3 which the
    // light block already overrides — so they resolve correctly in both
    // palettes without being redeclared there.
    expect(root).toContain('--surf0:');
    expect(root).toContain('--surf1:');
    expect(root).toContain('--surf2:');

    // Accent: pre-existing, must still be defined in both palettes.
    expect(root).toContain('--ac:');
    expect(light).toContain('--ac:');

    // State tokens: real per-theme values, so defined in both palettes, plus
    // the back-compat aliases that keep --gr/--am/--re working.
    for (const tok of ['--st-done', '--st-wip', '--st-open', '--st-risk', '--st-archived']) {
      expect(root).toContain(`${tok}:`);
      expect(light).toContain(`${tok}:`);
    }
    for (const alias of ['--gr:var(--st-done)', '--am:var(--st-wip)', '--re:var(--st-risk)']) {
      expect(root).toContain(alias);
      expect(light).toContain(alias);
    }
  });
});
