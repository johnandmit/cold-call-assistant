import { test, expect } from '@playwright/test';

test('test csv duplicates', async ({ page }) => {
  await page.goto('http://localhost:8080/cold-call-assistant/csv');
  
  // clear storage just in case
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('text=Drop CSV files here');
  const fileChooser = await fileChooserPromise;
  
  // Upload first CSV (Alice, Bob, Charlie with notes)
  await fileChooser.setFiles('test_csv_1.csv');
  
  // Confirm mapping
  await page.click('button:has-text("Confirm Mapping & Import")');
  await expect(page.locator('text=Imported/Merged successfully')).toBeVisible();

  // Upload second CSV (Alice with notes, Bob no notes, Charlie new notes)
  const fileChooserPromise2 = page.waitForEvent('filechooser');
  await page.click('text=Drop CSV files here');
  const fileChooser2 = await fileChooserPromise2;
  await fileChooser2.setFiles('test_csv_2.csv');
  
  // Confirm mapping
  await page.click('button:has-text("Confirm Mapping & Import")');

  // We expect Charlie to be a conflict since both test_csv_1 and test_csv_2 have notes for Charlie
  // Alice had no notes in CSV 1, and DOES have notes in CSV 2, so it should auto merge to CSV 2's Alice
  // Bob had no notes in CSV 1, and no notes in CSV 2, so it should auto merge to CSV 1's Bob
  
  await expect(page.locator('text=Duplicate Conflict Resolution')).toBeVisible();
  
  // The word Charlie should appear
  await expect(page.locator('text=Charlie').first()).toBeVisible();
  // Bob and Alice should not appear because they are auto-resolved
  await expect(page.locator('text=Alice')).not.toBeVisible();
  await expect(page.locator('text=Bob')).not.toBeVisible();

  // Keep one version
  await page.click('button:has-text("Keep This Version") >> nth=0');

  await expect(page.locator('text=Imported/Merged successfully')).toBeVisible();
});
