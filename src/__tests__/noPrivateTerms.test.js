// A public repository: examples are invented. Where the owner's private word
// list exists (outside the repository), no tracked file may contain a word
// from it. Without the list, on CI and for contributors, there is nothing to
// check against and the test says so by being skipped.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { loadTerms, scanTracked, termsFile, findIn } from '../../scripts/check-private.mjs';

describe('private terms', () => {
  it.skipIf(!existsSync(termsFile()))('no tracked file contains a word from the private list', () => {
    expect(scanTracked(loadTerms())).toEqual([]);
  });

  it('finds whole words without regard to case, and never prints them in full', () => {
    const terms = [/(?<![\p{L}\p{N}])Example Corp(?![\p{L}\p{N}])/iu, /TICKET-\d+/i];
    expect(findIn('fine\nat example corp today\nexamplecorporation\nsee ticket-12', terms, 'x.js')).toEqual([
      'x.js:2  e**********p',
      'x.js:4  t*******2',
    ]);
  });
});
