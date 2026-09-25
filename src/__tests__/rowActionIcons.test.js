// Reported: the hover square of the row buttons (⤢ ✎ + ↳) sits beside the
// icon instead of around it. Icon renders a display:block SVG, and a block
// inside a plain button keeps to the left edge while the 22px square runs on
// to the right. The button has to centre its icon itself. happy-dom lays
// nothing out, so the rule is what can be held.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(process.cwd(), 'src/App.css'), 'utf8');
const rule = selector => (css.match(new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\{([^}]*)\\}`)) || [])[2] || '';

describe('row action buttons', () => {
  it('centre their icon in the hover square', () => {
    const btn = rule('.tv-act-btn');
    expect(btn).toMatch(/display:inline-flex/);
    expect(btn).toMatch(/align-items:center/);
    expect(btn).toMatch(/justify-content:center/);
    expect(btn).toMatch(/padding:0/);
  });
});
