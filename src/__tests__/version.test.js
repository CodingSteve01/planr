// The version lives in three files, and the one that matters is the one
// Obsidian reads. A release whose tag does not match manifest.json is not
// installable, and a versions.json without an entry for it leaves Obsidian
// guessing which app versions the plugin supports — so the release workflow
// refuses to publish when they have drifted apart, and this refuses to merge.
import { describe, expect, it } from 'vitest';
import { nextVersion, readVersions, versionProblems } from '../../scripts/version.mjs';

describe('the version files', () => {
  it('agree with each other', async () => {
    expect(versionProblems(await readVersions())).toEqual([]);
  });

  it('name the disagreement rather than just failing', () => {
    expect(versionProblems({ pkg: '1.1.0', manifest: '1.0.0', minAppVersion: '1.5.0', versionsEntry: '1.5.0' }))
      .toEqual(['package.json says 1.1.0, manifest.json says 1.0.0']);
    expect(versionProblems({ pkg: '1.1.0', manifest: '1.1.0', minAppVersion: '1.5.0', versionsEntry: null }))
      .toEqual(['versions.json has no entry for 1.1.0']);
    expect(versionProblems({ pkg: '1.1.0', manifest: '1.1.0', minAppVersion: '1.8.0', versionsEntry: '1.5.0' }))
      .toEqual(['versions.json maps 1.1.0 to Obsidian 1.5.0, the manifest asks for 1.8.0']);
  });
});

// Asked: are the plugin versions incremented automatically? That would be
// ideal.
//
// They were not: `npm run version:set 1.1.0`, by hand, remembered or not. Five
// PRs of substantial change had shipped under 1.0.2, which means anybody on
// BRAT was still running the version before all of it.
//
// `nextVersion` is the rule, kept here rather than in a shell line inside a
// workflow, because "what is the next version" is a decision and decisions are
// testable. The workflow calls it; so can a human.
describe('the next version', () => {
  it('bumps the patch', () => {
    expect(nextVersion('1.0.2')).toBe('1.0.3');
    expect(nextVersion('1.0.9')).toBe('1.0.10');
  });

  it('bumps the minor when asked, and zeroes the patch', () => {
    expect(nextVersion('1.0.2', 'minor')).toBe('1.1.0');
  });

  it('bumps the major when asked, and zeroes the rest', () => {
    expect(nextVersion('1.4.7', 'major')).toBe('2.0.0');
  });

  it('refuses anything that is not a version rather than inventing one', () => {
    expect(() => nextVersion('v1.0.2')).toThrow();
    expect(() => nextVersion('1.0')).toThrow();
    expect(() => nextVersion('')).toThrow();
  });
});
