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

  it('ships the three files Obsidian downloads, and nothing else', () => {
    const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('planr');
    expect(manifest.isDesktopOnly).toBe(true);
    const versions = JSON.parse(readFileSync(path.join(here, '..', '..', 'versions.json'), 'utf8'));
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });
});
