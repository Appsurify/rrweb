import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

test.describe('Modern Seaside Stay — smoke', () => {
  test('home page loads and renders hero', async ({ page }) => {
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    await expect(page).toHaveTitle(/Seaside|Modern/i);
    await page.waitForLoadState('domcontentloaded');
  });

  test('contact link is reachable', async ({ page }) => {
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    const contactLink = page.getByRole('link', { name: /contact/i }).first();
    await expect(contactLink).toBeVisible();
    await contactLink.click();
    await page.waitForLoadState('domcontentloaded');
  });
});
