#!/usr/bin/env node
// Installs this repository's git hooks. Runs on `npm install` (the `prepare`
// script) and by hand as `npm run hooks`.
//
// The hooks are the first place a change is checked, before CI:
//
//   pre-commit   the staged files are formatted and lint, and hold no
//                private term
//   commit-msg   the private-terms check on the message
//   pre-push     `npm run quality` (lint, duplicates, dead code, versions,
//                semgrep, private terms)
//
// They are written into the repository's hook directory rather than switched
// in with `core.hooksPath`, so hooks a machine already has for other events
// (a post-merge that installs the plugin, say) keep working. A hook of the
// same name that this script did not write is left alone and reported.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const quiet = process.argv.includes('--quiet');
const say = msg => {
  if (!quiet) console.log(msg);
};
const MARK = '# planr: installed by scripts/install-hooks.mjs';

export const HOOKS = {
  // The files as they are on disk: a partly staged file is linted whole.
  // Nothing staged that lints: nothing to run. (GNU xargs would otherwise start
  // eslint without a file, which lints everything.)
  'pre-commit': `if ! git diff --cached --quiet --diff-filter=ACMR -- '*.js' '*.jsx' '*.mjs'; then
  git diff --cached --name-only -z --diff-filter=ACMR -- '*.js' '*.jsx' '*.mjs' | xargs -0 npx --no-install prettier --check --ignore-unknown || { echo 'Run: npm run format'; exit 1; }
  git diff --cached --name-only -z --diff-filter=ACMR -- '*.js' '*.jsx' '*.mjs' | xargs -0 npx --no-install eslint --no-warn-ignored || exit 1
fi
node scripts/check-private.mjs --staged || exit 1`,
  'commit-msg': 'node scripts/check-private.mjs --message "$1" || exit 1',
  'pre-push': 'npm run --silent quality || exit 1',
};

export function hookText(body) {
  return `#!/bin/sh\n${MARK}\n${body}\n`;
}

function main() {
  let dir;
  try {
    dir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  } catch {
    say('install-hooks: not a git checkout, nothing to do');
    return;
  }
  const hooks = join(dir, 'hooks');
  mkdirSync(hooks, { recursive: true });
  for (const [name, body] of Object.entries(HOOKS)) {
    const file = join(hooks, name);
    if (existsSync(file)) {
      const have = readFileSync(file, 'utf8');
      const ours = have.includes(MARK) || /^#!\/bin\/sh\nnode scripts\/check-private\.mjs [^\n]*\n$/.test(have);
      if (!ours) {
        console.warn(`install-hooks: ${name} exists and is not ours, left alone`);
        continue;
      }
    }
    writeFileSync(file, hookText(body));
    chmodSync(file, 0o755);
    say(`install-hooks: ${name}`);
  }
}

// Compared as real paths: a URL is percent-encoded and a path is not, and a
// checkout may sit behind a symlink.
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === realpathSync(fileURLToPath(import.meta.url))) main();
