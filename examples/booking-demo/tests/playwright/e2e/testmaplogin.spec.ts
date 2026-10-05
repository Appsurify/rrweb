import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

test('opens forgot password, returns to login, logs in, and clicks Test 32', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto('https://derek.dev.testmap.cloud/auth');

  await page.locator('a[href="/forgot-password"]', { hasText: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  await page.locator('a[href="/auth"]', { hasText: 'Back to Log in' }).click();
  await expect(page).toHaveURL(/\/auth$/);

  await page.locator('input[type="email"], input[name="email"]').first().fill('derek@appsurify.com');
  await page.locator('input[type="password"], input[name="password"]').first().fill('test1234');

  await page.getByRole('button', { name: 'Log In', exact: true }).click();

  // Wait for login to complete: successful login redirects to /project/<uuid>
  // and renders the projects dashboard.
  await expect(page).toHaveURL(
    /\/project\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    { timeout: 15000 }
  );
  await expect(page.getByRole('heading', { name: /All Projects/ })).toBeVisible({ timeout: 15000 });

  // The heading renders before the projects/testruns requests resolve. No
  // explicit wait for the data here: the plugin's settleBeforeStop waits for
  // network + DOM quiet and takes a final FullSnapshot of the loaded page.

  // await page.getByRole('link', { name: 'Test 32', exact: true }).click();
});
