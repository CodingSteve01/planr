#!/usr/bin/env node
// Runs semgrep with the repository's own rules (semgrep/planr.yml), with the
// registry's default rules as advice (--advice), or checks the rules against
// their fixtures (--selftest).
//
// semgrep is not an npm package. Where it is not installed the check is
// skipped with a line saying so, except on CI, where a skipped security
// check is a failed one.
import { spawnSync } from 'node:child_process';

const advice = process.argv.includes('--advice');
// --selftest: do the rules still find what they are for? (the files beside the rules)
const selftest = process.argv.includes('--selftest');
const targets = ['src', 'obsidian', 'scripts', 'tools', '.github'];
const args = selftest
  ? ['--test', 'semgrep/']
  : [
      'scan',
      '--config',
      advice ? 'p/default' : 'semgrep/planr.yml',
      '--metrics',
      'off',
      '--quiet',
      ...(advice ? [] : ['--error']),
      ...targets,
    ];

const probe = spawnSync('semgrep', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  if (process.env.CI) {
    console.error('security: semgrep is not installed');
    process.exit(1);
  }
  console.log('security: semgrep is not installed here, skipped (CI runs it). Install: https://semgrep.dev/docs/getting-started/');
  process.exit(0);
}
if (selftest) {
  // semgrep exits 0 when it finds no fixtures at all; that is not a pass.
  const run = spawnSync('semgrep', args, { encoding: 'utf8' });
  const out = `${run.stdout || ''}${run.stderr || ''}`;
  process.stdout.write(out);
  process.exit(run.status === 0 && /All tests passed/.test(out) ? 0 : 1);
}
const run = spawnSync('semgrep', args, { stdio: 'inherit' });
process.exit(advice ? 0 : (run.status ?? 1));
