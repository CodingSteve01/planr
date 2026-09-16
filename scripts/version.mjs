// The version lives in three files that have to agree, or the release is
// refused: package.json (the app), manifest.json (what Obsidian installs) and
// versions.json (which plugin version needs which Obsidian version).
//
//   node scripts/version.mjs 1.1.0       set all three
//   node scripts/version.mjs --check     fail if they have drifted apart
//
// Bumping is the whole release ritual: push the bump to main and the workflow
// tags it, builds it and publishes the three files Obsidian downloads.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = name => path.join(repo, name);

const readJson = async name => JSON.parse(await readFile(file(name), 'utf8'));
const writeJson = async (name, data) => writeFile(file(name), `${JSON.stringify(data, null, 2)}\n`);

/** What the three files currently say. */
export async function readVersions() {
  const [pkg, manifest, versions] = await Promise.all([
    readJson('package.json'), readJson('manifest.json'), readJson('versions.json'),
  ]);
  return {
    pkg: pkg.version,
    manifest: manifest.version,
    minAppVersion: manifest.minAppVersion,
    versionsEntry: versions[manifest.version] ?? null,
  };
}

/** Every disagreement, in words a release log can print. */
export function versionProblems({ pkg, manifest, minAppVersion, versionsEntry }) {
  const problems = [];
  if (pkg !== manifest) {
    problems.push(`package.json says ${pkg}, manifest.json says ${manifest}`);
  }
  if (versionsEntry === null) {
    problems.push(`versions.json has no entry for ${manifest}`);
  } else if (versionsEntry !== minAppVersion) {
    problems.push(`versions.json maps ${manifest} to Obsidian ${versionsEntry}, the manifest asks for ${minAppVersion}`);
  }
  return problems;
}

async function setVersion(next) {
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    throw new Error(`Not a version: ${next} — Obsidian wants x.y.z, with no leading "v".`);
  }
  const pkg = await readJson('package.json');
  const manifest = await readJson('manifest.json');
  const versions = await readJson('versions.json');

  pkg.version = next;
  manifest.version = next;
  versions[next] = manifest.minAppVersion;

  await writeJson('package.json', pkg);
  await writeJson('manifest.json', manifest);
  await writeJson('versions.json', versions);

  try {
    const lock = await readJson('package-lock.json');
    lock.version = next;
    if (lock.packages?.['']) lock.packages[''].version = next;
    await writeJson('package-lock.json', lock);
  } catch { /* no lockfile checked in, or not ours to touch */ }

  console.log(`${next} — commit this, and the release follows the push to main.`);
}

// Only when run as a script; the checks above are imported by the tests.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = process.argv[2];
  if (arg === '--check') {
    const problems = versionProblems(await readVersions());
    if (problems.length) {
      console.error(`The version files disagree:\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
    console.log('package.json, manifest.json and versions.json agree.');
  } else if (arg) {
    await setVersion(arg);
  } else {
    console.error('Usage: node scripts/version.mjs <x.y.z> | --check');
    process.exit(1);
  }
}
