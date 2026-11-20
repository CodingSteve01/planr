#!/usr/bin/env node
// Runs semgrep with the repository's own rules (.semgrep/), or with the
// registry's default rules as advice (--advice).
//
// semgrep is not an npm package. Where it is not installed the check is
// skipped with a line saying so, except on CI, where a skipped security
// check is a failed one.
import { spawnSync } from 'node:child_process';

const advice = process.argv.includes('--advice');
const targets = ['src', 'obsidian', 'scripts', 'tools', '.github'];
const args = ['scan', '--config', advice ? 'p/default' : '.semgrep/', '--metrics', 'off', '--quiet', ...(advice ? [] : ['--error']), ...targets];

const probe = spawnSync('semgrep', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  if (process.env.CI) { console.error('security: semgrep is not installed'); process.exit(1); }
  console.log('security: semgrep is not installed here, skipped (CI runs it). Install: https://semgrep.dev/docs/getting-started/');
  process.exit(0);
}
const run = spawnSync('semgrep', args, { stdio: 'inherit' });
process.exit(advice ? 0 : (run.status ?? 1));
