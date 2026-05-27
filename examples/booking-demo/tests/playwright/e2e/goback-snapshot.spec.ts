import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

/**
 * Repro for the "last page lost on goBack" issue.
 *
 * Flow:
 *   1. Land on home
 *   2. Navigate forward into a section (Apartments)
 *   3. page.goBack() → return to home
 *   4. Quick assertion that home is rendered
 *   5. Test ends
 *
 * Expected (after fix): report contains a FullSnapshot whose META href
 * points to the HOME page (the post-goBack state), AND it is the LAST
 * full snapshot in the event stream.
 *
 * Bug (before fix): the post-goBack FullSnapshot is missing — the report
 * ends with the FullSnapshot of /apartments, never capturing the return
 * to /. Caused by RRWebRecorder.stop() nulling window.stopFn without
 * actually invoking it, which skips NavigationManager.destroy() and the
 * synchronous flush of the pending settle-snapshot.
 */
test.describe('goBack snapshot capture', () => {
  test('captures the page state after page.goBack() — quick assertion', async ({ page }) => {
    // 1. Landing
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    await expect(page.getByText(/MareSereno|seaside/i).first()).toBeVisible();

    // 2. Forward navigation to Apartments
    await page.locator('nav').getByRole('link', { name: /apartments/i }).click();
    await expect(page).toHaveURL(/\/apartments/);
    await expect(page.getByText(/our apartments|browse/i).first()).toBeVisible();

    // 3. Back to home
    await page.goBack();

    // 4. Single quick URL check then END — minimal window
    await expect(page).toHaveURL(/\/modern-seaside-stay\/?$/);
  });

  test('captures the page state after page.goBack() — no assertion after', async ({ page }) => {
    // Most aggressive repro: NOTHING between goBack and test end.
    // If the recorder can survive even this, the bug is fixed.
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    await expect(page.getByText(/MareSereno|seaside/i).first()).toBeVisible();

    await page.locator('nav').getByRole('link', { name: /apartments/i }).click();
    await expect(page).toHaveURL(/\/apartments/);

    await page.goBack();
    // Test ends — no awaits between goBack and teardown.
  });

  test('captures the page state after page.goBack({waitUntil:commit})', async ({ page }) => {
    // Ultra aggressive: waitUntil:'commit' returns BEFORE DOMContentLoaded.
    // This maximally widens the race window — recorder.start() listener may
    // not have fired yet when the test function returns.
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    await expect(page.getByText(/MareSereno|seaside/i).first()).toBeVisible();

    await page.locator('nav').getByRole('link', { name: /apartments/i }).click();
    await expect(page).toHaveURL(/\/apartments/);

    await page.goBack({ waitUntil: 'commit' });
    // Test ends immediately. No awaits, no DOM-readiness checks.
  });
});
