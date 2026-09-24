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

  // Reported: the calendar icon sits inside the date, covering the day.
  // Obsidian positions it absolutely at the input's left edge.
  it('puts the date picker icon back after the date', () => {
    const css = readFileSync(path.join(out, 'styles.css'), 'utf8');
    const rule = css.match(/\.planr-view input\[type=date\][^{]*::-webkit-calendar-picker-indicator[^{]*\{[^}]*\}/);
    expect(rule, 'no date-picker rule in the plugin stylesheet').toBeTruthy();
    expect(rule[0]).toMatch(/position:\s*static/);
    // As specific as Obsidian's own selector, plus the scope — or it loses.
    expect(rule[0]).toMatch(/:not\(\[disabled="true"\]\)::-webkit-calendar-picker-indicator/);
  });

  it('ships the three files Obsidian downloads, and nothing else', () => {
    const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('planr');
    expect(manifest.isDesktopOnly).toBe(true);
    const versions = JSON.parse(readFileSync(path.join(here, '..', '..', 'versions.json'), 'utf8'));
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });
});
