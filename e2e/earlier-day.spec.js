import { test, expect } from './fixtures.js';
import { NAMES, seedPlan, iso } from './seed.js';
import { treeRow } from './helpers.js';

test.use({ seed: { plan: seedPlan({ withDayLog: true }) } });

test('an earlier day shows the plan as it stood, says so, and today shows the new name again', async ({ page }) => {
  await page.goto('http://planr.test/planr/');
  await expect(treeRow(page, NAMES.login)).toBeVisible();
  await expect(page.getByTestId('effective-bar')).toHaveCount(0);

  await page.getByTestId('effective-switch').click();
  await page.getByTestId('effective-date-input').fill(iso(-5));
  await page.getByTestId('effective-date-ok').click();

  const bar = page.getByTestId('effective-bar');
  await expect(bar).toHaveAttribute('data-travel', 'true');
  await expect(bar).toContainText('Earlier day');
  await expect(treeRow(page, 'Login-Entwurf')).toBeVisible();
  await expect(treeRow(page, NAMES.login)).toHaveCount(0);

  // Looking is not editing: the stored plan still carries the new name.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('planr_v2')).tree.find(n => n.id === 'P2.1').name);
  expect(stored).toBe(NAMES.login);

  await page.getByTestId('effective-leave').click();
  await expect(bar).toHaveCount(0);
  await expect(treeRow(page, NAMES.login)).toBeVisible();
  await expect(treeRow(page, 'Login-Entwurf')).toHaveCount(0);
});
