import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

const BASE_URL = 'https://www.dublin.ca.gov/';

interface LinkInfo {
  href: string;
  text: string;
}

test('clicks 5 navigation links on dublin.ca.gov and returns to main page', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/dublin\.ca\.gov/);
  console.log('Loaded main page:', await page.title());

  // Collect all visible internal links on the page
  const allLinks = await page.evaluate((): LinkInfo[] => {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter((a) => {
        const href = a.href;
        if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return false;
        let url: URL;
        try {
          url = new URL(href);
        } catch {
          return false;
        }
        // Must be https and on dublin.ca.gov
        if (url.protocol !== 'https:') return false;
        if (!url.hostname.includes('dublin.ca.gov')) return false;
        // Exclude same-page anchor links (hash only, no path change)
        if (url.hash && url.pathname === '/') return false;
        // Exclude the homepage itself
        if (url.pathname === '/' && !url.hash) return false;
        const rect = a.getBoundingClientRect();
        const style = window.getComputedStyle(a);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        );
      })
      .map((a) => {
        const url = new URL(a.href);
        // Normalize: strip fragments, ensure https://www.
        const normalized = `https://www.dublin.ca.gov${url.pathname}${url.search}`;
        return {
          href: normalized,
          text: (a.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
        };
      });
  });

  // Deduplicate by href
  const uniqueLinks = [...new Map(allLinks.map((l) => [l.href, l])).values()];
  console.log(`Found ${uniqueLinks.length} unique visible internal links`);
  expect(uniqueLinks.length, 'Should find at least 5 internal links').toBeGreaterThanOrEqual(5);

  // Pick 5 links — sorted alphabetically for determinism, skip any that look like downloads
  const sorted = [...uniqueLinks]
    .filter((l) => !/\.(pdf|docx?|xlsx?|zip)$/i.test(l.href))
    .sort((a, b) => (a.href > b.href ? 1 : -1));
  const linksToTest = sorted.slice(0, 5);

  console.log('Links to test:');
  linksToTest.forEach((l, i) => console.log(`  ${i + 1}. [${l.text || '(no text)'}] ${l.href}`));

  // Click each link, verify it loads, then return to the main page
  for (const link of linksToTest) {
    console.log(`\nNavigating to: ${link.href}`);

    const response = await page.goto(link.href, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const status = response?.status() ?? 0;
    expect(
      status,
      `Expected HTTP < 400 for "${link.text || link.href}" but got ${status}`,
    ).toBeLessThan(400);

    const title = await page.title();
    expect(title, `Page should have a non-empty title for: ${link.href}`).toBeTruthy();

    console.log(`  ✓ ${status} — "${title}" — ${link.href}`);

    // Return to the main page
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/dublin\.ca\.gov/);
    console.log('  ↩ Returned to main page');
  }

  console.log('\nAll 5 links verified successfully.');
});
