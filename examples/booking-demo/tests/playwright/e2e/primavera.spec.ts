import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

test('go to Primavera Century from top menu and return home', async ({ page }) => {
  await page.goto('https://ffbc.org/');

  const topMenuPrimaveraLink = page
    .getByLabel('Main')
    .getByRole('link', { name: 'Primavera Century', exact: true });

  await expect(topMenuPrimaveraLink).toBeVisible();
  await topMenuPrimaveraLink.click();

  await expect(page).toHaveURL(/\/primavera\/$/);

  await page.goBack();

  await expect(page).toHaveURL(/^https:\/\/ffbc\.org\/?$/);
});