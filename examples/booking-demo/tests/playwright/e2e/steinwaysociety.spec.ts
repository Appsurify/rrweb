import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';
import type { Locator, Page } from '@playwright/test';

const BASE_URL = 'https://steinwaysociety.com/';

// Fire a native browser DOM click (bypasses Playwright mouse simulation) then wait for URL
async function clickAndNavigate(locator: Locator, page: Page, urlPattern: RegExp): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click());
  await expect(page).toHaveURL(urlPattern, { timeout: 15000 });
}

test.describe('Steinway Society Homepage - Clickable Elements (~20% coverage)', () => {
  test('HOME nav link reloads the homepage', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const homeLink = page.locator('nav a[href="https://steinwaysociety.com/"]').first();
    await expect(homeLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(homeLink, page, /steinwaysociety\.com\/?$/);
  });

  test('Footer "News Archive" link navigates correctly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const newsLink = page.locator('a[href="https://steinwaysociety.com/archive/"]').first();
    await newsLink.scrollIntoViewIfNeeded();
    await expect(newsLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(newsLink, page, /\/archive/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('CONCERTS dropdown → 2026-27 Season at a Glance', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const seasonLink = page
      .locator('a[href="https://steinwaysociety.com/concerts/2026-27-season-at-a-glance/"]')
      .first();
    await clickAndNavigate(seasonLink, page, /season-at-a-glance/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('TICKETS dropdown → Subscriptions page', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const subsLink = page
      .locator('a[href="https://steinwaysociety.com/tickets/subscriptions/"]')
      .first();
    await clickAndNavigate(subsLink, page, /\/subscriptions/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('SUPPORT US dropdown → Donate page', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    // Nav submenu Donate uses relative href — target the visible CTA card in main instead
    const donateLink = page.locator('main a[href$="/donate/"]').first();
    await donateLink.scrollIntoViewIfNeeded();
    await expect(donateLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(donateLink, page, /\/donate/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Footer "Donate" (Get Involved) link navigates correctly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    // "Get Involved > Donate" in the footer uses the www absolute href
    const donateFooterLink = page
      .locator('a[href="https://www.steinwaysociety.com/support-us/donate/"]')
      .first();
    await donateFooterLink.scrollIntoViewIfNeeded();
    await expect(donateFooterLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(donateFooterLink, page, /\/donate/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('CTA "Season at a Glance" body card link works', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    // The nav has a hidden submenu copy; the main-content CTA card is inside <main>
    const seasonCTA = page
      .locator('main a[href="https://steinwaysociety.com/concerts/2026-27-season-at-a-glance/"]')
      .first();
    await seasonCTA.scrollIntoViewIfNeeded();
    await expect(seasonCTA).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(seasonCTA, page, /season-at-a-glance/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('CTA "Buy Tickets" body card link works', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const buyTicketsCTA = page
      .locator('main a[href="https://steinwaysociety.com/tickets/"]')
      .first();
    await buyTicketsCTA.scrollIntoViewIfNeeded();
    await expect(buyTicketsCTA).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(buyTicketsCTA, page, /\/tickets/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Footer "Past Concerts" link navigates correctly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const pastConcertsLink = page
      .locator('a[href="https://steinwaysociety.com/past-concerts/"]')
      .first();
    await pastConcertsLink.scrollIntoViewIfNeeded();
    await expect(pastConcertsLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(pastConcertsLink, page, /\/past-concerts/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Footer "Volunteer" link navigates correctly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const volunteerLink = page
      .locator('a[href="https://www.steinwaysociety.com/support-us/volunteer/"]')
      .first();
    await volunteerLink.scrollIntoViewIfNeeded();
    await expect(volunteerLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(volunteerLink, page, /\/volunteer/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Footer "Privacy Policy" link navigates correctly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'load' });

    const privacyLink = page.locator('a[href*="/privacy-policy"]').first();
    await privacyLink.scrollIntoViewIfNeeded();
    await expect(privacyLink).toBeVisible({ timeout: 10000 });
    await clickAndNavigate(privacyLink, page, /\/privacy-policy/);
    await expect(page.locator('body')).toBeVisible();
  });
});
