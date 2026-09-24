/** @vitest-environment happy-dom */
// Does the plugin bundle actually load?
//
// Obsidian evaluates main.js once, at startup, and a throw there shows up as
// "Failed to load plugin" with no useful trace. Everything that runs at module
// scope is in that blast radius: React, pdfmake, the html-to-docx blob URL the
// ?url shim builds, and every `import 'obsidian'` that has to stay external.
// So: build it, run it with a stub for the one module Obsidian provides, and
// check what comes out the other end.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postcss from 'postcss';
// The same stand-in the vault-layer tests use: whatever the bundle expects
// Obsidian to hand it has to exist here too, or this test is the one that
// says so.
import * as obsidian from './obsidian-stub.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(path.join(tmpdir(), 'planr-obsidian-'));


let exported;

beforeAll(() => {
  const build = spawnSync(
    process.execPath,
    [path.join(here, '..', 'esbuild.config.mjs'), '--out', out],
    { encoding: 'utf8' },
  );
  expect(build.status, build.stderr).toBe(0);

  const code = readFileSync(path.join(out, 'main.js'), 'utf8');
  const module_ = { exports: {} };
  const require_ = id => {
    if (id === 'obsidian') return obsidian;
    throw new Error(`bundle asked for an external module at runtime: ${id}`);
  };
  new Function('require', 'module', 'exports', code)(require_, module_, module_.exports);
  exported = module_.exports;
}, 60_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('the built plugin', () => {
  it('exports a plugin class as its default', () => {
    expect(typeof exported.default).toBe('function');
  });

  it('names the view type the stylesheet and manifest agree on', () => {
    expect(exported.VIEW_TYPE_PLANR).toBe('planr-view');
    const css = readFileSync(path.join(out, 'styles.css'), 'utf8');
    expect(css).toContain("[data-type='planr-view']");
  });

  // Reported: the checkboxes render as thin blue bars inside the plugin.
  // Obsidian replaces the native checkbox with a widget of its own — appearance
  // none plus an explicit width and height — so the plugin's blanket
  // `height: auto` for unclassed inputs collapsed it to a line. The app's own
  // layouts assume a native box, so take the native one back rather than
  // inherit half of the vault's.
  it('leaves checkboxes a real box, not a collapsed Obsidian widget', () => {
    const css = readFileSync(path.join(out, 'styles.css'), 'utf8');
    const heightAuto = (css.match(/[^{}]*\{[^}]*height:\s*auto[^}]*\}/g) || [])
      .filter(rule => /\.planr-view input/.test(rule.split('{')[0]));
    expect(heightAuto.length, 'no height reset for unclassed inputs').toBeGreaterThan(0);
    // Whatever else such a rule covers, it must not reach the checkbox.
    heightAuto
      .filter(rule => !/\[type=checkbox\]/.test(rule.split('{')[0]))
      .forEach(rule => expect(rule.split('{')[0]).toMatch(/:not\(\[type=checkbox\]\)/));
    expect(css).toMatch(/\.planr-view input\[type=checkbox\][^{]*\{[^}]*appearance:\s*auto/);
  });

  // The neutral tokens follow the vault's theme. The rule has to survive the
  // build as written — appended after the scoped app palette, keyed to both
  // the vault's and Planr's theme — or the plugin quietly goes back to
  // Planr's own colours and nobody notices until it sits next to a note.
  it('maps the neutral tokens onto the vault theme in both modes', () => {
    const css = readFileSync(path.join(out, 'styles.css'), 'utf8');
    const rules = [];
    postcss.parse(css).walkRules(rule => {
      if (rule.selectors.some(s => /body\.theme-(dark|light) \.planr-view$/.test(s))) rules.push(rule);
    });
    expect(rules, 'no vault-palette rule in styles.css').toHaveLength(1);
    const [rule] = rules;
    expect(rule.selectors).toEqual(expect.arrayContaining([
      'html[data-theme="dark"] body.theme-dark .planr-view',
      'html[data-theme="light"] body.theme-light .planr-view',
    ]));
    const decls = {};
    rule.walkDecls(d => { decls[d.prop] = d.value; });
    expect(decls['--bg']).toBe('var(--background-primary)');
    expect(decls['--bg2']).toBe('var(--background-secondary)');
    expect(decls['--b']).toBe('var(--background-modifier-border)');
    expect(decls['--tx']).toBe('var(--text-normal)');
    expect(decls['--ac2']).toBe('var(--interactive-accent)');
    expect(decls['--on-ac']).toBe('var(--text-on-accent)');
    for (const token of ['--bg3', '--bg4', '--bg5', '--b2', '--b3', '--tx2', '--tx3', '--ac', '--bg-done']) {
      expect(decls[token], `${token} is not mapped`).toMatch(/var\(--(background|text|interactive)-/);
    }
    // Semantic colours stay Planr's own.
    for (const token of ['--st-done', '--st-wip', '--st-risk', '--diff', '--cf-hi']) {
      expect(decls[token], `${token} must not follow the theme`).toBeUndefined();
    }
  });

  it('ships the three files Obsidian downloads, and nothing else', () => {
    const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('planr');
    expect(manifest.isDesktopOnly).toBe(true);
    const versions = JSON.parse(readFileSync(path.join(here, '..', '..', 'versions.json'), 'utf8'));
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });
});
