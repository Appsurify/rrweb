import { test, expect } from '@appsurify-testmap/rrweb-playwright-plugin';

interface LinkInfo {
  href: string;
  text: string;
}

test('visits 20% of visible interactive links on pinarello.com', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('https://www.pinarello.com/usa/en', { waitUntil: 'domcontentloaded' });

  // Dismiss cookie banner if present
  const allowCookiesButton = page.getByRole('button', { name: /allow all cookies/i });
  if (await allowCookiesButton.isVisible({ timeout: 6000 }).catch(() => false)) {
    await allowCookiesButton.click();
    await page.waitForTimeout(500);
  }

  // Collect all visible pinarello.com anchor links
  const allLinks = await page.evaluate((): LinkInfo[] => {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter((a) => {
        const href = a.href;
        if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return false;
        try {
          const { hostname } = new URL(href);
          if (!hostname.includes('pinarello.com')) return false;
        } catch {
          return false;
        }
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
      .map((a) => ({ href: a.href, text: (a.textContent ?? '').trim().slice(0, 80) }));
  });

  // Deduplicate by href
  const uniqueLinks = [...new Map(allLinks.map((l) => [l.href, l])).values()];

  console.log(`Found ${uniqueLinks.length} unique visible pinarello.com links`);
  expect(uniqueLinks.length, 'Should find at least 5 visible links').toBeGreaterThanOrEqual(5);

  // Pick 20%, minimum 1
  const sampleSize = Math.max(1, Math.ceil(uniqueLinks.length * 0.2));

  // Deterministic shuffle using sort with a fixed seed-like approach
  const shuffled = [...uniqueLinks].sort((a, b) => (a.href > b.href ? 1 : -1));
  // Take evenly spread indices across the sorted list for a representative sample
  const step = Math.floor(shuffled.length / sampleSize);
  const sample = Array.from({ length: sampleSize }, (_, i) => shuffled[i * step]);

  console.log(`Testing ${sample.length} links (20% of ${uniqueLinks.length}):`);
  sample.forEach((l, i) => console.log(`  ${i + 1}. [${l.text || '(no text)'}] ${l.href}`));

  // Verify each sampled link loads without HTTP error
  for (const link of sample) {
    const response = await page.goto(link.href, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const status = response?.status() ?? 0;
    expect(
      status,
      `Expected HTTP < 400 for link "${link.text || link.href}" but got ${status}`,
    ).toBeLessThan(400);

    const title = await page.title();
    expect(title, `Page should have a non-empty title for: ${link.href}`).toBeTruthy();

    console.log(`  ✓ ${status} — ${link.href}`);
  }
});
