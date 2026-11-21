import { test, expect, shoot } from './fixtures.js';
import { NAMES } from './seed.js';
import { openTab, treeRow } from './helpers.js';

test('a scenario compares against the plan and leaving it brings the plan back', async ({ page }) => {
  await page.goto('http://planr.test/planr/');
  await expect(treeRow(page, NAMES.invoices)).toBeVisible();
  await expect(page.getByTestId('scenario-bar')).toHaveCount(0);

  // Create the scenario from the top-bar switch.
  await page.getByTestId('scenario-switch').click();
  // With no scenario yet the name field is open at once.
  await page.getByTestId('scenario-new-input').fill('Less backend time');
  await page.getByTestId('scenario-new-input').press('Enter');
  await expect(page.getByTestId('scenario-bar-name')).toHaveText('Less backend time');
  await expect(page.getByTestId('scenario-bar-summary')).toContainText('no changes yet');

  // Cut Ben Ortiz to 20 % capacity in Resources.
  await openTab(page, 'Resources');
  await page.getByTestId('rv-section-members').click();
  await page.locator('tr', { hasText: 'Ben Ortiz' }).locator('.res-row-name').click();
  const member = page.getByTestId('member-modal');
  const cap = member.locator('.rf input[type="number"]');
  await cap.fill('20');
  await cap.blur();
  await expect(member).toContainText('20%');
  await member.locator('.modal-footer').getByRole('button', { name: 'Close' }).click();
  await expect(member).toHaveCount(0);
  await expect(page.getByTestId('scenario-bar-summary')).toContainText('1 change');

  // The comparison names at least one project or team that moves.
  await page.getByTestId('scenario-compare').click();
  const compare = page.locator('[data-testid^="scn-project-"], [data-testid^="scn-team-"]');
  await expect(compare.first()).toBeVisible();
  await shoot(page, 'scenario-comparison');
  await page.keyboard.press('Escape');

  // Leave: the plan is as before, Ben is back at 100 %.
  await page.getByTestId('scenario-leave').click();
  await expect(page.getByTestId('scenario-bar')).toHaveCount(0);
  await openTab(page, 'Resources');
  await expect(page.locator('tr', { hasText: 'Ben Ortiz' })).toContainText('100%');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('planr_v2')).members.find(m => m.id === 'M2').cap);
  expect(saved).toBe(1);
});
