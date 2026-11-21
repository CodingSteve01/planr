// Changing a task's status in the item dialog and in the side panel.
import { test, expect, APP_URL } from './fixtures.js';
import { openItemDialog, setProgress, treeRow, today } from './helpers.js';

test.describe('item dialog and side panel', () => {
  test('a status change shows in the tree row and in the history', async ({ page }) => {
    await page.goto(APP_URL);
    const row = treeRow(page, 'Steuerlogik');
    await expect(row).toBeVisible();
    await expect(row).not.toContainText('55%');

    let dialog = await openItemDialog(page, 'Steuerlogik');
    await setProgress(dialog, 55);
    await dialog.getByTestId('nm-save').click();
    await expect(page.getByTestId('node-modal')).toBeHidden();
    await expect(row).toContainText('55%');

    dialog = await openItemDialog(page, 'Steuerlogik');
    await expect(dialog.getByTestId('item-history-row')).not.toHaveCount(0);
    await expect(dialog.getByTestId('item-history-row').first()).toContainText('55');
  });

  test('a change counted from three days ago carries that date in the history', async ({ page }) => {
    await page.goto(APP_URL);
    const dialog = await openItemDialog(page, 'Profilseite');
    await setProgress(dialog, 35);
    const since = today(-3);
    await dialog.getByTestId('nm-as-of').fill(since);
    await expect(dialog.getByTestId('nm-as-of-note')).toBeVisible();
    await dialog.getByTestId('nm-save').click();
    await expect(page.getByTestId('node-modal')).toBeHidden();

    const again = await openItemDialog(page, 'Profilseite');
    const entry = again.getByTestId('item-history-row').first();
    await expect(entry).toContainText('35');
    // The day column reads dd/mm/yyyy.
    const [y, m, d] = since.split('-');
    await expect(entry.getByTestId('item-history-day')).toHaveText(`${d}/${m}/${y}`);
  });
});

test.describe('with the editor docked to the side', () => {
  test.use({ seed: { prefs: { planr_editor_dock: 'side' } } });

  test('the panel has the same five tabs, in the same order, as the dialog', async ({ page }) => {
    await page.goto(APP_URL);
    await treeRow(page, 'PDF-Export').click();
    const panel = page.locator('[role="tablist"]:not(.tab-bar)', { has: page.getByRole('tab', { name: 'Status' }) });
    await expect(panel).toBeVisible();
    const inPanel = await panel.getByRole('tab').allTextContents();
    expect(inPanel).toHaveLength(5);

    // The panel's own button moves the editor into a dialog and opens the same item there.
    await page.getByTestId('editor-dock-dialog').click();
    const dialog = page.getByTestId('node-modal');
    await expect(dialog).toBeVisible();
    expect(await dialog.getByRole('tab').allTextContents()).toEqual(inPanel);
  });
});
