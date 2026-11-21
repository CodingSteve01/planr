import { test, expect } from './fixtures.js';
import { openTab } from './helpers.js';

const bars = page => page.locator('.gbar[data-task-bar]');
// Position inside the timeline, so scrolling does not matter.
const left = bar => bar.evaluate(el => parseFloat(el.style.left));

test('the schedule has one bar per task, a drag pins a task, undo takes the pin back', async ({ page }) => {
  await page.goto('http://planr.test/planr/');
  await openTab(page, 'Schedule');

  // One bar per scheduled task: the seed has eleven tasks and two goals (goals draw no task bar).
  const taskCount = await page.evaluate(
    () => JSON.parse(localStorage.getItem('planr_v2')).tree.filter(n => /\./.test(n.id) && n.best != null).length,
  );
  expect(taskCount).toBe(11);
  await expect(bars(page)).toHaveCount(taskCount);

  await page.getByRole('button', { name: 'Day', exact: true }).click();
  const bar = page.locator('.gbar[data-task-bar="P2.2"]');
  await expect(bar).toContainText('Profilseite');
  await expect(bar).not.toContainText('▸');
  const before = await left(bar);

  // Drag two days (two day columns) to the right.
  const box = await bar.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + 20;
  const dayPx = 14;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dayPx, y, { steps: 4 });
  await page.mouse.move(x + 2 * dayPx, y, { steps: 4 });
  await page.mouse.up();

  // The bar is pinned to the new start: a pin badge shows and the bar sits further right.
  await expect(bar).toContainText('▸');
  expect(await left(bar)).toBeGreaterThan(before);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('planr_v2')).tree.find(n => n.id === 'P2.2').pinnedStart))
    .toBeTruthy();

  // Undo brings it back.
  await page.getByTestId('undo-btn').click();
  await expect(bar).not.toContainText('▸');
  await expect.poll(() => left(bar)).toBe(before);
  await expect(bar).toContainText('Profilseite');
});
