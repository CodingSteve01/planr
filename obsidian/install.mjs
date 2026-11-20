// Build the plugin straight into a vault, for trying it without a release.
//
//   npm run obsidian:install -- "/path/to/Vault"
//   npm run obsidian:install -- "/path/to/Vault" --dev   (unminified + sourcemap)
//
// The vault path is remembered in obsidian/.vault-path (git-ignored), so
// later runs are just `npm run obsidian:install`. Obsidian picks the new
// build up after "Reload app without saving" or toggling the plugin off/on.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const memo = path.join(here, '.vault-path');

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('--'));
const given = argv.find(a => !a.startsWith('--'));
const vault = given ?? (existsSync(memo) ? readFileSync(memo, 'utf8').trim() : null);

if (!vault) {
  console.error('Usage: npm run obsidian:install -- "/path/to/Vault"');
  process.exit(1);
}
if (!existsSync(path.join(vault, '.obsidian'))) {
  console.error(`Not an Obsidian vault (no .obsidian folder): ${vault}`);
  process.exit(1);
}

const target = path.join(vault, '.obsidian', 'plugins', 'planr');
const build = spawnSync(
  process.execPath,
  [path.join(here, 'esbuild.config.mjs'), '--out', target, ...flags],
  { stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);

writeFileSync(memo, `${vault}\n`);
console.log('Enable it under Settings → Community plugins → Installed plugins.');
