// "Abgesehen davon sind ja immer noch Teile in Englisch, Teile in deutsch, wie
//  du sehen kannst. Effort beispielsweise usw."
//
// The tree's column headers were written as literals — `<th>Effort</th>` — so
// they stayed English in a German app. Nothing catches that: they render, they
// look deliberate, and the i18n key test only checks that the keys which exist
// agree between the two languages. A missing key is invisible to it.
//
// This reads the source instead and asks a narrower question with a reliable
// answer: does any column header contain text that never passed through `t()`?
// A header is the right place to draw the line — it is always a label, never
// content, and there is no honest reason for one to be a literal.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (/\.jsx?$/.test(entry) && !full.includes('__tests__')) out.push(full);
  }
  return out;
}

describe('every label the user reads comes from i18n', () => {
  test('no column header is a hardcoded word', () => {
    // Symbols and numbers are not language: "%", "#", "Δ" read the same in
    // both, and translating them would be worse.
    const LANGUAGE_FREE = /^[\s%#Δ·→←↑↓✓✗…|/\-+0-9]*$/;
    const offenders = [];

    for (const file of sourceFiles(path.join(root, 'components'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)) {
        const text = m[1].trim();
        if (!text || LANGUAGE_FREE.test(text)) continue;
        if (text.includes('{')) continue;   // an expression, e.g. {t('…')}
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(root, file)}:${line}  <th>${text}</th>`);
      }
    }

    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });
});
