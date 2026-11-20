#!/usr/bin/env node
// Installs this repository's git hooks. Runs on `npm install` (the `prepare`
// script) and by hand as `npm run hooks`.
//
// The hooks are the first place a change is checked, before CI:
//
//   pre-commit   lint the staged files, and the private-terms check on them
//   commit-msg   the private-terms check on the message
//   pre-push     `npm run quality` (lint, duplicates, dead code, versions,
//                semgrep, private terms)
//
// They are written into the repository's hook directory rather than switched
// in with `core.hooksPath`, so hooks a machine already has for other events
// (a post-merge that installs the plugin, say) keep working. A hook of the
// same name that this script did not write is left alone and reported.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const quiet = process.argv.includes('--quiet');
const say = msg => { if (!quiet) console.log(msg); };
const MARK = '# planr: installed by scripts/install-hooks.mjs';

export const HOOKS = {
  'pre-commit': `files=$(git diff --cached --name-only --diff-filter=ACMR -- '*.js' '*.jsx' '*.mjs')
if [ -n "$files" ]; then npx --no-install eslint --no-warn-ignored $files || exit 1; fi
node scripts/check-private.mjs --staged || exit 1`,
  'commit-msg': 'node scripts/check-private.mjs --message "$1" || exit 1',
  'pre-push': 'npm run --silent quality || exit 1',
};

export function hookText(body) { return `#!/bin/sh\n${MARK}\n${body}\n`; }

function main() {
  let dir;
  try { dir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(); }
  catch { say('install-hooks: not a git checkout, nothing to do'); return; }
  const hooks = join(dir, 'hooks');
  mkdirSync(hooks, { recursive: true });
  for (const [name, body] of Object.entries(HOOKS)) {
    const file = join(hooks, name);
    if (existsSync(file)) {
      const have = readFileSync(file, 'utf8');
      const ours = have.includes(MARK) || /^#!\/bin\/sh\nnode scripts\/check-private\.mjs [^\n]*\n$/.test(have);
      if (!ours) { console.warn(`install-hooks: ${name} exists and is not ours, left alone`); continue; }
    }
    writeFileSync(file, hookText(body));
    chmodSync(file, 0o755);
    say(`install-hooks: ${name}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
