// @ts-check
import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

const BASE_URL = 'https://www.trekbikes.com/us/en_US/';

test.describe('Trek Bikes - Homepage (~20% of visible/interactive elements)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // Dismiss cookie/consent banner if present
    const consentBtn = page.locator('#CybotCookiebotDialogBodyButtonAccept, button:has-text("Allow all"), button:has-text("Accept")').first();
    if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentBtn.click();
    }
  });

  // --- Header / Logo ---
  test('Trek logo is visible and links to homepage', async ({ page }) => {
    const logo = page.locator('a[aria-label="Trek Bikes home page"]').first();
    await expect(logo).toBeVisible();
    const href = await logo.getAttribute('href');
    expect(href).toContain('trekbikes.com');
  });

  test('Electra brand link navigates to Electra site', async ({ page }) => {
    const electra = page.locator('a[aria-label="Shop Electra"]');
    const href = await electra.getAttribute('href');
    expect(href).toContain('electra');
  });

});
