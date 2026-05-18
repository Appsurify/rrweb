import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

test.describe('Navigation Snapshot Validation', () => {
  test('produces snapshots across multiple SPA navigations', async ({ page }) => {
    // 1. Visit landing page
    await page.goto('https://appsurify.github.io/modern-seaside-stay/');
    await expect(page.getByText(/MareSereno|seaside/i).first()).toBeVisible();

    // 2. Navigate to Apartments via navbar
    await page.locator('nav').getByRole('link', { name: /apartments/i }).click();
    await expect(page).toHaveURL(/\/apartments/);
    await expect(page.getByText(/our apartments|browse/i).first()).toBeVisible();

    // 3. Navigate to Amenities via navbar
    await page.locator('nav').getByRole('link', { name: /amenities/i }).click();
    await expect(page).toHaveURL(/\/amenities/);
    await expect(page.getByText(/amenities/i).first()).toBeVisible();

    // 4. Navigate to Gallery via navbar
    await page.locator('nav').getByRole('link', { name: /gallery/i }).click();
    await expect(page).toHaveURL(/\/gallery/);
    await expect(page.getByText(/gallery/i).first()).toBeVisible();

    // 5. Navigate to Contact via navbar
    await page.locator('nav').getByRole('link', { name: /contact/i }).click();
    await expect(page).toHaveURL(/\/contact/);
    await expect(page.getByText(/contact/i).first()).toBeVisible();

    // 6. Navigate back to Home via navbar
    await page.locator('nav').getByRole('link', { name: /home/i }).click();
    await expect(page).toHaveURL(/\/modern-seaside-stay\/?$/);
    await expect(page.getByText(/MareSereno|seaside/i).first()).toBeVisible();
  });
});
