// Source comments are in English. All of them.
//
// This codebase has one German-speaking user, and a session's worth of their
// feedback ended up quoted verbatim in test headers — it read well, and it was
// the wrong call: a comment is for whoever opens the file next, and half of
// them being in a language they may not read makes the file worse, not warmer.
// Quoting what somebody reported is still right; it goes in English now.
//
// Comment lines only — the German in `i18n.jsx`, in fixtures and in assertions
// is data the app actually shows, and translating that would be a bug.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Words that carry almost no risk of appearing in an English comment. "die"
// and "man" are deliberately absent — they are English words too, and a guard
// that cries wolf gets switched off.
const GERMAN = /\b(ich|nicht|kann|dass|und|oder|werden|wenn|aber|sind|eine|einen|einem|nur|noch|schon|auch|gibt|wäre|müsste|können|sieht|für|von|mit|über|beim|dann|weil|damit|dieser|diese|welche|jedes|immer)\b/gi;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (/\.(js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('source comments', () => {
  test('catches a German comment when there is one', () => {
    // The guard is only worth having if it fires. Two markers in one line.
    const line = '// das kann nicht funktionieren wenn niemand es liest';
    const body = line.replace(/^[/*]+/, '').trim();
    expect((body.match(GERMAN) || []).length).toBeGreaterThanOrEqual(2);
  });

  test('leaves an English line with one borrowed word alone', () => {
    const body = 'the markdown tag is *Benötigt:* and it still parses';
    expect((body.match(GERMAN) || []).length).toBeLessThan(2);
  });

  test('are in English', () => {
    const offenders = [];
    for (const dir of ['src', 'obsidian', 'scripts']) {
      for (const file of sourceFiles(path.join(repo, dir))) {
        if (file.endsWith('i18n.jsx')) continue;   // translations are data
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) return;
          const body = trimmed.replace(/^[/*]+/, '').trim();
          if (body.length < 14) return;
          // Two markers, so a single borrowed word (a field name, a quoted UI
          // label) is not enough to fail.
          if ((body.match(GERMAN) || []).length < 2) return;
          offenders.push(`${path.relative(repo, file)}:${i + 1}  ${body.slice(0, 80)}`);
        });
      }
    }
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });
});
