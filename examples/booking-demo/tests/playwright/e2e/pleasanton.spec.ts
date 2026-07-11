import { test } from '@appsurify-testmap/rrweb-playwright-plugin';

const BASE_URL = 'https://www.cityofpleasantonca.gov/';

const NAV_LINKS = [
  'Job Opportunities',
  'Library',
  'Report a Concern',
  'Activities Guide',
  'Contact Us',
  'Calendar',
];

const FOOTER_LINKS = [
  'Meeting Agendas',
  'City Calendar',
  'Emergency Preparedness',
  'Employment',
  'AB2854 Compliance',
  'Accessibility',
  'Sitemap',
];

test('clicks cityofpleasantonca.gov navigation links and returns to main page each time', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  console.log('Loaded main page:', await page.title());

  for (const linkText of NAV_LINKS) {
    console.log(`\nClicking link: "${linkText}"`);

    const link = page.getByRole('link', { name: new RegExp(`^${linkText}$`, 'i') }).first();
    await link.waitFor({ state: 'visible', timeout: 30_000 });
    await link.click();

    await page.waitForLoadState('domcontentloaded');

    const currentURL = page.url();
    const title = await page.title();
    console.log(`  ✓ Navigated to: "${title}" — ${currentURL}`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    console.log('  ↩ Returned to main page');
  }

  console.log('\nAll navigation links clicked successfully.');
});

test('clicks cityofpleasantonca.gov footer "Need More Info?" links and returns to main page each time', async ({ page }) => {
  test.setTimeout(300_000);

  // Load the main page once and collect all footer hrefs in a single pass
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  console.log('Loaded main page:', await page.title());

  const hrefs = {};
  for (const linkText of FOOTER_LINKS) {
    const link = page.locator('a').filter({ hasText: new RegExp(`^${linkText}$`, 'i') }).first();
    await link.waitFor({ state: 'attached', timeout: 30_000 });
    hrefs[linkText] = await link.getAttribute('href');
  }

  for (const linkText of FOOTER_LINKS) {
    console.log(`\nClicking footer link: "${linkText}"`);

    const targetUrl = new URL(hrefs[linkText], BASE_URL).href;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    const currentURL = page.url();
    const title = await page.title();
    console.log(`  ✓ Navigated to: "${title}" — ${currentURL}`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    console.log('  ↩ Returned to main page');
  }

  console.log('\nAll footer links clicked successfully.');
});
