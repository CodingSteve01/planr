import { test, expect } from './fixtures.js';
import { NAMES } from './seed.js';
import { openTab, treeRow } from './helpers.js';

// The app sits in a narrow side pane (for example next to an editor).
test.use({ viewport: { width: 700, height: 800 } });

test('at 700 px the page does not scroll sideways and the top-bar switches work', async ({ page }) => {
  await page.goto('http://planr.test/planr/');
  await expect(treeRow(page, NAMES.invoices)).toBeVisible();

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow(), 'tree').toBeLessThanOrEqual(0);
  for (const tab of ['Overview', 'Schedule', 'Resources']) {
    await openTab(page, tab);
    expect(await overflow(), tab).toBeLessThanOrEqual(0);
  }
  await openTab(page, 'Work Tree');

  // Both switches are on screen and open their menus.
  await page.getByTestId('scenario-switch').click();
  await expect(page.getByTestId('scenario-new-input')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('effective-switch').click();
  await expect(page.getByTestId('effective-menu')).toBeVisible();
  expect(await overflow(), 'menus open').toBeLessThanOrEqual(0);
});

test('at 700 px the save status is shown whole or not at all', async ({ page }) => {
  await page.goto('http://planr.test/planr/');
  await expect(treeRow(page, NAMES.invoices)).toBeVisible();
  const status = page.locator('.topbar-status');
  if (await status.isVisible()) {
    const inner = await status.boundingBox();
    const outer = await page.locator('.topbar-file').boundingBox();
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  } else {
    await expect(status).toBeHidden();
  }
});
