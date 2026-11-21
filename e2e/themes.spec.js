import { test, expect } from './fixtures.js';
import { NAMES } from './seed.js';
import { openItemDialog, treeRow } from './helpers.js';

// Reads the colours the browser computed and returns the lowest contrast
// ratio among the given elements, with the offender's text. Transparent
// backgrounds are composited over their ancestors; any CSS colour syntax
// works because a canvas does the parsing.
function lowestContrast(scope, selector) {
  return scope.evaluate((root, sel) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgba = css => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top, bottom) => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map(i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
    };
    const backdrop = el => {
      let acc = [0, 0, 0, 0];
      for (let n = el; n && acc[3] < 1; n = n.parentElement) acc = over(acc, rgba(getComputedStyle(n).backgroundColor));
      return over(acc, [255, 255, 255, 1]);
    };
    const lum = ([r, g, b]) => {
      const f = v => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let worst = { ratio: Infinity, what: '' };
    for (const el of root.querySelectorAll(sel)) {
      if (!el.getClientRects().length || el.disabled) continue;
      const bg = backdrop(el);
      const fg = over(rgba(getComputedStyle(el).color), bg);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < worst.ratio) worst = { ratio, what: `${el.tagName} "${(el.value || el.textContent || '').trim().slice(0, 30)}"` };
    }
    return worst;
  }, selector);
}

for (const theme of ['dark', 'light']) {
  test.describe(`${theme} theme`, () => {
    test.use({ seed: { prefs: { planr_theme: theme } } });

    test('the tree and the item dialog are readable', async ({ page }) => {
      await page.goto('http://planr.test/planr/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(treeRow(page, NAMES.invoices)).toBeVisible();
      const tree = await lowestContrast(page.locator('.main'), '[data-testid="tree-row-name"]');
      expect(tree.what, 'no tree row was measured').not.toBe('');
      expect(tree.ratio, `tree row ${tree.what}`).toBeGreaterThanOrEqual(3);

      const dialog = await openItemDialog(page, NAMES.login);
      const controls = await lowestContrast(dialog, 'input, textarea, select, button, [role="tab"]');
      expect(controls.what, 'no dialog control was measured').not.toBe('');
      expect(controls.ratio, `dialog control ${controls.what}`).toBeGreaterThanOrEqual(3);
    });
  });
}
