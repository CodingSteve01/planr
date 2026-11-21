// Small steps the specs share. Everything goes through what a user sees:
// roles, labels and the few stable test ids the app already has.
import { expect } from './fixtures.js';

export const main = page => page.locator('.main');

export async function openTab(page, label) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
}

// The tree row of a task, by its visible name.
export const treeRow = (page, name) => page.locator('tr', { has: page.getByTestId('tree-row-name').filter({ hasText: name }) });

// Select a task in the tree and open the item dialog (it opens on Status).
export async function openItemDialog(page, name) {
  await treeRow(page, name).click();
  await page.getByTestId('tv-edit-selected').click();
  const dialog = page.getByTestId('node-modal');
  await expect(dialog).toBeVisible();
  return dialog;
}

// Move the progress slider of the dialog or panel to `value` (steps of 5).
export async function setProgress(scope, value) {
  const slider = scope.getByRole('slider');
  await slider.focus();
  await slider.fill(String(value));
}

export const today = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
