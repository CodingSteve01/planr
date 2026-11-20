#!/usr/bin/env node
// Keeps private words out of a public repository.
//
// The words themselves cannot live here. They are read from a file outside
// the repository: one term per line, matched without regard to case; a line
// starting with `re:` is a regular expression; `#` starts a comment.
//
//   PLANR_PRIVATE_TERMS=<file>   default: ~/.config/planr/private-terms.txt
//
//   node scripts/check-private.mjs            every tracked file
//   node scripts/check-private.mjs --staged   what is about to be committed
//   node scripts/check-private.mjs --message <file>   a commit message
//
// Exit 0 when the list is missing (nothing to check against) or nothing is
// found, 1 on a find. A find names the file and line, never the term in full.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const termsFile = () => process.env.PLANR_PRIVATE_TERMS || join(homedir(), '.config', 'planr', 'private-terms.txt');

export function loadTerms(file = termsFile()) {
  if (!existsSync(file)) return null;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => (l.startsWith('re:') ? new RegExp(l.slice(3), 'i') : new RegExp(`(?<![\\p{L}\\p{N}])${esc(l)}(?![\\p{L}\\p{N}])`, 'iu')));
}

// Where the author's own name is the point: the licence and the plugin manifest.
const EXEMPT = new Set(['LICENSE', 'manifest.json', 'package-lock.json']);
const mask = s => (s.length <= 2 ? '**' : s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]);

export function findIn(text, terms, where) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const re of terms) {
      const m = re.exec(line);
      if (m) { out.push(`${where}:${i + 1}  ${mask(m[0])}`); break; }
    }
  });
  return out;
}

export function scanTracked(terms, staged = false) {
  const list = execFileSync('git', staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR'] : ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const finds = [];
  for (const file of list) {
    if (EXEMPT.has(file) || /\.(png|jpe?g|gif|ico|woff2?|ttf|pdf)$/i.test(file) || /pdfFonts\.js$/.test(file)) continue;
    let text;
    try { text = staged ? execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : readFileSync(file, 'utf8'); } catch { continue; }
    finds.push(...findIn(text, terms, file));
  }
  return finds;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const terms = loadTerms();
  if (!terms) { console.log(`check-private: no list at ${termsFile()}, nothing checked`); process.exit(0); }
  const at = process.argv.indexOf('--message');
  const finds = at > 0 ? findIn(readFileSync(process.argv[at + 1], 'utf8'), terms, 'commit message') : scanTracked(terms, process.argv.includes('--staged'));
  if (!finds.length) process.exit(0);
  console.error(`check-private: ${finds.length} private term(s) found. Replace them with invented examples.\n` + finds.slice(0, 40).join('\n'));
  process.exit(1);
}
