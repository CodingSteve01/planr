// The local guardrails: what runs before a commit and before a push. They are
// only as good as what they call, so this holds them to the scripts that
// exist.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { HOOKS, hookText } from '../../scripts/install-hooks.mjs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('the guardrails', () => {
  it('installs a hook for the commit, its message and the push', () => {
    expect(Object.keys(HOOKS).sort()).toEqual(['commit-msg', 'pre-commit', 'pre-push']);
    expect(hookText(HOOKS['pre-push'])).toMatch(/^#!\/bin\/sh\n# planr: installed by/);
    expect(HOOKS['pre-commit']).toContain('eslint');
    expect(HOOKS['pre-commit']).toContain('check-private.mjs --staged');
    expect(HOOKS['commit-msg']).toContain('check-private.mjs --message');
  });

  it('is installed by npm install', () => {
    expect(pkg.scripts.prepare).toContain('install-hooks.mjs');
  });

  it('every step of `npm run quality` is a script that exists, and CI runs each of them', () => {
    const steps = pkg.scripts.quality.split('&&').map(s => s.trim().replace(/^npm run /, ''));
    expect(steps).toEqual(['lint', 'dup', 'deadcode', 'version:check', 'security', 'private']);
    for (const step of steps) expect(pkg.scripts[step], step).toBeTruthy();
    // The private word list is the owner's and is not on the CI machine.
    // As a step of its own, not as part of another command or a comment.
    const runs = [...ci.matchAll(/^\s*-?\s*run:\s*(.+)$/gm)].map(m => m[1].trim());
    for (const step of steps.filter(s => s !== 'private')) expect(runs, step).toContain(`npm run ${step}`);
    expect(runs).toContain('npm run test:coverage');
  });

  it('no workflow uses an action by a tag that can be moved', () => {
    const dir = new URL('../../.github/workflows/', import.meta.url);
    const names = readdirSync(dir).filter(n => /\.ya?ml$/.test(n));
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const name of names) {
      const text = readFileSync(new URL(name, dir), 'utf8');
      for (const m of text.matchAll(/uses:\s*(\S+)/g)) expect(m[1], `${name}: ${m[1]}`).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it('the security rules are the repository\'s own, and each promise has one', () => {
    const rules = readFileSync(new URL('../../.semgrep/planr.yml', import.meta.url), 'utf8');
    const ids = [...rules.matchAll(/^\s*- id: (\S+)$/gm)].map(m => m[1]);
    expect(ids).toEqual(['planr-no-eval', 'planr-no-raw-html', 'planr-no-remote-code', 'planr-no-network-calls', 'planr-workflow-no-expression-in-run', 'planr-workflow-pinned-actions']);
    expect(rules.match(/severity: ERROR/g)).toHaveLength(ids.length);
    // What blocks is what is in the repository; the registry's rules advise.
    const security = readFileSync(new URL('../../scripts/security.mjs', import.meta.url), 'utf8');
    expect(security).toContain("advice ? 'p/default' : '.semgrep/'");
  });
});
