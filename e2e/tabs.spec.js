import { test, expect, shoot } from './fixtures.js';
import { openTab } from './helpers.js';

// One stable surface per tab: a test id where the app has one, otherwise
// something the user reads on that screen.
const SURFACES = {
  Overview: page => page.getByTestId('overview-progress'),
  'Work Tree': page => page.getByTestId('tree-editor-surface'),
  'Work order': page => page.getByTestId('wo-edit-P1.2'),
  Schedule: page => page.getByTestId('gantt-timeline'),
  Roadmap: page => page.getByTestId('roadmap-pane'),
  Briefing: page => page.getByTestId('bv-status-P1.2').first(),
  Planning: page => page.getByText('Team capacity').filter({ visible: true }).first(),
  Network: page => page.getByText('Mahnwesen').filter({ visible: true }).first(),
  Resources: page => page.getByTestId('rv-section-members'),
  Holidays: page => page.getByText('Add manually').filter({ visible: true }).first(),
  Report: page => page.getByRole('heading', { name: 'Report' }),
};

test('every tab opens and shows its main surface', async ({ page }) => {
  await page.goto('http://planr.test/planr/');
  const labels = (await page.getByRole('tab').allTextContents()).map(l => l.trim());
  // A new tab without a surface here must fail this test, not slip through.
  expect(labels).toEqual(Object.keys(SURFACES));
  // Fonts load lazily, on first use; ask for it, then check that it arrived from the built files.
  await page.evaluate(() => document.fonts.load("16px 'Instrument Serif'"));
  expect(await page.evaluate(() => document.fonts.check("16px 'Instrument Serif'"))).toBe(true);

  for (const label of labels) {
    await openTab(page, label);
    await expect(SURFACES[label](page), label).toBeVisible();
    await expect(page.locator('.topbar')).toBeVisible();
    await shoot(page, `tab-${label.toLowerCase().replace(/\s+/g, '-')}`);
  }
});
